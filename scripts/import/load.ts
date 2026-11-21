// Loads the parsed workbook into Postgres in one transaction.
import pg from 'pg';
import type { Built } from './build.ts';
import type { Parsed } from './parse.ts';

type Row = Record<string, unknown>;

/** Bulk insert via jsonb_to_recordset; returns import_ref -> id. */
async function insertMany(client: pg.PoolClient, table: string, cols: Record<string, string>, rows: Row[]) {
  const ids = new Map<string, number>();
  const names = Object.keys(cols);
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const def = names.map((n) => `${n} ${cols[n]}`).join(', ');
    const res = await client.query(
      `insert into ${table} (${names.join(', ')})
       select ${names.join(', ')} from jsonb_to_recordset($1::jsonb) as x(${def})
       returning id, import_ref`,
      [JSON.stringify(chunk)],
    );
    for (const r of res.rows) ids.set(r.import_ref, Number(r.id));
  }
  return ids;
}

export async function load(databaseUrl: string, parsed: Parsed, built: Built, opts: { replace: boolean }) {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`set local app.importing = 'on'; set local app.bypass_lock = 'on';`);

    const existing = await client.query('select count(*)::int n from purchase_lines');
    if (existing.rows[0].n > 0) {
      if (!opts.replace) throw new Error(`purchase_lines already has ${existing.rows[0].n} rows. Re-run with --replace to wipe ALL purchase, shipment, payment, product and flag data first.`);
      await client.query(`truncate flags, credit_notes, payments, purchase_lines, shipments, listings, products, fx_rates restart identity cascade`);
    }

    // periods
    const months = new Set<string>([...parsed.lines, ...parsed.payments, ...parsed.creditNotes, ...parsed.shipments].map((x) => x.month));
    for (const c of parsed.creditNotes) if (c.relatesTo) months.add(c.relatesTo);
    for (const m of months) await client.query('insert into periods (month) values ($1) on conflict do nothing', [m]);

    // vendors
    for (const v of built.vendors) {
      await client.query(
        `insert into vendors (name, kind, country, default_currency) values ($1, $2, $3, $4) on conflict (name) do nothing`,
        [v.name, v.kind, v.country, v.currency]);
    }
    const vendorIds = new Map<string, number>(
      (await client.query('select id, name from vendors')).rows.map((r) => [r.name, Number(r.id)]));

    const productIds = await insertMany(client, 'products',
      { name: 'text', category: 'line_category', agreed_courier_per_unit: 'numeric', agreed_courier_currency: 'currency_code', agreed_courier_from: 'date', notes: 'text', import_ref: 'text' },
      built.products.map((p) => ({
        name: p.name, category: p.category, agreed_courier_per_unit: p.agreedCourierPerUnit,
        agreed_courier_currency: p.agreedCourierCurrency, agreed_courier_from: p.agreedCourierFrom,
        notes: p.names.size > 1 ? `Also recorded as: ${[...p.names.keys()].filter((n) => n !== p.name).join(' | ')}` : null,
        import_ref: p.key,
      })));

    const listingIds = await insertMany(client, 'listings',
      { product_id: 'bigint', company_code: 'text', channel: 'sales_channel', asin: 'text', fnsku: 'text', import_ref: 'text' },
      built.listings.map((l) => ({ product_id: productIds.get(l.productKey), company_code: l.company, channel: l.channel, asin: l.asin, fnsku: l.fnsku, import_ref: l.key })));

    const shipmentIds = await insertMany(client, 'shipments',
      { period_month: 'date', company_code: 'text', channel: 'sales_channel', box_no: 'text', amazon_shipment_id: 'text', uk_shipment_id: 'text',
        created_on: 'date', tracking_no: 'text', status: 'shipment_status', received_on: 'date', received_by: 'text', import_ref: 'text' },
      parsed.shipments.map((s) => ({
        period_month: s.month, company_code: s.company, channel: s.channel, box_no: s.boxNo, amazon_shipment_id: s.amazonShipmentId,
        uk_shipment_id: s.ukShipmentId, created_on: s.createdOn, tracking_no: s.trackingNo, status: s.status, received_on: s.receivedOn,
        received_by: s.receivedBy, import_ref: s.groupId,
      })));

    const peace = vendorIds.get('Peace Enterprises')!;
    const lineIds = await insertMany(client, 'purchase_lines',
      { period_month: 'date', shipment_id: 'bigint', product_id: 'bigint', listing_id: 'bigint', company_code: 'text', vendor_id: 'bigint',
        category: 'line_category', description: 'text', qty: 'int', unit_price: 'numeric', currency: 'currency_code', courier_per_unit: 'numeric',
        invoice_no: 'text', invoice_date: 'date', defective_qty: 'int', short_qty: 'int', checked_by: 'text', remarks: 'text', remarks_2: 'text',
        amazon_case_id: 'text', reimbursement_id: 'text', reimbursed_gbp: 'numeric', import_ref: 'text' },
      parsed.lines.map((l) => ({
        period_month: l.month, shipment_id: l.groupId ? shipmentIds.get(l.groupId) ?? null : null,
        product_id: productIds.get(built.lineProduct.get(l)!), listing_id: built.lineListing.has(l) ? listingIds.get(built.lineListing.get(l)!) : null,
        company_code: l.company, vendor_id: l.vendor ? vendorIds.get(l.vendor) ?? peace : (l.currency === 'GBP' ? vendorIds.get('Alibaba (unspecified seller)') : peace),
        category: l.category, description: l.description, qty: l.qty, unit_price: l.unitPrice, currency: l.currency, courier_per_unit: l.courierPerUnit,
        invoice_no: l.invoiceNo, invoice_date: l.invoiceDate, defective_qty: l.defective, short_qty: l.short, checked_by: l.checkedBy,
        remarks: l.remarks, remarks_2: l.remarks2, amazon_case_id: l.amazonCaseId, reimbursement_id: l.reimbursementId,
        reimbursed_gbp: l.reimbursedGbp, import_ref: l.ref,
      })));

    await insertMany(client, 'payments',
      { period_month: 'date', company_code: 'text', vendor_id: 'bigint', kind: 'payment_kind', amount: 'numeric', currency: 'currency_code',
        amount_gbp: 'numeric', paid_on: 'date', method: 'text', paid_from: 'text', reference: 'text', confirmed: 'boolean', notes: 'text', import_ref: 'text' },
      parsed.payments.map((p) => ({
        period_month: p.month, company_code: p.company, vendor_id: vendorIds.get(p.vendor), kind: p.kind, amount: p.amount, currency: p.currency,
        amount_gbp: p.amountGbp, paid_on: p.paidOn, method: p.method, paid_from: p.paidFrom, reference: p.reference, confirmed: p.confirmed,
        notes: p.notes, import_ref: p.ref,
      })));

    await insertMany(client, 'credit_notes',
      { period_month: 'date', relates_to_month: 'date', company_code: 'text', vendor_id: 'bigint', amount: 'numeric', reason: 'text', import_ref: 'text' },
      parsed.creditNotes.map((c) => ({
        period_month: c.month, relates_to_month: c.relatesTo, company_code: c.company, vendor_id: peace, amount: c.amount, reason: c.reason, import_ref: c.ref,
      })));

    await client.query('select recompute_fx_from_payments()');
    await client.query('select refresh_all_flags()');

    // verify: database totals match what was parsed
    const db = await client.query(`select period_month::text m, company_code c, currency cur, count(*)::int n, sum(line_total)::float8 t
                                     from purchase_lines group by 1, 2, 3`);
    const want = new Map<string, { n: number; t: number }>();
    for (const l of parsed.lines) {
      const k = `${l.month}|${l.company}|${l.currency}`;
      const w = want.get(k) ?? { n: 0, t: 0 };
      w.n++; w.t += ((l.unitPrice ?? 0) + l.courierPerUnit) * l.qty;
      want.set(k, w);
    }
    const problems: string[] = [];
    for (const r of db.rows) {
      const w = want.get(`${r.m}|${r.c}|${r.cur}`);
      if (!w || w.n !== r.n || Math.abs(w.t - r.t) > 0.011) problems.push(`${r.m} ${r.c} ${r.cur}: db ${r.n} lines ${r.t}, parsed ${w?.n} ${w?.t}`);
    }
    if (db.rows.length !== want.size) problems.push(`group count differs: db ${db.rows.length} vs parsed ${want.size}`);
    if (problems.length) throw new Error('Verification failed, nothing saved:\n' + problems.join('\n'));

    await client.query('commit');
    const flags = await client.query(`select rule, count(*)::int n from flags where status = 'open' group by 1 order by 2 desc`);
    return { lines: lineIds.size, products: productIds.size, listings: listingIds.size, shipments: shipmentIds.size, flags: flags.rows };
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}
