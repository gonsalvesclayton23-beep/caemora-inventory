-- Update for the live project (26 Nov 2026): Margins become one line per product across Amazon, eBay, Shopify, OnBuy and Etsy (MRG-09).
-- Run AFTER 2026-11-26_margins.sql. Paste into Supabase → SQL Editor → New query and Run, once.
-- Existing margin lines each become a line of their own (nothing is merged); likely matches are listed in the app for you to confirm.
-- If it says "relation margin_products already exists", it has already been applied: nothing to do.


create table margin_products (
  id                     bigint generated always as identity primary key,
  product_id             bigint references products (id) on delete set null,
  name                   text not null check (btrim(name) <> ''),
  asin                   text,
  fnsku                  text,
  owner                  text,
  notes                  text,
  product_cost           numeric(12, 4) not null default 0 check (product_cost >= 0),
  product_cost_currency  currency_code not null default 'INR',
  courier_cost           numeric(12, 4) not null default 0 check (courier_cost >= 0),
  courier_currency       currency_code not null default 'INR',
  fx_rate                numeric(12, 4) check (fx_rate > 0),
  fx_rate_date           date,
  fx_source              text check (fx_source in ('daily', 'monthly', 'manual')),
  created_by             uuid references auth.users (id) default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- each existing line becomes a product line with the same id (old links keep working)
insert into margin_products (id, product_id, name, asin, fnsku, owner, notes, product_cost, product_cost_currency, courier_cost,
                             courier_currency, fx_rate, fx_rate_date, fx_source, created_by, created_at, updated_at)
overriding system value
select id, product_id, name, asin, fnsku, owner, notes, product_cost, product_cost_currency, courier_cost, courier_currency,
       fx_rate, fx_rate_date, fx_source, created_by, created_at, updated_at
  from margin_lines;
select setval(pg_get_serial_sequence('margin_products', 'id'), greatest((select max(id) from margin_products), 1), (select count(*) > 0 from margin_products));

-- the locked rate (MRG-08) now lives on the product line
drop trigger b_margin_line_fx on margin_lines;
drop function margin_line_fx();
create function margin_product_fx() returns trigger
language plpgsql security definer set search_path = public as $$
declare r daily_fx_rates; today date := (now() at time zone 'Europe/London')::date;
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.fx_rate is not distinct from old.fx_rate then return new; end if;
  if new.fx_rate is null then
    r := daily_rate_for(today);
    if r.rate_date is not null then
      new.fx_rate := r.inr_per_gbp; new.fx_rate_date := r.rate_date; new.fx_source := 'daily';
    else
      new.fx_rate := (select inr_per_gbp from v_fx where month <= today order by month desc limit 1);
      new.fx_rate_date := today; new.fx_source := 'monthly';
    end if;
    if new.fx_rate is null then raise exception 'Enter an exchange rate (₹ per £).' using errcode = 'P0001'; end if;
  elsif new.fx_source is null or (tg_op = 'UPDATE' and new.fx_source is not distinct from old.fx_source) then
    new.fx_source := 'manual'; new.fx_rate_date := today;
  end if;
  return new;
end $$;
create trigger b_margin_product_fx before insert or update on margin_products for each row execute function margin_product_fx();

alter table margin_products enable row level security;
create policy read_all on margin_products for select to authenticated using (is_active_user());
create policy admin_write on margin_products for all to authenticated using (is_admin()) with check (is_admin());
grant select, insert, update, delete on margin_products to authenticated;
create trigger z_audit after insert or update or delete on margin_products for each row execute function write_audit();

-- margin_lines: one row per platform of a product line
drop view v_margin_lines;
drop function copy_margin_line(bigint, text);   -- replaced by choosing each platform's company (MRG-09 AC4)
alter table margin_lines add column margin_product_id bigint references margin_products (id) on delete cascade;
update margin_lines set margin_product_id = id;
alter table margin_lines
  alter column margin_product_id set not null,
  add column hidden boolean not null default false,        -- "not sold on this platform": left out of the comparison
  alter column selling_price drop not null,                 -- no price = "Not priced"
  drop constraint margin_lines_channel_check,
  add constraint margin_lines_channel_check check (channel in ('AMAZON', 'EBAY', 'SHOPIFY', 'ONBUY', 'ETSY')),
  add constraint margin_lines_one_per_platform unique (margin_product_id, channel),
  drop column product_id, drop column name, drop column asin, drop column fnsku, drop column owner, drop column notes,
  drop column product_cost, drop column product_cost_currency, drop column courier_cost, drop column courier_currency,
  drop column fx_rate, drop column fx_rate_date, drop column fx_source;
drop index if exists margin_lines_list_idx;
create index margin_lines_product_idx on margin_lines (margin_product_id);

create function margin_line_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger b_margin_line_touch before update on margin_lines for each row execute function margin_line_touch();

-- one row per platform, with its product line's inputs (same column names as before, so the calculations are unchanged)
create view v_margin_lines with (security_invoker = true) as
select m.id, m.margin_product_id, m.channel, m.company_code, m.listing_status, m.hidden,
       m.referral_pct, m.fba_fee, m.promo_per_unit, m.local_shipping, m.misc_expense, m.ad_pct, m.selling_price, m.tax_override_pct,
       p.product_id, p.name, p.asin, p.fnsku, p.owner, p.notes, p.product_cost, p.product_cost_currency, p.courier_cost, p.courier_currency,
       p.fx_rate, p.fx_rate_date, p.fx_source,
       c.name as company_name, c.default_vat_pct as company_vat_pct, coalesce(m.tax_override_pct, c.default_vat_pct) as effective_tax_pct,
       m.created_at, greatest(m.updated_at, p.updated_at) as updated_at
  from margin_lines m join margin_products p on p.id = m.margin_product_id join companies c on c.code = m.company_code;
grant select on v_margin_lines to authenticated;

-- MRG-08 AC4, now on the product line
drop function use_todays_rate(bigint);
create function use_todays_rate(p_product bigint) returns void
language plpgsql set search_path = public as $$
declare r daily_fx_rates;
begin
  if not is_admin() then raise exception 'Only an admin can change margins.' using errcode = 'P0001'; end if;
  r := daily_rate_for((now() at time zone 'Europe/London')::date);
  if r.rate_date is null then raise exception 'No daily rate is available yet.' using errcode = 'P0001'; end if;
  update margin_products set fx_rate = r.inr_per_gbp, fx_rate_date = r.rate_date, fx_source = 'daily' where id = p_product;
end $$;

-- Save a product line and its platforms in one go (admin; row-level security applies).
-- p: {id?, product_id, name, asin, fnsku, owner, notes, product_cost, product_cost_currency, courier_cost, courier_currency,
--     fx_rate, fx_source?, fx_rate_date?, platforms: [{channel, company_code, selling_price, tax_override_pct, hidden, listing_status,
--     referral_pct, fba_fee, promo_per_unit, local_shipping, misc_expense, ad_pct}]}
create function save_margin_product(p jsonb) returns bigint
language plpgsql set search_path = public as $$
declare pid bigint := nullif(p ->> 'id', '')::bigint; x jsonb; n int;
begin
  if not is_admin() then raise exception 'Only an admin can change margins.' using errcode = 'P0001'; end if;
  if pid is null then
    insert into margin_products (product_id, name, asin, fnsku, owner, notes, product_cost, product_cost_currency, courier_cost,
                                 courier_currency, fx_rate, fx_source, fx_rate_date)
    values ((p ->> 'product_id')::bigint, p ->> 'name', p ->> 'asin', p ->> 'fnsku', p ->> 'owner', p ->> 'notes',
            coalesce((p ->> 'product_cost')::numeric, 0), coalesce(p ->> 'product_cost_currency', 'INR')::currency_code,
            coalesce((p ->> 'courier_cost')::numeric, 0), coalesce(p ->> 'courier_currency', 'INR')::currency_code,
            (p ->> 'fx_rate')::numeric, nullif(p ->> 'fx_source', ''), nullif(p ->> 'fx_rate_date', '')::date)
    returning id into pid;
  else
    update margin_products set product_id = (p ->> 'product_id')::bigint, name = p ->> 'name', asin = p ->> 'asin', fnsku = p ->> 'fnsku',
           owner = p ->> 'owner', notes = p ->> 'notes',
           product_cost = coalesce((p ->> 'product_cost')::numeric, 0), product_cost_currency = coalesce(p ->> 'product_cost_currency', 'INR')::currency_code,
           courier_cost = coalesce((p ->> 'courier_cost')::numeric, 0), courier_currency = coalesce(p ->> 'courier_currency', 'INR')::currency_code,
           fx_rate = (p ->> 'fx_rate')::numeric
     where id = pid;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'Line not found.' using errcode = 'P0001'; end if;
  end if;
  for x in select * from jsonb_array_elements(coalesce(p -> 'platforms', '[]')) loop
    if exists (select 1 from margin_lines where margin_product_id = pid and channel = x ->> 'channel') then
      update margin_lines set company_code = x ->> 'company_code', selling_price = (x ->> 'selling_price')::numeric,
             tax_override_pct = (x ->> 'tax_override_pct')::numeric, hidden = coalesce((x ->> 'hidden')::boolean, false),
             listing_status = coalesce(x ->> 'listing_status', 'listed'),
             referral_pct = (x ->> 'referral_pct')::numeric, fba_fee = (x ->> 'fba_fee')::numeric, promo_per_unit = (x ->> 'promo_per_unit')::numeric,
             local_shipping = (x ->> 'local_shipping')::numeric, misc_expense = (x ->> 'misc_expense')::numeric, ad_pct = (x ->> 'ad_pct')::numeric
       where margin_product_id = pid and channel = x ->> 'channel'
         and (company_code, selling_price, tax_override_pct, hidden, listing_status, referral_pct, fba_fee, promo_per_unit,
              local_shipping, misc_expense, ad_pct)
             is distinct from
             (x ->> 'company_code', (x ->> 'selling_price')::numeric, (x ->> 'tax_override_pct')::numeric, coalesce((x ->> 'hidden')::boolean, false),
              coalesce(x ->> 'listing_status', 'listed'), (x ->> 'referral_pct')::numeric, (x ->> 'fba_fee')::numeric, (x ->> 'promo_per_unit')::numeric,
              (x ->> 'local_shipping')::numeric, (x ->> 'misc_expense')::numeric, (x ->> 'ad_pct')::numeric);
    elsif (x ->> 'selling_price') is not null or coalesce((x ->> 'hidden')::boolean, false) then
      insert into margin_lines (margin_product_id, channel, company_code, selling_price, tax_override_pct, hidden, listing_status,
                                referral_pct, fba_fee, promo_per_unit, local_shipping, misc_expense, ad_pct)
      values (pid, x ->> 'channel', x ->> 'company_code', (x ->> 'selling_price')::numeric, (x ->> 'tax_override_pct')::numeric,
              coalesce((x ->> 'hidden')::boolean, false), coalesce(x ->> 'listing_status', 'listed'),
              (x ->> 'referral_pct')::numeric, (x ->> 'fba_fee')::numeric, (x ->> 'promo_per_unit')::numeric,
              (x ->> 'local_shipping')::numeric, (x ->> 'misc_expense')::numeric, (x ->> 'ad_pct')::numeric);
    end if;
  end loop;
  return pid;
end $$;

-- MRG-09 AC6: an admin confirms a match. p_keep's name, costs and rate stay; p_from's platforms (prices, fees and their
-- price history, which is kept by platform row) move onto it and p_from goes. Only lines on different platforms can merge.
create function merge_margin_products(p_keep bigint, p_from bigint) returns void
language plpgsql set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only an admin can change margins.' using errcode = 'P0001'; end if;
  if p_keep = p_from then raise exception 'Choose two different lines.' using errcode = 'P0001'; end if;
  if (select count(*) from margin_products where id in (p_keep, p_from)) <> 2 then raise exception 'Line not found.' using errcode = 'P0001'; end if;
  if exists (select 1 from margin_lines a join margin_lines b using (channel) where a.margin_product_id = p_keep and b.margin_product_id = p_from) then
    raise exception 'Both lines have the same platform, so they cannot be merged.' using errcode = 'P0001';
  end if;
  update margin_products k set asin = coalesce(k.asin, f.asin), fnsku = coalesce(k.fnsku, f.fnsku), product_id = coalesce(k.product_id, f.product_id),
         notes = case when f.notes is null or f.notes = k.notes then k.notes when k.notes is null then f.notes else k.notes || E'\n' || f.notes end
    from margin_products f where k.id = p_keep and f.id = p_from;
  update margin_lines set margin_product_id = p_keep where margin_product_id = p_from;
  delete from margin_products where id = p_from;
  delete from margin_match_dismissed where p_from in (a_id, b_id);
end $$;

-- "Not a match": the pair is not suggested again
create table margin_match_dismissed (
  a_id bigint not null references margin_products (id) on delete cascade,
  b_id bigint not null references margin_products (id) on delete cascade,
  dismissed_by uuid references auth.users (id) default auth.uid(),
  dismissed_at timestamptz not null default now(),
  primary key (a_id, b_id), check (a_id < b_id)
);
alter table margin_match_dismissed enable row level security;
create policy read_all on margin_match_dismissed for select to authenticated using (is_active_user());
create policy admin_write on margin_match_dismissed for all to authenticated using (is_admin()) with check (is_admin());
grant select, insert, delete on margin_match_dismissed to authenticated;

-- price history per platform row (unchanged view, now with the platform and product line)
drop view v_margin_price_history;
create view v_margin_price_history with (security_invoker = true) as
select a.id, a.row_key::bigint as line_id, m.margin_product_id, m.channel, a.changed_at,
       (a.old_data ->> 'selling_price')::numeric as old_price, (a.new_data ->> 'selling_price')::numeric as new_price,
       a.changed_by, p.full_name as changed_by_name
  from audit_log a left join profiles p on p.id = a.changed_by left join margin_lines m on m.id = a.row_key::bigint
 where a.table_name = 'margin_lines' and a.action = 'UPDATE'
   and (a.old_data ->> 'selling_price') is distinct from (a.new_data ->> 'selling_price');
grant select on v_margin_price_history to authenticated;

-- Shopify, OnBuy and Etsy fees (MRG-09 "Margin settings to add"): 0 until the real fees are entered
insert into settings (key, value, description)
select 'margin_' || pl.k || '_' || s.k, s.v::jsonb, 'Margins: ' || pl.label || ' ' || s.label
  from (values ('shopify', 'Shopify', 1), ('onbuy', 'OnBuy', 2), ('etsy', 'Etsy', 3)) pl (k, label, o),
       (values ('fee_pct', '0', 'platform fee (% of selling price)'), ('fixed_fee', '0', 'fixed fee (£ per order or listing)'),
               ('payment_pct', '0', 'payment processing fee (% of selling price)'), ('payment_fixed', '0', 'payment processing fee (£ per order)'),
               ('fee_vat_pct', '0', 'VAT on platform fees (%)'), ('shipping', '2.76', 'default shipping (£ per order)'),
               ('misc', '0.05', 'default miscellaneous (£ per order)')) s (k, v, label)
on conflict (key) do nothing;
