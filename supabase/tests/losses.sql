-- LOS-01..LOS-04. Runs after cae.sql (Tanvi data entry, Clayton admin, ...c viewer; boxes R3/R7 from receiving.sql).
set role authenticated;

-- LOS-02: the landed cost per unit in £ of a product's latest purchase is offered
select test_as(tanvi());
select expect((select landed_cost_gbp(id) from products where name = 'Colgate dental floss 50m R') > 0, 'LOS-02: landed cost per unit in £ offered');

-- LOS-01 AC1: the India team records a loss; saved with who and when; month from the date; net worked out
insert into losses (occurred_on, type, company_code, platform, product_id, qty, unit_cost_gbp, refund_gbp, recovered_gbp, reference, notes)
select '2026-11-20', 'refunded_no_return', 'YD', 'EBAY', id, 3, 1.39, 8.99, 2, 'EBAY-ORDER-1', 'buyer kept it' from products where name = 'Colgate dental floss 50m R';
select expect((select month = '2026-11-01' and goods_gbp = 4.17 and net_loss_gbp = 11.16 and created_by = tanvi() and created_at > now() - interval '1 minute'
                 from losses where reference = 'EBAY-ORDER-1'), 'LOS-01/02: saved with who, when, month and net loss');
select expect((select recorded_by_name = 'Tanvi' and product_name = 'Colgate dental floss 50m R' from v_losses where reference = 'EBAY-ORDER-1'), 'LOS-01: names shown');
select expect_error($$insert into losses (occurred_on, type, company_code, product_id, qty, unit_cost_gbp) select '2026-11-20', 'stolen', 'YD', id, 1, 1 from products limit 1$$, '%losses_type_check%');
select expect_error($$insert into losses (occurred_on, type, company_code, product_id, qty, unit_cost_gbp) select '2026-11-20', 'expired', 'YD', id, 0, 1 from products limit 1$$, '%losses_qty_check%');

-- question 5: a loss can be recorded or corrected in a settled month (December was settled in receiving.sql)
insert into losses (occurred_on, type, company_code, product_id, qty, unit_cost_gbp, reference)
select '2026-12-15', 'expired', 'ARC', id, 2, 1.5, 'EXP-DEC' from products where name = 'ENO Regular 30''s R';
update losses set qty = 3 where reference = 'EXP-DEC';
select expect((select qty = 3 and net_loss_gbp = 4.5 from losses where reference = 'EXP-DEC'), 'LOS: recorded and corrected in a settled month');
select expect((select count(*) from audit_log where table_name = 'losses') = 0, '(the India team cannot read the Audit log)');

-- only an admin deletes; a viewer only reads
delete from losses where reference = 'EXP-DEC';
select expect((select count(*) from losses where reference = 'EXP-DEC') = 1, 'LOS: the India team cannot delete a loss');
select test_as('00000000-0000-0000-0000-00000000000c');
select expect((select count(*) from v_losses) >= 2, 'LOS: a viewer can read losses');
select expect_error($$insert into losses (occurred_on, type, company_code, product_id, qty, unit_cost_gbp) select '2026-11-20', 'expired', 'YD', id, 1, 1 from products limit 1$$, '%row-level security%');
select test_as(clayton());
select expect((select count(*) from v_audit_log where table_name = 'losses' and action = 'UPDATE') = 1, 'LOS: every change is in the Audit log');
delete from losses where reference = 'EXP-DEC';
select expect((select count(*) from losses where reference = 'EXP-DEC') = 0, 'LOS: an admin can delete');

-- LOS-04: a lost box's contents, with each line's own landed cost per unit and units already recorded as lost
update shipments set status = 'lost' where box_no = 'R7';
select expect((select count(*) = 1 and min(qty) = 40 and min(unit_cost_gbp) > 0 and min(already_recorded) = 0 from loss_lines_for_shipment((select id from shipments where box_no = 'R7'))),
              'LOS-04: lost box contents offered with landed cost');
insert into losses (occurred_on, type, company_code, platform, product_id, qty, unit_cost_gbp, shipment_id)
select current_date, 'lost_in_transit', l.company_code, null, l.product_id, l.qty, l.unit_cost_gbp, (select id from shipments where box_no = 'R7')
  from loss_lines_for_shipment((select id from shipments where box_no = 'R7')) l;
select expect((select min(already_recorded) = 40 from loss_lines_for_shipment((select id from shipments where box_no = 'R7'))), 'LOS-04: already recorded shows, so nothing is counted twice');
reset role;
select test_as(null);
