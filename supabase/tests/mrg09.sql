-- MRG-09: one product line, every platform. Runs after margins.sql (soap on Amazon at £9.49, floss on eBay).
set role authenticated;
select test_as('00000000-0000-0000-0000-00000000000a');

-- AC1: the costs and the rate are entered once; each platform is a row under it
select save_margin_product(jsonb_build_object('id', (select id from margin_products where asin = 'B0FMHY3KW5'),
  'name', 'Antifungal Soap - KetoSkin AF 75g', 'asin', 'B0FMHY3KW5', 'fnsku', 'X002DRQU19', 'product_cost', 90, 'courier_cost', 70, 'fx_rate', 115,
  'platforms', jsonb_build_array(
    jsonb_build_object('channel', 'AMAZON', 'company_code', 'CMR', 'referral_pct', 8, 'fba_fee', 2.42, 'promo_per_unit', 1.5, 'selling_price', 8.99),
    jsonb_build_object('channel', 'EBAY', 'company_code', 'YD', 'ad_pct', 12, 'local_shipping', 2.76, 'misc_expense', 0.05, 'selling_price', 7.69),
    jsonb_build_object('channel', 'ONBUY', 'company_code', 'CMR', 'selling_price', null))));
select expect((select count(*) from margin_products where asin = 'B0FMHY3KW5') = 1, 'MRG-09 AC1: one product line');
select expect((select string_agg(channel || '@' || company_code || '=' || coalesce(selling_price::text, '-'), ' ' order by channel) from v_margin_lines where asin = 'B0FMHY3KW5')
              = 'AMAZON@CMR=8.9900 EBAY@YD=7.6900', 'MRG-09 AC1: Amazon and eBay rows under it (OnBuy with no price is not saved)');
select expect((select count(distinct (product_cost, courier_cost, fx_rate)) = 1 and min(fx_rate) = 115 from v_margin_lines where asin = 'B0FMHY3KW5'),
              'MRG-09 AC1: every platform uses the same costs and rate');
select expect_error($$insert into margin_lines (margin_product_id, channel, company_code, selling_price)
                      values ((select id from margin_products where asin = 'B0FMHY3KW5'), 'AMAZON', 'GOE', 5)$$, '%margin_lines_one_per_platform%');

-- AC4: eBay's company changes; Amazon's row does not
create temporary table amazon_before as select * from margin_lines where id = (select id from v_margin_lines where asin = 'B0FMHY3KW5' and channel = 'AMAZON');
update margin_lines set company_code = 'CMR' where id = (select id from v_margin_lines where asin = 'B0FMHY3KW5' and channel = 'EBAY');
select expect((select effective_tax_pct from v_margin_lines where asin = 'B0FMHY3KW5' and channel = 'EBAY') = 7.5, 'MRG-09 AC4: eBay now taxed at Caemora Ltd''s 7.5%');
select expect((select count(*) from margin_lines m join amazon_before b using (id) where row(m.*) is not distinct from row(b.*)) = 1, 'MRG-09 AC4: Amazon row unchanged');
update margin_lines set company_code = 'YD' where id = (select id from v_margin_lines where asin = 'B0FMHY3KW5' and channel = 'EBAY');

