-- Roles, settled-month lock, audit log and row-level security.

-- ---------------------------------------------------------------- role helpers

create function app_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;

create function is_active_user() returns boolean language sql stable as $$ select app_role() is not null $$;
create function is_admin()       returns boolean language sql stable as $$ select coalesce(app_role() = 'admin', false) $$;
create function is_staff()       returns boolean language sql stable as $$ select coalesce(app_role() in ('admin', 'data_entry'), false) $$;
create function can_view_money() returns boolean language sql stable as $$ select coalesce(app_role() in ('admin', 'viewer'), false) $$;

-- Direct database connections (the importer, migrations, scheduled jobs) have no JWT user.
create function is_system() returns boolean language sql stable as $$
  select auth.uid() is null and current_user not in ('anon', 'authenticated')
$$;

create function is_importing() returns boolean language sql stable as $$
  select coalesce(current_setting('app.importing', true), '') = 'on' and is_system()
$$;

create function edit_reason() returns text language sql stable as $$
  select nullif(trim(coalesce(current_setting('app.edit_reason', true), '')), '')
$$;

-- New sign-ups get an inactive data-entry profile; an admin activates them and sets the role.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, role, active)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), 'data_entry', false)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------- periods

-- Normalise period_month to the 1st and create the period if it is new.
create function ensure_period() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.period_month := date_trunc('month', new.period_month)::date;
  insert into periods (month) values (new.period_month) on conflict do nothing;
  return new;
end $$;

-- Block changes to settled months. Data entry: always blocked. Admin: allowed with a reason, and flagged.
create function enforce_period_lock() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec       jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  m_old     date  := case when tg_op <> 'INSERT' then old.period_month end;
  m_new     date  := case when tg_op <> 'DELETE' then new.period_month end;
  m_settled date;
  reason    text  := edit_reason();
