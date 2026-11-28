-- PRD-08 and MRG-19: the database refuses a new product or margin line that already exists. Runs after margins10.sql.
set role authenticated;
select test_as(tanvi());

-- PRD-08 AC1/AC2: same name ignoring capitals, spaces and punctuation is refused; a different name saves
insert into products (name) values ('Dup Test Colgate Floss 50m');
select expect_error($$insert into products (name) values ('dup test colgate floss – 50M')$$, '%Already created: Dup Test Colgate Floss 50m%');
insert into products (name) values ('Dup Test Colgate Floss 50m (pack of 2)');
select expect((select count(*) from products where name ilike 'Dup Test Colgate%') = 2, 'PRD-08 AC2/AC4: a different (similar) product saves');

-- PRD-08 AC3: an FNSKU or ASIN already on another product is refused; the same ASIN on the same product for another company is fine
insert into listings (product_id, company_code, channel, fnsku, asin) select id, 'ARC', 'FBA', 'XDUPFNSKU1', 'BDUPASIN01' from products where name = 'Dup Test Colgate Floss 50m';
select expect_error($$insert into listings (product_id, company_code, channel, fnsku) select id, 'GOE', 'FBA', 'XDUPFNSKU1' from products where name = 'Dup Test Colgate Floss 50m (pack of 2)'$$,
                    '%Already created: Dup Test Colgate Floss 50m (FNSKU XDUPFNSKU1)%');
select expect_error($$insert into listings (product_id, company_code, channel, asin) select id, 'GOE', 'FBA', 'bdupasin01' from products where name = 'Dup Test Colgate Floss 50m (pack of 2)'$$,
                    '%Already created: Dup Test Colgate Floss 50m (ASIN BDUPASIN01)%');
insert into listings (product_id, company_code, channel, asin) select id, 'GOE', 'FBA', 'BDUPASIN01' from products where name = 'Dup Test Colgate Floss 50m';
select expect((select count(*) from listings where asin = 'BDUPASIN01') = 2, 'PRD-08: the same product can be listed by another company');

-- MRG-19: the same checks on new margin lines
select test_as(clayton());
select save_margin_product('{"name": "Dup Margin Soap 75g", "asin": "BDUPMRG001", "product_cost": 90, "courier_cost": 70, "fx_rate": 115, "platforms": []}');
select expect_error($$select save_margin_product('{"name": "dup margin soap – 75G", "product_cost": 1, "courier_cost": 0, "fx_rate": 115, "platforms": []}')$$, '%Already created: Dup Margin Soap 75g%');
select expect_error($$select save_margin_product('{"name": "Other soap", "asin": "bdupmrg001", "product_cost": 1, "courier_cost": 0, "fx_rate": 115, "platforms": []}')$$, '%Already created: Dup Margin Soap 75g (ASIN BDUPMRG001)%');
select expect(save_margin_product('{"name": "Dup Margin Soap 75g (pack of 2)", "product_cost": 1, "courier_cost": 0, "fx_rate": 115, "platforms": []}') > 0, 'MRG-19 AC4: a similar name saves');
-- saving an existing line again (same name) is not a duplicate of itself
select expect(save_margin_product(jsonb_build_object('id', (select id from margin_products where name = 'Dup Margin Soap 75g'), 'name', 'Dup Margin Soap 75g', 'asin', 'BDUPMRG001',
  'product_cost', 95, 'courier_cost', 70, 'fx_rate', 115, 'platforms', '[]'::jsonb)) > 0, 'MRG-19: editing a line is fine');
reset role;
select test_as(null);
