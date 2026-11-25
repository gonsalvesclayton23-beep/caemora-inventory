-- PUR-06: group several products into one shipment box. Runs after tests.sql (users ...a admin, ...b data entry, ...c viewer).
-- Decisions 25 Nov 2026: receipts per box for split lines; FBM/UK boxes may mix companies; "30 of 50 shipped";
-- contents can change while the box is In transit, not after it is received.

-- helpers (as the database owner)
create or replace function line_id(p_invoice text, p_product text) returns bigint language sql as $$
  select pl.id from purchase_lines pl join products p on p.id = pl.product_id where pl.invoice_no = p_invoice and p.name = p_product
$$;
create or replace function box_id(p_box text) returns bigint language sql as $$ select id from shipments where box_no = p_box $$;
grant execute on function line_id(text, text), box_id(text) to authenticated;

set role authenticated;
select test_as('00000000-0000-0000-0000-00000000000a');
insert into products (name) values ('ENO Regular 30s B'), ('Colgate Slim Soft B'), ('Vicks Inhaler B'), ('Himalaya Neem B'), ('Betadine B');


select test_as('00000000-0000-0000-0000-00000000000b');
-- invoice PE-131 for ARC: 5 lines, 150 units
insert into purchase_lines (period_month, product_id, company_code, vendor_id, qty, unit_price, courier_per_unit, invoice_no, invoice_date)
select '2026-11-01', p.id, 'ARC', v.id, x.qty, 100, 10, 'PE-131', '2026-11-21'
  from (values ('ENO Regular 30s B', 50), ('Colgate Slim Soft B', 40), ('Vicks Inhaler B', 30), ('Himalaya Neem B', 20), ('Betadine B', 10)) x(name, qty)
  join products p on p.name = x.name, vendors v where v.name = 'Peace Enterprises';
-- PE-140 for ARC (AC3), PE-142 for ARC with 50 ENO (AC4), PE-141 for Goenche (AC5)
insert into purchase_lines (period_month, product_id, company_code, vendor_id, qty, unit_price, courier_per_unit, invoice_no, invoice_date)
select '2026-11-01', p.id, x.co, v.id, x.qty, 100, 10, x.inv, '2026-11-22'
  from (values ('PE-140', 'Vicks Inhaler B', 'ARC', 12), ('PE-142', 'ENO Regular 30s B', 'ARC', 50), ('PE-141', 'Betadine B', 'GOE', 8),
               ('PE-144', 'Himalaya Neem B', 'ARC', 5)) x(inv, name, co, qty)
  join products p on p.name = x.name, vendors v where v.name = 'Peace Enterprises';

-- AC1: tick all 5 lines of PE-131 and "Put in one box" with box 3, FBA15MRYZWHR
select expect(put_in_box((select jsonb_agg(jsonb_build_object('line_id', id, 'qty', qty)) from purchase_lines where invoice_no = 'PE-131'),
                         null, jsonb_build_object('company_code', 'ARC', 'box_no', '3', 'amazon_shipment_id', 'FBA15MRYZWHR', 'created_on', '2026-11-23')) > 0,
              'PUR-06 AC1: put in one box');
select expect((select count(*) from shipments where amazon_shipment_id = 'FBA15MRYZWHR') = 1
              and (select count(*) from v_shipment_contents where shipment_id = box_id('3')) = 5
              and (select sum(qty) from v_shipment_contents where shipment_id = box_id('3')) = 150,
              'PUR-06 AC1: one shipment, 5 products, 150 units');

-- AC2: each product, its units, its invoice number and company, and the 150 total
select expect((select bool_and(product_name is not null and qty > 0 and invoice_no = 'PE-131' and company_code = 'ARC')
                 from v_shipment_contents where shipment_id = box_id('3'))
              and (select units from v_shipment_totals where shipment_id = box_id('3')) = 150,
              'PUR-06 AC2: contents and total');

