-- UI-04 (decision B, 25 Nov 2026): purchases with an invoice date from 25 Nov 2026 use the ECB daily rate of their
-- invoice date (the last published before it on weekends); earlier purchases keep the monthly Wise rate (LC-03).
-- The rate used is stored on each line, so its cost never shifts later. Runs after tests.sql.

set role authenticated;
select test_as('00000000-0000-0000-0000-00000000000a');
select expect_error($$select store_daily_rates('[{"date": "2026-11-24", "eur_inr": 104.5, "eur_gbp": 0.842}]')$$, '%permission denied%');
select test_as('00000000-0000-0000-0000-00000000000b');
select expect_error($$insert into daily_fx_rates (rate_date, inr_per_gbp) values ('2026-11-24', 1)$$, '%row-level security%');

-- the daily fetch (server only, with the service key) stores rates
reset role;
set role service_role;
select store_daily_rates('[{"date": "2026-11-20", "eur_inr": 103.9, "eur_gbp": 0.84},
                           {"date": "2026-11-24", "eur_inr": 104.5, "eur_gbp": 0.842}]');
reset role;
set role authenticated;
select test_as('00000000-0000-0000-0000-00000000000b');
select expect((select inr_per_gbp from daily_fx_rates where rate_date = '2026-11-24') = 124.1093, 'UI-04: ₹ per £ stored from the ECB euro rates');

-- a purchase invoiced 24 Nov (before the switch) keeps the monthly Wise rate
insert into purchase_lines (period_month, product_id, company_code, vendor_id, qty, unit_price, courier_per_unit, invoice_no, invoice_date)
select '2026-11-01', p.id, 'ARC', v.id, 10, 260, 130, 'FX-OLD', '2026-11-24'
  from products p, vendors v where p.name = 'Test ENO Regular 30s' and v.name = 'Peace Enterprises';
select expect((select fx_inr_per_gbp is null from purchase_lines where invoice_no = 'FX-OLD'), 'UI-04 B: before 25 Nov 2026 no daily rate is stored');
select expect((select fx_basis from v_purchase_lines where invoice_no = 'FX-OLD') = 'monthly', 'UI-04 B: earlier purchase converts at the monthly Wise rate');

-- invoiced Wed 25 Nov with no rate published yet for that day: the last published (24 Nov) is used
insert into purchase_lines (period_month, product_id, company_code, vendor_id, qty, unit_price, courier_per_unit, invoice_no, invoice_date)
select '2026-11-01', p.id, 'ARC', v.id, 10, 260, 130, 'FX-NEW', '2026-11-25'
  from products p, vendors v where p.name = 'Test ENO Regular 30s' and v.name = 'Peace Enterprises';
select expect((select fx_inr_per_gbp = 124.1093 and fx_rate_date = '2026-11-24' from purchase_lines where invoice_no = 'FX-NEW'),
              'UI-04 B: new purchase stores the daily rate for its invoice date (last published)');
select expect((select fx_basis = 'daily' and round(landed_per_unit_gbp, 4) = round(390 / 124.1093, 4) from v_purchase_lines where invoice_no = 'FX-NEW'),
              'UI-04 B: landed cost in £ uses the daily rate');

-- AC5 (changed): a later rate never changes a line's stored rate, nor balances or payments
select test_as('00000000-0000-0000-0000-00000000000a');
create temporary table before_rec as select vendor_id, company_code, period_month, currency, closing_balance from v_reconciliation;
create temporary table before_pay as select id, amount, amount_gbp from payments;
reset role;
set role service_role;
select store_daily_rates('[{"date": "2026-11-25", "eur_inr": 106.0, "eur_gbp": 0.84}]');
reset role;
set role authenticated;
select test_as('00000000-0000-0000-0000-00000000000a');
select expect((select fx_inr_per_gbp from purchase_lines where invoice_no = 'FX-NEW') = 124.1093, 'UI-04 AC5: stored rate never shifts');
select expect(not exists (select 1 from v_reconciliation r join before_rec b using (vendor_id, company_code, period_month, currency)
                           where r.closing_balance <> b.closing_balance), 'UI-04 AC5: balances unchanged');
select expect(not exists (select 1 from payments p join before_pay b using (id) where (p.amount, p.amount_gbp) <> (b.amount, b.amount_gbp)),
              'UI-04 AC5: payments unchanged');

-- a weekend invoice uses Friday's rate
insert into purchase_lines (period_month, product_id, company_code, vendor_id, qty, unit_price, courier_per_unit, invoice_no, invoice_date)
select '2026-11-01', p.id, 'ARC', v.id, 1, 260, 130, 'FX-SUN', '2026-11-29'
  from products p, vendors v where p.name = 'Test ENO Regular 30s' and v.name = 'Peace Enterprises';
select expect((select fx_rate_date from purchase_lines where invoice_no = 'FX-SUN') = '2026-11-25', 'UI-04 B: weekend uses the last published rate');

reset role;
select test_as(null);
