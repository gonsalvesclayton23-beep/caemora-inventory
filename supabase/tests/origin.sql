-- DSH-06: units, goods and courier per month by where the supplier is (India in ₹, China in £). Runs after sales.sql.
set role authenticated;
select test_as(clayton());
insert into vendors (name, country, default_currency, kind) values ('Shenzhen Test Co', 'CN', 'GBP', 'alibaba'), ('UK Box Co', 'GB', 'GBP', 'supplier');
insert into products (name) values ('Origin test IN'), ('Origin test CN'), ('Origin test GB');
insert into purchase_lines (period_month, product_id, company_code, vendor_id, qty, unit_price, courier_per_unit, currency, invoice_no, invoice_date)
select '2027-01-01', p.id, 'ARC', v.id, x.qty, x.price, x.courier, x.cur::currency_code, 'OR-1', '2027-01-10'
  from (values ('Origin test IN', 'Peace Enterprises', 1000, 180, 50, 'INR'), ('Origin test CN', 'Shenzhen Test Co', 300, 1.65, 0.40, 'GBP'),
               ('Origin test GB', 'UK Box Co', 50, 2, 0, 'GBP')) x(prod, vendor, qty, price, courier, cur)
  join products p on p.name = x.prod join vendors v on v.name = x.vendor;
select expect((select units = 1000 and goods = 180000 and courier = 50000 from dashboard_by_origin(1, '2027-01-01') where origin = 'IN'),
              'DSH-06: India = Indian suppliers, in ₹');
select expect((select units = 300 and goods = 495 and courier = 120 from dashboard_by_origin(1, '2027-01-01') where origin = 'CN'),
              'DSH-06: China = Chinese suppliers, in £');
select expect((select count(*) from dashboard_by_origin(1, '2027-01-01')) = 2, 'DSH-06: other suppliers (e.g. UK packaging) are not in either diagram');
select expect((select count(distinct month) from dashboard_by_origin(12, '2027-01-01')) = 12, 'DSH-06: 12 months, each one present');
select test_as(tanvi());
select expect((select units from dashboard_by_origin(1, '2027-01-01') where origin = 'IN') = 1000, 'DSH-06: everyone can see it');
reset role;
select test_as(null);