-- AC5: Shopify, OnBuy and Etsy settings, starting at 0 (shipping £2.76, misc £0.05); a platform can be hidden
select expect((select count(*) from settings where key ~ '^margin_(shopify|onbuy|etsy)_') = 21, 'MRG-09 AC5: 7 settings for each new platform');
select expect((select bool_and(case when key ~ '_shipping$' then value #>> '{}' = '2.76' when key ~ '_misc$' then value #>> '{}' = '0.05' when key = 'margin_etsy_payment_fixed' then value #>> '{}' = '0.2' else value #>> '{}' = '0' end)
                 from settings where key ~ '^margin_(shopify|onbuy|etsy)_'), 'MRG-09 AC5: fees start at 0');
select save_margin_product(jsonb_build_object('id', (select id from margin_products where asin = 'B0FMHY3KW5'),
  'name', 'Antifungal Soap - KetoSkin AF 75g', 'asin', 'B0FMHY3KW5', 'fnsku', 'X002DRQU19', 'product_cost', 90, 'courier_cost', 70, 'fx_rate', 115,
  'platforms', jsonb_build_array(
    jsonb_build_object('channel', 'SHOPIFY', 'company_code', 'CMR', 'selling_price', 9.99, 'local_shipping', 2.76, 'misc_expense', 0.05),
    jsonb_build_object('channel', 'ETSY', 'company_code', 'CMR', 'hidden', true))));
select expect((select string_agg(channel || ':' || hidden, ' ' order by channel) from v_margin_lines where asin = 'B0FMHY3KW5')
              = 'AMAZON:false EBAY:false ETSY:true SHOPIFY:false', 'MRG-09 AC5: Shopify row added, Etsy hidden, other rows kept');
update settings set value = '5' where key = 'margin_shopify_fee_pct';
select expect((select count(*) from v_settings_history where key = 'margin_shopify_fee_pct' and old_value = '0' and new_value = '5') = 1, 'MRG-09 AC5: Shopify fee change kept');
update settings set value = '0' where key = 'margin_shopify_fee_pct';
select test_as('00000000-0000-0000-0000-00000000000b');
update settings set value = '9' where key = 'margin_etsy_fee_pct';
select expect((select value #>> '{}' from settings where key = 'margin_etsy_fee_pct') = '0', 'MRG-09 AC5: only an admin changes the new settings');

-- AC6: nothing merges on its own; an admin confirms each match, keeping both platforms' prices, fees and price history
select test_as('00000000-0000-0000-0000-00000000000a');
select save_margin_product('{"name": "ENO Lemon 5g (pack of 6)", "asin": "B0ENO00001", "product_cost": 60, "courier_cost": 20, "fx_rate": 118,
  "platforms": [{"channel": "AMAZON", "company_code": "GOE", "referral_pct": 15, "fba_fee": 2.72, "promo_per_unit": 0.5, "selling_price": 6.99}]}');
-- the second line was saved before MRG-19 refused same-name lines, so it is loaded the way older data was (directly)
reset role;
select test_as(null);
with p as (insert into margin_products (name, product_cost, courier_cost, fx_rate) values ('ENO lemon 5g pack of 6', 65, 20, 120) returning id)
insert into margin_lines (margin_product_id, channel, company_code, ad_pct, local_shipping, misc_expense, selling_price)
select id, 'EBAY', 'YD', 8, 2.76, 0.05, 5.99 from p;
set role authenticated;
select test_as('00000000-0000-0000-0000-00000000000a');
update margin_lines set selling_price = 6.49 where id = (select id from v_margin_lines where name = 'ENO lemon 5g pack of 6');
select expect((select count(*) from margin_products where name ilike 'ENO%') = 2, 'MRG-09 AC6: matching lines stay separate until confirmed');
select test_as('00000000-0000-0000-0000-00000000000b');
select expect_error($$select merge_margin_products((select id from margin_products where asin = 'B0ENO00001'), (select id from margin_products where name = 'ENO lemon 5g pack of 6'))$$, '%Only an admin%');
select test_as('00000000-0000-0000-0000-00000000000a');
select expect_error($$select merge_margin_products((select id from margin_products where asin = 'B0ENO00001'), (select id from margin_products where asin = 'B0FMHY3KW5'))$$, '%same platform%');
create temporary table eno_ebay as select id from v_margin_lines where name = 'ENO lemon 5g pack of 6';
select merge_margin_products((select id from margin_products where asin = 'B0ENO00001'), (select id from margin_products where name = 'ENO lemon 5g pack of 6'));
select expect((select count(*) from margin_products where name ilike 'ENO%') = 1, 'MRG-09 AC6: confirmed match is one line');
select expect((select string_agg(channel || '@' || company_code || '=' || selling_price::text || '/' || coalesce(referral_pct::text, ad_pct::text), ' ' order by channel)
                 from v_margin_lines where asin = 'B0ENO00001') = 'AMAZON@GOE=6.9900/15.000 EBAY@YD=6.4900/8.000', 'MRG-09 AC6: both platforms'' prices and fees kept');
select expect((select product_cost = 60 and fx_rate = 118 from margin_products where asin = 'B0ENO00001'), 'MRG-09 AC6: the chosen line''s costs and rate kept');
select expect((select count(*) from v_margin_price_history h join eno_ebay e on e.id = h.line_id where old_price = 5.99 and new_price = 6.49
                and h.margin_product_id = (select id from margin_products where asin = 'B0ENO00001')) = 1, 'MRG-09 AC6: eBay price history kept');

reset role;
select test_as(null);
