-- LOS-01..LOS-04 (28 Nov 2026): record losses so they can be accounted for every month.
-- Net loss (£) = goods at landed cost + refund paid to the buyer − anything recovered (e.g. an Amazon reimbursement).
-- Admins and the India team record and correct losses at any time (settled months included: they are often found late);
-- viewers read; only an admin deletes. Every change is in the Audit log.

create table losses (
  id              bigint generated always as identity primary key,
  occurred_on     date not null,
  month           date not null,
  type            text not null check (type in ('lost_in_transit', 'damaged_return', 'refunded_no_return', 'expired')),
  company_code    text not null references companies (code),
  platform        text check (platform in ('AMAZON', 'AMAZON_FBM', 'EBAY', 'SHOPIFY', 'ONBUY', 'ETSY', 'TIKTOK', 'OTHER')),
  product_id      bigint not null references products (id),
  qty             integer not null check (qty > 0),
  unit_cost_gbp   numeric(12, 4) not null check (unit_cost_gbp >= 0),     -- landed cost per unit, offered from the purchase
  goods_gbp       numeric(14, 2) generated always as (round(qty * unit_cost_gbp, 2)) stored,
  refund_gbp      numeric(12, 2) not null default 0 check (refund_gbp >= 0),
  recovered_gbp   numeric(12, 2) not null default 0 check (recovered_gbp >= 0),
  net_loss_gbp    numeric(14, 2) generated always as (round(qty * unit_cost_gbp, 2) + refund_gbp - recovered_gbp) stored,
  shipment_id     bigint references shipments (id) on delete set null,
  reference       text,            -- order ID, case ID, tracking number…
  notes           text,
  created_by      uuid references auth.users (id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index losses_month_idx on losses (month, company_code);
create index losses_shipment_idx on losses (shipment_id);

create function losses_month() returns trigger language plpgsql as $$
begin
  new.month := date_trunc('month', new.occurred_on)::date;
  new.updated_at := now();
  return new;
end $$;
create trigger b_losses_month before insert or update on losses for each row execute function losses_month();

alter table losses enable row level security;
create policy read_all on losses for select to authenticated using (is_active_user());
create policy staff_insert on losses for insert to authenticated with check (is_staff());
create policy staff_update on losses for update to authenticated using (is_staff()) with check (is_staff());
create policy admin_delete on losses for delete to authenticated using (is_admin());
grant select, insert, update, delete on losses to authenticated;
create trigger z_audit after insert or update or delete on losses for each row execute function write_audit();

create view v_losses with (security_invoker = true) as
select l.*, p.name as product_name, c.name as company_name, person_name(l.created_by) as recorded_by_name,
       s.amazon_shipment_id, s.box_no
  from losses l join products p on p.id = l.product_id join companies c on c.code = l.company_code
  left join shipments s on s.id = l.shipment_id;
grant select on v_losses to authenticated;

-- LOS-02: landed cost per unit in £ of a product's latest purchase (₹ converted at that line's rate)
create function landed_cost_gbp(p_product bigint) returns numeric
language sql stable security invoker set search_path = public as $$
  select round(landed_per_unit_gbp, 4) from v_purchase_lines
   where product_id = p_product and landed_per_unit_gbp is not null and unit_price is not null
   order by period_month desc, id desc limit 1
$$;

-- LOS-04: what was in a lost box, with each line's own landed cost per unit, and how many units are already recorded as lost
create function loss_lines_for_shipment(p_shipment bigint)
returns table (product_id bigint, product_name text, company_code text, qty integer, unit_cost_gbp numeric, already_recorded integer)
language sql stable security invoker set search_path = public as $$
  select pl.product_id, pl.product_name, pl.company_code, i.qty, round(pl.landed_per_unit_gbp, 4),
         coalesce((select sum(l.qty) from losses l where l.shipment_id = p_shipment and l.product_id = pl.product_id), 0)::integer
    from shipment_items i join v_purchase_lines pl on pl.id = i.purchase_line_id
   where i.shipment_id = p_shipment
   order by pl.product_name
$$;
grant execute on function landed_cost_gbp(bigint), loss_lines_for_shipment(bigint) to authenticated;
