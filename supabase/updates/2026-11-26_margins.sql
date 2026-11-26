-- Update for the live project (26 Nov 2026): the Margins section (MRG-01..MRG-08). Purchases, shipments and payments are unchanged.
-- Run AFTER 2026-11-26_companies_vat.sql. Paste into Supabase → SQL Editor → New query and Run, once.
-- If it says "relation margin_lines already exists", it has already been applied: nothing to do.


create table margin_lines (
  id                     bigint generated always as identity primary key,
  channel                text not null check (channel in ('AMAZON', 'EBAY')),
  company_code           text not null references companies (code),
  product_id             bigint references products (id) on delete set null,
  name                   text not null check (btrim(name) <> ''),
  asin                   text,
  fnsku                  text,
  listing_status         text not null default 'listed' check (listing_status in ('listed', 'not_listed')),
  owner                  text,
  notes                  text,
  product_cost           numeric(12, 4) not null default 0 check (product_cost >= 0),
  product_cost_currency  currency_code not null default 'INR',
  courier_cost           numeric(12, 4) not null default 0 check (courier_cost >= 0),
  courier_currency       currency_code not null default 'INR',
  referral_pct           numeric(6, 3),        -- Amazon: % of the selling price
  fba_fee                numeric(10, 4),       -- Amazon: £ per unit
  promo_per_unit         numeric(10, 4),       -- Amazon: promo/ads £ per unit
  local_shipping         numeric(10, 4),       -- eBay: £ per order
  misc_expense           numeric(10, 4),       -- eBay: £ per order
  ad_pct                 numeric(6, 3),        -- eBay: ads as % of the selling price
  selling_price          numeric(10, 4) not null check (selling_price >= 0),
  tax_override_pct       numeric(5, 2) check (tax_override_pct between 0 and 100),   -- null = the company's Default VAT
  fx_rate                numeric(12, 4) check (fx_rate > 0),   -- ₹ per £, locked on the line (MRG-08)
  fx_rate_date           date,
  fx_source              text check (fx_source in ('daily', 'monthly', 'manual')),
  created_by             uuid references auth.users (id) default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index margin_lines_list_idx on margin_lines (channel, company_code);

-- MRG-08: a new line takes the day's rate (the latest published); a rate typed by hand is marked as such
create function margin_line_fx() returns trigger
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
create trigger b_margin_line_fx before insert or update on margin_lines for each row execute function margin_line_fx();

alter table margin_lines enable row level security;
create policy read_all on margin_lines for select to authenticated using (is_active_user());
create policy admin_write on margin_lines for all to authenticated using (is_admin()) with check (is_admin());
grant select, insert, update, delete on margin_lines to authenticated;
create trigger z_audit after insert or update or delete on margin_lines for each row execute function write_audit();

-- MRG-01: the line's tax rate is its own, else its company's Default VAT
create view v_margin_lines with (security_invoker = true) as
select m.*, c.name as company_name, c.default_vat_pct as company_vat_pct,
       coalesce(m.tax_override_pct, c.default_vat_pct) as effective_tax_pct
  from margin_lines m join companies c on c.code = m.company_code;
grant select on v_margin_lines to authenticated;

-- MRG-08 AC4: "Use today's rate" (admin)
create function use_todays_rate(p_id bigint) returns void
language plpgsql set search_path = public as $$
declare r daily_fx_rates;
begin
  if not is_admin() then raise exception 'Only an admin can change margins.' using errcode = 'P0001'; end if;
  r := daily_rate_for((now() at time zone 'Europe/London')::date);
  if r.rate_date is null then raise exception 'No daily rate is available yet.' using errcode = 'P0001'; end if;
  update margin_lines set fx_rate = r.inr_per_gbp, fx_rate_date = r.rate_date, fx_source = 'daily' where id = p_id;
end $$;

-- MRG-07 AC4: copy a line to another company: same costs, the new company's tax (admin)
create function copy_margin_line(p_id bigint, p_company text) returns bigint
language plpgsql set search_path = public as $$
declare nid bigint;
begin
  if not is_admin() then raise exception 'Only an admin can change margins.' using errcode = 'P0001'; end if;
  insert into margin_lines (channel, company_code, product_id, name, asin, fnsku, listing_status, owner, notes, product_cost,
                            product_cost_currency, courier_cost, courier_currency, referral_pct, fba_fee, promo_per_unit,
                            local_shipping, misc_expense, ad_pct, selling_price, tax_override_pct, fx_rate, fx_rate_date, fx_source)
  select channel, p_company, product_id, name, asin, fnsku, listing_status, owner, notes, product_cost, product_cost_currency,
         courier_cost, courier_currency, referral_pct, fba_fee, promo_per_unit, local_shipping, misc_expense, ad_pct,
         selling_price, null, fx_rate, fx_rate_date, fx_source
    from margin_lines where id = p_id
  returning id into nid;
  if nid is null then raise exception 'Line not found.' using errcode = 'P0001'; end if;
  return nid;
end $$;

-- MRG-02: shared fees and the ROI target (settings: everyone reads, admin changes, every change kept)
insert into settings (key, value, description) values
  ('margin_fee_vat_pct',         '20',   'Margins: VAT on Amazon and eBay fees (%)'),
  ('margin_fba_surcharge_pct',   '2',    'Margins: Amazon FBA surcharge (% of the FBA fee)'),
  ('margin_dst_pct',             '2',    'Margins: Amazon Digital Services Tax (% of referral fee + FBA fee)'),
  ('margin_ebay_fee_pct',        '12.8', 'Margins: eBay fee (% of selling price)'),
  ('margin_ebay_fixed_fee',      '0.30', 'Margins: eBay fixed fee (£ per order)'),
  ('margin_ebay_local_shipping', '2.76', 'Margins: eBay local shipping default (£ per order)'),
  ('margin_ebay_misc',           '0.05', 'Margins: eBay miscellaneous expense default (£ per order)'),
  ('margin_roi_target_pct',      '25',   'Margins: ROI target (%)')
on conflict (key) do nothing;

-- MRG-05 AC3: price history
create view v_margin_price_history with (security_invoker = true) as
select a.id, a.row_key::bigint as line_id, a.changed_at,
       (a.old_data ->> 'selling_price')::numeric as old_price, (a.new_data ->> 'selling_price')::numeric as new_price,
       a.changed_by, p.full_name as changed_by_name
  from audit_log a left join profiles p on p.id = a.changed_by
 where a.table_name = 'margin_lines' and a.action = 'UPDATE'
   and (a.old_data ->> 'selling_price') is distinct from (a.new_data ->> 'selling_price');

-- MRG-02 AC4 (and other settings): old value, new value, who and when
create view v_settings_history with (security_invoker = true) as
select a.id, a.row_key as key, a.changed_at, a.old_data ->> 'value' as old_value, a.new_data ->> 'value' as new_value,
       a.changed_by, p.full_name as changed_by_name
  from audit_log a left join profiles p on p.id = a.changed_by
 where a.table_name = 'settings' and a.action = 'UPDATE' and (a.old_data -> 'value') is distinct from (a.new_data -> 'value');

grant select on v_margin_price_history, v_settings_history to authenticated;
