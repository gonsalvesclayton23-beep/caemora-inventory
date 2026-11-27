-- Update for the live project (27 Nov 2026): FLG-03 cases (flags assigned to a person) and SHP-08 receiving and shortages.
-- Run AFTER 2026-11-27_audit_log.sql. Paste into Supabase → SQL Editor → New query and Run, once.
-- Flags that are already open do not become cases; boxes already short get a flag, not a case.
-- If it says "type case_status already exists", it has already been applied: nothing to do.

-- ===== FLG-03

create type case_status as enum ('open', 'in_progress', 'resolved');

-- the admin's rules: which flag types create cases, and who gets them
create table case_rules (
  rule          text primary key,
  label         text not null,
  creates_case  boolean not null default false,
  assign_to     text not null default 'person' check (assign_to in ('entered_by', 'person')),
  assignee      uuid references profiles (id) on delete set null,   -- 'person': this person (none = the admin)
  staff_ok      boolean not null default true,                       -- false = money: only an admin may be given it
  updated_at    timestamptz not null default now()
);
insert into case_rules (rule, label, creates_case, assign_to, staff_ok) values
  ('missing_invoice_no',       'No invoice number',            true,  'entered_by', true),
  ('missing_invoice_date',     'No invoice date',              true,  'entered_by', true),
  ('blank_price',              'No price',                     true,  'entered_by', true),
  ('courier_above_rate_card',  'Courier above rate card',      true,  'entered_by', true),
  ('check_with_supplier',      'Check with supplier',          true,  'person',     true),
  ('raise_amazon_case',        'Raise Amazon case',            true,  'person',     true),
  ('price_change',             'Price changed',                false, 'entered_by', true),
  ('courier_change',           'Courier changed',              false, 'entered_by', true),
  ('courier_above_price',      'Courier > product price',      false, 'entered_by', true),
  ('suspect_currency',         'Looks like £ entered as ₹',    false, 'entered_by', true),
  ('receipt_discrepancy',      'Short/defective, no remark',   false, 'entered_by', true),
  ('long_in_transit',          'In transit too long',          false, 'entered_by', true),
  ('duplicate_tracking',       'Duplicate tracking no.',       false, 'entered_by', true),
  ('unconfirmed_payment',      'Unconfirmed payment',          false, 'person',     false),
  ('payment_missing_reference','Payment without reference',    false, 'person',     false),
  ('settled_month_edit',       'Edit to settled month',        false, 'person',     false);

insert into settings (key, value, description) values
  ('case_due_working_days', '3', 'Cases: due after this many working days (Mon–Fri)')
on conflict (key) do nothing;

create table cases (
  id               bigint generated always as identity primary key,
  flag_id          bigint references flags (id) on delete set null,
  rule             text not null,
  entity_type      text not null,
  entity_id        bigint not null,
  title            text not null,
  staff_ok         boolean not null default true,
  assigned_to      uuid references profiles (id),
  status           case_status not null default 'open',
  due_on           date not null,
  external_ref     text,                 -- e.g. the Amazon case ID (SHP-08 AC4)
  outcome          text check (outcome in ('units_found', 'replacement_sent', 'supplier_credit_note', 'amazon_reimbursed')),
  outcome_gbp      numeric(12, 2) check (outcome_gbp >= 0),
  resolution       text check (resolution in ('fix', 'owner', 'outcome')),
  resolution_note  text,
  resolved_by      uuid references profiles (id),
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index cases_one_open_per_flag on cases (flag_id) where status <> 'resolved';
create index cases_assigned_idx on cases (assigned_to, status);

create table case_events (
  id         bigint generated always as identity primary key,
  case_id    bigint not null references cases (id) on delete cascade,
  at         timestamptz not null default now(),
  by         uuid,
  kind       text not null,             -- created, reassigned, status, reference, resolved, reopened, outcome
  from_user  uuid,
  to_user    uuid,
  note       text
);
create index case_events_case_idx on case_events (case_id, at);

-- Mon–Fri working days (UK bank holidays are not skipped)
create function add_working_days(p_from date, p_days integer) returns date language plpgsql immutable as $$
declare d date := p_from; n integer := 0;
begin
  while n < greatest(p_days, 0) loop
    d := d + 1;
    if extract(isodow from d) < 6 then n := n + 1; end if;
  end loop;
  return d;
end $$;

create function london_today() returns date language sql stable as $$ select (now() at time zone 'Europe/London')::date $$;

-- someone who may be given a case: active admin, or active India team member when the case is not about money
create function can_take_case(p_user uuid, p_staff_ok boolean) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_user and active and (role = 'admin' or (p_staff_ok and role = 'data_entry')))
$$;
create function default_case_admin() returns uuid language sql stable security definer set search_path = public as $$
  select id from profiles where role = 'admin' and active order by created_at, id limit 1
