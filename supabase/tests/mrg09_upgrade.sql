-- MRG-09 AC6 on upgrade: run on a database at migration 011 with lines in it, then 012 is applied, then the checks below.
-- (run.sh does this in its own database, caemora_upgrade.)
do $$
begin
  assert (select count(*) from margin_products) = 3, 'every existing line became a product line of its own (nothing merged)';
  assert (select count(*) from margin_lines) = 3 and not exists (select 1 from margin_lines where margin_product_id <> id), 'each keeps its id';
  assert (select string_agg(channel || '=' || selling_price::text || '/' || company_code, ' ' order by id) from v_margin_lines)
         = 'AMAZON=9.4900/CMR EBAY=7.6900/YD AMAZON=5.0000/GOE', 'prices, platforms and companies kept';
  assert (select product_cost = 90 and fx_rate = 115 and fx_source = 'manual' and asin = 'B0FMHY3KW5' from margin_products where id = 1), 'costs and rate kept';
  assert (select count(*) from v_margin_price_history where line_id = 1 and old_price = 8.99 and new_price = 9.49) = 1, 'price history kept';
  assert (select count(*) from settings where key like 'margin_%') = 29, 'settings added';
end $$;
select 'upgrade ok';
