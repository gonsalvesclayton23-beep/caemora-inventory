-- Company names and Default VAT (margin calculator file, 26 Nov 2026: "Companies and their tax"; MRG-01 AC5 change history).
-- Codes and every existing row stay exactly as they were; only names, order and a VAT setting change.

set role authenticated;
select test_as('00000000-0000-0000-0000-00000000000b');

select expect((select string_agg(code || '=' || name, ', ' order by sort_order) from companies) =
              'CMR=Caemora Ltd, ARC=ARC UK G Ltd, YD=Youdent Ltd, GOE=Goenche Ltd, GOA=Goasales, GEN=Gentech, ALS=Al Store',
              'Companies: new names, codes unchanged, in this order');
select expect((select string_agg(code || '=' || default_vat_pct::text || coalesce(' ' || vat_scheme, ''), ', ' order by sort_order) from companies) =
              'CMR=7.50 Flat Rate VAT, ARC=7.50 Flat Rate VAT, YD=0.00, GOE=0.00, GOA=0.00, GEN=0.00, ALS=0.00',
              'Companies: starting Default VAT');

-- only an admin can change it
update companies set default_vat_pct = 9 where code = 'CMR';
select expect((select default_vat_pct from companies where code = 'CMR') = 7.5, 'Companies: data entry cannot change VAT');
select test_as('00000000-0000-0000-0000-00000000000c');
update companies set default_vat_pct = 9 where code = 'CMR';
select expect((select default_vat_pct from companies where code = 'CMR') = 7.5, 'Companies: viewer cannot change VAT');

-- MRG-01 AC5 (change history): old value, new value, who and when
select test_as('00000000-0000-0000-0000-00000000000a');
update profiles set full_name = 'Clayton' where id = '00000000-0000-0000-0000-00000000000a';
select set_vat('CMR', 8, 'Flat Rate VAT');
select expect((select default_vat_pct from companies where code = 'CMR') = 8, 'MRG-01 AC5: admin changes Caemora Ltd to 8%');
select expect((select count(*) from v_company_vat_history
                where code = 'CMR' and old_vat = 7.5 and new_vat = 8 and changed_by_name = 'Clayton'
                  and changed_at > now() - interval '1 minute') = 1,
              'MRG-01 AC5: old value, new value, who and when are kept');
select expect((select company_name from v_company_vat_history where code = 'CMR' limit 1) = 'Caemora Ltd', 'VAT history names the company');
select expect_error($$select set_vat('CMR', 150, null)$$, '%VAT must be between 0% and 100%%');
select test_as('00000000-0000-0000-0000-00000000000b');
select expect_error($$select set_vat('CMR', 5, null)$$, '%Only an admin can change VAT%');
select expect((select count(*) from v_company_vat_history) = 0, 'VAT history is for admins only');

-- a name change does not touch any existing data (codes are the links)
select test_as('00000000-0000-0000-0000-00000000000a');
select expect((select count(*) from purchase_lines where company_code not in (select code from companies)) = 0, 'every line still has its company');

reset role;
select test_as(null);
