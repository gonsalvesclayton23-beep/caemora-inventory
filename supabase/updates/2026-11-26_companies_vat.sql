-- Update for the live project (26 Nov 2026): company names, list order and Default VAT. Codes and data are unchanged.
-- Run AFTER 2026-11-25_daily_fx.sql. Paste into Supabase → SQL Editor → New query and Run, once.

-- Company names and Default VAT (margin calculator file, 26 Nov 2026). Codes and all existing data are unchanged:
-- every other table refers to a company by its code, so only the display name, list order and a VAT setting change.

alter table companies
  add column sort_order      integer,
  add column default_vat_pct numeric(5, 2) not null default 0,
  add column vat_scheme      text;                       -- e.g. 'Flat Rate VAT'; null for 0% VAT

create function company_vat_rules() returns trigger language plpgsql as $$
begin
  if new.default_vat_pct < 0 or new.default_vat_pct > 100 then
    raise exception 'VAT must be between 0%% and 100%%.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger b_company_vat before insert or update of default_vat_pct on companies
  for each row execute function company_vat_rules();

-- names, order and starting VAT (also set in seed.sql for new projects)
update companies c set name = v.name, sort_order = v.ord, default_vat_pct = v.vat, vat_scheme = v.scheme,
                       aliases = (select array_agg(distinct a) from unnest(c.aliases || v.extra) a)
  from (values ('CMR', 'Caemora Ltd',  1, 7.5, 'Flat Rate VAT', '{}'::text[]),
               ('ARC', 'ARC UK G Ltd', 2, 7.5, 'Flat Rate VAT', '{arc uk g ltd}'),
               ('YD',  'Youdent Ltd',  3, 0,   null,            '{youdent ltd}'),
               ('GOE', 'Goenche Ltd',  4, 0,   null,            '{}'),
               ('GOA', 'Goasales',     5, 0,   null,            '{goasales}'),
               ('GEN', 'Gentech',      6, 0,   null,            '{}'),
               ('ALS', 'Al Store',     7, 0,   null,            '{}')) v(code, name, ord, vat, scheme, extra)
 where c.code = v.code;

-- every change to a company (VAT included) goes into the change history; only an admin can make one (RLS admin_write)
create trigger z_audit after insert or update or delete on companies for each row execute function write_audit();

-- the one way the app changes VAT: admin only, with a clear refusal for anyone else
create function set_vat(p_code text, p_vat numeric, p_scheme text) returns void
language plpgsql set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only an admin can change VAT.' using errcode = 'P0001'; end if;
  update companies set default_vat_pct = p_vat, vat_scheme = nullif(btrim(coalesce(p_scheme, '')), '') where code = p_code;
  if not found then raise exception 'Unknown company %.', p_code using errcode = 'P0001'; end if;
end $$;

-- VAT changes: old value, new value, who and when (admins only, like the rest of the change history)
create view v_company_vat_history with (security_invoker = true) as
select a.id, a.changed_at, a.row_key as code, c.name as company_name,
       (a.old_data ->> 'default_vat_pct')::numeric as old_vat, (a.new_data ->> 'default_vat_pct')::numeric as new_vat,
       a.old_data ->> 'vat_scheme' as old_scheme, a.new_data ->> 'vat_scheme' as new_scheme,
       a.changed_by, p.full_name as changed_by_name
  from audit_log a
  left join companies c on c.code = a.row_key
  left join profiles p on p.id = a.changed_by
 where a.table_name = 'companies' and a.action = 'UPDATE'
   and ((a.old_data ->> 'default_vat_pct') is distinct from (a.new_data ->> 'default_vat_pct')
        or (a.old_data ->> 'vat_scheme') is distinct from (a.new_data ->> 'vat_scheme'));
grant select on v_company_vat_history to authenticated;
