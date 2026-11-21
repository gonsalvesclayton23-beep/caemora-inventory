// Reads MIT-2026.xlsx and turns every monthly tab into purchase lines, shipments, payments and credit notes.
import ExcelJS from 'exceljs';
import {
  Issue, companyCode, hasPound, num, parseCompCell, parseDate, parseStatus, round, tabMonth, text, ShipStatus,
} from './normalize.ts';

export type Currency = 'INR' | 'GBP';
export type Channel = 'FBA' | 'FBM' | 'EBAY';

export interface RawLine {
  ref: string;
  tab: string;
  month: string;
  groupId: string | null;
  company: string;
  channel: Channel;
  asin: string | null;
  fnsku: string | null;
  description: string;
  qty: number;
  unitPrice: number | null;
  currency: Currency;
  courierPerUnit: number;
  sheetTotal: number | null;   // "Unit / Invoice Amt" as it was in the sheet
  vendor: string | null;       // raw vendor text
  invoiceNo: string | null;
  invoiceDate: string | null;
  defective: number;
  short: number;
  checkedBy: string | null;
  remarks: string | null;
  remarks2: string | null;
  reimbursedGbp: number | null;
  amazonCaseId: string | null;
  reimbursementId: string | null;
  category: 'stock' | 'consumable';
}

export interface RawShipment {
  groupId: string;
  ref: string;
  month: string;
  company: string | null;
  channel: Channel | null;
  boxNo: string | null;
  amazonShipmentId: string | null;
  ukShipmentId: string | null;
  createdOn: string | null;
  trackingNo: string | null;
  status: ShipStatus;
  receivedOn: string | null;
  receivedBy: string | null;
}

export interface RawPayment {
  ref: string;
  month: string;
  company: string;
  vendor: string;
  kind: 'opening' | 'closing' | 'other';
  amount: number;
  currency: Currency;
  amountGbp: number | null;
  paidOn: string | null;
  method: string | null;
  paidFrom: string | null;
  reference: string | null;
  confirmed: boolean;
  notes: string | null;
}

export interface RawCreditNote {
  ref: string;
  month: string;
  relatesTo: string | null;
  company: string | null;
  amount: number;
  reason: string;
}

export interface Parsed {
  lines: RawLine[];
  shipments: RawShipment[];
  payments: RawPayment[];
  creditNotes: RawCreditNote[];
  issues: Issue[];
  sheetTotals: Record<string, { lines: number; inr: number; gbp: number }>; // per tab, as summed from the sheet
}

// header text (normalised) -> field
const HEADERS: Record<string, string> = {
  'box no': 'boxNo', comp: 'comp', asin: 'asin', fnsku: 'fnsku', product: 'product',
  'unit inv qty': 'qty', 'unit price/per': 'unitPrice', 'unit total price': 'goodsTotal',
  'unit courier charges': 'courierTotal', 'courier cost per unit': 'courierPerUnit',
  'unit / invoice amt': 'invoiceAmt', 'acount for': 'account',
  'payment done rs': 'payInr', 'payment amt rs': 'payInr', 'in £': 'payGbp', 'payment date': 'payDate',
  vendor: 'vendor', 'payment mode': 'payMode', 'payment a/c from': 'payFrom',
  'inv no': 'invNo', 'inv dt': 'invDate',
  'amazon shipment id': 'amzShipment', 'india-amz shipment id': 'amzShipment', 'amz shipment id': 'amzShipment',
  'uk shipment id': 'ukShipment', 'shipment creation date': 'shipCreated', 'tracking no.': 'tracking',
  'consignment status': 'status', 'consignment received date': 'receivedDate',
  'defective rcvd qty': 'defective', 'short qty': 'short', 'total unit rcvd/ inventory': 'receivedTotal',
  'checked by': 'checkedBy', 'remarks (margin sheet check)': 'remarks', 'remarks-1': 'remarks2',
  'amt reimbursed in £': 'reimbGbp',
};