$$;

-- the India team only handles purchases and shipments
create function entity_staff_ok(p_entity text) returns boolean language sql immutable as $$
  select p_entity in ('purchase_lines', 'shipments', 'shipment_items')
$$;

create function case_rule_checks() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.assignee is not null and not can_take_case(new.assignee, new.staff_ok) then
    raise exception '%', case when new.staff_ok then 'Choose an active admin or India team member.'
                              else 'Cases about payments and money can only go to an admin.' end using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger b_case_rule_checks before insert or update on case_rules for each row execute function case_rule_checks();

-- who a new case goes to
create function case_assignee(p_rule case_rules, p_entity text, p_id bigint) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare who uuid; ok boolean := p_rule.staff_ok and entity_staff_ok(p_entity);
begin
  if p_rule.assign_to = 'entered_by' then
    execute format('select created_by from %I where id = $1', p_entity) into who using p_id;
  else
    who := p_rule.assignee;
  end if;
  if who is null or not can_take_case(who, ok) then who := default_case_admin(); end if;
  return who;
end $$;

-- open a case for a flag (when its rule creates cases and it has no open case yet)
create function open_case_for_flag(f flags) returns void
language plpgsql security definer set search_path = public as $$
declare r case_rules; who uuid; cid bigint;
begin
  if flag_on('no_cases') then return; end if;   -- set while flags for older problems are first raised
  select * into r from case_rules where rule = f.rule;
  if not found or not r.creates_case then return; end if;
  if exists (select 1 from cases where flag_id = f.id and status <> 'resolved') then return; end if;
  if f.entity_type not in ('purchase_lines', 'shipments', 'shipment_items', 'payments') then return; end if;
  who := case_assignee(r, f.entity_type, f.entity_id);
  insert into cases (flag_id, rule, entity_type, entity_id, title, staff_ok, assigned_to, due_on)
  values (f.id, f.rule, f.entity_type, f.entity_id, f.message, r.staff_ok and entity_staff_ok(f.entity_type), who,
          add_working_days(london_today(), setting_num('case_due_working_days', 3)::int))
  returning id into cid;
  insert into case_events (case_id, by, kind, to_user, note) values (cid, auth.uid(), 'created', who, 'Raised by the "' || r.label || '" flag');
end $$;

-- flags drive cases: a new or re-opened flag opens a case; a cleared flag closes it ("Resolved by fix"); a changed message updates the title
create function flags_to_cases() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'open' and (tg_op = 'INSERT' or old.status <> 'open') then
    perform open_case_for_flag(new);
  elsif tg_op = 'UPDATE' and new.status = 'resolved' and old.status <> 'resolved' then
    with done as (
      update cases set status = 'resolved', resolution = 'fix', resolved_at = now(), updated_at = now(),
                       resolution_note = coalesce(new.resolution_note, 'The problem was fixed')
       where flag_id = new.id and status <> 'resolved' returning id)
    insert into case_events (case_id, by, kind, note) select id, auth.uid(), 'resolved', 'Resolved by fix' from done;
  end if;
  if tg_op = 'UPDATE' and new.message is distinct from old.message then
    update cases set title = new.message, updated_at = now() where flag_id = new.id and status <> 'resolved';
  end if;
  return null;
end $$;
create trigger y_flags_to_cases after insert or update on flags for each row execute function flags_to_cases();

-- ---------------------------------------------------------------- actions (all checks here; no direct writes)

create function case_for_actor(p_case bigint) returns cases
language plpgsql stable security definer set search_path = public as $$
declare c cases;
begin
  select * into c from cases where id = p_case;
  if not found then raise exception 'Case not found.' using errcode = 'P0001'; end if;
  if not (is_admin() or (c.assigned_to = auth.uid() and is_staff() and c.staff_ok)) then
    raise exception 'This case is not assigned to you.' using errcode = 'P0001';
  end if;
  return c;
