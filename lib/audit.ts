// Audit log (27 Nov 2026): turns rows of audit_log into plain English for the admin's Audit log tab and its CSV.

export interface AuditRow {
  table_name: string; action: string; row_key: string | null;
  old_data: Record<string, any> | null; new_data: Record<string, any> | null;
}
export interface Lookups { products?: Map<number, string>; marginProducts?: Map<number, string>; vendors?: Map<number, string> }

export const AUDIT_PAGE_SIZE = 100;

/** table → area shown on screen (also the "Area" filter) */
export const AREAS: Record<string, string> = {
  auth: 'Sign-in',
  purchase_lines: 'Purchase',
  shipments: 'Shipment',
  shipment_items: 'Box contents',
  invoice_files: 'Invoice file',
  payments: 'Payment',
  credit_notes: 'Credit note',
  periods: 'Month (settle / reopen)',
  products: 'Product',
  listings: 'Product listing',
  vendors: 'Supplier',
  companies: 'Company',
  profiles: 'User',
  settings: 'Setting',
  fx_rates: 'Exchange rate (monthly)',
  flags: 'Flag',
  margin_products: 'Product margin',
  margin_lines: 'Product margin',
  margin_match_dismissed: 'Product margin',
  case_rules: 'Case rule',
  company_sales: 'Sales (monthly)',
  losses: 'Loss',
};
export const AUDIT_ACTIONS: Record<string, string> = {
  INSERT: 'Added', UPDATE: 'Changed', DELETE: 'Deleted',
  SIGN_IN: 'Signed in', SIGN_OUT: 'Signed out', SIGN_IN_FAILED: 'Failed sign-in', BULK: 'Marked as seen',
};

const FIELD: Record<string, string> = {
  unit_price: 'Unit price', courier_per_unit: 'Courier per unit', qty: 'Quantity', currency: 'Currency', invoice_no: 'Invoice no.',
  invoice_date: 'Invoice date', period_month: 'Month', company_code: 'Company', vendor_id: 'Supplier', product_id: 'Product',
  shipment_id: 'Shipment', description: 'Description', defective_qty: 'Defective', short_qty: 'Short', remarks: 'Remarks', remarks_2: 'Remarks 2',
  checked_by: 'Checked by', tracking_no: 'Tracking no.', amazon_shipment_id: 'Amazon shipment ID', status: 'Status', amount: 'Amount',
  amount_gbp: 'Amount (£)', paid_on: 'Paid on', method: 'Method', reference: 'Reference', confirmed: 'Confirmed', paid_from_company: 'Paid from',
  selling_price: 'Selling price', tax_override_pct: 'Own tax rate (%)', referral_pct: 'Referral fee (%)', fba_fee: 'FBA fee', promo_per_unit: 'Ads (£ per unit)', category_fee_pct: 'Category fee %',
  local_shipping: 'Shipping', misc_expense: 'Misc. expense', ad_pct: 'Ads %', hidden: 'Hidden', listing_status: 'Listing',
  product_cost: 'Product cost', product_cost_currency: 'Product cost currency', courier_cost: 'Courier cost', courier_currency: 'Courier currency',
  fx_rate: 'Exchange rate', fx_rate_date: 'Rate date', fx_source: 'Rate source', inr_per_gbp: '₹ per £', default_vat_pct: 'Default VAT (%)',
  vat_scheme: 'VAT scheme', full_name: 'Name', role: 'Role', active: 'Active', value: 'Value', agreed_courier_per_unit: 'Agreed courier per unit',
  agreed_courier_currency: 'Agreed courier currency', agreed_courier_from: 'Agreed courier from', resolution_note: 'Note', channel: 'Platform',
};
/** never shown as a change: bookkeeping or worked out from other fields */
const HIDDEN = new Set(['id', 'created_at', 'updated_at', 'created_by', 'import_ref', 'line_total', 'goods_total', 'courier_total', 'received_qty',
  'resolved_at', 'resolved_by', 'fetched_at']);

const PLATFORM: Record<string, string> = { AMAZON: 'Amazon', EBAY: 'eBay', SHOPIFY: 'Shopify', ONBUY: 'OnBuy', ETSY: 'Etsy' };
const RULE: Record<string, string> = {
  price_change: 'Price changed', courier_change: 'Courier changed', courier_above_price: 'Courier > product price',
  courier_above_rate_card: 'Courier above rate card', missing_invoice_no: 'Missing invoice no.', missing_invoice_date: 'Missing invoice date',
  blank_price: 'Blank price', suspect_currency: 'Looks like £ entered as ₹', receipt_discrepancy: 'Short/defective, no remark',
  long_in_transit: 'In transit too long', duplicate_tracking: 'Duplicate tracking no.', unconfirmed_payment: 'Unconfirmed payment',
  payment_missing_reference: 'Payment without reference', settled_month_edit: 'Edit to settled month',
};

