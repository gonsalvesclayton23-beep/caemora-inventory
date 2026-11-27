-- FLG-03: cases from flags, assigned to a person. Runs after the other tests (users ...a admin Clayton, ...b data entry, ...c viewer).
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'tanvi@example.test'), ('00000000-0000-0000-0000-0000000000e2', 'raj@example.test');
update profiles set role = 'data_entry', active = true, full_name = 'Tanvi' where id = '00000000-0000-0000-0000-0000000000e1';
update profiles set role = 'data_entry', active = true, full_name = 'Raj' where id = '00000000-0000-0000-0000-0000000000e2';
create or replace function tanvi() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000e1'::uuid $$;
create or replace function raj() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000e2'::uuid $$;
create or replace function clayton() returns uuid language sql as $$ select '00000000-0000-0000-0000-00000000000a'::uuid $$;
grant execute on function tanvi(), raj(), clayton() to authenticated;

-- (flags raised before cases existed do not become cases: checked on upgrade, in cases_upgrade.sql)

set role authenticated;

-- FLG-03 Settings: which flag types create cases, and who gets them; admin only
select test_as(tanvi());
update case_rules set creates_case = false where rule = 'missing_invoice_no';
update settings set value = '9' where key = 'case_due_working_days';
select test_as(clayton());
select expect((select creates_case and assign_to = 'entered_by' from case_rules where rule = 'missing_invoice_no'), 'FLG-03 Settings: only an admin changes case rules');
select expect((select value #>> '{}' from settings where key = 'case_due_working_days') = '3', 'FLG-03 Settings: due time starts at 3 working days, admin only');
select expect((select string_agg(rule, ',' order by rule) from case_rules where creates_case)
              = 'blank_price,check_with_supplier,courier_above_rate_card,missing_invoice_date,missing_invoice_no,raise_amazon_case',
              'FLG-03 Settings: case types switched on to begin with');

-- FLG-03 AC1: Tanvi enters a line with no invoice number → case for Tanvi, Open, due in 3 working days
select test_as(tanvi());
insert into products (name) values ('Case test ENO');
insert into purchase_lines (period_month, product_id, company_code, vendor_id, qty, unit_price, courier_per_unit, invoice_date)
select '2026-11-01', p.id, 'ARC', v.id, 10, 100, 10, '2026-11-25' from products p, vendors v where p.name = 'Case test ENO' and v.name = 'Peace Enterprises';
create temporary table l1 as select id from purchase_lines where product_id = (select id from products where name = 'Case test ENO');
select expect((select count(*) from v_cases where entity_type = 'purchase_lines' and entity_id = (select id from l1) and rule = 'missing_invoice_no'
                and assigned_to = tanvi() and status = 'open' and due_on = add_working_days((now() at time zone 'Europe/London')::date, 3)) = 1,
              'FLG-03 AC1: case assigned to Tanvi, Open, due in 3 working days');
select expect(add_working_days('2026-11-27', 3) = '2026-12-02' and add_working_days('2026-11-28', 3) = '2026-12-02', 'FLG-03 AC1: working days are Mon–Fri');

-- FLG-03 AC2: Tanvi's own cases, with a link to the line
insert into products (name) values ('Case test Colgate');
insert into purchase_lines (period_month, product_id, company_code, vendor_id, qty, unit_price, courier_per_unit, invoice_date)
select '2026-11-01', p.id, 'ARC', v.id, 5, 100, 10, '2026-11-25' from products p, vendors v where p.name = 'Case test Colgate' and v.name = 'Peace Enterprises';
select expect((select count(*) from v_my_cases) = 2 and (select bool_and(link = '/purchases/' || entity_id and title <> '' and due_on is not null) from v_my_cases),
              'FLG-03 AC2: "My cases (2)" with what is wrong, a link and a due date');

-- FLG-03 AC3: admin reassigns to Raj with a note; kept in the history; Tanvi cannot reassign
select expect_error($$select reassign_case((select id from cases where entity_id = (select id from l1) and rule = 'missing_invoice_no'), raj(), 'mine now')$$, '%Only an admin%');
select test_as(clayton());
select reassign_case((select id from cases where entity_id = (select id from l1) and rule = 'missing_invoice_no'), raj(), 'Raj has the invoice');
select test_as(tanvi());
select expect((select count(*) from v_my_cases) = 1 and not exists (select 1 from v_cases where entity_id = (select id from l1)), 'FLG-03 AC3: it leaves Tanvi''s list');
select test_as(raj());
select expect((select count(*) from v_my_cases where entity_id = (select id from l1)) = 1, 'FLG-03 AC3: it appears in Raj''s');
select expect((select count(*) from v_case_events where case_id = (select id from cases where entity_id = (select id from l1) and rule = 'missing_invoice_no')
                and kind = 'reassigned' and from_name = 'Tanvi' and to_name = 'Raj' and note = 'Raj has the invoice' and by_name = 'Clayton') = 1,
              'FLG-03 AC3: reassignment kept in the case history');

-- FLG-03 AC4: adding the invoice number clears the flag and closes the case by itself
update purchase_lines set invoice_no = 'PE-131' where id = (select id from l1);
select expect((select status = 'resolved' and resolution = 'fix' from cases where entity_id = (select id from l1) and rule = 'missing_invoice_no'), 'FLG-03 AC4: "Resolved by fix"');
-- a case that cannot close by itself: the owner resolves it with a note
select test_as(tanvi());
create temporary table c2 as select id from v_my_cases limit 1;
select expect_error($$select resolve_case((select id from c2), '  ')$$, '%Add a note%');
select test_as(raj());
select expect_error($$select resolve_case((select id from c2), 'not mine')$$, '%not assigned to you%');
select test_as(tanvi());
select set_case_status((select id from c2), 'in_progress');
select resolve_case((select id from c2), 'Asked Peace for the invoice copy');
select expect((select status = 'resolved' and resolution = 'owner' and resolution_note = 'Asked Peace for the invoice copy' and resolved_by = tanvi() from cases where id = (select id from c2)),
              'FLG-03 AC4: resolved by its owner with a note');
select expect((select count(*) from v_my_cases) = 0, 'FLG-03 AC4: resolved cases leave My cases');

-- FLG-03 AC5: overdue; the admin sees every case
select test_as(clayton());
reset role;
update cases set due_on = (now() at time zone 'Europe/London')::date - 1 where id = (select id from c2);
update cases set status = 'open', resolution = null, resolved_at = null where id = (select id from c2);
set role authenticated;
select test_as(clayton());
select expect((select overdue from v_cases where id = (select id from c2)), 'FLG-03 AC5: past its due date = overdue');
select expect((select count(*) from v_cases) >= 3, 'FLG-03 AC5: admin sees all cases');

-- Access: payment cases never go to the India team, even if the rule says so
select expect_error($$update case_rules set creates_case = true, assign_to = 'person', assignee = tanvi() where rule = 'payment_missing_reference'$$, '%payment%');
update case_rules set creates_case = true where rule = 'payment_missing_reference';
insert into payments (period_month, company_code, vendor_id, kind, amount, amount_gbp, paid_on, method, reference, confirmed)
select '2026-11-01', 'ARC', id, 'opening', 500, 4, '2026-11-20', 'Wise', null, true from vendors where name = 'Peace Enterprises';
select expect((select assigned_to from cases where rule = 'payment_missing_reference') = clayton(), 'FLG-03 Access: payment case goes to the admin');
select expect_error($$select reassign_case((select id from cases where rule = 'payment_missing_reference'), tanvi(), 'try')$$, '%payment%');
select test_as(tanvi());
select expect(not exists (select 1 from v_cases where rule = 'payment_missing_reference'), 'FLG-03 Access: India team never sees payment cases');
select expect_error($$insert into cases (rule, entity_type, entity_id, title, due_on) values ('x', 'x', 1, 'x', current_date)$$, '%permission denied%');
select test_as('00000000-0000-0000-0000-00000000000c');
select expect((select count(*) from v_cases) >= 3, 'FLG-03 Access: viewer can read cases');
select expect_error($$select set_case_status((select id from c2), 'in_progress')$$, '%not assigned to you%');

reset role;
select test_as(null);
