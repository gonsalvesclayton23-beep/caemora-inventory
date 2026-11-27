-- DSH-04 (27 Nov 2026): each company's monthly sales (£, including VAT, all platforms together), typed in by an admin for now.
-- A later sales sync (Amazon, eBay…) can fill the same table. Everyone signed in can see it; only an admin changes it.

create table company_sales (
  id            bigint generated always as identity primary key,
  company_code  text not null references companies (code),
  month         date not null,
  amount_gbp    numeric(14, 2) not null check (amount_gbp >= 0),
  updated_by    uuid references profiles (id) default auth.uid(),
  updated_at    timestamptz not null default now(),
  unique (company_code, month)
);

create function company_sales_month() returns trigger language plpgsql as $$
begin
  new.month := date_trunc('month', new.month)::date;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger b_company_sales_month before insert or update on company_sales for each row execute function company_sales_month();

alter table company_sales enable row level security;
create policy read_all on company_sales for select to authenticated using (is_active_user());
create policy admin_write on company_sales for all to authenticated using (is_admin()) with check (is_admin());
grant select, insert, update, delete on company_sales to authenticated;
create trigger z_audit after insert or update or delete on company_sales for each row execute function write_audit();
