-- DSH-06 (28 Nov 2026): per month, units ordered with goods and courier paid, split by where the supplier is:
-- India (Indian suppliers, in ₹) and China (Chinese suppliers, in £). Stock only, as the units chart. Everyone can see it.
create function dashboard_by_origin(p_months integer default 12, p_end date default null)
returns table (month date, origin text, units bigint, goods numeric, courier numeric)
language sql stable security invoker set search_path = public as $$
  with bounds as (
    select date_trunc('month', coalesce(p_end, (now() at time zone 'Europe/London')::date))::date as last_month
  ), months as (
    select generate_series(b.last_month - make_interval(months => greatest(p_months, 1) - 1), b.last_month, interval '1 month')::date as month
      from bounds b
  ), origins (origin, cur) as (values ('IN', 'INR'::currency_code), ('CN', 'GBP'::currency_code))
  select m.month, o.origin,
         coalesce(sum(pl.qty), 0)::bigint,
         coalesce(sum(pl.goods_total), 0),
         coalesce(sum(pl.courier_total), 0)
    from months m cross join origins o
    left join (purchase_lines pl join vendors v on v.id = pl.vendor_id)
      on date_trunc('month', coalesce(pl.invoice_date, pl.period_month))::date = m.month
     and pl.category = 'stock' and v.country = o.origin and pl.currency = o.cur
   group by m.month, o.origin
   order by o.origin desc, m.month
$$;
grant execute on function dashboard_by_origin(integer, date) to authenticated;
