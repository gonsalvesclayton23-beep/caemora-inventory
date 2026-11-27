-- SHP-08: record what was received (at home or at Amazon) and act on shortages. Runs after cases.sql (Tanvi, Raj, Clayton).
create or replace function item_of(p_box text, p_product text) returns bigint language sql as $$
  select i.id from shipment_items i join shipments s on s.id = i.shipment_id join purchase_lines pl on pl.id = i.purchase_line_id
   join products p on p.id = pl.product_id where s.box_no = p_box and p.name = p_product
$$;
grant execute on function item_of(text, text) to authenticated;

set role authenticated;
select test_as(clayton());
insert into products (name) values ('ENO Regular 30''s R'), ('Colgate Slim Soft R'), ('Colgate dental floss 50m R');
update case_rules set assign_to = 'person', assignee = raj() where rule = 'check_with_supplier';   -- "India team lead"

select test_as(tanvi());
insert into purchase_lines (period_month, product_id, company_code, vendor_id, qty, unit_price, courier_per_unit, invoice_no, invoice_date)
select '2026-12-01', p.id, 'ARC', v.id, x.qty, 100, 10, x.inv, '2026-12-02'
  from (values ('ENO Regular 30''s R', 50, 'PE-R150'), ('Colgate Slim Soft R', 40, 'PE-R150'), ('Colgate dental floss 50m R', 40, 'PE-R140')) x(name, qty, inv)
  join products p on p.name = x.name, vendors v where v.name = 'Peace Enterprises';
select put_in_box((select jsonb_agg(jsonb_build_object('line_id', id, 'qty', qty)) from purchase_lines where invoice_no = 'PE-R150'),
                  null, jsonb_build_object('company_code', 'ARC', 'box_no', 'R3', 'amazon_shipment_id', 'FBA15SHP08X', 'created_on', '2026-12-03'));
select put_in_box((select jsonb_agg(jsonb_build_object('line_id', id, 'qty', qty)) from purchase_lines where invoice_no = 'PE-R140'),
                  null, jsonb_build_object('company_code', 'ARC', 'box_no', 'R7', 'created_on', '2026-12-03'));

-- Destination: FBA… boxes start as Amazon warehouse, others as Home (UK); only an admin changes it
select expect((select destination from shipments where box_no = 'R3') = 'amazon' and (select destination from shipments where box_no = 'R7') = 'home',
              'SHP-08 Destination: set from the Amazon shipment ID');
select expect_error($$update shipments set destination = 'amazon' where box_no = 'R7'$$, '%Only an admin%');

-- SHP-08 Lock: December is settled; receipts can still be entered and corrected, prices/quantities/companies cannot
select test_as(clayton());
select settle_month('2026-12-01');
select test_as(tanvi());
select expect_error($$update purchase_lines set unit_price = 1 where invoice_no = 'PE-R150'$$, '%settled%');
select expect_error($$update purchase_lines set qty = 1 where invoice_no = 'PE-R140'$$, '%settled%');
select expect_error($$update purchase_lines set company_code = 'GOE' where invoice_no = 'PE-R140'$$, '%settled%');

-- SHP-08 AC1: Amazon's count of 48 and 40, entered by the India team (with who and when)
update shipment_items set short_qty = 2 where id = item_of('R3', 'ENO Regular 30''s R');
update shipment_items set short_qty = 0 where id = item_of('R3', 'Colgate Slim Soft R');
update shipments set status = 'received_partial', received_on = '2026-12-10', received_by = 'Amazon' where box_no = 'R3';
select expect((select counted_by = tanvi() and counted_at > now() - interval '1 minute' from shipment_items where id = item_of('R3', 'ENO Regular 30''s R')),
              'SHP-08 AC1: saved with who and when');
select expect((select sum(qty) = 90 and sum(qty - short_qty) = 88 and sum(short_qty) = 2 from shipment_items where shipment_id = (select id from shipments where box_no = 'R3')),
              'SHP-08 AC1: 88 of 90, 2 short');
select expect((select short_qty from purchase_lines where invoice_no = 'PE-R150' and product_id = (select id from products where name = 'ENO Regular 30''s R')) = 2,
              'SHP-08 AC1: the line follows the box (settled month)');

-- SHP-08 AC4: Amazon box short → "Raise Amazon case" case (to the admin until someone is chosen)
select test_as(clayton());
select expect((select count(*) from v_cases where rule = 'raise_amazon_case' and entity_id = item_of('R3', 'ENO Regular 30''s R') and status = 'open' and assigned_to = clayton()
                and title = 'Raise Amazon case: 2 short, ENO Regular 30''s R, FBA15SHP08X' and link = '/shipments/' || (select id from shipments where box_no = 'R3')) = 1,
              'SHP-08 AC4: "Raise Amazon case" case created');
select set_case_reference((select id from cases where rule = 'raise_amazon_case' and entity_id = item_of('R3', 'ENO Regular 30''s R') and status = 'open'), '12151530462');
select expect((select status = 'in_progress' and external_ref = '12151530462' from cases where rule = 'raise_amazon_case' and entity_id = item_of('R3', 'ENO Regular 30''s R')),
              'SHP-08 AC4: "Case raised with Amazon"');
