-- FLG-03 on upgrade: flags that were already open when cases arrived do not become cases (no flood on day one).
do $$
begin
  assert (select count(*) from flags where status = 'open' and rule = 'missing_invoice_no') >= 1, 'a flag existed before the upgrade';
  assert (select count(*) from cases) = 0, 'no cases for flags raised before the upgrade';
  assert (select count(*) from case_rules where creates_case) = 6, 'case rules added';
end $$;
-- SHP-08 on upgrade: a box that was already short gets its flag and its destination, but no case
do $$
begin
  assert (select destination from shipments where amazon_shipment_id = 'FBA15UPGRADE') = 'amazon', 'destination set from the FBA ID';
  assert (select count(*) from flags where rule = 'raise_amazon_case' and status = 'open') = 1, 'existing shortage flagged';
  assert (select count(*) from cases) = 0, 'no case for a shortage from before the upgrade';
  perform refresh_all_flags();
  assert (select count(*) from cases) = 0, 'the nightly check does not create cases for old problems either';
end $$;
