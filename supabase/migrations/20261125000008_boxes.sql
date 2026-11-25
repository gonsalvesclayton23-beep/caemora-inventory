-- PUR-06: a box (shipment) holds products from any invoice; a purchase line can be split across boxes.
-- Decisions 25 Nov 2026: receipts per box for split lines; FBM/UK boxes may mix companies; "30 of 50 shipped";
-- contents can change while the box is In transit, not after it is received.
-- purchase_lines.shipment_id is kept in step: it is the box when the line is in exactly one box, so every
-- existing screen and flag keeps working for single-box lines.

create table shipment_items (
  id                bigint generated always as identity primary key,
  shipment_id       bigint not null references shipments (id) on delete cascade,
  purchase_line_id  bigint not null references purchase_lines (id) on delete cascade,
  qty               integer not null check (qty > 0),
  defective_qty     integer not null default 0 check (defective_qty >= 0),
  short_qty         integer not null default 0 check (short_qty >= 0),
  remarks           text,
  created_by        uuid references auth.users (id) default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (shipment_id, purchase_line_id)
);
create index shipment_items_line_idx on shipment_items (purchase_line_id);

-- every line already linked to a box becomes that box's contents, with its receipt
insert into shipment_items (shipment_id, purchase_line_id, qty, defective_qty, short_qty)
select shipment_id, id, qty, defective_qty, short_qty from purchase_lines where shipment_id is not null and qty > 0;

-- linking a line to a box, and the receipt fields, are not money: allowed after a month is settled
create or replace function receipt_columns(p_table text) returns text[] language sql immutable as $$
  select case p_table
    when 'shipments' then array['status', 'received_on', 'received_by', 'tracking_no', 'courier', 'notes', 'updated_at']
    -- generated totals are listed too: they are not yet computed in a BEFORE trigger, and follow from the other columns
    when 'purchase_lines' then array['defective_qty', 'short_qty', 'received_qty', 'checked_by', 'remarks', 'remarks_2',
                                     'amazon_case_id', 'reimbursement_id', 'reimbursed_gbp', 'updated_at', 'updated_by',
                                     'courier_total', 'goods_total', 'line_total', 'shipment_id']
    else array[]::text[] end
$$;

create function flag_on(p_name text) returns boolean language sql stable as $$
  select coalesce(current_setting('app.' || p_name, true), '') = 'on'
$$;

-- ---------------------------------------------------------------- box contents rules

create function shipment_item_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  box record; line record; others integer; other_company text;
  r shipment_items := case when tg_op = 'DELETE' then old else new end;
  contents_change boolean;
begin
  select * into box from shipments where id = r.shipment_id;
  contents_change := tg_op <> 'UPDATE'
    or (new.qty, new.shipment_id, new.purchase_line_id) is distinct from (old.qty, old.shipment_id, old.purchase_line_id);

  -- contents are fixed once the box is received (receipts can still be recorded)
  if contents_change and box.status <> 'in_transit' and not flag_on('items_from_line') and not is_importing() then
    raise exception 'Box % has already been received: its contents cannot change.',
      coalesce(box.amazon_shipment_id, box.box_no, '#' || box.id) using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  -- the rules below are about what goes into a box: recording a receipt never trips them,
  -- and history loaded from the spreadsheet is taken as it was
  if not contents_change or is_importing() then
    new.updated_at := now();
    return new;
  end if;

  select * into line from purchase_lines where id = new.purchase_line_id;

  -- never more units in boxes than were bought
  select coalesce(sum(qty), 0) into others from shipment_items
   where purchase_line_id = new.purchase_line_id and id <> coalesce(new.id, -1);
  if others + new.qty > line.qty then
    raise exception 'Only % of % units are left to put in a box.', greatest(line.qty - others, 0), line.qty using errcode = 'P0001';
  end if;

  -- an Amazon (FBA) box holds one company's stock; FBM/UK boxes may mix
  if box.channel = 'FBA' or box.amazon_shipment_id is not null then
    select pl.company_code into other_company from shipment_items i join purchase_lines pl on pl.id = i.purchase_line_id
     where i.shipment_id = new.shipment_id and i.id <> coalesce(new.id, -1) and pl.company_code <> line.company_code limit 1;
    if other_company is not null or (box.company_code is not null and box.company_code <> line.company_code) then
      raise exception 'An Amazon shipment can only hold one company''s stock.' using errcode = 'P0001';
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger a_item_rules before insert or update or delete on shipment_items
  for each row execute function shipment_item_rules();