select expect((select amazon_case_id from shipment_items where id = item_of('R3', 'ENO Regular 30''s R')) = '12151530462', 'SHP-08 AC4: case ID kept on the box line');

-- SHP-08 AC2: corrected 48 → 50: history kept, shortage 0, case closes by itself
select test_as(raj());
update shipment_items set short_qty = 0 where id = item_of('R3', 'ENO Regular 30''s R');
select expect((select count(*) from v_receipt_history where item_id = item_of('R3', 'ENO Regular 30''s R') and old_received = 48 and new_received = 50
                and by_name = 'Raj' and at > now() - interval '1 minute') = 1, 'SHP-08 AC2: history shows 48 → 50 with who and when');
select expect((select short_qty from shipment_items where id = item_of('R3', 'ENO Regular 30''s R')) = 0, 'SHP-08 AC2: shortage 0');
select test_as(clayton());
select expect((select status = 'resolved' and resolution = 'fix' from cases where rule = 'raise_amazon_case' and entity_id = item_of('R3', 'ENO Regular 30''s R')),
              'SHP-08 AC2: the shortage case closes by itself');

-- SHP-08 AC3: Home box 7, 38 of 40 → "Check with supplier" case (to the person chosen for the rule)
select test_as(tanvi());
update shipment_items set short_qty = 2 where id = item_of('R7', 'Colgate dental floss 50m R');
select test_as(clayton());
select expect((select count(*) from cases where rule = 'check_with_supplier' and entity_id = item_of('R7', 'Colgate dental floss 50m R') and status = 'open' and assigned_to = raj()
                and title = 'Check with supplier: 2 short, Colgate dental floss 50m R, box R7, invoice PE-R140') = 1,
              'SHP-08 AC3: "Check with supplier" case created');
select test_as(tanvi());
select expect_error($$update shipment_items set short_qty = 41 where id = item_of('R7', 'Colgate dental floss 50m R')$$, '%more than%');

-- Defective units are followed up the same way
update shipment_items set defective_qty = 1 where id = item_of('R7', 'Colgate dental floss 50m R');
select test_as(clayton());
select expect((select title from cases where rule = 'check_with_supplier' and entity_id = item_of('R7', 'Colgate dental floss 50m R') and status = 'open') = 'Check with supplier: 2 short, 1 defective, Colgate dental floss 50m R, box R7, invoice PE-R140',
              'SHP-08 Defective: on the case too');
select expect((select count(*) from cases where rule = 'check_with_supplier' and entity_id = item_of('R7', 'Colgate dental floss 50m R')) = 1, 'SHP-08: one case per box line, kept up to date');

-- SHP-08 AC5: the owner records the outcome → case closes, box line shows the outcome
create temporary table r7case as select id from cases where rule = 'check_with_supplier' and entity_id = item_of('R7', 'Colgate dental floss 50m R') and status = 'open';
select test_as(tanvi());
select expect_error($$select resolve_shortage((select id from r7case), 'supplier_credit_note', null, 'CN-9')$$, '%not assigned to you%');
select test_as(raj());
select expect_error($$select resolve_shortage((select id from cases where rule = 'check_with_supplier' and entity_id = item_of('R7', 'Colgate dental floss 50m R') and status = 'open'), 'amazon_reimbursed', null, null)$$, '%amount%');
select resolve_shortage((select id from cases where rule = 'check_with_supplier' and entity_id = item_of('R7', 'Colgate dental floss 50m R') and status = 'open'), 'supplier_credit_note', null, 'Credit note CN-9');
select test_as(clayton());
select expect((select status = 'resolved' and resolution = 'outcome' and outcome = 'supplier_credit_note' from cases where rule = 'check_with_supplier' and entity_id = item_of('R7', 'Colgate dental floss 50m R')),
              'SHP-08 AC5: case closes with the outcome');
select expect((select outcome = 'supplier_credit_note' and outcome_by = raj() and short_qty = 2 from shipment_items where id = item_of('R7', 'Colgate dental floss 50m R')),
              'SHP-08 AC5: box line shows the outcome');
select expect((select count(*) from flags where rule = 'check_with_supplier' and entity_id = item_of('R7', 'Colgate dental floss 50m R') and status = 'open') = 0, 'SHP-08 AC5: no open flag left');

-- AC5 with Amazon reimbursed (£ amount)
select test_as(tanvi());
update shipment_items set short_qty = 3 where id = item_of('R3', 'Colgate Slim Soft R');
select test_as(clayton());
select resolve_shortage((select id from cases where rule = 'raise_amazon_case' and entity_id = item_of('R3', 'Colgate Slim Soft R') and status = 'open'), 'amazon_reimbursed', 38.22, null);
select expect((select outcome = 'amazon_reimbursed' and outcome_gbp = 38.22 from shipment_items where id = item_of('R3', 'Colgate Slim Soft R')), 'SHP-08 AC5: Amazon reimbursed £38.22');

reset role;
select test_as(null);
