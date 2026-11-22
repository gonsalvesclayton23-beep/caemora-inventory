-- DSH-01 / DSH-02: monthly purchasing overview, calculated in one place.
-- A purchase belongs to the month of its invoice (order) date; lines imported without one fall back to their sheet month.
-- "Current month" is the Europe/London month.
-- Units count stock only (packaging/stationery is left out); spend includes every purchase.
-- INR and GBP are summed separately and never converted.
create function dashboard_monthly(p_months integer default 12, p_end date default null)
returns table (month date, units bigint, spend_inr numeric, spend_gbp numeric, missing_currency bigint)
language sql stable security invoker set search_path = public as $$
  with bounds as (
    select date_trunc('month', coalesce(p_end, (now() at time zone 'Europe/London')::date))::date as last_month
  ), months as (
    select generate_series(b.last_month - make_interval(months => greatest(p_months, 1) - 1), b.last_month, interval '1 month')::date as month
      from bounds b
  )
  select m.month,
         coalesce(sum(pl.qty) filter (where pl.category = 'stock'), 0)::bigint,
         coalesce(sum(pl.line_total) filter (where pl.currency = 'INR'), 0),
         coalesce(sum(pl.line_total) filter (where pl.currency = 'GBP'), 0),
         count(pl.id) filter (where pl.currency is null)
    from months m
    left join purchase_lines pl on date_trunc('month', coalesce(pl.invoice_date, pl.period_month))::date = m.month
   group by m.month
   order by m.month
$$;

grant execute on function dashboard_monthly(integer, date) to authenticated;