-- receipts per box add up on the line; the line's box is set when it is in exactly one box
create function sync_line_from_items(p_line bigint) returns void
language plpgsql security definer set search_path = public as $$
declare n integer; d integer; s integer; only_box bigint;
begin
  select count(*), coalesce(sum(defective_qty), 0), coalesce(sum(short_qty), 0), min(shipment_id)
    into n, d, s, only_box from shipment_items where purchase_line_id = p_line;
  perform set_config('app.items_sync', 'on', true);
  if n = 0 then
    update purchase_lines set shipment_id = null where id = p_line and shipment_id is not null;
  else
    update purchase_lines set defective_qty = d, short_qty = s, shipment_id = case when n = 1 then only_box end
     where id = p_line and (defective_qty, short_qty, shipment_id) is distinct from (d, s, case when n = 1 then only_box end);
  end if;
  perform set_config('app.items_sync', 'off', true);
end $$;

create function items_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then perform sync_line_from_items(old.purchase_line_id); end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.purchase_line_id <> old.purchase_line_id
                            or (new.defective_qty, new.short_qty, new.shipment_id) is distinct from (old.defective_qty, old.short_qty, old.shipment_id)) then
    perform sync_line_from_items(new.purchase_line_id);
  end if;
  return null;
end $$;

create trigger y_items_changed after insert or update or delete on shipment_items
  for each row execute function items_changed();

-- ---------------------------------------------------------------- the line side

-- Changes made on the line itself (as before PUR-06) are refused or passed to its single box.
create function line_box_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare n integer; boxed integer;
begin
  if flag_on('items_sync') or is_importing() then return new; end if;
  select count(*), coalesce(sum(qty), 0) into n, boxed from shipment_items where purchase_line_id = new.id;
  if n = 0 then return new; end if;
  if new.qty < boxed and not (n = 1 and boxed = old.qty) then
    raise exception '% units of this line are already in boxes.', boxed using errcode = 'P0001';
  end if;
  if n > 1 and (new.defective_qty, new.short_qty) is distinct from (old.defective_qty, old.short_qty) then
    raise exception 'This line is in % boxes. Record shortages on each box.', n using errcode = 'P0001';
  end if;
  if n > 1 and new.shipment_id is distinct from old.shipment_id then
    raise exception 'This line is in % boxes. Change it on each box.', n using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger a1_line_box_rules before update on purchase_lines
  for each row execute function line_box_rules();

-- ...and mirrored onto the box contents after the line is saved
create function line_to_items() returns trigger
language plpgsql security definer set search_path = public as $$
declare item shipment_items;
begin
  if flag_on('items_sync') then return null; end if;
  perform set_config('app.items_from_line', 'on', true);
  if tg_op = 'INSERT' then
    if new.shipment_id is not null and new.qty > 0 then
      insert into shipment_items (shipment_id, purchase_line_id, qty, defective_qty, short_qty)
      values (new.shipment_id, new.id, new.qty, new.defective_qty, new.short_qty);
    end if;
  else
    select * into item from shipment_items where purchase_line_id = new.id;
    if (select count(*) from shipment_items where purchase_line_id = new.id) = 1 then
      update shipment_items set
        qty = case when item.qty = old.qty then new.qty else qty end,
        defective_qty = new.defective_qty, short_qty = new.short_qty,
        shipment_id = coalesce(new.shipment_id, shipment_id)
       where id = item.id
         and (qty, defective_qty, short_qty, shipment_id) is distinct from
             (case when item.qty = old.qty then new.qty else item.qty end, new.defective_qty, new.short_qty, coalesce(new.shipment_id, item.shipment_id));
      if new.shipment_id is null and old.shipment_id is not null then delete from shipment_items where id = item.id; end if;
    elsif item.id is null and new.shipment_id is not null and new.qty > 0 then
      insert into shipment_items (shipment_id, purchase_line_id, qty, defective_qty, short_qty)
      values (new.shipment_id, new.id, new.qty, new.defective_qty, new.short_qty);
    end if;
  end if;
  perform set_config('app.items_from_line', 'off', true);
  return null;
end $$;