end $$;

create function reassign_case(p_case bigint, p_to uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare c cases;
begin
  if not is_admin() then raise exception 'Only an admin can reassign a case.' using errcode = 'P0001'; end if;
  select * into c from cases where id = p_case;
  if not found then raise exception 'Case not found.' using errcode = 'P0001'; end if;
  if not can_take_case(p_to, c.staff_ok) then
    raise exception '%', case when c.staff_ok then 'Choose an active admin or India team member.'
                              else 'This case is about payments or money, so it can only go to an admin.' end using errcode = 'P0001';
  end if;
  update cases set assigned_to = p_to, updated_at = now() where id = p_case;
  insert into case_events (case_id, by, kind, from_user, to_user, note) values (p_case, auth.uid(), 'reassigned', c.assigned_to, p_to, nullif(btrim(coalesce(p_note, '')), ''));
end $$;

create function set_case_status(p_case bigint, p_status case_status) returns void
language plpgsql security definer set search_path = public as $$
declare c cases := case_for_actor(p_case);
begin
  if p_status = 'resolved' then raise exception 'Use Resolve, with a note.' using errcode = 'P0001'; end if;
  update cases set status = p_status, updated_at = now(), resolution = null, resolution_note = null, resolved_by = null, resolved_at = null where id = p_case;
  insert into case_events (case_id, by, kind, note) values (p_case, auth.uid(), case when c.status = 'resolved' then 'reopened' else 'status' end,
    case p_status when 'in_progress' then 'In progress' else 'Open' end);
end $$;

create function resolve_case(p_case bigint, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare c cases := case_for_actor(p_case);
begin
  if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'Add a note saying what was done.' using errcode = 'P0001'; end if;
  if c.status = 'resolved' then raise exception 'This case is already resolved.' using errcode = 'P0001'; end if;
  update cases set status = 'resolved', resolution = 'owner', resolution_note = btrim(p_note), resolved_by = auth.uid(), resolved_at = now(), updated_at = now()
   where id = p_case;
  insert into case_events (case_id, by, kind, note) values (p_case, auth.uid(), 'resolved', btrim(p_note));
end $$;

-- ---------------------------------------------------------------- reading

alter table case_rules enable row level security;
create policy read_all on case_rules for select to authenticated using (is_active_user());
create policy admin_write on case_rules for update to authenticated using (is_admin()) with check (is_admin());
revoke insert, delete, truncate on case_rules from authenticated, anon;
create trigger z_audit after update on case_rules for each row execute function write_audit();

alter table cases enable row level security;
alter table case_events enable row level security;
-- admin and viewer: every case; India team: only their own, and never money
create policy read_cases on cases for select to authenticated
  using (can_view_money() or (is_staff() and assigned_to = auth.uid() and staff_ok));
create policy read_events on case_events for select to authenticated
  using (exists (select 1 from cases c where c.id = case_id));
revoke insert, update, delete, truncate on cases, case_events from authenticated, anon;
grant select on cases, case_events to authenticated;

-- colleagues' names (the India team cannot read other profiles; a name is all that is shown)
create function person_name(p_user uuid) returns text language sql stable security definer set search_path = public as $$
  select full_name from profiles where id = p_user and is_active_user()
$$;

create view v_cases with (security_invoker = true) as
select c.*, r.label as rule_label, person_name(c.assigned_to) as assigned_name,
       (c.status <> 'resolved' and c.due_on < london_today()) as overdue,
       case c.entity_type
         when 'purchase_lines' then '/purchases/' || c.entity_id
         when 'shipments' then '/shipments/' || c.entity_id
         when 'shipment_items' then '/shipments/' || (select i.shipment_id from shipment_items i where i.id = c.entity_id)
         when 'payments' then '/reconciliation'
         else '/flags' end as link
  from cases c left join case_rules r on r.rule = c.rule;
create view v_my_cases with (security_invoker = true) as
select * from v_cases where assigned_to = auth.uid() and status <> 'resolved';
create view v_case_events with (security_invoker = true) as
select e.*, person_name(e.by) as by_name, person_name(e.from_user) as from_name, person_name(e.to_user) as to_name
  from case_events e;
grant select on v_cases, v_my_cases, v_case_events to authenticated;

-- ===== SHP-08

-- ---------------------------------------------------------------- destination
alter table shipments add column destination text check (destination in ('amazon', 'home'));
-- filled in quietly: no "updated" time, flag re-check or audit entry for the 275 existing boxes
alter table shipments disable trigger user;
update shipments set destination = case when upper(coalesce(amazon_shipment_id, '')) like 'FBA%' then 'amazon' else 'home' end;
alter table shipments enable trigger user;
alter table shipments alter column destination set not null;

create function shipment_destination() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.destination is null then
      new.destination := case when upper(coalesce(new.amazon_shipment_id, '')) like 'FBA%' then 'amazon' else 'home' end;
    end if;
  elsif new.destination is distinct from old.destination and not is_admin() and not is_system() then
    raise exception 'Only an admin can change where a box goes.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger a0_shipment_destination before insert or update on shipments for each row execute function shipment_destination();

-- an admin may correct the destination of a box from a settled month (it is not a money change)
create or replace function receipt_columns(p_table text) returns text[] language sql immutable as $$
  select case p_table
    when 'shipments' then array['status', 'received_on', 'received_by', 'tracking_no', 'courier', 'notes', 'updated_at', 'destination']
    -- generated totals are listed too: they are not yet computed in a BEFORE trigger, and follow from the other columns
    when 'purchase_lines' then array['defective_qty', 'short_qty', 'received_qty', 'checked_by', 'remarks', 'remarks_2',
                                     'amazon_case_id', 'reimbursement_id', 'reimbursed_gbp', 'updated_at', 'updated_by',
                                     'courier_total', 'goods_total', 'line_total', 'shipment_id']
    else array[]::text[] end
$$;

-- ---------------------------------------------------------------- counts on each box line
alter table shipment_items
  add column counted_by     uuid references profiles (id),
  add column counted_at     timestamptz,
  add column amazon_case_id text,
  add column outcome        text check (outcome in ('units_found', 'replacement_sent', 'supplier_credit_note', 'amazon_reimbursed')),
  add column outcome_gbp    numeric(12, 2) check (outcome_gbp >= 0),
  add column outcome_note   text,
  add column outcome_by     uuid references profiles (id),
  add column outcome_at     timestamptz;

-- history of counts (who changed received or defective, from what to what); readable by everyone signed in
create table receipt_counts (
  id             bigint generated always as identity primary key,
  item_id        bigint not null references shipment_items (id) on delete cascade,
  shipment_id    bigint not null,
  at             timestamptz not null default now(),
  by             uuid,
  old_received   integer, new_received integer,
  old_defective  integer, new_defective integer
);
create index receipt_counts_item_idx on receipt_counts (item_id, at);

create function item_counts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.short_qty, new.defective_qty) is not distinct from (old.short_qty, old.defective_qty) then return new; end if;
  if new.short_qty > new.qty then
    raise exception 'Received cannot be more than the % sent.', new.qty using errcode = 'P0001';
  end if;
  if new.defective_qty > new.qty - new.short_qty then
    raise exception 'Defective (%) cannot be more than the % received.', new.defective_qty, new.qty - new.short_qty using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    new.counted_by := coalesce(auth.uid(), new.counted_by);
    new.counted_at := now();
    -- a recount replaces the old shortage: a new shortage is followed up afresh
    if new.outcome is not null and (new.short_qty > old.short_qty or new.defective_qty > old.defective_qty) then
      new.outcome := null; new.outcome_gbp := null; new.outcome_note := null; new.outcome_by := null; new.outcome_at := null;
    end if;
  end if;
  return new;
end $$;
create trigger b_item_counts before insert or update on shipment_items for each row execute function item_counts();

create function item_count_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.short_qty, new.defective_qty) is distinct from (old.short_qty, old.defective_qty) and not is_importing() then
    insert into receipt_counts (item_id, shipment_id, by, old_received, new_received, old_defective, new_defective)
    values (new.id, new.shipment_id, auth.uid(), old.qty - old.short_qty, new.qty - new.short_qty, old.defective_qty, new.defective_qty);
  end if;
  return null;
