-- Behavioural tests for roles, the settled-month lock, flags and reconciliation.
-- Runs as postgres, switching into the `authenticated` role with a fake JWT subject.

create or replace function test_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
$$;

create or replace function expect_error(p_sql text, p_like text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'TEST FAILED: expected error like "%" from: %', p_like, p_sql;
exception when others then
  if sqlerrm like 'TEST FAILED%' then raise; end if;
  if sqlerrm not ilike p_like then
    raise exception 'TEST FAILED: expected error like "%", got "%"', p_like, sqlerrm;
  end if;
end $$;

create or replace function expect(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'TEST FAILED: %', p_what; end if;
end $$;
grant execute on function test_as(uuid), expect_error(text, text), expect(boolean, text) to authenticated;

-- users ------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'india@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'viewer@example.test'),
  ('00000000-0000-0000-0000-00000000000d', 'newbie@example.test');
update profiles set role = 'admin', active = true where id = '00000000-0000-0000-0000-00000000000a';
update profiles set role = 'data_entry', active = true where id = '00000000-0000-0000-0000-00000000000b';
update profiles set role = 'viewer', active = true where id = '00000000-0000-0000-0000-00000000000c';
-- ...d stays as the default: inactive data_entry

-- India team enters a purchase ------------------------------------------------------
set role authenticated;
select test_as('00000000-0000-0000-0000-00000000000b');

insert into products (name, agreed_courier_per_unit) values ('Test ENO Regular 30s', 1);
select expect((select agreed_courier_per_unit from products where name = 'Test ENO Regular 30s') is null,
              'data entry cannot set a rate card on insert');

insert into shipments (period_month, company_code, channel, amazon_shipment_id, tracking_no, created_on)
values ('2026-10-15', 'ARC', 'FBA', 'FBA15TEST001', 'TRK1', '2026-10-15');
select expect((select period_month from shipments where amazon_shipment_id = 'FBA15TEST001') = '2026-10-01',
              'period_month normalised to the 1st');

insert into purchase_lines (period_month, shipment_id, product_id, company_code, vendor_id, qty, unit_price, courier_per_unit, invoice_no)
select '2026-10-01', s.id, p.id, 'ARC', v.id, 10, 260, 125, 'PE-1'
  from shipments s, products p, vendors v
 where s.amazon_shipment_id = 'FBA15TEST001' and p.name = 'Test ENO Regular 30s' and v.name = 'Peace Enterprises';

insert into purchase_lines (period_month, product_id, company_code, vendor_id, qty, unit_price, courier_per_unit)
select '2026-11-01', p.id, 'ARC', v.id, 20, 280, 130
  from products p, vendors v where p.name = 'Test ENO Regular 30s' and v.name = 'Peace Enterprises';

select expect((select line_total from purchase_lines where period_month = '2026-11-01') = 20 * (280 + 130), 'line total');
select expect((select count(*) from flags where rule = 'price_change') = 1, 'price change flag (260 -> 280 is 7.7%)');
select expect((select count(*) from flags where rule = 'courier_change') = 1, 'courier change flag (125 -> 130)');
select expect((select count(*) from flags where rule = 'missing_invoice_no') = 1, 'missing invoice flag on Nov line only');

select expect((select count(*) from payments) = 0, 'data entry cannot see payments');
select expect_error($$update products set agreed_courier_per_unit = 100 where name = 'Test ENO Regular 30s'$$,
                    '%Only an admin can change the agreed rate card%');
select expect_error($$select settle_month('2026-10-01')$$, '%Only an admin%');

-- Admin: rate card, payments, settle -----------------------------------------------
select test_as('00000000-0000-0000-0000-00000000000a');
update products set agreed_courier_per_unit = 125 where name = 'Test ENO Regular 30s';
select refresh_all_flags();
select expect((select count(*) from flags where rule = 'courier_above_rate_card' and status = 'open') = 1,
              'Nov courier 130 is above the agreed 125, Oct 125 is not');

insert into payments (period_month, company_code, vendor_id, kind, amount, amount_gbp, paid_on, method, reference)
select '2026-10-01', 'ARC', id, 'opening', 2000, 16, '2026-10-10', 'Wise', 'W1' from vendors where name = 'Peace Enterprises';
select recompute_fx_from_payments();
select expect((select inr_per_gbp from fx_rates where month = '2026-10-01') = 125, 'fx from payments');

select expect((select closing_balance from v_reconciliation where period_month = '2026-10-01' and company_code = 'ARC')
              = 10 * (260 + 125) - 2000, 'Oct closing balance');
select expect((select opening_balance from v_reconciliation where period_month = '2026-11-01' and company_code = 'ARC')
              = 10 * (260 + 125) - 2000, 'Nov opening = Oct closing');

-- a vendor-level credit note (no company) reduces the overall vendor balance
insert into credit_notes (period_month, company_code, vendor_id, amount, reason)
select '2026-10-01', null, id, 100, 'Excess received' from vendors where name = 'Peace Enterprises';
select expect((select closing_balance from v_vendor_balance where vendor_name = 'Peace Enterprises' and period_month = '2026-10-01')
              = 10 * (260 + 125) - 2000 - 100, 'vendor balance includes company-less credit note');
select expect((select closing_balance from v_vendor_balance where vendor_name = 'Peace Enterprises' and period_month = '2026-11-01')
              = 10 * (260 + 125) - 2000 - 100 + 20 * (280 + 130), 'vendor balance carries forward');

select settle_month('2026-10-01');

-- India blocked from the settled month -----------------------------------------------
select test_as('00000000-0000-0000-0000-00000000000b');
select expect_error($$update purchase_lines set qty = 11 where period_month = '2026-10-01'$$, '%October 2026 is settled%');
select expect_error($$insert into purchase_lines (period_month, product_id, company_code, vendor_id, qty, unit_price)
                      select '2026-10-01', p.id, 'ARC', v.id, 1, 1 from products p, vendors v limit 1$$, '%settled%');
select expect_error($$update purchase_lines set period_month = '2026-10-01' where period_month = '2026-11-01'$$, '%settled%');
-- SHP-06 AC5: no new shipment in a settled month
select expect_error($$insert into shipments (period_month, company_code, box_no) values ('2026-10-15', 'ARC', '9')$$, '%October 2026 is settled%');
select expect_error($$select edit_with_reason('purchase_lines', (select id from purchase_lines where period_month = '2026-10-01'), '{"qty": 11}', 'typo')$$,
                    '%settled%');

-- ...but goods can still be received against a settled month
update shipments set status = 'received', received_on = '2026-11-03', received_by = 'Amazon' where amazon_shipment_id = 'FBA15TEST001';
update purchase_lines set short_qty = 1, remarks = '1 unit missing' where period_month = '2026-10-01';
select expect((select received_qty from purchase_lines where period_month = '2026-10-01') = 9, 'receipt recorded in settled month');
select expect_error($$update purchase_lines set short_qty = 2, unit_price = 1 where period_month = '2026-10-01'$$, '%settled%');
select expect_error($$update shipments set company_code = 'CMR' where amazon_shipment_id = 'FBA15TEST001'$$, '%settled%');
update purchase_lines set short_qty = 0, remarks = null where period_month = '2026-10-01';

-- Admin may edit a settled month only with a reason ------------------------------------
select test_as('00000000-0000-0000-0000-00000000000a');
select expect_error($$update purchase_lines set qty = 11 where period_month = '2026-10-01'$$, '%reason is required%');
select edit_with_reason('purchase_lines', (select id from purchase_lines where period_month = '2026-10-01'),
                        '{"qty": 11, "remarks": "1 extra unit found"}', 'Vendor sent corrected invoice');
select expect((select qty from purchase_lines where period_month = '2026-10-01') = 11, 'admin edit applied');
select expect((select count(*) from flags where rule = 'settled_month_edit' and message like '%corrected invoice%') = 1,
              'settled-month edit flagged');
select expect((select reason from audit_log where table_name = 'purchase_lines' and action = 'UPDATE'
                order by id desc limit 1) = 'Vendor sent corrected invoice', 'audit log keeps the reason');

-- Viewer: reads money, cannot write ------------------------------------------------------
select test_as('00000000-0000-0000-0000-00000000000c');
select expect((select count(*) from payments) = 1, 'viewer sees payments');
select expect_error($$insert into shipments (period_month, company_code) values ('2026-11-01', 'ARC')$$, '%row-level security%');

-- Inactive user sees nothing -------------------------------------------------------------
select test_as('00000000-0000-0000-0000-00000000000d');
select expect((select count(*) from purchase_lines) = 0, 'inactive user sees no purchases');
select expect((select count(*) from companies) = 0, 'inactive user sees no companies');

-- Flags clear when fixed ------------------------------------------------------------------
select test_as('00000000-0000-0000-0000-00000000000b');
update purchase_lines set invoice_no = 'PE-2' where period_month = '2026-11-01';
select expect((select status from flags where rule = 'missing_invoice_no') = 'resolved', 'flag auto-resolves when fixed');

select test_as('00000000-0000-0000-0000-00000000000a');
select expect(acknowledge_flags_before('2026-11-01') >= 0, 'bulk acknowledge runs');
select expect((select count(*) from flags where status = 'open' and period_month < '2026-11-01' and rule <> 'settled_month_edit') = 0,
              'old flags acknowledged');
select expect((select email from profiles where id = '00000000-0000-0000-0000-00000000000b') = 'india@example.test', 'email copied to profile');

-- What the screens send -----------------------------------------------------------------
-- edit form posts every field, as text/numbers/nulls, through edit_with_reason
select edit_with_reason('purchase_lines', (select id from purchase_lines where period_month = '2026-11-01'),
  jsonb_build_object('qty', 20, 'unit_price', 280, 'courier_per_unit', 125, 'currency', 'INR', 'invoice_no', 'PE-2', 'invoice_date', null,
                     'company_code', 'ARC', 'vendor_id', (select id from vendors where name = 'Peace Enterprises'), 'defective_qty', 0,
                     'short_qty', 0, 'checked_by', null, 'remarks', null), 'Courier corrected');
select expect((select courier_per_unit from purchase_lines where period_month = '2026-11-01') = 125, 'form patch applied');
select expect((select status from flags where rule = 'courier_above_rate_card' and entity_id = (select id from purchase_lines where period_month = '2026-11-01')) = 'resolved',
              'rate card flag clears after correction');

-- a payment for ARC made from Caemora's bank account shows as paid on another company's behalf
insert into payments (period_month, company_code, vendor_id, kind, amount, amount_gbp, paid_on, method, reference, paid_from_company, paid_from)
select '2026-11-01', 'ARC', id, 'closing', 1000, 8, '2026-11-20', 'Wise', 'W2', 'CMR', 'CMR' from vendors where name = 'Peace Enterprises';
select expect((select on_behalf from v_payments_by_account where period_month = '2026-11-01' and paid_for = 'ARC' and paid_from_account = 'CMR'),
              'on-behalf payment detected');

reset role;
select test_as(null);
