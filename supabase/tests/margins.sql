-- Margins (MRG-01..MRG-08): access, history and the locked exchange rate. Calculations are tested in tests/margins.test.ts.
-- Same checks as before MRG-09; lines are now a product line (costs, rate) with one row per platform.
-- Runs after companies.sql (CMR is at 8% there) and ui04.sql (daily rates 20, 24, 25 Nov exist).

set role authenticated;
select test_as('00000000-0000-0000-0000-00000000000a');

-- MRG-08 AC1/AC5: a new line takes the latest daily rate, with its own date
select save_margin_product('{"name": "Antifungal Soap - KetoSkin AF 75g", "asin": "B0FMHY3KW5", "fnsku": "X002DRQU19", "product_cost": 90, "courier_cost": 70,
  "platforms": [{"channel": "AMAZON", "company_code": "CMR", "referral_pct": 8, "fba_fee": 2.42, "promo_per_unit": 1.5, "selling_price": 8.99}]}');
select expect((select fx_source = 'daily' and fx_rate = (select inr_per_gbp from daily_fx_rates order by rate_date desc limit 1)
                      and fx_rate_date = (select max(rate_date) from daily_fx_rates)
                 from margin_products where asin = 'B0FMHY3KW5'), 'MRG-08 AC1/AC5: latest daily rate filled in, with its date');

-- MRG-08 AC2: a rate typed by hand
select save_margin_product('{"name": "Colgate dental floss 50m (pack of 1)", "product_cost": 155, "courier_cost": 15, "fx_rate": 120,
  "platforms": [{"channel": "EBAY", "company_code": "YD", "local_shipping": 2.76, "misc_expense": 0.05, "ad_pct": 12, "selling_price": 7.69}]}');
select expect((select fx_source = 'manual' and fx_rate = 120 and fx_rate_date = (now() at time zone 'Europe/London')::date
                 from margin_products where name like 'Colgate dental floss%'), 'MRG-08 AC2: entered by hand, dated today');

-- MRG-01: effective tax rate = own rate, else the company's
select expect((select effective_tax_pct from v_margin_lines where asin = 'B0FMHY3KW5') = 8, 'MRG-01 AC5: company rate (8% after the change)');
update margin_lines set tax_override_pct = 0 where id = (select id from v_margin_lines where asin = 'B0FMHY3KW5');
select expect((select effective_tax_pct from v_margin_lines where asin = 'B0FMHY3KW5') = 0, 'MRG-01 AC3: own rate');
update margin_lines set tax_override_pct = null where id = (select id from v_margin_lines where asin = 'B0FMHY3KW5');
select set_vat('CMR', 7.5, 'Flat Rate VAT');
select expect((select effective_tax_pct from v_margin_lines where asin = 'B0FMHY3KW5') = 7.5, 'MRG-01 AC4/AC5: back to the company rate, which follows changes');

-- MRG-05 AC3: price history £8.99 → £9.49, with when and who
update margin_lines set selling_price = 9.49 where id = (select id from v_margin_lines where asin = 'B0FMHY3KW5');
select expect((select count(*) from v_margin_price_history
                where line_id = (select id from v_margin_lines where asin = 'B0FMHY3KW5') and channel = 'AMAZON'
                  and old_price = 8.99 and new_price = 9.49 and changed_by_name = 'Clayton' and changed_at > now() - interval '1 minute') = 1,
              'MRG-05 AC3: price history kept');

-- MRG-08 AC3: a saved line keeps its rate when a new daily rate arrives
create temporary table locked as select id, fx_rate from margin_products;
reset role;
set role service_role;
select store_daily_rates('[{"date": "2026-11-26", "eur_inr": 107.0, "eur_gbp": 0.84}]');
reset role;
set role authenticated;
select test_as('00000000-0000-0000-0000-00000000000a');
select expect(not exists (select 1 from margin_products m join locked l using (id) where m.fx_rate <> l.fx_rate), 'MRG-08 AC3: rate stays locked');

-- MRG-08 AC4: "Use today's rate" changes it and the change is kept
select use_todays_rate((select id from margin_products where name like 'Colgate dental floss%'));
select expect((select fx_rate = 127.381 and fx_source = 'daily' and fx_rate_date = '2026-11-26' from margin_products where name like 'Colgate dental floss%'),
              'MRG-08 AC4: today''s rate applied');
select expect((select count(*) from audit_log where table_name = 'margin_products' and action = 'UPDATE'
                and (old_data ->> 'fx_rate') = '120.0000' and (new_data ->> 'fx_rate') = '127.3810') = 1, 'MRG-08 AC4: change kept in the history');

-- MRG-07 AC4 (now MRG-09 AC4): the platform's company can be changed; costs stay, tax follows that company
update margin_lines set company_code = 'CMR' where id = (select id from v_margin_lines where name like 'Colgate dental floss%');
select expect((select count(*) from v_margin_lines where name like 'Colgate dental floss%' and company_code = 'CMR'
                and product_cost = 155 and tax_override_pct is null and effective_tax_pct = 7.5) = 1, 'MRG-07 AC4: costs kept, tax at 7.5%');
update margin_lines set company_code = 'YD' where id = (select id from v_margin_lines where name like 'Colgate dental floss%');

-- MRG-02 AC4: settings changes are kept with old value, new value, who and when
update settings set value = '2.5' where key = 'margin_fba_surcharge_pct';
select expect((select count(*) from v_settings_history where key = 'margin_fba_surcharge_pct' and old_value = '2' and new_value = '2.5'
                and changed_by_name = 'Clayton' and changed_at > now() - interval '1 minute') = 1, 'MRG-02 AC4: setting change kept');
update settings set value = '2' where key = 'margin_fba_surcharge_pct';

-- Access: everyone reads; only an admin changes anything (MRG-02 AC3 and "Who can do what")
select test_as('00000000-0000-0000-0000-00000000000b');
select expect((select count(*) from v_margin_lines) = 2 and (select count(*) from settings where key like 'margin_%') = 31, 'Margins: data entry can read lines and settings');
update settings set value = '3' where key = 'margin_fba_surcharge_pct';
select expect((select value #>> '{}' from settings where key = 'margin_fba_surcharge_pct') = '2', 'MRG-02 AC3: data entry cannot change settings');
update margin_lines set selling_price = 1 where id = (select id from v_margin_lines where asin = 'B0FMHY3KW5');
select expect((select selling_price from v_margin_lines where asin = 'B0FMHY3KW5') = 9.49, 'Margins: data entry cannot change a line');
update margin_products set product_cost = 1 where asin = 'B0FMHY3KW5';
select expect((select product_cost from margin_products where asin = 'B0FMHY3KW5') = 90, 'Margins: data entry cannot change a product line');
select expect_error($$insert into margin_products (name, fx_rate) values ('x', 100)$$, '%row-level security%');
select expect_error($$select save_margin_product('{"name": "x", "fx_rate": 100}')$$, '%Only an admin%');
select expect_error($$select use_todays_rate((select id from margin_products limit 1))$$, '%Only an admin%');
select test_as('00000000-0000-0000-0000-00000000000c');
select expect((select count(*) from v_margin_lines) = 2, 'Margins: viewer can read');

reset role;
select test_as(null);