end $$;
create trigger x_item_count_history after update on shipment_items for each row execute function item_count_history();

alter table receipt_counts enable row level security;
create policy read_all on receipt_counts for select to authenticated using (is_active_user());
revoke insert, update, delete, truncate on receipt_counts from authenticated, anon;
grant select on receipt_counts to authenticated;
create view v_receipt_history with (security_invoker = true) as
select r.*, person_name(r.by) as by_name from receipt_counts r;
grant select on v_receipt_history to authenticated;

-- ---------------------------------------------------------------- shortage flags → cases (FLG-03)
-- Amazon box: "Raise Amazon case: 2 short, ENO Regular 30's, FBA15MRYZWHR"
-- Home box:   "Check with supplier: 2 short, Colgate dental floss 50m, box 7, invoice PE-140"
create function refresh_item_flags(p_item bigint) returns void
language plpgsql security definer set search_path = public as $$
declare i record; what text; active boolean; rule_on text; rule_off text; msg text;
begin
  select si.*, s.destination, s.box_no, s.amazon_shipment_id, pl.invoice_no, pl.company_code, pl.period_month, p.name as product_name
    into i
    from shipment_items si join shipments s on s.id = si.shipment_id
    join purchase_lines pl on pl.id = si.purchase_line_id join products p on p.id = pl.product_id
   where si.id = p_item;
  if not found then
    update flags set status = 'resolved', resolved_at = now(), resolution_note = 'Box line removed', updated_at = now()
     where entity_type = 'shipment_items' and entity_id = p_item and status <> 'resolved';
    return;
  end if;
  what := concat_ws(', ', case when i.short_qty > 0 then i.short_qty || ' short' end, case when i.defective_qty > 0 then i.defective_qty || ' defective' end);
  active := (i.short_qty > 0 or i.defective_qty > 0) and i.outcome is null;
  if i.destination = 'amazon' then
    rule_on := 'raise_amazon_case'; rule_off := 'check_with_supplier';
    msg := format('Raise Amazon case: %s, %s, %s', what, i.product_name, coalesce(i.amazon_shipment_id, 'box ' || coalesce(i.box_no, '#' || i.shipment_id)));
  else
    rule_on := 'check_with_supplier'; rule_off := 'raise_amazon_case';
    msg := format('Check with supplier: %s, %s, box %s, invoice %s', what, i.product_name, coalesce(i.box_no, '#' || i.shipment_id), coalesce(i.invoice_no, 'none'));
  end if;
  perform set_flag(rule_off, 'warning', 'shipment_items', p_item, i.period_month, i.company_code, false, '');
  perform set_flag(rule_on, 'warning', 'shipment_items', p_item, i.period_month, i.company_code, active, msg,
                   jsonb_build_object('shipment_id', i.shipment_id, 'purchase_line_id', i.purchase_line_id, 'short', i.short_qty, 'defective', i.defective_qty));