const humanize = (k: string) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const monthLong = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** a stored value as text: "90.0000" → "90", true → "Yes", null → "—" */
export function show(v: unknown): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string' && /^-?\d+\.\d+$/.test(v)) return String(Number(v));
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function recordLabel(r: AuditRow, d: Record<string, any>, l: Lookups): string {
  const t = r.table_name;
  const join = (...xs: unknown[]) => xs.filter((x) => x != null && x !== '').map(String).join(' · ');
  switch (t) {
    case 'auth': return d.email ?? '';
    case 'purchase_lines': return join(d.description ?? l.products?.get(Number(d.product_id)), d.invoice_no) || `Line ${r.row_key}`;
    case 'shipments': return join(d.tracking_no, d.amazon_shipment_id) || `Shipment ${r.row_key}`;
    case 'shipment_items': return join(l.products?.get(Number(d.product_id)), d.shipment_id && `shipment ${d.shipment_id}`) || `Box item ${r.row_key}`;
    case 'payments': return join(d.reference, l.vendors?.get(Number(d.vendor_id)), d.company_code) || `Payment ${r.row_key}`;
    case 'credit_notes': return join(d.reference, d.note, l.vendors?.get(Number(d.vendor_id))) || `Credit note ${r.row_key}`;
    case 'periods': return d.month ? monthLong(d.month) : (r.row_key ?? '');
    case 'settings': return d.description ?? d.key ?? r.row_key ?? '';
    case 'fx_rates': return d.month ? monthLong(d.month) : (r.row_key ?? '');
    case 'flags': return join(RULE[d.rule] ?? d.rule, d.message).replace(' · ', ': ');
    case 'profiles': return join(d.full_name, d.email);
    case 'companies': return join(d.name, d.code);
    case 'listings': return join(l.products?.get(Number(d.product_id)), d.company_code, d.fnsku);
    case 'margin_products': return d.name ?? `Margin line ${r.row_key}`;
    case 'margin_lines': return join(l.marginProducts?.get(Number(d.margin_product_id)) ?? `Margin line ${d.margin_product_id}`, PLATFORM[d.channel] ?? d.channel);
    case 'margin_match_dismissed': return join(l.marginProducts?.get(Number(d.a_id)) ?? `line ${d.a_id}`, l.marginProducts?.get(Number(d.b_id)) ?? `line ${d.b_id}`).replace(' · ', ' and ');
    case 'invoice_files': return d.file_name ?? d.path ?? `File ${r.row_key}`;
    default: return d.name ?? d.description ?? r.row_key ?? '';
  }
}

export function describeEntry(r: AuditRow, l: Lookups = {}) {
  const d = { ...(r.old_data ?? {}), ...(r.new_data ?? {}) };
  let action = AUDIT_ACTIONS[r.action] ?? r.action;
  if (r.table_name === 'margin_match_dismissed') action = r.action === 'INSERT' ? 'Not a match' : 'Match suggested again';
  let record = recordLabel(r, d, l);
  if (r.action === 'BULK') {
    const n = r.new_data ?? {};
    record = `${n.count} flag${n.count === 1 ? '' : 's'}${n.rule ? ` (${RULE[n.rule] ?? n.rule})` : ''} from before ${monthLong(String(n.before))}`;
  }
  const changes: { field: string; old: string; new: string }[] = [];
  if (r.action === 'UPDATE' && r.old_data && r.new_data) {
    for (const k of Object.keys(r.new_data)) {
      if (HIDDEN.has(k)) continue;
      if (JSON.stringify(r.old_data[k]) === JSON.stringify(r.new_data[k])) continue;
      if (show(r.old_data[k]) === show(r.new_data[k])) continue;
      changes.push({ field: FIELD[k] ?? humanize(k), old: show(r.old_data[k]), new: show(r.new_data[k]) });
    }
  }
  return { area: AREAS[r.table_name] ?? humanize(r.table_name), action, record, changes };
}

/** What was entered on an added record, or held by a deleted one (shown on request, and in the CSV). */
export function details(r: AuditRow): { field: string; value: string }[] {
  const d = r.action === 'DELETE' ? r.old_data : r.new_data;
  if (!d || r.action === 'UPDATE' || r.table_name === 'auth') return [];
  return Object.entries(d).filter(([k, v]) => !HIDDEN.has(k) && v != null && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => ({ field: FIELD[k] ?? humanize(k), value: show(v) }));
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** AUD AC5: filters from the address bar; anything unexpected is ignored. */
export function parseAuditFilters(sp: Record<string, string | undefined>) {
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  return {
    user: sp.user && UUID.test(sp.user) ? sp.user : null,
    area: sp.area && sp.area in AREAS ? sp.area : null,
    action: sp.action && sp.action in AUDIT_ACTIONS ? sp.action : null,
    from: sp.from && DAY.test(sp.from) ? sp.from : null,
    to: sp.to && DAY.test(sp.to) ? sp.to : null,
    page, offset: (page - 1) * AUDIT_PAGE_SIZE,
  };
}
export type AuditFilters = ReturnType<typeof parseAuditFilters>;

/** Area filter: product margins cover three tables. */
export const areaTables = (area: string) =>
  area === 'margin_products' || area === 'margin_lines' || area === 'margin_match_dismissed' ? ['margin_products', 'margin_lines', 'margin_match_dismissed'] : [area];

/** Areas offered in the filter, one per label. */
export const AREA_OPTIONS = Object.entries(AREAS).filter(([k]) => k !== 'margin_lines' && k !== 'margin_match_dismissed');

export const AUDIT_EXPORT_COLUMNS = ['when_uk', 'who', 'email', 'area', 'action', 'record', 'changes', 'reason'] as const;

export const ukTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/London' });

/** AUD AC8: the Audit log shows every time in one zone, UK or India, picked on the screen (UK unless India is picked). */
export const AUDIT_ZONES = {
  uk: { label: 'UK time', short: 'UK', tz: 'Europe/London' },
  india: { label: 'India time', short: 'India', tz: 'Asia/Kolkata' },
} as const;
export type AuditZone = keyof typeof AUDIT_ZONES;
export const auditZone = (v: string | undefined | null): AuditZone => (v === 'india' ? 'india' : 'uk');
export const auditTime = (iso: string, zone: AuditZone) =>
  `${new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: AUDIT_ZONES[zone].tz })} ${AUDIT_ZONES[zone].short}`;