create trigger y_line_to_items after insert or update of qty, defective_qty, short_qty, shipment_id on purchase_lines
  for each row execute function line_to_items();

-- ---------------------------------------------------------------- "Put in one box"

-- p_lines: [{"line_id": 1, "qty": 50}, ...]; p_shipment: an existing box, or null to create one from p_new
-- (company_code, box_no, amazon_shipment_id, tracking_no, courier, created_on, channel). Returns the box id.
create function put_in_box(p_lines jsonb, p_shipment bigint, p_new jsonb) returns bigint
language plpgsql set search_path = public as $$
declare sid bigint := p_shipment; l jsonb; existing shipment_items; d date; left_qty integer; line_qty integer;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Tick at least one line.' using errcode = 'P0001';
  end if;
  if sid is null then
    d := coalesce(nullif(p_new ->> 'created_on', '')::date, (now() at time zone 'Europe/London')::date);
    insert into shipments (period_month, company_code, channel, box_no, amazon_shipment_id, tracking_no, courier, created_on, status)
    values (d, nullif(p_new ->> 'company_code', ''),
            coalesce(nullif(p_new ->> 'channel', ''), case when nullif(p_new ->> 'amazon_shipment_id', '') is not null then 'FBA' else 'FBM' end)::sales_channel,
            nullif(p_new ->> 'box_no', ''), upper(nullif(p_new ->> 'amazon_shipment_id', '')), nullif(p_new ->> 'tracking_no', ''),
            nullif(p_new ->> 'courier', ''), d, 'in_transit')
    returning id into sid;
  end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    if coalesce((l ->> 'qty')::int, 0) <= 0 then continue; end if;
    -- units of the line not yet in any box
    select pl.qty - coalesce((select sum(qty) from shipment_items where purchase_line_id = pl.id), 0), pl.qty
      into left_qty, line_qty from purchase_lines pl where pl.id = (l ->> 'line_id')::bigint;
    if (l ->> 'qty')::int > left_qty then
      raise exception 'Only % of % units are left to put in a box.', greatest(left_qty, 0), line_qty using errcode = 'P0001';
    end if;
    select * into existing from shipment_items where shipment_id = sid and purchase_line_id = (l ->> 'line_id')::bigint;
    if existing.id is not null then
      update shipment_items set qty = qty + (l ->> 'qty')::int where id = existing.id;
    else
      insert into shipment_items (shipment_id, purchase_line_id, qty) values (sid, (l ->> 'line_id')::bigint, (l ->> 'qty')::int);
    end if;
  end loop;
  return sid;
end $$;

-- ---------------------------------------------------------------- what is in each box, and where each line went

create view v_shipment_contents with (security_invoker = true) as
select i.id, i.shipment_id, i.purchase_line_id, p.name as product_name, pl.invoice_no, pl.company_code, pl.period_month,
       i.qty, i.defective_qty, i.short_qty, i.qty - i.defective_qty - i.short_qty as received_qty, i.remarks,
       pl.qty as line_qty
  from shipment_items i
  join purchase_lines pl on pl.id = i.purchase_line_id
  join products p on p.id = pl.product_id;

create view v_shipment_totals with (security_invoker = true) as
select shipment_id, count(*) as products, sum(qty) as units from shipment_items group by shipment_id;

create view v_line_boxes with (security_invoker = true) as
select pl.id as purchase_line_id, pl.qty as line_qty, sum(i.qty)::int as boxed_qty, count(*)::int as box_count,
       case when sum(i.qty) >= pl.qty then format('%s shipped in %s box%s', pl.qty, count(*), case when count(*) = 1 then '' else 'es' end)
            else format('%s of %s shipped', sum(i.qty), pl.qty) end as summary
  from shipment_items i join purchase_lines pl on pl.id = i.purchase_line_id
 group by pl.id, pl.qty;

-- ---------------------------------------------------------------- access

alter table shipment_items enable row level security;
create policy read_all on shipment_items for select to authenticated using (is_active_user());
create policy staff_write on shipment_items for all to authenticated using (is_staff()) with check (is_staff());
grant select, insert, update, delete on shipment_items to authenticated;
grant select on v_shipment_contents, v_shipment_totals, v_line_boxes to authenticated;
create trigger z_audit after insert or update or delete on shipment_items for each row execute function write_audit();