end $$;

create function item_flags_on_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_importing() then return null; end if;
  if tg_op = 'DELETE' then perform refresh_item_flags(old.id);
  elsif tg_op = 'INSERT' or (new.short_qty, new.defective_qty, new.outcome) is distinct from (old.short_qty, old.defective_qty, old.outcome) then
    perform refresh_item_flags(new.id);
  end if;
  return null;
end $$;
create trigger y_item_flags after insert or update or delete on shipment_items for each row execute function item_flags_on_change();

create function box_flags_on_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.destination is distinct from old.destination or new.box_no is distinct from old.box_no
     or new.amazon_shipment_id is distinct from old.amazon_shipment_id then
    for r in select id from shipment_items where shipment_id = new.id loop perform refresh_item_flags(r.id); end loop;
  end if;
  return null;
end $$;
create trigger y_box_item_flags after update on shipments for each row execute function box_flags_on_change();

-- the nightly check covers box lines too (otherwise unchanged)
create or replace function refresh_all_flags() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in select id from purchase_lines loop perform refresh_line_flags(r.id); n := n + 1; end loop;
  for r in select id from shipments      loop perform refresh_shipment_flags(r.id); end loop;
  for r in select id from payments       loop perform refresh_payment_flags(r.id); end loop;
  for r in select id from shipment_items where short_qty > 0 or defective_qty > 0 or outcome is not null loop perform refresh_item_flags(r.id); end loop;
  return n;