begin
  select month into m_settled from periods
   where month in (m_old, m_new) and status = 'settled' order by month limit 1;
  if m_settled is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if is_system() and coalesce(current_setting('app.bypass_lock', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if not is_admin() then
    raise exception '% is settled and cannot be changed. Ask an admin.', to_char(m_settled, 'FMMonth YYYY')
      using errcode = 'P0001';
  end if;

  if reason is null then
    raise exception 'A reason is required to change settled month %.', to_char(m_settled, 'FMMonth YYYY')
      using errcode = 'P0001';
  end if;

  insert into flags (rule, severity, entity_type, entity_id, period_month, company_code, message, details)
  values ('settled_month_edit', 'critical', tg_table_name, (rec ->> 'id')::bigint, m_settled, rec ->> 'company_code',
          format('%s on %s in settled month %s: %s', initcap(lower(tg_op)), replace(tg_table_name, '_', ' '),
                 to_char(m_settled, 'FMMonth YYYY'), reason),
          jsonb_build_object('reason', reason, 'by', auth.uid(), 'op', tg_op));

  return case when tg_op = 'DELETE' then old else new end;
end $$;

create function touch_updated() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_table_name = 'purchase_lines' then new.updated_by := auth.uid(); end if;
  return new;
end $$;

-- ---------------------------------------------------------------- audit

create function write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  if is_importing() then return null; end if;
  insert into audit_log (table_name, row_key, action, old_data, new_data, period_month, reason, changed_by)
  values (tg_table_name,
          coalesce(rec ->> 'id', rec ->> 'month', rec ->> 'key', rec ->> 'code'),
          tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          case when tg_table_name = 'settings' then null
               else coalesce((rec ->> 'period_month')::date, (rec ->> 'month')::date) end,
          edit_reason(),
          auth.uid());
  return null;
end $$;

-- ---------------------------------------------------------------- rate card protection

create function protect_rate_card() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_admin() or is_system() then return new; end if;
  if tg_op = 'INSERT' then
    new.agreed_courier_per_unit := null;
    new.agreed_courier_from := null;
    new.agreed_unit_price := null;
  elsif (new.agreed_courier_per_unit, new.agreed_courier_currency, new.agreed_courier_from, new.agreed_unit_price, new.agreed_price_currency)
        is distinct from
        (old.agreed_courier_per_unit, old.agreed_courier_currency, old.agreed_courier_from, old.agreed_unit_price, old.agreed_price_currency) then
    raise exception 'Only an admin can change the agreed rate card.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger products_rate_card before insert or update on products
  for each row execute function protect_rate_card();

-- ---------------------------------------------------------------- attach triggers

do $$
declare t text;
begin
  foreach t in array array['shipments', 'purchase_lines', 'payments', 'credit_notes'] loop
    execute format('create trigger a_ensure_period before insert or update of period_month on %I
                    for each row execute function ensure_period()', t);
    execute format('create trigger b_period_lock before insert or update or delete on %I
                    for each row execute function enforce_period_lock()', t);
    execute format('create trigger c_touch before update on %I
                    for each row execute function touch_updated()', t);
  end loop;

  foreach t in array array['shipments', 'purchase_lines', 'payments', 'credit_notes',
                           'products', 'listings', 'periods', 'profiles', 'fx_rates', 'settings'] loop
    execute format('create trigger z_audit after insert or update or delete on %I
                    for each row execute function write_audit()', t);
  end loop;
end $$;

create trigger c_touch before update on products for each row execute function touch_updated();

-- ---------------------------------------------------------------- admin RPCs

create function settle_month(p_month date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only an admin can settle a month.' using errcode = 'P0001'; end if;
  insert into periods (month) values (date_trunc('month', p_month)) on conflict do nothing;
  update periods set status = 'settled', settled_at = now(), settled_by = auth.uid()
   where month = date_trunc('month', p_month);
end $$;

create function reopen_month(p_month date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only an admin can reopen a month.' using errcode = 'P0001'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'A reason is required.' using errcode = 'P0001'; end if;
  perform set_config('app.edit_reason', p_reason, true);
  update periods set status = 'open', settled_at = null, settled_by = null where month = date_trunc('month', p_month);
  insert into flags (rule, severity, entity_type, entity_id, period_month, message, details)
  values ('settled_month_edit', 'critical', 'period', extract(epoch from date_trunc('month', p_month))::bigint,
          date_trunc('month', p_month), format('%s reopened: %s', to_char(p_month, 'FMMonth YYYY'), p_reason),
          jsonb_build_object('reason', p_reason, 'by', auth.uid(), 'op', 'REOPEN'));
end $$;

-- Edit or delete a row with a recorded reason (required for settled months, optional otherwise).
-- Runs as the caller, so RLS and the lock trigger still apply.
create function edit_with_reason(p_table text, p_id bigint, p_patch jsonb, p_reason text) returns void
language plpgsql set search_path = public as $$
declare sets text; cols text;
begin
  if p_table not in ('purchase_lines', 'shipments', 'payments', 'credit_notes') then
    raise exception 'Table % cannot be edited this way.', p_table;
  end if;
  perform set_config('app.edit_reason', coalesce(p_reason, ''), true);

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = p_table
     and column_name in (select jsonb_object_keys(p_patch))
     and is_generated = 'NEVER' and is_identity = 'NO'
     and column_name not in ('id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'import_ref');
  if cols is null then raise exception 'Nothing to update.'; end if;

  sets := format('(%s) = (select %s from jsonb_populate_record(null::%I, $1))', cols, cols, p_table);
  execute format('update %I set %s where id = $2', p_table, sets) using p_patch, p_id;
  if not found then raise exception 'Row not found or not permitted.'; end if;
end $$;

create function delete_with_reason(p_table text, p_id bigint, p_reason text) returns void
language plpgsql set search_path = public as $$
begin
  if p_table not in ('purchase_lines', 'shipments', 'payments', 'credit_notes') then
    raise exception 'Table % cannot be deleted this way.', p_table;
  end if;
  perform set_config('app.edit_reason', coalesce(p_reason, ''), true);
  execute format('delete from %I where id = $1', p_table) using p_id;
  if not found then raise exception 'Row not found or not permitted.'; end if;
end $$;

-- ---------------------------------------------------------------- row-level security

alter table companies      enable row level security;
alter table profiles       enable row level security;
alter table vendors        enable row level security;
alter table settings       enable row level security;
alter table products       enable row level security;
alter table listings       enable row level security;
alter table periods        enable row level security;
alter table fx_rates       enable row level security;
alter table shipments      enable row level security;
alter table purchase_lines enable row level security;
alter table payments       enable row level security;
alter table credit_notes   enable row level security;
alter table flags          enable row level security;
alter table audit_log      enable row level security;

-- reference data: everyone signed in can read; admins write
create policy read_all on companies for select to authenticated using (is_active_user());
create policy admin_write on companies for all to authenticated using (is_admin()) with check (is_admin());

create policy read_all on settings for select to authenticated using (is_active_user());
create policy admin_write on settings for all to authenticated using (is_admin()) with check (is_admin());

create policy read_all on periods for select to authenticated using (is_active_user());
create policy admin_write on periods for all to authenticated using (is_admin()) with check (is_admin());

create policy read_all on fx_rates for select to authenticated using (is_active_user());
create policy admin_write on fx_rates for all to authenticated using (is_admin()) with check (is_admin());

create policy read_all on vendors for select to authenticated using (is_active_user());
create policy staff_insert on vendors for insert to authenticated with check (is_staff());
create policy admin_update on vendors for update to authenticated using (is_admin()) with check (is_admin());
create policy admin_delete on vendors for delete to authenticated using (is_admin());

-- products & listings: staff can add and edit (rate card guarded by trigger); admins delete
create policy read_all on products for select to authenticated using (is_active_user());
create policy staff_insert on products for insert to authenticated with check (is_staff());
create policy staff_update on products for update to authenticated using (is_staff()) with check (is_staff());
create policy admin_delete on products for delete to authenticated using (is_admin());

create policy read_all on listings for select to authenticated using (is_active_user());
create policy staff_insert on listings for insert to authenticated with check (is_staff());
create policy staff_update on listings for update to authenticated using (is_staff()) with check (is_staff());
create policy admin_delete on listings for delete to authenticated using (is_admin());

-- purchases & shipments: staff write (settled months blocked by trigger)
create policy read_all on shipments for select to authenticated using (is_active_user());
create policy staff_write on shipments for all to authenticated using (is_staff()) with check (is_staff());

create policy read_all on purchase_lines for select to authenticated using (is_active_user());
create policy staff_write on purchase_lines for all to authenticated using (is_staff()) with check (is_staff());

-- money: admin and viewer read; admin writes
create policy money_read on payments for select to authenticated using (can_view_money());
create policy admin_write on payments for all to authenticated using (is_admin()) with check (is_admin());

create policy money_read on credit_notes for select to authenticated using (can_view_money());
create policy admin_write on credit_notes for all to authenticated using (is_admin()) with check (is_admin());

-- flags: data entry sees flags on purchases and shipments only
create policy read_flags on flags for select to authenticated
  using (can_view_money() or (is_staff() and entity_type in ('purchase_lines', 'shipments')));
create policy admin_update on flags for update to authenticated using (is_admin()) with check (is_admin());

create policy admin_read on audit_log for select to authenticated using (is_admin());

create policy read_own on profiles for select to authenticated using (id = auth.uid() or is_admin());
create policy admin_update on profiles for update to authenticated using (is_admin()) with check (is_admin());