-- AC3: add PE-140 to box 3; each keeps its own invoice number
select put_in_box(jsonb_build_array(jsonb_build_object('line_id', line_id('PE-140', 'Vicks Inhaler B'), 'qty', 12)), box_id('3'), null);
select expect((select array_agg(distinct invoice_no order by invoice_no) from v_shipment_contents where shipment_id = box_id('3')) = array['PE-131', 'PE-140'],
              'PUR-06 AC3: both invoice numbers in box 3');

-- AC4: 30 of PE-142's 50 ENO in box 5 and 20 in box 6
select put_in_box(jsonb_build_array(jsonb_build_object('line_id', line_id('PE-142', 'ENO Regular 30s B'), 'qty', 30)),
                  null, jsonb_build_object('company_code', 'ARC', 'box_no', '5', 'amazon_shipment_id', 'FBA15AAAA005'));
select expect((select summary from v_line_boxes where purchase_line_id = line_id('PE-142', 'ENO Regular 30s B')) = '30 of 50 shipped',
              'PUR-06 decision: "30 of 50 shipped" while partly boxed');
select put_in_box(jsonb_build_array(jsonb_build_object('line_id', line_id('PE-142', 'ENO Regular 30s B'), 'qty', 20)),
                  null, jsonb_build_object('company_code', 'ARC', 'box_no', '6', 'amazon_shipment_id', 'FBA15AAAA006'));
select expect((select qty from v_shipment_contents where shipment_id = box_id('5')) = 30
              and (select qty from v_shipment_contents where shipment_id = box_id('6')) = 20
              and (select summary from v_line_boxes where purchase_line_id = line_id('PE-142', 'ENO Regular 30s B')) = '50 shipped in 2 boxes',
              'PUR-06 AC4: each box shows its part; "50 shipped in 2 boxes"');
select expect_error($$select put_in_box(jsonb_build_array(jsonb_build_object('line_id', line_id('PE-142', 'ENO Regular 30s B'), 'qty', 10)), box_id('6'), null)$$,
                    '%Only 0 of 50 units are left to put in a box%');
select expect_error($$update shipment_items set qty = 40 where shipment_id = box_id('5')$$, '%Only 30 of 50 units are left to put in a box%');

-- AC5: an ARC line and a Goenche line in the same Amazon box is refused
select expect_error($$select put_in_box(jsonb_build_array(jsonb_build_object('line_id', line_id('PE-141', 'Betadine B'), 'qty', 8)), box_id('3'), null)$$,
                    '%An Amazon shipment can only hold one company''s stock%');
select expect_error($$select put_in_box(jsonb_build_array(
                        jsonb_build_object('line_id', line_id('PE-141', 'Betadine B'), 'qty', 1),
                        jsonb_build_object('line_id', line_id('PE-144', 'Himalaya Neem B'), 'qty', 1)),
                      null, jsonb_build_object('company_code', 'GOE', 'box_no', '7', 'amazon_shipment_id', 'FBA15AAAA007'))$$,
                    '%An Amazon shipment can only hold one company''s stock%');
-- decision: a UK (FBM) box may mix companies
select expect(put_in_box(jsonb_build_array(jsonb_build_object('line_id', line_id('PE-141', 'Betadine B'), 'qty', 4)),
                         null, jsonb_build_object('company_code', 'GOE', 'box_no', 'UK-1', 'channel', 'FBM')) > 0, 'PUR-06: UK box');
insert into purchase_lines (period_month, product_id, company_code, vendor_id, qty, unit_price, courier_per_unit, invoice_no, invoice_date)
select '2026-11-01', p.id, 'CMR', v.id, 6, 100, 10, 'PE-143', '2026-11-22'
  from products p, vendors v where p.name = 'Betadine B' and v.name = 'Peace Enterprises';
select put_in_box(jsonb_build_array(jsonb_build_object('line_id', line_id('PE-143', 'Betadine B'), 'qty', 6)), box_id('UK-1'), null);
select expect((select count(distinct company_code) from v_shipment_contents where shipment_id = box_id('UK-1')) = 2,
              'PUR-06 decision: FBM/UK boxes may mix companies');

