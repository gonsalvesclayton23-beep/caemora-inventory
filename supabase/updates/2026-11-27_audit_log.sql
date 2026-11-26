-- Update for the live project (27 Nov 2026): Audit log tab (admins only), sign-in recording, and logging for suppliers, flags and "Not a match".
-- Run AFTER 2026-11-26_margin_platforms.sql. Paste into Supabase → SQL Editor → New query and Run, once.
-- If it says "trigger z_audit for relation vendors already exists", it has already been applied: nothing to do.


-- AUD AC7: nobody can change or remove log entries through the app, admins included (only the database's own triggers write)
revoke insert, update, delete, truncate on audit_log from anon, authenticated;

-- AUD AC6: suppliers and "Not a match"
create trigger z_audit after insert or update or delete on vendors for each row execute function write_audit();
create trigger z_audit after insert or delete on margin_match_dismissed for each row execute function write_audit();

-- AUD AC6: a flag acknowledged or resolved by a person (automatic checks and the bulk "mark as seen" are left out here)
create trigger z_audit after update on flags for each row
  when (old.status is distinct from new.status
        and (new.status = 'acknowledged' or (new.status = 'resolved' and new.resolved_by is not null))
        and auth.uid() is not null
        and coalesce(current_setting('app.bulk_ack', true), '') <> 'on')
  execute function write_audit();

-- bulk "mark as seen" (Admin page): one entry for the lot, not one per flag. Otherwise unchanged.
create or replace function acknowledge_flags_before(p_month date, p_rule text default null) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not is_admin() then raise exception 'Only an admin can do this.' using errcode = 'P0001'; end if;
  perform set_config('app.bulk_ack', 'on', true);
  update flags set status = 'acknowledged', updated_at = now()
   where status = 'open' and period_month < p_month and (p_rule is null or rule = p_rule);
  get diagnostics n = row_count;
  perform set_config('app.bulk_ack', '', true);
  if n > 0 then
    insert into audit_log (table_name, row_key, action, old_data, new_data, changed_by)
    values ('flags', null, 'BULK', null, jsonb_build_object('count', n, 'before', p_month, 'rule', p_rule), auth.uid());
  end if;
  return n;
end $$;

-- AUD AC4: sign-in events. Signed in / signed out need a session and record the person's own email;
-- a failed attempt has no session and records the email typed (at most 20 per email, and 300 in all, per 10 minutes).
create function record_sign_in_event(p_event text, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text;
begin
  if p_event in ('SIGN_IN', 'SIGN_OUT') then
    if uid is null then raise exception 'Only someone signed in can record this.' using errcode = 'P0001'; end if;
    select email into em from profiles where id = uid;
    insert into audit_log (table_name, row_key, action, new_data, changed_by) values ('auth', uid::text, p_event, jsonb_build_object('email', em), uid);
  elsif p_event = 'SIGN_IN_FAILED' then
    em := lower(left(btrim(coalesce(p_email, '')), 200));
    if (select count(*) from audit_log where action = 'SIGN_IN_FAILED' and changed_at > now() - interval '10 minutes' and new_data ->> 'email' = em) >= 20
       or (select count(*) from audit_log where action = 'SIGN_IN_FAILED' and changed_at > now() - interval '10 minutes') >= 300 then
      return;
    end if;
    insert into audit_log (table_name, row_key, action, new_data, changed_by) values ('auth', null, 'SIGN_IN_FAILED', jsonb_build_object('email', em), null);
  else
    raise exception 'Unknown event.' using errcode = 'P0001';
  end if;
end $$;
revoke all on function record_sign_in_event(text, text) from public;
grant execute on function record_sign_in_event(text, text) to anon, authenticated;

create index if not exists audit_log_changed_at_idx on audit_log (changed_at desc);
create index if not exists audit_log_by_idx on audit_log (changed_by, changed_at desc);
create index if not exists audit_log_table_idx on audit_log (table_name, changed_at desc);

-- AUD AC1/AC2: the log with the person's name (admins only: audit_log can only be read by an admin)
create view v_audit_log with (security_invoker = true) as
select a.id, a.changed_at, a.table_name, a.row_key, a.action, a.old_data, a.new_data, a.reason, a.period_month,
       a.changed_by, p.full_name as changed_by_name, p.email as changed_by_email
  from audit_log a left join profiles p on p.id = a.changed_by;
grant select on v_audit_log to authenticated;