const SHIPMENT_FIELDS = ['boxNo', 'comp', 'amzShipment', 'ukShipment', 'shipCreated', 'tracking'];
const PEACE = /^peace/i;
const UK_CARD = /amex|apple ?pay|card|debit/i;

function cellValue(cell: ExcelJS.Cell): unknown {
  // Ignore the copies ExcelJS gives for the hidden cells of a merged range; we fill down ourselves.
  if (cell.isMerged && cell.master.address !== cell.address) return undefined;
  const v = cell.value as any;
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return v.result instanceof Date ? v.result : v.result ?? null;
    if ('richText' in v) return v.richText.map((t: any) => t.text).join('');
    if ('text' in v) return v.text;
    if ('error' in v) return null;
    return null;
  }
  return v;
}

export async function parseWorkbook(path: string, overrides: Record<string, any> = {}): Promise<Parsed> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const out: Parsed = { lines: [], shipments: [], payments: [], creditNotes: [], issues: [], sheetTotals: {} };

  for (const ws of wb.worksheets) {
    const month = tabMonth(ws.name);
    if (month) parseMonthTab(ws, month, out, overrides);
    else if (/stationery/i.test(ws.name)) parseStationery(ws, out, overrides);
    else out.issues.push({ ref: ws.name, severity: 'warn', type: 'tab_skipped', message: `Tab "${ws.name}" not recognised` });
  }
  linkSelfPaidGbp(out);
  return out;
}

function headerMap(ws: ExcelJS.Worksheet): Record<string, number[]> {
  const map: Record<string, number[]> = {};
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const h = String(cellValue(cell) ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    const f = HEADERS[h];
    if (f) (map[f] ??= []).push(col);
  });
  return map;
}

