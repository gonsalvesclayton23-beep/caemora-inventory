-- MRG-21 (28 Nov 2026): every margin line (catalogue item) has a Caemora product identifier: CAE + its number, e.g. CAE0001.
-- Assigned automatically in order when a line is created; required; can't be changed or typed in; numbers are never reused.
-- Existing lines are numbered in the order they were created.

create sequence margin_cae_seq;
create function cae_code(p_n bigint) returns text language sql immutable as $$
  select 'CAE' || case when p_n < 10000 then lpad(p_n::text, 4, '0') else p_n::text end
$$;

alter table margin_products add column cae_code text;
-- numbered quietly: no "updated" time, rate re-check or audit entry for existing lines
alter table margin_products disable trigger user;
update margin_products m set cae_code = cae_code(o.n)
  from (select id, row_number() over (order by created_at, id) as n from margin_products) o where o.id = m.id;
alter table margin_products enable trigger user;
select setval('margin_cae_seq', greatest((select count(*) from margin_products), 1), (select count(*) > 0 from margin_products));
alter table margin_products alter column cae_code set not null, add constraint margin_products_cae_code_key unique (cae_code);

create function margin_cae_code() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.cae_code := cae_code(nextval('margin_cae_seq'));      -- whatever was passed in
  elsif new.cae_code is distinct from old.cae_code then
    raise exception 'The Caemora product ID cannot be changed.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger a_margin_cae_code before insert or update of cae_code on margin_products for each row execute function margin_cae_code();

-- the list view carries it (same columns as before, plus cae_code at the end)
create or replace view v_margin_lines with (security_invoker = true) as
select m.id, m.margin_product_id, m.channel, m.company_code, m.listing_status, m.hidden,
       m.referral_pct, m.fba_fee, m.promo_per_unit, m.local_shipping, m.misc_expense, m.ad_pct, m.selling_price, m.tax_override_pct,
       p.product_id, p.name, p.asin, p.fnsku, p.owner, p.notes, p.product_cost, p.product_cost_currency, p.courier_cost, p.courier_currency,
       p.fx_rate, p.fx_rate_date, p.fx_source,
       c.name as company_name, c.default_vat_pct as company_vat_pct, coalesce(m.tax_override_pct, c.default_vat_pct) as effective_tax_pct,
       m.created_at, greatest(m.updated_at, p.updated_at) as updated_at,
       m.category_fee_pct, p.cae_code
  from margin_lines m join margin_products p on p.id = m.margin_product_id join companies c on c.code = m.company_code;
