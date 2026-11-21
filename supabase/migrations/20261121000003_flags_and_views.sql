-- Automatic flags, FX, landed cost and reconciliation.

create function setting_num(p_key text, p_default numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::numeric from settings where key = p_key), p_default)
$$;

create function fmt_money(p_amount numeric, p_currency currency_code) returns text language sql immutable as $$
  select case p_currency when 'INR' then '₹' when 'GBP' then '£' when 'USD' then '$' else '¥' end
         || trim(to_char(p_amount, 'FM999,999,990.00'))
$$;

-- Raise (or refresh) a flag when p_active, otherwise auto-resolve it.
-- A flag a person resolved stays resolved; one that was auto-resolved re-opens if the problem returns.
create function set_flag(p_rule text, p_severity flag_severity, p_type text, p_id bigint, p_month date,
                         p_company text, p_active boolean, p_message text, p_details jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_active then
    insert into flags (rule, severity, entity_type, entity_id, period_month, company_code, message, details)
    values (p_rule, p_severity, p_type, p_id, p_month, p_company, p_message, p_details)
    on conflict (rule, entity_type, entity_id) where rule <> 'settled_month_edit'
    do update set message = excluded.message, details = excluded.details, severity = excluded.severity,
                  period_month = excluded.period_month, company_code = excluded.company_code, updated_at = now(),
                  status = case when flags.status = 'resolved' and flags.resolved_by is null then 'open'::flag_status
                                else flags.status end,
                  resolved_at = case when flags.status = 'resolved' and flags.resolved_by is null then null
                                     else flags.resolved_at end;
  else
    update flags set status = 'resolved', resolved_at = now(), resolution_note = 'Cleared automatically',
                     updated_at = now()
     where rule = p_rule and entity_type = p_type and entity_id = p_id and status <> 'resolved';
  end if;
end $$;

-- ---------------------------------------------------------------- purchase line rules

create function refresh_line_flags(p_line_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  l        record;
  prev     record;
  pct      numeric := setting_num('price_change_pct', 5);
  c_pct    numeric := setting_num('courier_change_pct', 0);
  tol      numeric := setting_num('rate_card_tolerance_pct', 0);
  low_inr  numeric := setting_num('suspect_inr_price_below', 20);
  t        text := 'purchase_lines';
begin
  select pl.*, p.name as product_name, p.agreed_courier_per_unit, p.agreed_courier_currency, p.agreed_courier_from
    into l
    from purchase_lines pl join products p on p.id = pl.product_id
   where pl.id = p_line_id;

  if not found then
    update flags set status = 'resolved', resolved_at = now(), resolution_note = 'Line deleted'
     where entity_type = t and entity_id = p_line_id and status <> 'resolved' and rule <> 'settled_month_edit';
    return;
  end if;

  -- the most recent purchase of the same product, in the same currency, in an earlier month
  select unit_price, courier_per_unit, period_month into prev
    from purchase_lines
   where product_id = l.product_id and currency = l.currency and period_month < l.period_month
     and unit_price is not null
   order by period_month desc, id desc
   limit 1;

  perform set_flag('price_change', 'warning', t, l.id, l.period_month, l.company_code,
    prev.unit_price is not null and l.unit_price is not null and prev.unit_price > 0
      and abs(l.unit_price - prev.unit_price) / prev.unit_price * 100 > pct,
    format('%s: price %s → %s (vs %s)', l.product_name, fmt_money(prev.unit_price, l.currency),
           fmt_money(l.unit_price, l.currency), to_char(prev.period_month, 'Mon YY')),
    jsonb_build_object('previous', prev.unit_price, 'current', l.unit_price, 'previous_month', prev.period_month));

  perform set_flag('courier_change', 'warning', t, l.id, l.period_month, l.company_code,
    prev.courier_per_unit is not null and prev.courier_per_unit <> l.courier_per_unit
      and (prev.courier_per_unit = 0
           or abs(l.courier_per_unit - prev.courier_per_unit) / prev.courier_per_unit * 100 > c_pct),
    format('%s: courier/unit %s → %s (vs %s)', l.product_name, fmt_money(prev.courier_per_unit, l.currency),
           fmt_money(l.courier_per_unit, l.currency), to_char(prev.period_month, 'Mon YY')),
    jsonb_build_object('previous', prev.courier_per_unit, 'current', l.courier_per_unit,
                       'previous_month', prev.period_month));

  perform set_flag('courier_above_price', 'warning', t, l.id, l.period_month, l.company_code,
    l.unit_price is not null and l.courier_per_unit > l.unit_price,
    format('%s: courier/unit %s is more than the product price %s', l.product_name,
           fmt_money(l.courier_per_unit, l.currency), fmt_money(l.unit_price, l.currency)));

  perform set_flag('courier_above_rate_card', 'critical', t, l.id, l.period_month, l.company_code,
    l.agreed_courier_per_unit is not null and l.agreed_courier_currency = l.currency
      and l.period_month >= coalesce(l.agreed_courier_from, '-infinity'::date)
      and l.courier_per_unit > l.agreed_courier_per_unit * (1 + tol / 100),
    format('%s: courier/unit %s is above the agreed %s', l.product_name,
           fmt_money(l.courier_per_unit, l.currency), fmt_money(l.agreed_courier_per_unit, l.currency)),
    jsonb_build_object('agreed', l.agreed_courier_per_unit, 'charged', l.courier_per_unit,
                       'excess_total', (l.courier_per_unit - l.agreed_courier_per_unit) * l.qty));

  perform set_flag('missing_invoice_no', 'warning', t, l.id, l.period_month, l.company_code,
    l.category = 'stock' and nullif(trim(coalesce(l.invoice_no, '')), '') is null,
    format('%s: no invoice number', l.product_name));

  perform set_flag('blank_price', 'critical', t, l.id, l.period_month, l.company_code,
    l.unit_price is null or l.unit_price = 0,
    format('%s: unit price is blank', l.product_name));

  perform set_flag('suspect_currency', 'warning', t, l.id, l.period_month, l.company_code,
    l.currency = 'INR' and l.unit_price > 0 and l.unit_price < low_inr,
    format('%s: ₹%s per unit looks like a £ price', l.product_name, l.unit_price));

  perform set_flag('receipt_discrepancy', 'info', t, l.id, l.period_month, l.company_code,
    (l.defective_qty + l.short_qty) > 0 and nullif(trim(coalesce(l.remarks, '') || coalesce(l.remarks_2, '')), '') is null,
    format('%s: %s defective, %s short, no remark', l.product_name, l.defective_qty, l.short_qty));
end $$;

-- ---------------------------------------------------------------- shipment rules

create function refresh_shipment_flags(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  s     record;
  days  numeric := setting_num('in_transit_days', 21);
  dup   bigint;
  t     text := 'shipments';
begin
  select * into s from shipments where id = p_id;
  if not found then
    update flags set status = 'resolved', resolved_at = now(), resolution_note = 'Shipment deleted'
     where entity_type = t and entity_id = p_id and status <> 'resolved' and rule <> 'settled_month_edit';
    return;
  end if;

  perform set_flag('long_in_transit', 'warning', t, s.id, s.period_month, s.company_code,
    s.status = 'in_transit' and coalesce(s.created_on, s.created_at::date) < current_date - days::int,
    format('Shipment %s has been in transit since %s',
           coalesce(s.amazon_shipment_id, s.tracking_no, s.box_no, '#' || s.id),
           to_char(coalesce(s.created_on, s.created_at::date), 'DD Mon YY')));

  select id into dup from shipments
   where id <> s.id and tracking_no is not null and upper(tracking_no) not in ('NA', 'N/A', 'TBA', '')
     and tracking_no = s.tracking_no
   limit 1;
  perform set_flag('duplicate_tracking', 'warning', t, s.id, s.period_month, s.company_code,
    dup is not null, format('Tracking no %s is also used by shipment #%s', s.tracking_no, dup));
end $$;

-- ---------------------------------------------------------------- payment rules

create function refresh_payment_flags(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare p record; t text := 'payments';
begin
  select * into p from payments where id = p_id;
  if not found then
    update flags set status = 'resolved', resolved_at = now(), resolution_note = 'Payment deleted'
     where entity_type = t and entity_id = p_id and status <> 'resolved' and rule <> 'settled_month_edit';
    return;
  end if;

  perform set_flag('unconfirmed_payment', 'warning', t, p.id, p.period_month, p.company_code,
    not p.confirmed,
    format('%s %s %s has no payment date, method or £ amount. Confirm it was actually paid.',
           p.company_code, p.kind, fmt_money(p.amount, p.currency)));

  perform set_flag('payment_missing_reference', 'info', t, p.id, p.period_month, p.company_code,
    p.confirmed and p.method ilike '%wise%' and nullif(trim(coalesce(p.reference, '')), '') is null,
    format('%s payment of %s has no Wise reference', p.company_code, fmt_money(p.amount, p.currency)));
end $$;

-- ---------------------------------------------------------------- triggers & batch refresh

create function flags_on_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare id bigint := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  if is_importing() then return null; end if;
  case tg_table_name
    when 'purchase_lines' then perform refresh_line_flags(id);
    when 'shipments'      then perform refresh_shipment_flags(id);
    when 'payments'       then perform refresh_payment_flags(id);
  end case;
  return null;
end $$;

create trigger y_flags after insert or update or delete on purchase_lines for each row execute function flags_on_change();
create trigger y_flags after insert or update or delete on shipments      for each row execute function flags_on_change();
create trigger y_flags after insert or update or delete on payments       for each row execute function flags_on_change();

-- Run nightly (pg_cron) and after an import. Also catches knock-on effects, e.g. a rate-card change.
create function refresh_all_flags() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in select id from purchase_lines loop perform refresh_line_flags(r.id); n := n + 1; end loop;
  for r in select id from shipments      loop perform refresh_shipment_flags(r.id); end loop;
  for r in select id from payments       loop perform refresh_payment_flags(r.id); end loop;
  return n;
end $$;

-- Weighted ₹/£ from each month's confirmed INR payments. Manual rates are never overwritten.
create function recompute_fx_from_payments() returns void
language sql security definer set search_path = public as $$
  insert into fx_rates (month, inr_per_gbp, source)
  select period_month, round(sum(amount) / sum(amount_gbp), 4), 'payments'
    from payments
   where currency = 'INR' and confirmed and amount_gbp > 0 and amount > 0
   group by period_month
  on conflict (month) do update set inr_per_gbp = excluded.inr_per_gbp, updated_at = now()
   where fx_rates.source <> 'manual';
$$;

-- ---------------------------------------------------------------- views (RLS of the caller applies)

-- Rate for each month: that month's, else the most recent earlier one, else the default setting.
create view v_fx with (security_invoker = true) as
select p.month,
       coalesce(
         (select f.inr_per_gbp from fx_rates f where f.month <= p.month order by f.month desc limit 1),
         setting_num('default_inr_per_gbp', 125)) as inr_per_gbp,
       (select f.source from fx_rates f where f.month = p.month) as source
  from periods p;

create view v_purchase_lines with (security_invoker = true) as
select pl.*,
       p.name   as product_name,
       p.agreed_courier_per_unit,
       c.name   as company_name,
       v.name   as vendor_name,
       v.kind   as vendor_kind,
       li.asin, li.fnsku, li.channel,
       s.box_no, s.amazon_shipment_id, s.tracking_no, s.status as shipment_status, s.received_on,
       fx.inr_per_gbp,
       (coalesce(pl.unit_price, 0) + pl.courier_per_unit) as landed_per_unit,
       case pl.currency when 'INR' then coalesce(pl.unit_price, 0) + pl.courier_per_unit
                        when 'GBP' then (coalesce(pl.unit_price, 0) + pl.courier_per_unit) * fx.inr_per_gbp end
         as landed_per_unit_inr,
       case pl.currency when 'GBP' then coalesce(pl.unit_price, 0) + pl.courier_per_unit
                        when 'INR' then (coalesce(pl.unit_price, 0) + pl.courier_per_unit) / fx.inr_per_gbp end
         as landed_per_unit_gbp,
       case when pl.received_qty > 0 then pl.line_total / pl.received_qty end as landed_per_received_unit,
       case pl.currency when 'INR' then pl.line_total when 'GBP' then pl.line_total * fx.inr_per_gbp end as line_total_inr,
       case pl.currency when 'GBP' then pl.line_total when 'INR' then pl.line_total / fx.inr_per_gbp end as line_total_gbp
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

-- Balance owed to each vendor by each company, month by month, in the vendor's currency.
create view v_reconciliation with (security_invoker = true) as
with movements as (
  select vendor_id, company_code, period_month, currency,
         sum(line_total) as purchases, 0::numeric as credit_notes, 0::numeric as payments, 0::numeric as unconfirmed
    from purchase_lines group by 1, 2, 3, 4
  union all
  select vendor_id, company_code, period_month, currency, 0, sum(amount), 0, 0
    from credit_notes group by 1, 2, 3, 4
  union all
  select vendor_id, company_code, period_month, currency, 0, 0,
         sum(amount) filter (where confirmed), coalesce(sum(amount) filter (where not confirmed), 0)
    from payments group by 1, 2, 3, 4
), monthly as (
  select vendor_id, company_code, period_month, currency,
         sum(purchases) as purchases, sum(credit_notes) as credit_notes,
         coalesce(sum(payments), 0) as payments, sum(unconfirmed) as unconfirmed_payments
    from movements group by 1, 2, 3, 4
)
select m.*,
       v.name as vendor_name,
       coalesce(sum(m.purchases - m.credit_notes - m.payments) over w_prev, 0) as opening_balance,
       m.purchases - m.credit_notes - m.payments                            as movement,
       sum(m.purchases - m.credit_notes - m.payments) over w_to_date        as closing_balance,
       per.status as period_status
  from monthly m
  join vendors v on v.id = m.vendor_id
  join periods per on per.month = m.period_month
 where can_view_money()
window w_prev    as (partition by m.vendor_id, m.company_code, m.currency order by m.period_month
                     rows between unbounded preceding and 1 preceding),
       w_to_date as (partition by m.vendor_id, m.company_code, m.currency order by m.period_month);


-- What is owed to each vendor overall, month by month. This is the main reconciliation:
-- payments go out from whichever company account suits, so the vendor balance is what matters;
-- v_reconciliation gives the per-company breakdown (rows with no company = vendor-level credit notes).
create view v_vendor_balance with (security_invoker = true) as
with monthly as (
  select vendor_id, period_month, currency,
         sum(purchases) as purchases, sum(credit_notes) as credit_notes,
         sum(payments) as payments, sum(unconfirmed_payments) as unconfirmed_payments
    from v_reconciliation
   group by 1, 2, 3
)
select m.*,
       v.name as vendor_name,
       coalesce(sum(m.purchases - m.credit_notes - m.payments) over w_prev, 0) as opening_balance,
       m.purchases - m.credit_notes - m.payments                            as movement,
       sum(m.purchases - m.credit_notes - m.payments) over w_to_date        as closing_balance,
       per.status as period_status
  from monthly m
  join vendors v on v.id = m.vendor_id
  join periods per on per.month = m.period_month
window w_prev    as (partition by m.vendor_id, m.currency order by m.period_month
                     rows between unbounded preceding and 1 preceding),
       w_to_date as (partition by m.vendor_id, m.currency order by m.period_month);

-- Which bank account paid for which company's stock. A row where the paying account is not the company's
-- own (another company, or a personal account) is money one party owes another.
create view v_payments_by_account with (security_invoker = true) as
select p.period_month,
       p.company_code                                    as paid_for,
       coalesce(p.paid_from_company, p.paid_from, '?')   as paid_from_account,
       p.paid_from_company is distinct from p.company_code as on_behalf,
       p.currency,
       count(*)                                          as payments,
       sum(p.amount)                                     as amount,
       sum(p.amount_gbp)                                 as amount_gbp
  from payments p
 where p.confirmed and can_view_money()
 group by 1, 2, 3, 4, 5;
