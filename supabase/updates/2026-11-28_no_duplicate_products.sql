-- Update for the live project (28 Nov 2026): PRD-08 and MRG-19. A new product or margin line that already exists is refused.
-- Existing products and lines are not changed. Run AFTER 2026-11-28_margins_fees.sql. Paste into Supabase → SQL Editor → New query and Run, once.
-- If it says "function product_key ... already exists", it has already been applied: nothing to do.


create function product_key(p_name text) returns text language sql immutable as $$
  select regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '', 'g')
$$;
create index products_key_idx on products (product_key(name));
create index margin_products_key_idx on margin_products (product_key(name));

-- products: the same name
create function product_no_duplicate() returns trigger
language plpgsql security definer set search_path = public as $$
declare hit text;
begin
  if is_system() then return new; end if;
  if tg_op = 'UPDATE' and product_key(new.name) = product_key(old.name) then return new; end if;
  select name into hit from products where product_key(name) = product_key(new.name) and id <> coalesce(new.id, -1) order by id limit 1;
  if hit is not null then raise exception 'Already created: %', hit using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger a0_product_no_duplicate before insert or update of name on products for each row execute function product_no_duplicate();

-- listings: an FNSKU or ASIN that is already on another product (the same product listed by another company is fine)
create function listing_no_duplicate() returns trigger
language plpgsql security definer set search_path = public as $$
declare hit text; code text;
begin
  if is_system() then return new; end if;
  if nullif(btrim(coalesce(new.fnsku, '')), '') is not null
     and (tg_op = 'INSERT' or upper(coalesce(new.fnsku, '')) <> upper(coalesce(old.fnsku, ''))) then
    select p.name, upper(l.fnsku) into hit, code from listings l join products p on p.id = l.product_id
     where upper(l.fnsku) = upper(new.fnsku) and l.product_id <> new.product_id order by l.id limit 1;
    if hit is not null then raise exception 'Already created: % (FNSKU %)', hit, code using errcode = 'P0001'; end if;
  end if;
  if nullif(btrim(coalesce(new.asin, '')), '') is not null
     and (tg_op = 'INSERT' or upper(coalesce(new.asin, '')) <> upper(coalesce(old.asin, ''))) then
    select p.name, upper(l.asin) into hit, code from listings l join products p on p.id = l.product_id
     where upper(l.asin) = upper(new.asin) and l.product_id <> new.product_id order by l.id limit 1;
    if hit is not null then raise exception 'Already created: % (ASIN %)', hit, code using errcode = 'P0001'; end if;
  end if;
  return new;
end $$;
create trigger a0_listing_no_duplicate before insert or update of fnsku, asin on listings for each row execute function listing_no_duplicate();

-- margin lines: the same name, ASIN or FNSKU as another margin line
create function margin_product_no_duplicate() returns trigger
language plpgsql security definer set search_path = public as $$
declare hit text; code text;
begin
  if is_system() then return new; end if;
  if tg_op = 'INSERT' or product_key(new.name) <> product_key(old.name) then
    select name into hit from margin_products where product_key(name) = product_key(new.name) and id <> coalesce(new.id, -1) order by id limit 1;
    if hit is not null then raise exception 'Already created: %', hit using errcode = 'P0001'; end if;
  end if;
  if nullif(btrim(coalesce(new.asin, '')), '') is not null and (tg_op = 'INSERT' or upper(coalesce(new.asin, '')) <> upper(coalesce(old.asin, ''))) then
    select name, upper(asin) into hit, code from margin_products where upper(asin) = upper(new.asin) and id <> coalesce(new.id, -1) order by id limit 1;
    if hit is not null then raise exception 'Already created: % (ASIN %)', hit, code using errcode = 'P0001'; end if;
  end if;
  if nullif(btrim(coalesce(new.fnsku, '')), '') is not null and (tg_op = 'INSERT' or upper(coalesce(new.fnsku, '')) <> upper(coalesce(old.fnsku, ''))) then
    select name, upper(fnsku) into hit, code from margin_products where upper(fnsku) = upper(new.fnsku) and id <> coalesce(new.id, -1) order by id limit 1;
    if hit is not null then raise exception 'Already created: % (FNSKU %)', hit, code using errcode = 'P0001'; end if;
  end if;
  return new;
end $$;
create trigger a0_margin_product_no_duplicate before insert or update of name, asin, fnsku on margin_products
  for each row execute function margin_product_no_duplicate();
