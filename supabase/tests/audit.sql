-- Audit log (27 Nov 2026). Runs last: earlier tests have made plenty of changes.
grant execute on function test_as(uuid), expect_error(text, text), expect(boolean, text) to anon;
create temporary table mark as select coalesce(max(id), 0) as id from audit_log;
grant select on mark to authenticated;
set role authenticated;

-- AUD AC1: admins only
select test_as('00000000-0000-0000-0000-00000000000a');
select expect((select count(*) from v_audit_log) > 0 and (select count(*) from v_audit_log where changed_by_name = 'Clayton') > 0, 'AUD AC1: admin sees the log, with names');
select test_as('00000000-0000-0000-0000-00000000000b');
select expect((select count(*) from v_audit_log) = 0 and (select count(*) from audit_log) = 0, 'AUD AC1: data entry sees nothing');
select test_as('00000000-0000-0000-0000-00000000000c');
select expect((select count(*) from v_audit_log) = 0, 'AUD AC1: viewer sees nothing');

-- AUD AC3: viewing records nothing
reset role;
create temporary table n0 as select count(*) as n from audit_log;
grant select on n0 to authenticated;
set role authenticated;
select test_as('00000000-0000-0000-0000-00000000000b');
select count(*) from v_purchase_lines; select count(*) from shipments; select count(*) from v_margin_lines; select count(*) from products;
select test_as('00000000-0000-0000-0000-00000000000a');
select count(*) from v_reconciliation; select count(*) from payments; select count(*) from v_audit_log;
reset role;
select expect((select count(*) from audit_log) = (select n from n0), 'AUD AC3: viewing pages adds nothing to the log');
set role authenticated;

-- AUD AC4: sign-in, sign-out, failed sign-in
select test_as('00000000-0000-0000-0000-00000000000b');
select record_sign_in_event('SIGN_IN', 'ignored@x.test');
select record_sign_in_event('SIGN_OUT', null);
select test_as(null);
reset role; set role anon;
select record_sign_in_event('SIGN_IN_FAILED', 'Guess@Example.test');
select expect_error($$select record_sign_in_event('SIGN_IN', 'admin@example.test')$$, '%signed in%');
reset role; set role authenticated;
select test_as('00000000-0000-0000-0000-00000000000a');
select expect((select count(*) from v_audit_log where table_name = 'auth' and action = 'SIGN_IN' and changed_by = '00000000-0000-0000-0000-00000000000b'
                and new_data ->> 'email' = (select email from profiles where id = '00000000-0000-0000-0000-00000000000b')) = 1, 'AUD AC4: sign-in recorded with who (their own email, not the one passed in)');
select expect((select count(*) from v_audit_log where table_name = 'auth' and action = 'SIGN_OUT' and changed_by = '00000000-0000-0000-0000-00000000000b') = 1, 'AUD AC4: sign-out recorded');
select expect((select count(*) from v_audit_log where table_name = 'auth' and action = 'SIGN_IN_FAILED' and changed_by is null and new_data ->> 'email' = 'guess@example.test') = 1, 'AUD AC4: failed sign-in recorded with the email typed');
-- someone hammering the form cannot flood the log
reset role; set role anon;
select record_sign_in_event('SIGN_IN_FAILED', 'flood@x.test') from generate_series(1, 30);
reset role;
select expect((select count(*) from audit_log where action = 'SIGN_IN_FAILED' and new_data ->> 'email' = 'flood@x.test') = 20, 'AUD AC4: at most 20 failed attempts per email per 10 minutes are kept');
set role authenticated;

-- AUD AC6: suppliers, flags (by a person), bulk "mark as seen", "Not a match"
select test_as('00000000-0000-0000-0000-00000000000a');
update vendors set notes = 'audit test' where name = 'Peace Enterprises';
select expect((select count(*) from v_audit_log where table_name = 'vendors' and action = 'UPDATE' and new_data ->> 'notes' = 'audit test' and changed_by_name = 'Clayton') = 1, 'AUD AC6: supplier change recorded');
select expect((select count(*) from flags where status = 'open') >= 3, 'AUD AC6: (setup) open flags exist');
create temporary table one_flag as select id from flags where status = 'open' order by id limit 1;
update flags set status = 'acknowledged', updated_at = now() where id = (select id from one_flag);
select expect((select count(*) from v_audit_log where table_name = 'flags' and action = 'UPDATE' and row_key = (select id::text from one_flag)
                and new_data ->> 'status' = 'acknowledged' and changed_by_name = 'Clayton') = 1, 'AUD AC6: flag acknowledged by a person recorded');
reset role;
create temporary table n1 as select count(*) as n from audit_log where table_name = 'flags';
set role authenticated;
select test_as('00000000-0000-0000-0000-00000000000a');
select refresh_all_flags();
reset role;
select expect((select count(*) from audit_log where table_name = 'flags') = (select n from n1), 'AUD AC6: automatic flag checks are not recorded as someone''s change');
set role authenticated;
select test_as('00000000-0000-0000-0000-00000000000a');
select acknowledge_flags_before('2027-01-01');
select expect((select count(*) from v_audit_log where table_name = 'flags' and action = 'BULK' and (new_data ->> 'count')::int >= 2 and changed_by_name = 'Clayton') = 1
              and (select count(*) from v_audit_log where table_name = 'flags' and action = 'UPDATE' and id > (select id from mark)) = 1, 'AUD AC6: bulk "mark as seen" is one entry, not one per flag');
insert into margin_match_dismissed (a_id, b_id) select min(id), max(id) from margin_products having count(*) >= 2;
select expect((select count(*) from v_audit_log where table_name = 'margin_match_dismissed' and action = 'INSERT' and changed_by_name = 'Clayton') = 1, 'AUD AC6: "Not a match" recorded');

-- AUD AC7: nobody can change or remove the log, admins included
select expect_error($$update audit_log set reason = 'x'$$, '%permission denied%');
select expect_error($$delete from audit_log$$, '%permission denied%');
select expect_error($$insert into audit_log (table_name, action) values ('x', 'UPDATE')$$, '%permission denied%');
reset role; set role anon;
select expect_error($$delete from audit_log$$, '%permission denied%');

reset role;
select test_as(null);