function parseMonthTab(ws: ExcelJS.Worksheet, month: string, out: Parsed, overrides: Record<string, any>) {
  const tab = ws.name;
  const H = headerMap(ws);
  for (const req of ['product', 'qty', 'unitPrice', 'account']) {
    if (!H[req]) out.issues.push({ ref: tab, severity: 'error', type: 'missing_column', message: `No "${req}" column` });
  }
  const totals = (out.sheetTotals[tab] = { lines: 0, inr: 0, gbp: 0 });
  const productCol = H.product?.[0] ?? 4;

  let group: RawShipment | null = null;
  let groupLines: RawLine[] = [];
  let groupSeq = 0;
  let lastCompany: string | null = null;

  const closeGroup = () => {
    const g = group as RawShipment | null;
    const identified = g && (g.boxNo || g.amazonShipmentId || g.trackingNo || g.ukShipmentId);
    if (g && !identified) for (const l of groupLines) l.groupId = null;
    if (group && identified && groupLines.length) {
      if (groupLines.some((l) => l.defective + l.short > 0) && group.status === 'received') group.status = 'received_partial';
      group.company ??= groupLines[0].company;
      group.channel ??= groupLines[0].channel;
      out.shipments.push(group);
    }
    group = null;
    groupLines = [];
  };

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const ref = `${tab}!${r}`;
    const ov = overrides[ref] ?? {};
    if (ov.skip) { out.issues.push({ ref, severity: 'info', type: 'override_skip', message: 'Skipped by overrides.json' }); continue; }

    const get = (f: string): unknown => {
      if (f in ov) return ov[f];
      for (const c of H[f] ?? []) { const v = cellValue(row.getCell(c)); if (v != null && v !== '') return v; }
      return null;
    };
    const lead = Array.from({ length: productCol + 1 }, (_, i) => cellValue(row.getCell(i + 1)))
      .filter((v) => v != null).map(String).join(' ');
    const product = text(get('product'));
    const vendor = text(get('vendor'));
    const invoiceAmt = num(get('invoiceAmt'));
    const payInr = num(get('payInr'));
    const payGbpRaw = get('payGbp');
    const payGbp = num(payGbpRaw);
    const account = get('account');
    const company = companyCode(account);

    // ------------------------------------------------ Peace payment rows
    const isPaymentEntry = /payment entry/i.test(lead) ||
      (!text(get('qty')) && invoiceAmt != null && invoiceAmt < 0 && vendor != null && PEACE.test(vendor));
    if (isPaymentEntry) {
      const amount = payInr ?? (invoiceAmt != null ? -invoiceAmt : null);
      if (!company || amount == null) {
        out.issues.push({ ref, severity: 'error', type: 'payment_unreadable', message: `Payment row without company or amount ("${lead}")` });
        continue;
      }
      const label = text(get('product')) ?? '';
      const kind = /closing/i.test(label) && !/opening/i.test(label) ? 'closing' : /opening/i.test(label) ? 'opening' : 'other';
      const paidOn = parseDate(get('payDate'), month, 'Payment date', ref, out.issues);
      const method = text(get('payMode'));
      const confirmed = paidOn != null || method != null || (payGbp != null && payGbp > 0);
      const refNo = Array.from({ length: productCol }, (_, i) => cellValue(row.getCell(i + 1)))
        .find((v) => typeof v === 'number' && v > 1e8);
      out.payments.push({
        ref, month, company, vendor: 'Peace Enterprises', kind, amount: round(amount, 2), currency: 'INR',
        amountGbp: payGbp, paidOn, method, paidFrom: text(get('payFrom')),
        reference: refNo != null ? String(refNo) : null, confirmed, notes: label || null,
      });
      if (!confirmed) out.issues.push({ ref, severity: 'warn', type: 'payment_unconfirmed', message: `${company} ${label}: ₹${amount} has no payment date, method or £ amount; imported as unconfirmed` });
      if (payInr != null && invoiceAmt != null && Math.abs(payInr + invoiceAmt) > 1) {
        out.issues.push({ ref, severity: 'warn', type: 'payment_mismatch', message: `Payment ₹${payInr} vs invoice column ${invoiceAmt}` });
      }
      continue;
    }

    // ------------------------------------------------ credit notes
    if (product && /^credit note/i.test(product)) {
      const amt = invoiceAmt != null ? -invoiceAmt : null;
      const rel = product.match(/month of\s+([a-z]+)/i);
      const relMonth = rel ? tabMonth(rel[1]) : null;
      if (amt == null || amt <= 0) {
        out.issues.push({ ref, severity: 'error', type: 'credit_note_unreadable', message: `Credit note without a negative amount: "${product}"` });
        continue;
      }
      const cnCompany = company ?? (ov.company ? companyCode(ov.company) : null);
      out.creditNotes.push({ ref, month, relatesTo: relMonth, company: cnCompany, amount: amt, reason: product });
      if (!cnCompany) out.issues.push({ ref, severity: 'info', type: 'credit_note_all_companies', message: `Credit note ₹${amt} has no company; applied to the vendor's overall balance` });
      continue;
    }

    // ------------------------------------------------ shipment grouping (fill-down)
    const startsGroup = SHIPMENT_FIELDS.some((f) => { const v = get(f); return v != null && v !== ''; });
    if (startsGroup) {
      closeGroup();
      const comp = parseCompCell(get('comp'));
      const amz = text(get('amzShipment'));
      const uk = text(get('ukShipment'));
      const isFba = (s: string | null) => !!s && /^FBA/i.test(s);
      const st = parseStatus(get('status'));
      const tracking = text(get('tracking'));
      const amazonShipmentId = isFba(amz) ? amz : isFba(uk) ? uk : null;
      group = {
        groupId: `${tab}#${++groupSeq}`, ref, month,
        company: comp.company ?? null,
        channel: comp.channel ?? null,
        boxNo: text(get('boxNo')),
        amazonShipmentId,
        ukShipmentId: [amz, uk].filter((x) => x && x !== amazonShipmentId && !/^na$/i.test(x)).join(' / ') || null,
        createdOn: parseDate(get('shipCreated'), month, 'Shipment created', ref, out.issues),
        trackingNo: tracking && !/^na$/i.test(tracking) ? tracking.replace(/\.0$/, '') : null,
        status: st.status ?? 'in_transit',
        receivedOn: null,
        receivedBy: st.by ?? null,
      };
    }

    // ------------------------------------------------ purchase lines
    if (!product) {
      if (lead.trim() && (invoiceAmt != null || payInr != null || payGbp != null)) {
        out.issues.push({ ref, severity: 'warn', type: 'row_unrecognised', message: `Row with amounts but no product: "${lead.slice(0, 80)}"` });
      }
      continue;
    }
    const qty = num(get('qty'));
    let unitPrice = num(get('unitPrice'));
    const goodsTotal = num(get('goodsTotal'));
    if (qty == null || qty <= 0) {
      out.issues.push({ ref, severity: 'error', type: 'no_qty', message: `"${product}" has no quantity; not imported` });
      continue;
    }
    if (unitPrice == null && goodsTotal != null) unitPrice = round(goodsTotal / qty);
    if (unitPrice == null && invoiceAmt != null && invoiceAmt > 0 && num(get('courierPerUnit')) == null) {
      unitPrice = round(invoiceAmt / qty);
      out.issues.push({ ref, severity: 'warn', type: 'price_from_total', message: `"${product}": no unit price; using row total ${invoiceAmt} ÷ ${qty} = ${unitPrice} (includes any courier)` });
    }

    let courierPerUnit = num(get('courierPerUnit'));
    const courierTotal = num(get('courierTotal'));
    if (courierPerUnit == null && courierTotal != null) courierPerUnit = round(courierTotal / qty);

    let lineCompany = company ?? (ov.company ? companyCode(ov.company) : null);
    if (!lineCompany && group?.company) lineCompany = group.company;
    if (!lineCompany && lastCompany && group) {
      lineCompany = lastCompany;
      out.issues.push({ ref, severity: 'warn', type: 'company_inferred', message: `"${product}": no company; took ${lastCompany} from the line above` });
    }
    if (!lineCompany) {
      out.issues.push({ ref, severity: 'error', type: 'no_company', message: `"${product}": "Acount for" is "${account ?? ''}", not a known company` });
      continue;
    }
    lastCompany = lineCompany;

    // currency: £ for UK-card / Alibaba purchases, ₹ otherwise
    const method = text(get('payMode'));
    const vendorIsChina = !!vendor && /alibaba|co\.?,? ?lt|limited|trading|international|biomaterial|pet products|ltd/i.test(vendor) && !PEACE.test(vendor);
    let currency: Currency = 'INR';
    let why = '';
    if (vendorIsChina) { currency = 'GBP'; why = `vendor "${vendor}"`; }
    else if (method && UK_CARD.test(method)) { currency = 'GBP'; why = `paid by ${method}`; }
    else if (hasPound(product, payGbpRaw, get('invoiceAmt')) && (unitPrice == null || unitPrice < 50)) { currency = 'GBP'; why = '£ in the row'; }
    else if (unitPrice != null && unitPrice > 0 && unitPrice < 20 && !Number.isInteger(unitPrice)) { currency = 'GBP'; why = `price ${unitPrice} has pence`; }
    if (ov.currency) currency = ov.currency;
    if (currency === 'GBP' && !ov.currency) {
      out.issues.push({ ref, severity: 'info', type: 'currency_gbp', message: `"${product}" treated as £ (${why})` });
    }

    const rawFnsku = text(get('fnsku'));
    const fnsku = rawFnsku && /^X0[0-9A-Z]{8}$/i.test(rawFnsku) ? rawFnsku.toUpperCase() : null;
    const rawAsin = text(get('asin'));
    const asin = rawAsin && /^B0[0-9A-Z]{8}$/i.test(rawAsin) ? rawAsin.toUpperCase() : null;
    const comp = parseCompCell(get('comp'));
    const acctLower = String(account ?? '').toLowerCase();
    const channel: Channel = fnsku ? 'FBA' : acctLower.includes('ebay') ? 'EBAY' : (group?.channel === 'FBA' && fnsku ? 'FBA' : comp.channel === 'FBA' && fnsku ? 'FBA' : 'FBM');

    const rem = text(get('remarks'));
    const rem2 = text(get('remarks2'));
    const both = `${rem ?? ''} ${rem2 ?? ''}`;
    const caseId = both.match(/case\s*id[:\s-]*(\d{8,})/i)?.[1] ?? null;
    const reimbId = both.match(/reimbursement\s*id[:\s-]*(\d{8,})/i)?.[1] ?? null;

    // status / received date live on each line in the sheet; lift them to the shipment
    if (group) {
      const st = parseStatus(get('status'));
      if (st.status && group.status === 'in_transit') group.status = st.status;
      if (st.by && !group.receivedBy) group.receivedBy = st.by;
      const rd = parseDate(get('receivedDate'), month, 'Received date', ref, out.issues);
      if (rd && !group.receivedOn) group.receivedOn = rd;
      if (rd && group.status === 'in_transit') group.status = 'received';
    }

    // Some rows hold the courier TOTAL in the per-unit column, or no courier at all but a higher row total.
    const goods = (unitPrice ?? 0) * qty;
    if (invoiceAmt != null && invoiceAmt > 0 && courierPerUnit) {
      const asPerUnit = goods + courierPerUnit * qty;
      const asTotal = goods + courierPerUnit;
      if (Math.abs(asPerUnit - invoiceAmt) > 1 && Math.abs(asTotal - invoiceAmt) <= 1) {
        out.issues.push({ ref, severity: 'info', type: 'courier_was_total', message: `"${product}": courier ${courierPerUnit} is the total for ${qty} units; using ${round(courierPerUnit / qty)} per unit` });
        courierPerUnit = round(courierPerUnit / qty);
      }
    } else if (invoiceAmt != null && !courierPerUnit && unitPrice != null && invoiceAmt > goods + 0.5) {
      courierPerUnit = round((invoiceAmt - goods) / qty);
      out.issues.push({ ref, severity: 'info', type: 'courier_derived', message: `"${product}": no courier given; ${round(invoiceAmt - goods, 2)} difference to the row total taken as courier (${courierPerUnit}/unit)` });
    }

    const line: RawLine = {
      ref, tab, month, groupId: group?.groupId ?? null, company: lineCompany, channel,
      asin, fnsku, description: product, qty, unitPrice: unitPrice == null ? null : round(unitPrice), currency,
      courierPerUnit: round(courierPerUnit ?? 0),
      sheetTotal: invoiceAmt, vendor: vendor && !PEACE.test(vendor) ? vendor : vendor && PEACE.test(vendor) ? 'Peace Enterprises' : null,
      invoiceNo: text(get('invNo')), invoiceDate: parseDate(get('invDate'), month, 'Invoice date', ref, out.issues),
      defective: num(get('defective')) ?? 0, short: Math.max(0, num(get('short')) ?? 0),
      checkedBy: text(get('checkedBy')), remarks: rem, remarks2: rem2,
      reimbursedGbp: num(get('reimbGbp')), amazonCaseId: caseId, reimbursementId: reimbId, category: 'stock',
    };
    if (/invoice receipt|^tba$/i.test(line.invoiceNo ?? '')) line.invoiceNo = null;

    // Multi-row orders from a direct supplier (Folkbella, Alibaba) only name the vendor on the first row.
    const prevLine = out.lines.at(-1);
    if (!line.vendor && !/^PE/i.test(line.invoiceNo ?? '') && prevLine && prevLine.tab === tab &&
        Number(prevLine.ref.split('!')[1]) === r - 1 && prevLine.vendor && prevLine.vendor !== 'Peace Enterprises' &&
        prevLine.currency === line.currency && prevLine.company === line.company) {
      line.vendor = prevLine.vendor;
      line.invoiceNo ??= prevLine.invoiceNo;
      out.issues.push({ ref, severity: 'info', type: 'vendor_inherited', message: `"${product}": vendor ${prevLine.vendor} taken from the row above (same order)` });
    }
    if (line.invoiceNo && /^\d{4}-\d{2}-\d{2}$/.test(line.invoiceNo)) line.invoiceNo = null; // a date typed in the Inv No column
    out.lines.push(line);
    if (group) groupLines.push(line);

    totals.lines++;
    const computed = (line.unitPrice ?? 0) * qty + line.courierPerUnit * qty;
    if (currency === 'INR') totals.inr += invoiceAmt ?? computed; else totals.gbp += invoiceAmt ?? computed;
    const orderTotal = line.vendor && line.vendor !== 'Peace Enterprises' && invoiceAmt != null && invoiceAmt > computed + 1;
    const doubleCourier = invoiceAmt != null && Math.abs(invoiceAmt - computed - line.courierPerUnit) < 0.02;
    if (invoiceAmt != null && Math.abs(invoiceAmt - computed) > 0.5 && !(currency === 'GBP' && invoiceAmt === 0)) {
      out.issues.push({ ref, severity: orderTotal || doubleCourier ? 'info' : 'warn',
        type: orderTotal ? 'order_total_on_first_row' : doubleCourier ? 'sheet_formula_adds_courier_twice' : 'total_mismatch',
        message: `"${product}": sheet total ${invoiceAmt} ≠ qty × (price + courier) = ${round(computed, 2)}` });
    }
    if (line.unitPrice == null) out.issues.push({ ref, severity: 'warn', type: 'blank_price', message: `"${product}": blank unit price` });

    // purchases paid directly on the row (Alibaba, Folkbella): record the payment too
    if (payInr != null || payGbp != null) {
      const vendorName = line.vendor ?? (currency === 'GBP' ? 'Alibaba (unspecified seller)' : 'Peace Enterprises');
      const payInrRaw = get('payInr');
      const amount = currency === 'INR' ? payInr : (hasPound(payInrRaw) ? payInr : payGbp ?? payInr);
      if (amount != null) {
        out.payments.push({
          ref, month, company: lineCompany, vendor: vendorName, kind: 'other', amount: round(amount, 2), currency,
          amountGbp: currency === 'GBP' ? amount : payGbp, paidOn: parseDate(get('payDate'), month, 'Payment date', ref, out.issues), method,
          paidFrom: text(get('payFrom')), reference: currency === 'GBP' ? line.invoiceNo : null, confirmed: true,
          notes: `Paid with purchase: ${product}`,
        });
      } else {
        out.issues.push({ ref, severity: 'info', type: 'gbp_only_payment', message: `"${product}": only a £ amount (${payGbp}) next to a ₹ purchase` });
        (line as any)._gbpOnly = payGbp;
      }
    }
  }
  closeGroup();
}

