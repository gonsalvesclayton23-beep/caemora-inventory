-- Reference data. Safe to re-run.

insert into companies (code, name, sort_order, default_vat_pct, vat_scheme, aliases, notes) values
  ('CMR', 'Caemora Ltd',  1, 7.5, 'Flat Rate VAT', '{caemora,cmr,caemora-amex,caemora-debit}', null),
  ('ARC', 'ARC UK G Ltd', 2, 7.5, 'Flat Rate VAT', '{arc,arc-wise,arc uk g ltd}', null),
  ('YD',  'Youdent Ltd',  3, 0,   null, '{yd,yd-ebay,youdent,youdent ltd,ydent,ebay,yd-wise}', 'Sells as YD-eBay'),
  ('GOE', 'Goenche Ltd',  4, 0,   null, '{goenche,goe}', null),
  ('GOA', 'Goasales',     5, 0,   null, '{goa sales,goasales,goa}', null),
  ('GEN', 'Gentech',      6, 0,   null, '{gentech}', 'Sole-trader eBay store'),
  ('ALS', 'Al Store',     7, 0,   null, '{als,alstore,al store}', null)
on conflict (code) do update set name = excluded.name, sort_order = excluded.sort_order, aliases = excluded.aliases, notes = excluded.notes;
-- (Default VAT is only set when a company is first created; after that an admin changes it in the app.)

insert into vendors (name, kind, country, default_currency, aliases, notes) values
  ('Peace Enterprises', 'india_partner', 'IN', 'INR', '{peace,peace entrp,peace enterprises}', 'India buying partner'),
  ('Folkbella',         'supplier',      'IN', 'INR', '{folkbella}', null),
  ('Alibaba (unspecified seller)', 'alibaba', 'CN', 'GBP', '{alibaba}', 'Use for Alibaba orders where the seller is not recorded'),
  ('Packaging supplier (unspecified)', 'supplier', 'GB', 'GBP', '{}', 'Stationery & packaging bought in the UK')
on conflict (name) do update set kind = excluded.kind, aliases = excluded.aliases;

insert into settings (key, value, description) values
  ('price_change_pct',         '5',   'Flag a unit price that moved more than this % vs the previous month'),
  ('courier_change_pct',       '0',   'Flag a courier/unit change above this % vs the previous month (0 = any change)'),
  ('rate_card_tolerance_pct',  '0',   'Allowed % above the agreed courier rate before flagging'),
  ('suspect_inr_price_below',  '20',  'A ₹ unit price below this probably was a £ price'),
  ('in_transit_days',          '21',  'Flag shipments in transit longer than this'),
  ('default_inr_per_gbp',      '125', 'Fallback ₹ per £ when no month rate exists'),
  ('reimbursement_inr_per_gbp','127', 'Fixed rate the sheet used to convert Amazon reimbursements')
on conflict (key) do nothing;
