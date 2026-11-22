-- INV-01..03: invoice dates are required on new purchases, invoice files can be uploaded and listed.

-- ---------------------------------------------------------------- invoice date rules

-- New stock purchases must carry an invoice date, and are filed in that invoice's month.
create function purchase_invoice_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_importing() then return new; end if;
  if tg_op = 'UPDATE' then
    -- an invoice date can be corrected but not removed; the line stays in the month it was filed under
    if old.invoice_date is not null and new.invoice_date is null then
      raise exception 'The invoice date cannot be removed.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.category = 'stock' and new.invoice_date is null then
    raise exception 'Enter the invoice date.' using errcode = 'P0001';
  end if;
  if new.invoice_date is not null then
    new.period_month := date_trunc('month', new.invoice_date)::date;
  end if;
  return new;
end $$;

-- runs before a_ensure_period / b_period_lock (triggers fire in name order)
create trigger a0_invoice_rules before insert or update of invoice_date on purchase_lines
  for each row execute function purchase_invoice_rules();

-- flag older lines without an invoice date
create or replace function refresh_line_flags(p_line_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  l        record;
  prev     record;
  pct      numeric := setting_num('price_change_pct', 5);
  c_pct    numeric := setting_num('courier_change_pct', 0);
  tol      numeric := setting_num('rate_card_tolerance_pct', 0);
  low_inr  numeric := setting_num('suspect_inr_price_below', 20);
  t        text := 'purchase_lines';
begin
  select pl.*, p.name as product_name, p.agreed_courier_per_unit, p.agreed_courier_currency, p.agreed_courier_from
    into l
    from purchase_lines pl join products p on p.id = pl.product_id
   where pl.id = p_line_id;

  if not found then
    update flags set status = 'resolved', resolved_at = now(), resolution_note = 'Line deleted'
     where entity_type = t and entity_id = p_line_id and status <> 'resolved' and rule <> 'settled_month_edit';
    return;
  end if;

  -- the most recent purchase of the same product, in the same currency, in an earlier month
  select unit_price, courier_per_unit, period_month into prev
    from purchase_lines
   where product_id = l.product_id and currency = l.currency and period_month < l.period_month
     and unit_price is not null
   order by period_month desc, id desc
   limit 1;

  perform set_flag('price_change', 'warning', t, l.id, l.period_month, l.company_code,
    prev.unit_price is not null and l.unit_price is not null and prev.unit_price > 0
      and abs(l.unit_price - prev.unit_price) / prev.unit_price * 100 > pct,
    format('%s: price %s → %s (vs %s)', l.product_name, fmt_money(prev.unit_price, l.currency),
           fmt_money(l.unit_price, l.currency), to_char(prev.period_month, 'Mon YY')),
    jsonb_build_object('previous', prev.unit_price, 'current', l.unit_price, 'previous_month', prev.period_month));

  perform set_flag('courier_change', 'warning', t, l.id, l.period_month, l.company_code,
    prev.courier_per_unit is not null and prev.courier_per_unit <> l.courier_per_unit
      and (prev.courier_per_unit = 0
           or abs(l.courier_per_unit - prev.courier_per_unit) / prev.courier_per_unit * 100 > c_pct),
    format('%s: courier/unit %s → %s (vs %s)', l.product_name, fmt_money(prev.courier_per_unit, l.currency),
           fmt_money(l.courier_per_unit, l.currency), to_char(prev.period_month, 'Mon YY')),
    jsonb_build_object('previous', prev.courier_per_unit, 'current', l.courier_per_unit,
                       'previous_month', prev.period_month));

  perform set_flag('courier_above_price', 'warning', t, l.id, l.period_month, l.company_code,
    l.unit_price is not null and l.courier_per_unit > l.unit_price,
    format('%s: courier/unit %s is more than the product price %s', l.product_name,
           fmt_money(l.courier_per_unit, l.currency), fmt_money(l.unit_price, l.currency)));

  perform set_flag('courier_above_rate_card', 'critical', t, l.id, l.period_month, l.company_code,
    l.agreed_courier_per_unit is not null and l.agreed_courier_currency = l.currency
      and l.period_month >= coalesce(l.agreed_courier_from, '-infinity'::date)
      and l.courier_per_unit > l.agreed_courier_per_unit * (1 + tol / 100),
    format('%s: courier/unit %s is above the agreed %s', l.product_name,
           fmt_money(l.courier_per_unit, l.currency), fmt_money(l.agreed_courier_per_unit, l.currency)),
    jsonb_build_object('agreed', l.agreed_courier_per_unit, 'charged', l.courier_per_unit,
                       'excess_total', (l.courier_per_unit - l.agreed_courier_per_unit) * l.qty));

  perform set_flag('missing_invoice_no', 'warning', t, l.id, l.period_month, l.company_code,
    l.category = 'stock' and nullif(trim(coalesce(l.invoice_no, '')), '') is null,
    format('%s: no invoice number', l.product_name));

  perform set_flag('blank_price', 'critical', t, l.id, l.period_month, l.company_code,
    l.unit_price is null or l.unit_price = 0,
    format('%s: unit price is blank', l.product_name));

  perform set_flag('suspect_currency', 'warning', t, l.id, l.period_month, l.company_code,
    l.currency = 'INR' and l.unit_price > 0 and l.unit_price < low_inr,
    format('%s: ₹%s per unit looks like a £ price', l.product_name, l.unit_price));

  perform set_flag('receipt_discrepancy', 'info', t, l.id, l.period_month, l.company_code,
    (l.defective_qty + l.short_qty) > 0 and nullif(trim(coalesce(l.remarks, '') || coalesce(l.remarks_2, '')), '') is null,
    format('%s: %s defective, %s short, no remark', l.product_name, l.defective_qty, l.short_qty));

  perform set_flag('missing_invoice_date', 'warning', t, l.id, l.period_month, l.company_code,
    l.category = 'stock' and l.invoice_date is null,
    format('%s: no invoice date', l.product_name));
end $$;

-- ---------------------------------------------------------------- invoice files

create table invoice_files (
  id            bigint generated always as identity primary key,
  company_code  text references companies (code),
  vendor_id     bigint references vendors (id),
  invoice_no    text,
  invoice_date  date,
  storage_path  text not null unique,          -- path inside the private "invoices" storage bucket
  file_name     text not null,
  content_type  text,
  size_bytes    integer,
  uploaded_by   uuid references auth.users (id) default auth.uid(),
  uploaded_at   timestamptz not null default now()
);
create index invoice_files_lookup_idx on invoice_files (vendor_id, invoice_no);

alter table invoice_files enable row level security;
create policy read_all on invoice_files for select to authenticated using (is_active_user());
create policy staff_insert on invoice_files for insert to authenticated with check (is_staff());
create policy admin_update on invoice_files for update to authenticated using (is_admin()) with check (is_admin());
create policy admin_delete on invoice_files for delete to authenticated using (is_admin());
create trigger z_audit after insert or update or delete on invoice_files for each row execute function write_audit();
grant select, insert, update, delete on invoice_files to authenticated;

-- One row per invoice (vendor + company + invoice no.), with its purchase totals and how many files are attached.
create view v_invoices with (security_invoker = true) as
select pl.vendor_id,
       v.name                         as vendor_name,
       pl.company_code,
       pl.invoice_no,
       min(pl.invoice_date)           as invoice_date,
       min(pl.period_month)           as period_month,
       count(*)                       as lines,
       sum(pl.qty)                    as units,
       sum(pl.line_total) filter (where pl.currency = 'INR') as total_inr,
       sum(pl.line_total) filter (where pl.currency = 'GBP') as total_gbp,
       (select count(*) from invoice_files f
         where f.vendor_id = pl.vendor_id and f.invoice_no = pl.invoice_no
           and (f.company_code is null or f.company_code = pl.company_code)) as files
  from purchase_lines pl
  join vendors v on v.id = pl.vendor_id
 where pl.invoice_no is not null
 group by pl.vendor_id, v.name, pl.company_code, pl.invoice_no;
grant select on v_invoices to authenticated;

-- ---------------------------------------------------------------- storage bucket (Supabase only)

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('invoices', 'invoices', false, 10485760,
            array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
    on conflict (id) do nothing;
    execute $p$create policy "invoices: read" on storage.objects for select to authenticated
             using (bucket_id = 'invoices' and public.is_active_user())$p$;
    execute $p$create policy "invoices: upload" on storage.objects for insert to authenticated
             with check (bucket_id = 'invoices' and public.is_staff())$p$;
    execute $p$create policy "invoices: delete" on storage.objects for delete to authenticated
             using (bucket_id = 'invoices' and public.is_admin())$p$;
  end if;
end $$;

select refresh_all_flags();