// A ₹ purchase paid directly sometimes has only the £ amount (the ₹ cell holds a date), or has the ₹ on one row
// and the £ on the next (e.g. Folkbella Persol + Betadine).
function linkSelfPaidGbp(out: Parsed) {
  const rowOf = (ref: string) => Number(ref.split('!')[1]);
  for (const line of out.lines as any[]) {
    if (line._gbpOnly == null) continue;
    const gbp = line._gbpOnly as number;
    delete line._gbpOnly;
    const row = rowOf(line.ref);
    const prev = out.payments.find((p) => p.ref.split('!')[0] === line.tab && rowOf(p.ref) < row && rowOf(p.ref) >= row - 3 &&
      p.vendor === line.vendor && p.currency === 'INR' && p.amountGbp == null);
    if (prev) {
      prev.amountGbp = gbp;
      out.issues.push({ ref: line.ref, severity: 'info', type: 'gbp_linked', message: `£${gbp} attached to payment from ${prev.ref}` });
      continue;
    }
    // the order = this row plus the rows below it that belong to the same invoice
    const order = [line];
    for (const l of out.lines) {
      if (l.tab === line.tab && rowOf(l.ref) > row && l.vendor === line.vendor && l.invoiceNo && l.invoiceNo === line.invoiceNo &&
          rowOf(l.ref) === rowOf(order.at(-1)!.ref) + 1) order.push(l);
    }
    const inr = round(order.reduce((s, l) => s + ((l.unitPrice ?? 0) + l.courierPerUnit) * l.qty, 0), 2);
    out.payments.push({
      ref: line.ref, month: line.month, company: line.company, vendor: line.vendor ?? 'Peace Enterprises', kind: 'other',
      amount: inr, currency: 'INR', amountGbp: gbp, paidOn: line.invoiceDate, method: null, paidFrom: null, reference: line.invoiceNo,
      confirmed: true, notes: `₹ amount = order total (${order.length} row${order.length > 1 ? 's' : ''}); sheet only had £${gbp}`,
    });
    out.issues.push({ ref: line.ref, severity: 'warn', type: 'payment_inr_estimated',
      message: `"${line.description}": only £${gbp} recorded; payment of ₹${inr} assumed (order total, ${order.length} rows, ≈ ₹${Math.round(inr / gbp)}/£)` });
  }
}

