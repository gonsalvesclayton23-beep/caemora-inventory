-- Margins (MRG-01..MRG-08): access, history and the locked exchange rate. Calculations are tested in tests/margins.test.ts.
-- Runs after companies.sql (CMR is at 8% there) and ui04.sql (daily rates 20, 24, 25 Nov exist).

set role authenticated;
select test_as('00000000-0000-0000-0000-00000000000a');

-- MRG-08 AC1/AC5: a new line takes the latest daily rate, with its own date
insert into margin_lines (channel, company_code, name, asin, fnsku, product_cost, courier_cost, referral_pct, fba_fee, promo_per_unit, selling_price)
values ('AMAZON', 'CMR', 'Antifungal Soap - KetoSkin AF 75g', 'B0FMHY3KW5', 'X002DRQU19', 90, 70, 8, 2.42, 1.5, 8.99);
select expect((select fx_source = 'daily' and fx_rate = (select inr_per_gbp from daily_fx_rates order by rate_date desc limit 1)
                      and fx_rate_date = (select max(rate_date) from daily_fx_rates)
                 from margin_lines where asin = 'B0FMHY3KW5'), 'MRG-08 AC1/AC5: latest daily rate filled in, with its date');

-- MRG-08 AC2: a rate typed by hand
insert into margin_lines (channel, company_code, name, product_cost, courier_cost, local_shipping, misc_expense, ad_pct, selling_price, fx_rate)
values ('EBAY', 'YD', 'Colgate dental floss 50m (pack of 1)', 155, 15, 2.76, 0.05, 12, 7.69, 120);
select expect((select fx_source = 'manual' and fx_rate = 120 and fx_rate_date = (now() at time zone 'Europe/London')::date
                 from margin_lines where name like 'Colgate dental floss%'), 'MRG-08 AC2: entered by hand, dated today');

-- MRG-01: effective tax rate = own rate, else the company's
select expect((select effective_tax_pct from v_margin_lines where asin = 'B0FMHY3KW5') = 8, 'MRG-01 AC5: company rate (8% after the change)');
update margin_lines set tax_override_pct = 0 where asin = 'B0FMHY3KW5';
select expect((select effective_tax_pct from v_margin_lines where asin = 'B0FMHY3KW5') = 0, 'MRG-01 AC3: own rate');
update margin_lines set tax_override_pct = null where asin = 'B0FMHY3KW5';
select set_vat('CMR', 7.5, 'Flat Rate VAT');
select expect((select effective_tax_pct from v_margin_lines where asin = 'B0FMHY3KW5') = 7.5, 'MRG-01 AC4/AC5: back to the company rate, which follows changes');

-- MRG-05 AC3: price history £8.99 → £9.49, with when and who
update margin_lines set selling_price = 9.49 where asin = 'B0FMHY3KW5';
select expect((select count(*) from v_margin_price_history
                where line_id = (select id from margin_lines where asin = 'B0FMHY3KW5')
                  and old_price = 8.99 and new_price = 9.49 and changed_by_name = 'Clayton' and changed_at > now() - interval '1 minute') = 1,
              'MRG-05 AC3: price history kept');

-- MRG-08 AC3: a saved line keeps its rate when a new daily rate arrives
create temporary table locked as select id, fx_rate from margin_lines;
reset role;
set role service_role;
select store_daily_rates('[{"date": "2026-11-26", "eur_inr": 107.0, "eur_gbp": 0.84}]');
reset role;
set role authenticated;
select test_as('00000000-0000-0000-0000-00000000000a');
select expect(not exists (select 1 from margin_lines m join locked l using (id) where m.fx_rate <> l.fx_rate), 'MRG-08 AC3: rate stays locked');

-- MRG-08 AC4: "Use today's rate" changes it and the change is kept
select use_todays_rate((select id from margin_lines where name like 'Colgate dental floss%'));
select expect((select fx_rate = 127.381 and fx_source = 'daily' and fx_rate_date = '2026-11-26' from margin_lines where name like 'Colgate dental floss%'),
              'MRG-08 AC4: today''s rate applied');
select expect((select count(*) from audit_log where table_name = 'margin_lines' and action = 'UPDATE'
                and (old_data ->> 'fx_rate') = '120.0000' and (new_data ->> 'fx_rate') = '127.3810') = 1, 'MRG-08 AC4: change kept in the history');

-- MRG-07 AC4: copy to another company (admin) keeps costs, uses the new company's rate
select expect(copy_margin_line((select id from margin_lines where name like 'Colgate dental floss%'), 'CMR') > 0, 'MRG-07 AC4: copied');
select expect((select count(*) from v_margin_lines where name like 'Colgate dental floss%' and company_code = 'CMR'
                and product_cost = 155 and tax_override_pct is null and effective_tax_pct = 7.5) = 1, 'MRG-07 AC4: costs kept, tax at 7.5%');

-- MRG-02 AC4: settings changes are kept with old value, new value, who and when
update settings set value = '2.5' where key = 'margin_fba_surcharge_pct';
select expect((select count(*) from v_settings_history where key = 'margin_fba_surcharge_pct' and old_value = '2' and new_value = '2.5'
                and changed_by_name = 'Clayton' and changed_at > now() - interval '1 minute') = 1, 'MRG-02 AC4: setting change kept');
update settings set value = '2' where key = 'margin_fba_surcharge_pct';

-- Access: everyone reads; only an admin changes anything (MRG-02 AC3 and "Who can do what")
select test_as('00000000-0000-0000-0000-00000000000b');
select expect((select count(*) from v_margin_lines) = 3 and (select count(*) from settings where key like 'margin_%') = 8, 'Margins: data entry can read lines and settings');
update settings set value = '3' where key = 'margin_fba_surcharge_pct';
select expect((select value #>> '{}' from settings where key = 'margin_fba_surcharge_pct') = '2', 'MRG-02 AC3: data entry cannot change settings');
update margin_lines set selling_price = 1 where asin = 'B0FMHY3KW5';
select expect((select selling_price from margin_lines where asin = 'B0FMHY3KW5') = 9.49, 'Margins: data entry cannot change a line');
select expect_error($$insert into margin_lines (channel, company_code, name, selling_price, fx_rate) values ('AMAZON', 'CMR', 'x', 1, 100)$$, '%row-level security%');
select expect_error($$select use_todays_rate((select id from margin_lines limit 1))$$, '%Only an admin%');
select test_as('00000000-0000-0000-0000-00000000000c');
select expect((select count(*) from v_margin_lines) = 3, 'Margins: viewer can read');
select expect_error($$select copy_margin_line((select id from margin_lines limit 1), 'GOE')$$, '%Only an admin%');

reset role;
select test_as(null);
