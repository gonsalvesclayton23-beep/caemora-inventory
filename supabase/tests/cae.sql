-- MRG-21: every margin line has a Caemora product identifier CAE + number, assigned in order, required, fixed. Runs after duplicates.sql.
set role authenticated;
select test_as(clayton());
create temporary table before_max as select max(substr(cae_code, 4)::int) as n from margin_products;
select expect(not exists (select 1 from margin_products where cae_code is null or cae_code !~ '^CAE[0-9]{4,}$'), 'MRG-21 AC2: every line has an ID like CAE0001');
select expect((select count(distinct cae_code) = count(*) from margin_products), 'MRG-21 AC2: IDs are unique');

-- AC1: a new line gets the next number, whatever is passed in
select save_margin_product('{"name": "CAE test one", "product_cost": 1, "courier_cost": 0, "fx_rate": 115, "platforms": []}');
select expect((select cae_code from margin_products where name = 'CAE test one') = 'CAE' || lpad(((select n from before_max) + 1)::text, 4, '0'), 'MRG-21 AC1: next number');
insert into margin_products (name, product_cost, courier_cost, fx_rate, cae_code) values ('CAE test two', 1, 0, 115, 'CAE9999');
select expect((select cae_code from margin_products where name = 'CAE test two') = 'CAE' || lpad(((select n from before_max) + 2)::text, 4, '0'), 'MRG-21 AC2: cannot be typed in by hand');

-- AC2: it cannot be changed, and a deleted line's number is not reused
select expect_error($$update margin_products set cae_code = 'CAE0500' where name = 'CAE test one'$$, '%cannot be changed%');
delete from margin_products where name = 'CAE test two';
select save_margin_product('{"name": "CAE test three", "product_cost": 1, "courier_cost": 0, "fx_rate": 115, "platforms": []}');
select expect((select cae_code from margin_products where name = 'CAE test three') = 'CAE' || lpad(((select n from before_max) + 3)::text, 4, '0'), 'MRG-21 AC2: numbers are never reused');

-- AC4: on the line in the list view
select expect((select count(*) from v_margin_lines where cae_code is null) = 0, 'MRG-21 AC4: in the list');
reset role;
select test_as(null);
