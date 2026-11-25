-- UI-04 (decision B, 25 Nov 2026): the European Central Bank's daily £→₹ rate.
-- Shown on the dashboard, and used to convert purchases with an invoice date from 25 Nov 2026 onwards:
-- the rate of the invoice date, or the last one published before it (weekends, holidays).
-- The rate used is stored on each line, so its cost never shifts later. Earlier purchases keep the monthly
-- Wise rate (LC-03). Supplier balances and payments are not converted, so they never change with the rate.

create table daily_fx_rates (
  rate_date    date primary key,
  inr_per_gbp  numeric(12, 4) not null check (inr_per_gbp > 0),
  eur_inr      numeric(12, 4),
  eur_gbp      numeric(12, 5),
  source       text not null default 'European Central Bank',
  fetched_at   timestamptz not null default now()
);
alter table daily_fx_rates enable row level security;
create policy read_all on daily_fx_rates for select to authenticated using (is_active_user());
grant select on daily_fx_rates to authenticated;   -- no one writes except the server's daily fetch (below)

insert into settings (key, value, description)
values ('daily_fx_from', '"2026-11-25"', 'Purchases invoiced from this date use the ECB daily rate (UI-04)')
on conflict (key) do nothing;

create function daily_fx_from() returns date language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::date from settings where key = 'daily_fx_from'), '2026-11-25'::date)
$$;

alter table purchase_lines
  add column fx_inr_per_gbp numeric(12, 4),   -- daily rate used for this line (null = monthly Wise rate)
  add column fx_rate_date   date;

create function daily_rate_for(p_day date) returns daily_fx_rates
language sql stable security definer set search_path = public as $$
  select * from daily_fx_rates where rate_date <= p_day order by rate_date desc limit 1
$$;

-- a new purchase (or a corrected invoice date) takes the daily rate of its invoice date
create function line_daily_fx() returns trigger
language plpgsql security definer set search_path = public as $$
declare r daily_fx_rates;
begin
  if is_importing() then return new; end if;
  if tg_op = 'UPDATE' and new.invoice_date is not distinct from old.invoice_date then return new; end if;
  if new.invoice_date is null or new.invoice_date < daily_fx_from() then
    new.fx_inr_per_gbp := null; new.fx_rate_date := null;
    return new;
  end if;
  r := daily_rate_for(new.invoice_date);
  new.fx_inr_per_gbp := r.inr_per_gbp;   -- null until the first rate is fetched; filled in then (below)
  new.fx_rate_date := r.rate_date;
  return new;
end $$;
create trigger a2_line_daily_fx before insert or update of invoice_date on purchase_lines
  for each row execute function line_daily_fx();

-- The server's daily fetch: rows [{"date", "eur_inr", "eur_gbp"}] from the ECB. Only the service key may call it.
create function store_daily_rates(p_rates jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into daily_fx_rates (rate_date, inr_per_gbp, eur_inr, eur_gbp, fetched_at)
  select (x ->> 'date')::date, round((x ->> 'eur_inr')::numeric / (x ->> 'eur_gbp')::numeric, 4),
         (x ->> 'eur_inr')::numeric, (x ->> 'eur_gbp')::numeric, now()
    from jsonb_array_elements(p_rates) x
   where (x ->> 'eur_inr')::numeric > 0 and (x ->> 'eur_gbp')::numeric > 0
  on conflict (rate_date) do update
     set inr_per_gbp = excluded.inr_per_gbp, eur_inr = excluded.eur_inr, eur_gbp = excluded.eur_gbp, fetched_at = now();
  get diagnostics n = row_count;

  -- purchases saved before any rate was available get theirs now; lines that already have a rate keep it
  perform set_config('app.bypass_lock', 'on', true);
  update purchase_lines pl
     set (fx_inr_per_gbp, fx_rate_date) = (select r.inr_per_gbp, r.rate_date from daily_rate_for(pl.invoice_date) r)
   where pl.fx_inr_per_gbp is null and pl.invoice_date >= daily_fx_from()
     and exists (select 1 from daily_fx_rates d where d.rate_date <= pl.invoice_date);
  perform set_config('app.bypass_lock', 'off', true);
  return n;
end $$;
revoke execute on function store_daily_rates(jsonb) from public, anon, authenticated;
grant usage on schema public to service_role;
grant execute on function store_daily_rates(jsonb) to service_role;

-- conversions use the line's daily rate when it has one, else the month's Wise rate
drop view v_landed_cost;
drop view v_purchase_lines;

create view v_purchase_lines with (security_invoker = true) as
select pl.*,
       p.name   as product_name,
       p.agreed_courier_per_unit,
       c.name   as company_name,
       v.name   as vendor_name,
       v.kind   as vendor_kind,
       li.asin, li.fnsku, li.channel,
       s.box_no, s.amazon_shipment_id, s.tracking_no, s.status as shipment_status, s.received_on,
       coalesce(pl.fx_inr_per_gbp, fx.inr_per_gbp) as inr_per_gbp,
       case when pl.fx_inr_per_gbp is not null then 'daily' else 'monthly' end as fx_basis,
       (coalesce(pl.unit_price, 0) + pl.courier_per_unit) as landed_per_unit,
       case pl.currency when 'INR' then coalesce(pl.unit_price, 0) + pl.courier_per_unit
                        when 'GBP' then (coalesce(pl.unit_price, 0) + pl.courier_per_unit) * coalesce(pl.fx_inr_per_gbp, fx.inr_per_gbp) end
         as landed_per_unit_inr,
       case pl.currency when 'GBP' then coalesce(pl.unit_price, 0) + pl.courier_per_unit
                        when 'INR' then (coalesce(pl.unit_price, 0) + pl.courier_per_unit) / coalesce(pl.fx_inr_per_gbp, fx.inr_per_gbp) end
         as landed_per_unit_gbp,
       case when pl.received_qty > 0 then pl.line_total / pl.received_qty end as landed_per_received_unit,
       case pl.currency when 'INR' then pl.line_total when 'GBP' then pl.line_total * coalesce(pl.fx_inr_per_gbp, fx.inr_per_gbp) end as line_total_inr,
       case pl.currency when 'GBP' then pl.line_total when 'INR' then pl.line_total / coalesce(pl.fx_inr_per_gbp, fx.inr_per_gbp) end as line_total_gbp
  from purchase_lines pl
  join products p   on p.id = pl.product_id
  join companies c  on c.code = pl.company_code
  join vendors v    on v.id = pl.vendor_id
  left join listings li  on li.id = pl.listing_id
  left join shipments s  on s.id = pl.shipment_id
  left join v_fx fx      on fx.month = pl.period_month;

create view v_landed_cost with (security_invoker = true) as
select period_month, company_code, product_id, product_name, currency,
       sum(qty)                                   as qty,
       sum(received_qty)                          as received_qty,
       sum(line_total)                            as total_cost,
       round(sum(line_total) / nullif(sum(qty), 0), 2)            as landed_per_unit,
       round(sum(line_total_inr) / nullif(sum(qty), 0), 2)        as landed_per_unit_inr,
       round(sum(line_total_gbp) / nullif(sum(qty), 0), 4)        as landed_per_unit_gbp,
       round(sum(line_total) / nullif(sum(received_qty), 0), 2)   as landed_per_received_unit
  from v_purchase_lines
 group by period_month, company_code, product_id, product_name, currency;

grant select on v_purchase_lines, v_landed_cost to authenticated;
