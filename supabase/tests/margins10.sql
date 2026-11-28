-- MRG-11/13/14/15/16/17/18 in the database. Runs after origin.sql.
set role authenticated;
select test_as(clayton());

-- MRG-11 AC1/AC2: product and courier cost are required; 0 is a valid courier cost
select expect_error($$select save_margin_product('{"name": "Cost test", "courier_cost": 0, "fx_rate": 115, "platforms": []}')$$, '%Enter a product cost%');
select expect_error($$select save_margin_product('{"name": "Cost test", "product_cost": 90, "fx_rate": 115, "platforms": []}')$$, '%Enter a courier cost (enter 0 if there is none)%');
select expect(save_margin_product('{"name": "Cost test", "product_cost": 90, "courier_cost": 0, "fx_rate": 115, "platforms": []}') > 0, 'MRG-11 AC2: courier 0 saves');

-- MRG-11 AC5: the currency check limits are settings
select expect((select value #>> '{}' from settings where key = 'margin_suspect_inr_below') = '20'
          and (select value #>> '{}' from settings where key = 'margin_suspect_gbp_above') = '50', 'MRG-11 AC5: limits ₹20 and £50 are settings');

-- MRG-14 AC4: Amazon FBA and FBM are two rows of the same product line; MRG-15: category fee % on the eBay row
select save_margin_product(jsonb_build_object('name', 'FBM test', 'product_cost', 90, 'courier_cost', 70, 'fx_rate', 115, 'platforms', jsonb_build_array(
  jsonb_build_object('channel', 'AMAZON', 'company_code', 'CMR', 'referral_pct', 8, 'fba_fee', 2.42, 'promo_per_unit', 1.5, 'misc_expense', 0, 'selling_price', 8.99),
  jsonb_build_object('channel', 'AMAZON_FBM', 'company_code', 'CMR', 'referral_pct', 8, 'local_shipping', 2.76, 'misc_expense', 0.05, 'promo_per_unit', 1.5, 'selling_price', 8.99),
  jsonb_build_object('channel', 'EBAY', 'company_code', 'YD', 'ad_pct', 12, 'local_shipping', 2.76, 'misc_expense', 0.05, 'category_fee_pct', 3, 'selling_price', 7.69))));
select expect((select string_agg(channel || ':' || coalesce(category_fee_pct::text, '-'), ' ' order by channel) from v_margin_lines where name = 'FBM test')
              = 'AMAZON:- AMAZON_FBM:- EBAY:3.000', 'MRG-14 AC4 / MRG-15: FBA and FBM rows, eBay category fee kept');

-- MRG-16..18: the platform fee settings carry their platform's names; Etsy's payment fee starts at £0.20
select expect((select description from settings where key = 'margin_shopify_fee_pct') like '%Shopify selling fee%'
          and (select description from settings where key = 'margin_onbuy_fee_pct') like '%OnBuy sales fee%'
          and (select description from settings where key = 'margin_etsy_fee_pct') like '%Etsy transaction fee%'
          and (select description from settings where key = 'margin_etsy_payment_fixed') like '%Etsy payment fee%', 'MRG-16..18: fee settings renamed');
select expect((select value #>> '{}' from settings where key = 'margin_etsy_payment_fixed') = '0.2', 'MRG-18: Etsy payment fee £0.20');

-- MRG-13: no "Promo" in any margin setting
select expect(not exists (select 1 from settings where key like 'margin_%' and description ilike '%promo%'), 'MRG-13: no "Promo" in settings');

-- only an admin changes the new settings
select test_as(tanvi());
update settings set value = '1' where key = 'margin_suspect_inr_below';
select expect((select value #>> '{}' from settings where key = 'margin_suspect_inr_below') = '20', 'MRG-11 AC5: only an admin changes the limits');
reset role;
select test_as(null);