-- Decision: receipts per box for a split line, added up on the line
update shipment_items set short_qty = 1, remarks = 'case raised' where shipment_id = box_id('5');
update shipment_items set defective_qty = 2 where shipment_id = box_id('6');
select expect((select short_qty = 1 and defective_qty = 2 and received_qty = 47 from purchase_lines where id = line_id('PE-142', 'ENO Regular 30s B')),
              'PUR-06 decision: per-box receipts add up on the line');
select expect((select received_qty from v_shipment_contents where shipment_id = box_id('5')) = 29, 'PUR-06: box 5 received 29');
select expect_error($$update purchase_lines set short_qty = 3 where id = line_id('PE-142', 'ENO Regular 30s B')$$, '%Record shortages on each box%');

-- Lines in a single box work exactly as today (line receipt fields still work)
update purchase_lines set short_qty = 2 where id = line_id('PE-131', 'Betadine B');
select expect((select short_qty from shipment_items where purchase_line_id = line_id('PE-131', 'Betadine B')) = 2,
              'PUR-06: single-box line receives as today');

-- Decision: contents can change while In transit, not once received
update shipment_items set qty = 3 where shipment_id = box_id('UK-1') and purchase_line_id = line_id('PE-141', 'Betadine B');
select expect((select summary from v_line_boxes where purchase_line_id = line_id('PE-141', 'Betadine B')) = '3 of 8 shipped',
              'PUR-06 decision: reduce a line in an In-transit box');
delete from shipment_items where shipment_id = box_id('UK-1') and purchase_line_id = line_id('PE-143', 'Betadine B');
select expect(not exists (select 1 from v_line_boxes where purchase_line_id = line_id('PE-143', 'Betadine B')),
              'PUR-06 decision: remove a line from an In-transit box');
update shipments set status = 'received', received_on = '2026-11-25' where box_no = 'UK-1';
select expect_error($$delete from shipment_items where shipment_id = box_id('UK-1')$$, '%has already been received%');
select expect_error($$update shipment_items set qty = 1 where shipment_id = box_id('UK-1')$$, '%has already been received%');
update shipment_items set short_qty = 1 where shipment_id = box_id('UK-1');
select expect((select short_qty from purchase_lines where id = line_id('PE-141', 'Betadine B')) = 1, 'PUR-06: receipts still recorded once received');

-- The existing ways of putting a whole invoice in a box keep working (PUR-01 AC3, SHP-01 AC2)
insert into shipments (period_month, company_code, channel, box_no) values ('2026-11-01', 'CMR', 'FBM', 'OLD-WAY');
insert into purchase_lines (period_month, shipment_id, product_id, company_code, vendor_id, qty, unit_price, courier_per_unit, invoice_no, invoice_date)
select '2026-11-01', box_id('OLD-WAY'), p.id, 'CMR', v.id, 7, 100, 10, 'PE-150', '2026-11-24'
  from products p, vendors v where p.name = 'Betadine B' and v.name = 'Peace Enterprises';
select expect((select qty from v_shipment_contents where shipment_id = box_id('OLD-WAY')) = 7, 'PUR-06: a purchase saved into a box is in its contents');
update purchase_lines set qty = 9 where invoice_no = 'PE-150';
select expect((select qty from v_shipment_contents where shipment_id = box_id('OLD-WAY')) = 9, 'PUR-06: single-box line quantity follows the line');

-- viewers cannot change boxes
select test_as('00000000-0000-0000-0000-00000000000c');
select expect_error($$select put_in_box(jsonb_build_array(jsonb_build_object('line_id', line_id('PE-141', 'Betadine B'), 'qty', 1)),
                      null, jsonb_build_object('company_code', 'GOE', 'box_no', 'X'))$$, '%row-level security%');

reset role;
select test_as(null);