end $$;

-- boxes that were already short or defective get their flag now, without a case (only new problems become cases)
do $$
declare r record;
begin
  perform set_config('app.no_cases', 'on', true);
  for r in select id from shipment_items where short_qty > 0 or defective_qty > 0 loop perform refresh_item_flags(r.id); end loop;
  perform set_config('app.no_cases', '', true);
end $$;

-- the India team sees flags on box lines too (they are about shipments)
drop policy read_flags on flags;
create policy read_flags on flags for select to authenticated
  using (can_view_money() or (is_staff() and entity_type in ('purchase_lines', 'shipments', 'shipment_items')));

-- ---------------------------------------------------------------- case actions for shortages

-- SHP-08 AC4: the Amazon case ID → "Case raised with Amazon" (kept on the box line, where SHP-05 will read it)
create function set_case_reference(p_case bigint, p_ref text) returns void
language plpgsql security definer set search_path = public as $$
declare c cases := case_for_actor(p_case); ref text := nullif(btrim(coalesce(p_ref, '')), '');
begin
  if ref is null then raise exception 'Enter the case ID.' using errcode = 'P0001'; end if;
  update cases set external_ref = ref, status = case when status = 'open' then 'in_progress'::case_status else status end, updated_at = now() where id = p_case;
  if c.entity_type = 'shipment_items' and c.rule = 'raise_amazon_case' then
    update shipment_items set amazon_case_id = ref where id = c.entity_id;
  end if;
  insert into case_events (case_id, by, kind, note) values (p_case, auth.uid(), 'reference',
    case when c.rule = 'raise_amazon_case' then 'Case raised with Amazon: ' else 'Reference: ' end || ref);
end $$;

-- SHP-08 AC5: the outcome closes the case and shows on the box
create function resolve_shortage(p_case bigint, p_outcome text, p_gbp numeric, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare c cases := case_for_actor(p_case); label text;
begin
  if c.entity_type <> 'shipment_items' then raise exception 'This is not a shortage case.' using errcode = 'P0001'; end if;
  if c.status = 'resolved' then raise exception 'This case is already resolved.' using errcode = 'P0001'; end if;
  label := case p_outcome when 'units_found' then 'Units found' when 'replacement_sent' then 'Replacement sent'
                          when 'supplier_credit_note' then 'Supplier credit note' when 'amazon_reimbursed' then 'Amazon reimbursed' end;
  if label is null then raise exception 'Choose what happened.' using errcode = 'P0001'; end if;
  if p_outcome = 'amazon_reimbursed' and coalesce(p_gbp, 0) <= 0 then
    raise exception 'Enter the £ amount Amazon reimbursed.' using errcode = 'P0001';
  end if;
  -- close the case first, so clearing the flag below does not also mark it "Resolved by fix"
  update cases set status = 'resolved', resolution = 'outcome', outcome = p_outcome, outcome_gbp = p_gbp,
                   resolution_note = nullif(btrim(coalesce(p_note, '')), ''), resolved_by = auth.uid(), resolved_at = now(), updated_at = now()
   where id = p_case;
  insert into case_events (case_id, by, kind, note) values (p_case, auth.uid(), 'outcome',
    label || coalesce(' £' || to_char(p_gbp, 'FM999,990.00'), '') || coalesce(': ' || nullif(btrim(coalesce(p_note, '')), ''), ''));
  update shipment_items set outcome = p_outcome, outcome_gbp = p_gbp, outcome_note = nullif(btrim(coalesce(p_note, '')), ''),
                            outcome_by = auth.uid(), outcome_at = now()
   where id = c.entity_id;
end $$;

-- box contents with counts and shortage follow-up (the screen reads this)
create or replace view v_box_receipts with (security_invoker = true) as
select si.id, si.shipment_id, si.purchase_line_id, si.qty, si.short_qty, si.defective_qty, si.qty - si.short_qty as received,
       si.counted_at, person_name(si.counted_by) as counted_by_name, si.amazon_case_id, si.outcome, si.outcome_gbp, si.outcome_note, si.outcome_at,
       person_name(si.outcome_by) as outcome_by_name
  from shipment_items si;
grant select on v_box_receipts to authenticated;
