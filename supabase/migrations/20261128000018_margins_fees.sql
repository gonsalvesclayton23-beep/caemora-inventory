-- MRG-10..MRG-18 (28 Nov 2026): Amazon FBM as its own row, eBay category fee, required costs, currency-check limits,
-- and the Shopify/OnBuy/Etsy fee settings named as each platform names them. Existing lines and figures are unchanged:
-- today's Amazon lines are FBA ('AMAZON'), and every new field starts empty or 0.

-- MRG-14: Amazon FBM is a sixth platform row (Amazon FBA stays 'AMAZON')
alter table margin_lines drop constraint margin_lines_channel_check;
alter table margin_lines add constraint margin_lines_channel_check check (channel in ('AMAZON', 'AMAZON_FBM', 'EBAY', 'SHOPIFY', 'ONBUY', 'ETSY'));

-- MRG-15: eBay category fee, % of the selling price, entered per product
alter table margin_lines add column category_fee_pct numeric(6, 3) check (category_fee_pct >= 0 and category_fee_pct < 100);

-- the view lists the new column (same columns as before, plus category_fee_pct at the end)
create or replace view v_margin_lines with (security_invoker = true) as
select m.id, m.margin_product_id, m.channel, m.company_code, m.listing_status, m.hidden,
       m.referral_pct, m.fba_fee, m.promo_per_unit, m.local_shipping, m.misc_expense, m.ad_pct, m.selling_price, m.tax_override_pct,
       p.product_id, p.name, p.asin, p.fnsku, p.owner, p.notes, p.product_cost, p.product_cost_currency, p.courier_cost, p.courier_currency,
       p.fx_rate, p.fx_rate_date, p.fx_source,
       c.name as company_name, c.default_vat_pct as company_vat_pct, coalesce(m.tax_override_pct, c.default_vat_pct) as effective_tax_pct,
       m.created_at, greatest(m.updated_at, p.updated_at) as updated_at,
       m.category_fee_pct
  from margin_lines m join margin_products p on p.id = m.margin_product_id join companies c on c.code = m.company_code;

-- MRG-11 and MRG-15: saving requires both costs and keeps the category fee
create or replace function save_margin_product(p jsonb) returns bigint
language plpgsql set search_path = public as $$
declare pid bigint := nullif(p ->> 'id', '')::bigint; x jsonb; n int;
begin
  if not is_admin() then raise exception 'Only an admin can change margins.' using errcode = 'P0001'; end if;
  -- MRG-11: both costs are required (0 is a valid courier cost)
  if nullif(p ->> 'product_cost', '') is null then raise exception 'Enter a product cost' using errcode = 'P0001'; end if;
  if nullif(p ->> 'courier_cost', '') is null then raise exception 'Enter a courier cost (enter 0 if there is none)' using errcode = 'P0001'; end if;
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
             local_shipping = (x ->> 'local_shipping')::numeric, misc_expense = (x ->> 'misc_expense')::numeric, ad_pct = (x ->> 'ad_pct')::numeric,
             category_fee_pct = (x ->> 'category_fee_pct')::numeric
       where margin_product_id = pid and channel = x ->> 'channel'
         and (company_code, selling_price, tax_override_pct, hidden, listing_status, referral_pct, fba_fee, promo_per_unit,
              local_shipping, misc_expense, ad_pct, category_fee_pct)
             is distinct from
             (x ->> 'company_code', (x ->> 'selling_price')::numeric, (x ->> 'tax_override_pct')::numeric, coalesce((x ->> 'hidden')::boolean, false),
              coalesce(x ->> 'listing_status', 'listed'), (x ->> 'referral_pct')::numeric, (x ->> 'fba_fee')::numeric, (x ->> 'promo_per_unit')::numeric,
              (x ->> 'local_shipping')::numeric, (x ->> 'misc_expense')::numeric, (x ->> 'ad_pct')::numeric, (x ->> 'category_fee_pct')::numeric);
    elsif (x ->> 'selling_price') is not null or coalesce((x ->> 'hidden')::boolean, false) then
      insert into margin_lines (margin_product_id, channel, company_code, selling_price, tax_override_pct, hidden, listing_status,
                                referral_pct, fba_fee, promo_per_unit, local_shipping, misc_expense, ad_pct, category_fee_pct)
      values (pid, x ->> 'channel', x ->> 'company_code', (x ->> 'selling_price')::numeric, (x ->> 'tax_override_pct')::numeric,
              coalesce((x ->> 'hidden')::boolean, false), coalesce(x ->> 'listing_status', 'listed'),
              (x ->> 'referral_pct')::numeric, (x ->> 'fba_fee')::numeric, (x ->> 'promo_per_unit')::numeric,
              (x ->> 'local_shipping')::numeric, (x ->> 'misc_expense')::numeric, (x ->> 'ad_pct')::numeric, (x ->> 'category_fee_pct')::numeric);
    end if;
  end loop;
  return pid;
end $$;


-- MRG-11 AC5: the currency check limits
insert into settings (key, value, description) values
  ('margin_suspect_inr_below', '20', 'Margins: currency check: a ₹ product cost below this looks like £'),
  ('margin_suspect_gbp_above', '50', 'Margins: currency check: a £ product cost above this looks like ₹')
on conflict (key) do nothing;

-- MRG-16..18: the existing platform fee settings carry each platform's own names; Etsy's payment fee is 20p
update settings set description = 'Margins: Shopify selling fee (% of selling price)' where key = 'margin_shopify_fee_pct';
update settings set description = 'Margins: OnBuy sales fee (% of selling price)' where key = 'margin_onbuy_fee_pct';
update settings set description = 'Margins: Etsy transaction fee (% of selling price)' where key = 'margin_etsy_fee_pct';
update settings set description = 'Margins: Etsy payment fee (£ per order)' where key = 'margin_etsy_payment_fixed';
update settings set description = 'Margins: Etsy payment fee (% of selling price)' where key = 'margin_etsy_payment_pct';
update settings set value = '0.2' where key = 'margin_etsy_payment_fixed' and (value #>> '{}')::numeric = 0;
