-- Reference data. Safe to re-run.

insert into companies (code, name, aliases, notes) values
  ('CMR', 'Caemora Ltd',  '{caemora,cmr,caemora-amex,caemora-debit}', null),
  ('ARC', 'ARC',          '{arc,arc-wise}', null),
  ('GOE', 'Goenche Ltd',  '{goenche,goe}', null),
  ('YD',  'YouDent',      '{yd,yd-ebay,youdent,youdent ltd,ydent,ebay,yd-wise}', 'Sells as YD-eBay'),
  ('ALS', 'Al Store',     '{als,alstore,al store}', null),
  ('GEN', 'Gentech',      '{gentech}', 'Sole-trader eBay store'),
  ('GOA', 'Goa Sales',    '{goa sales,goa}', null)
on conflict (code) do update set name = excluded.name, aliases = excluded.aliases, notes = excluded.notes;

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
