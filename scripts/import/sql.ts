// Writes the import as one SQL script that can be pasted into the Supabase SQL editor.
// Same result and the same checks as `--load`, without a database password leaving the dashboard.
import { writeFileSync } from 'node:fs';
import type { Built } from './build.ts';
import type { Parsed } from './parse.ts';

const json = (rows: unknown[]) => {
  const s = JSON.stringify(rows);
  if (s.includes('$json$')) throw new Error('Data contains the SQL quote marker $json$');
  return `$json$${s}$json$::jsonb`;
};

export function writeImportSql(path: string, parsed: Parsed, built: Built) {
  const months = new Set<string>([...parsed.lines, ...parsed.payments, ...parsed.creditNotes, ...parsed.shipments].map((x) => x.month));
  for (const c of parsed.creditNotes) if (c.relatesTo) months.add(c.relatesTo);

  const vendorOf = (l: Parsed['lines'][number]) => l.vendor ?? (l.currency === 'GBP' ? 'Alibaba (unspecified seller)' : 'Peace Enterprises');

  // expected totals, checked before COMMIT
  const expected = new Map<string, { n: number; t: number }>();
  for (const l of parsed.lines) {
    const k = `${l.month}|${l.company}|${l.currency}`;
    const e = expected.get(k) ?? { n: 0, t: 0 };
    e.n++; e.t += ((l.unitPrice ?? 0) + l.courierPerUnit) * l.qty;
    expected.set(k, e);
  }

  const sql = `-- MIT-2026.xlsx import, generated ${new Date().toISOString().slice(0, 10)}.
-- Paste into Supabase → SQL Editor and Run, AFTER supabase/setup.sql. Runs as one transaction:
-- if anything fails or the totals do not match the spreadsheet, nothing is saved.
begin;
set local app.importing = 'on';
set local app.bypass_lock = 'on';

do $$ begin
  if exists (select 1 from purchase_lines) then
    raise exception 'Purchases already exist. This import is meant for an empty database.';
  end if;
end $$;

insert into periods (month) select x::date from jsonb_array_elements_text(${json([...months].sort())}) x on conflict do nothing;

insert into vendors (name, kind, country, default_currency)
select x.name, x.kind::vendor_kind, x.country, x.currency::currency_code
  from jsonb_to_recordset(${json(built.vendors)}) as x(name text, kind text, country text, currency text)
on conflict (name) do nothing;

insert into products (name, category, agreed_courier_per_unit, agreed_courier_currency, agreed_courier_from, notes, import_ref)
select x.name, x.category::line_category, x.rate, x.cur::currency_code, x.rate_from, x.notes, x.ref
  from jsonb_to_recordset(${json(built.products.map((p, ord) => ({
    ord, ref: p.key, name: p.name, category: p.category, rate: p.agreedCourierPerUnit, cur: p.agreedCourierCurrency,
    rate_from: p.agreedCourierFrom, notes: p.names.size > 1 ? `Also recorded as: ${[...p.names.keys()].filter((n) => n !== p.name).join(' | ')}` : null,
  })))}) as x(ord int, ref text, name text, category text, rate numeric, cur text, rate_from date, notes text)
 order by x.ord;

insert into listings (product_id, company_code, channel, asin, fnsku, import_ref)
select p.id, x.company, x.channel::sales_channel, x.asin, x.fnsku, x.ref
  from jsonb_to_recordset(${json(built.listings.map((l) => ({ ref: l.key, product: l.productKey, company: l.company, channel: l.channel, asin: l.asin, fnsku: l.fnsku })))})
       as x(ref text, product text, company text, channel text, asin text, fnsku text)
  join products p on p.import_ref = x.product;

insert into shipments (period_month, company_code, channel, box_no, amazon_shipment_id, uk_shipment_id, created_on, tracking_no, status, received_on, received_by, import_ref)
select x.month, x.company, x.channel::sales_channel, x.box, x.amz, x.uk, x.created, x.tracking, x.status::shipment_status, x.received, x.by, x.ref
  from jsonb_to_recordset(${json(parsed.shipments.map((s, ord) => ({
    ord, ref: s.groupId, month: s.month, company: s.company, channel: s.channel, box: s.boxNo, amz: s.amazonShipmentId, uk: s.ukShipmentId,
    created: s.createdOn, tracking: s.trackingNo, status: s.status, received: s.receivedOn, by: s.receivedBy,
  })))}) as x(ord int, ref text, month date, company text, channel text, box text, amz text, uk text, created date, tracking text, status text, received date, by text)
 order by x.ord;

insert into purchase_lines (period_month, shipment_id, product_id, listing_id, company_code, vendor_id, category, description, qty, unit_price, currency,
                            courier_per_unit, invoice_no, invoice_date, defective_qty, short_qty, checked_by, remarks, remarks_2,
                            amazon_case_id, reimbursement_id, reimbursed_gbp, import_ref)
select x.month, s.id, p.id, li.id, x.company, v.id, x.category::line_category, x.description, x.qty, x.price, x.currency::currency_code,
       x.courier, x.inv_no, x.inv_date, x.defective, x.short, x.checked_by, x.remarks, x.remarks_2, x.case_id, x.reimb_id, x.reimb_gbp, x.ref
  from jsonb_to_recordset(${json(parsed.lines.map((l, ord) => ({
    ord, ref: l.ref, month: l.month, shipment: l.groupId, product: built.lineProduct.get(l), listing: built.lineListing.get(l) ?? null,
    company: l.company, vendor: vendorOf(l), category: l.category, description: l.description, qty: l.qty, price: l.unitPrice,
    currency: l.currency, courier: l.courierPerUnit, inv_no: l.invoiceNo, inv_date: l.invoiceDate, defective: l.defective, short: l.short,
    checked_by: l.checkedBy, remarks: l.remarks, remarks_2: l.remarks2, case_id: l.amazonCaseId, reimb_id: l.reimbursementId, reimb_gbp: l.reimbursedGbp,
  })))}) as x(ord int, ref text, month date, shipment text, product text, listing text, company text, vendor text, category text, description text,
              qty int, price numeric, currency text, courier numeric, inv_no text, inv_date date, defective int, short int, checked_by text,
              remarks text, remarks_2 text, case_id text, reimb_id text, reimb_gbp numeric)
  join products p on p.import_ref = x.product
  join vendors v on v.name = x.vendor
  left join listings li on li.import_ref = x.listing
  left join shipments s on s.import_ref = x.shipment
 order by x.ord;

insert into payments (period_month, company_code, vendor_id, kind, amount, currency, amount_gbp, paid_on, method, paid_from, paid_from_company, reference, confirmed, notes, import_ref)
select x.month, x.company, v.id, x.kind::payment_kind, x.amount, x.currency::currency_code, x.gbp, x.paid_on, x.method, x.paid_from, x.from_company,
       x.reference, x.confirmed, x.notes, x.ref
  from jsonb_to_recordset(${json(parsed.payments.map((p, ord) => ({
    ord, ref: p.ref, month: p.month, company: p.company, vendor: p.vendor, kind: p.kind, amount: p.amount, currency: p.currency, gbp: p.amountGbp,
    paid_on: p.paidOn, method: p.method, paid_from: p.paidFrom, from_company: p.paidFromCompany ?? null, reference: p.reference,
    confirmed: p.confirmed, notes: p.notes,
  })))}) as x(ord int, ref text, month date, company text, vendor text, kind text, amount numeric, currency text, gbp numeric, paid_on date,
              method text, paid_from text, from_company text, reference text, confirmed boolean, notes text)
  join vendors v on v.name = x.vendor
 order by x.ord;

insert into credit_notes (period_month, relates_to_month, company_code, vendor_id, amount, reason, import_ref)
select x.month, x.relates, x.company, v.id, x.amount, x.reason, x.ref
  from jsonb_to_recordset(${json(parsed.creditNotes.map((c) => ({ ref: c.ref, month: c.month, relates: c.relatesTo, company: c.company, amount: c.amount, reason: c.reason })))})
       as x(ref text, month date, relates date, company text, amount numeric, reason text)
  join vendors v on v.name = 'Peace Enterprises';

select recompute_fx_from_payments();
select refresh_all_flags();

-- every month × company × currency must match the spreadsheet, and every row must have landed
do $$
declare bad text;
begin
  if (select count(*) from purchase_lines) <> ${parsed.lines.length} then raise exception 'Expected ${parsed.lines.length} purchase lines, got %', (select count(*) from purchase_lines); end if;
  if (select count(*) from payments) <> ${parsed.payments.length} then raise exception 'Expected ${parsed.payments.length} payments, got %', (select count(*) from payments); end if;
  if (select count(*) from credit_notes) <> ${parsed.creditNotes.length} then raise exception 'Expected ${parsed.creditNotes.length} credit notes'; end if;
  select string_agg(format('%s %s %s', e.k, e.n, d.n), '; ') into bad
    from jsonb_to_recordset(${json([...expected.entries()].map(([k, v]) => ({ k, n: v.n, t: Math.round(v.t * 100) / 100 })))}) as e(k text, n int, t numeric)
    full join (select period_month::text || '|' || company_code || '|' || currency as k, count(*)::int n, round(sum(line_total), 2) t
                 from purchase_lines group by 1) d on d.k = e.k
   where e.k is null or d.k is null or e.n <> d.n or abs(e.t - d.t) > 0.011;
  if bad is not null then raise exception 'Totals do not match the spreadsheet: %', bad; end if;
end $$;

commit;

select 'Imported ${parsed.lines.length} purchase lines, ${parsed.shipments.length} shipments, ${parsed.payments.length} payments, ${parsed.creditNotes.length} credit notes, ${built.products.length} products. Totals match the spreadsheet.' as result;
`;
  writeFileSync(path, sql);
}
