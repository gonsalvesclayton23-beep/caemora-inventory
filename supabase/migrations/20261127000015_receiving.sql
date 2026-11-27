-- SHP-08 (27 Nov 2026): record what each box delivered, at home or at Amazon, and act on shortages.
-- Received counts (short and defective) stay open to admins and the India team at any time, settled months included
-- (as SHP-03 already allowed). Prices, quantities bought and companies stay locked as before.
-- "Received" = units that arrived, defective ones included; short = sent − received; defective is entered separately.

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
