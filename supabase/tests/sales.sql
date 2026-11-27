-- DSH-04: monthly sales per company, typed in by an admin (for now). Runs after cases.sql (Tanvi exists).
set role authenticated;

-- AC4: only an admin enters or changes sales
select test_as(clayton());
insert into company_sales (company_code, month, amount_gbp) values ('CMR', '2026-11-15', 12450);
select expect((select month from company_sales where company_code = 'CMR') = '2026-11-01', 'DSH-04: month kept as the 1st');
update company_sales set amount_gbp = 12500 where company_code = 'CMR' and month = '2026-11-01';
select expect((select count(*) from v_audit_log where table_name = 'company_sales' and action = 'UPDATE'
                and (old_data ->> 'amount_gbp')::numeric = 12450 and (new_data ->> 'amount_gbp')::numeric = 12500 and changed_by_name = 'Clayton') = 1,
              'DSH-04 AC4: every change is in the Audit log');
select expect_error($$insert into company_sales (company_code, month, amount_gbp) values ('ARC', '2026-11-01', -1)$$, '%company_sales_amount_gbp_check%');
select expect_error($$insert into company_sales (company_code, month, amount_gbp) values ('CMR', '2026-11-03', 1)$$, '%duplicate%');

select test_as(tanvi());
select expect_error($$insert into company_sales (company_code, month, amount_gbp) values ('ARC', '2026-11-01', 1)$$, '%row-level security%');
update company_sales set amount_gbp = 1 where company_code = 'CMR';
select expect((select amount_gbp from company_sales where company_code = 'CMR') = 12500, 'DSH-04 AC4: the India team cannot change sales');
-- everyone can see the tiles
select expect((select count(*) from company_sales) = 1, 'DSH-04: the India team can see sales');
select test_as('00000000-0000-0000-0000-00000000000c');
update company_sales set amount_gbp = 1 where company_code = 'CMR';
select expect((select amount_gbp from company_sales where company_code = 'CMR') = 12500 and (select count(*) from company_sales) = 1, 'DSH-04: a viewer can see but not change sales');

reset role;
select test_as(null);