function parseStationery(ws: ExcelJS.Worksheet, out: Parsed, overrides: Record<string, any>) {
  // Columns: Month | Date of Purchase | Item | Qty | Per Unit | Inv Amt | Paid from Ac. Columns J+ are notes (and a login) and are ignored.
  out.issues.push({ ref: `${ws.name}`, severity: 'warn', type: 'sensitive_data', message: 'Columns M–O hold website links, an email and what looks like a password. Not imported. Change that password.' });
  let lastMonth: string | null = null;
  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const ref = `${ws.name}!${r}`;
    if (overrides[ref]?.skip) continue;
    const v = (c: number) => cellValue(row.getCell(c));
    const item = text(v(3));
    if (!item) continue;
    const date = v(2);
    const iso = date instanceof Date ? date.toISOString().slice(0, 10) : null;
    const month: string | null = iso ? `${iso.slice(0, 7)}-01` : lastMonth;
    if (!month) { out.issues.push({ ref, severity: 'error', type: 'no_date', message: `Stationery "${item}" has no date` }); continue; }
    lastMonth = month;
    const qty = num(v(4));
    const price = num(v(5));
    const company = companyCode(v(7));
    if (!qty || !company) { out.issues.push({ ref, severity: 'error', type: 'stationery_unreadable', message: `"${item}": missing qty or company` }); continue; }
    out.lines.push({
      ref, tab: ws.name, month, groupId: null, company, channel: 'FBM', asin: null, fnsku: null, description: item,
      qty, unitPrice: price, currency: 'GBP', courierPerUnit: 0, sheetTotal: num(v(6)), vendor: 'Packaging supplier (unspecified)',
      invoiceNo: null, invoiceDate: iso, defective: 0, short: 0, checkedBy: null, remarks: null, remarks2: null,
      reimbursedGbp: null, amazonCaseId: null, reimbursementId: null, category: 'consumable',
    });
    const total = num(v(6));
    if (total != null) {
      out.payments.push({ ref, month, company, vendor: 'Packaging supplier (unspecified)', kind: 'other', amount: total, currency: 'GBP',
        amountGbp: total, paidOn: iso, method: null, paidFrom: text(v(7)), reference: null, confirmed: true, notes: `Stationery: ${item}` });
    }
  }
}
