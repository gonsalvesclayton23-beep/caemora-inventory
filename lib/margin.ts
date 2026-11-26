// Margins (MRG-01..MRG-08): the calculations. Pure functions, used by the screens, the export and the tests.
// Only inputs are stored (margin_lines); every figure here is worked out from them each time it is shown.

export type Channel = 'AMAZON' | 'EBAY' | 'SHOPIFY' | 'ONBUY' | 'ETSY';
export type OtherPlatform = 'SHOPIFY' | 'ONBUY' | 'ETSY';

/** MRG-09: every platform, in the order shown. */
export const PLATFORMS: readonly { code: Channel; label: string }[] = [
  { code: 'AMAZON', label: 'Amazon' }, { code: 'EBAY', label: 'eBay' }, { code: 'SHOPIFY', label: 'Shopify' },
  { code: 'ONBUY', label: 'OnBuy' }, { code: 'ETSY', label: 'Etsy' },
];
export const platformLabel = (c: string) => PLATFORMS.find((p) => p.code === c)?.label ?? c;

/** Shopify, OnBuy and Etsy fees (settings, admin-editable). */
export interface PlatformFees {
  feePct: number; fixedFee: number; paymentPct: number; paymentFixed: number; feeVatPct: number; shipping: number; misc: number;
}
const NO_FEES: PlatformFees = { feePct: 0, fixedFee: 0, paymentPct: 0, paymentFixed: 0, feeVatPct: 0, shipping: 2.76, misc: 0.05 };
const PLATFORM_FEE_KEYS: Record<keyof PlatformFees, string> = {
  feePct: 'fee_pct', fixedFee: 'fixed_fee', paymentPct: 'payment_pct', paymentFixed: 'payment_fixed', feeVatPct: 'fee_vat_pct', shipping: 'shipping', misc: 'misc',
};
export type Cur = 'INR' | 'GBP' | 'USD' | 'CNY';

export interface MarginSettings {
  feeVatPct: number;          // VAT on Amazon and eBay fees
  fbaSurchargePct: number;    // % of the FBA fee
  dstPct: number;             // Digital Services Tax, % of (referral fee + FBA fee)
  ebayFeePct: number;         // % of the selling price
  ebayFixedFee: number;       // £ per order
  ebayLocalShipping: number;  // default for new eBay lines
  ebayMisc: number;           // default for new eBay lines
  roiTargetPct: number;
  platforms: Record<OtherPlatform, PlatformFees>;
}

export const DEFAULT_MARGIN_SETTINGS: MarginSettings = {
  feeVatPct: 20, fbaSurchargePct: 2, dstPct: 2, ebayFeePct: 12.8, ebayFixedFee: 0.3, ebayLocalShipping: 2.76, ebayMisc: 0.05, roiTargetPct: 25,
  platforms: { SHOPIFY: { ...NO_FEES }, ONBUY: { ...NO_FEES }, ETSY: { ...NO_FEES } },
};

/** settings table key → MarginSettings field */
export const SETTING_KEYS: Record<Exclude<keyof MarginSettings, 'platforms'>, string> = {
  feeVatPct: 'margin_fee_vat_pct',
  fbaSurchargePct: 'margin_fba_surcharge_pct',
  dstPct: 'margin_dst_pct',
  ebayFeePct: 'margin_ebay_fee_pct',
  ebayFixedFee: 'margin_ebay_fixed_fee',
  ebayLocalShipping: 'margin_ebay_local_shipping',
  ebayMisc: 'margin_ebay_misc',
  roiTargetPct: 'margin_roi_target_pct',
};

export function settingsFromRows(rows: { key: string; value: unknown }[]): MarginSettings {
  const map = new Map(rows.map((r) => [r.key, Number(r.value)]));
  const out: MarginSettings = { ...DEFAULT_MARGIN_SETTINGS, platforms: { SHOPIFY: { ...NO_FEES }, ONBUY: { ...NO_FEES }, ETSY: { ...NO_FEES } } };
  for (const [field, key] of Object.entries(SETTING_KEYS) as [Exclude<keyof MarginSettings, 'platforms'>, string][]) {
    const v = map.get(key);
    if (v != null && Number.isFinite(v)) out[field] = v;
  }
  for (const pl of ['SHOPIFY', 'ONBUY', 'ETSY'] as const) {
    for (const [field, k] of Object.entries(PLATFORM_FEE_KEYS) as [keyof PlatformFees, string][]) {
      const v = map.get(`margin_${pl.toLowerCase()}_${k}`);
      if (v != null && Number.isFinite(v)) out.platforms[pl][field] = v;
    }
  }
  return out;
}

export interface MarginInput {
  channel: Channel;
  productCost: number;
  productCostCurrency: Cur;
  courierCost: number;
  courierCurrency: Cur;
  fxRate: number;             // ₹ per £
  sellingPrice: number;       // £
  companyVatPct: number;
  ownTaxPct: number | null;   // null = the company's rate
  // Amazon
  referralPct?: number | null;
  fbaFee?: number | null;
  promoPerUnit?: number | null;
  // eBay
  localShipping?: number | null;
  miscExpense?: number | null;
  adPct?: number | null;
}

export interface MarginResult {
  landed: number;
  referralFee: number; referralFeeVat: number; fbaFee: number; fbaFeeVat: number; fbaSurcharge: number; digitalServicesTax: number; promo: number;
  localShipping: number; miscExpense: number; ebayFees: number; platformFees: number; adFees: number;
  costBeforeTax: number; taxPct: number; tax: number; finalCost: number; profit: number;
  roi: number | null;         // %, null when the landed cost is 0
  belowTarget: boolean;
}

const n = (v: number | null | undefined) => (v == null || !Number.isFinite(Number(v)) ? 0 : Number(v));

/** An amount in £: ₹ is divided by the line's rate, £ is used as it is (MRG-04 AC5). */
export const toGbp = (amount: number, currency: Cur, fxRate: number) =>
  currency === 'INR' ? (fxRate > 0 ? n(amount) / fxRate : 0) : n(amount);

export const effectiveTaxPct = (i: Pick<MarginInput, 'ownTaxPct' | 'companyVatPct'>) => i.ownTaxPct ?? n(i.companyVatPct);

export function computeMargin(i: MarginInput, s: MarginSettings): MarginResult {
  const vat = s.feeVatPct / 100;
  const P = n(i.sellingPrice);
  const landed = toGbp(i.productCost, i.productCostCurrency, i.fxRate) + toGbp(i.courierCost, i.courierCurrency, i.fxRate);
  const taxPct = effectiveTaxPct(i);
  const tax = P * taxPct / 100;
  const r: MarginResult = {
    landed, referralFee: 0, referralFeeVat: 0, fbaFee: 0, fbaFeeVat: 0, fbaSurcharge: 0, digitalServicesTax: 0, promo: 0,
    localShipping: 0, miscExpense: 0, ebayFees: 0, platformFees: 0, adFees: 0, costBeforeTax: 0, taxPct, tax, finalCost: 0, profit: 0, roi: null, belowTarget: false,
  };
  if (i.channel === 'AMAZON') {
    r.referralFee = P * n(i.referralPct) / 100;
    r.referralFeeVat = r.referralFee * vat;
    r.fbaFee = n(i.fbaFee);
    r.fbaFeeVat = r.fbaFee * vat;
    r.fbaSurcharge = r.fbaFee * s.fbaSurchargePct / 100;
    r.digitalServicesTax = (r.referralFee + r.fbaFee) * s.dstPct / 100;
    r.promo = n(i.promoPerUnit);
    r.costBeforeTax = landed + r.referralFee + r.referralFeeVat + r.fbaFee + r.fbaFeeVat + r.fbaSurcharge + r.digitalServicesTax + r.promo;
  } else if (i.channel === 'EBAY') {
    r.localShipping = n(i.localShipping);
    r.miscExpense = n(i.miscExpense);
    r.ebayFees = (P * s.ebayFeePct / 100 + s.ebayFixedFee) * (1 + vat);
    r.adFees = P * n(i.adPct) / 100 * (1 + vat);
    r.costBeforeTax = landed + r.localShipping + r.miscExpense + r.ebayFees + r.adFees;
  } else {
    // MRG-09: Shopify, OnBuy, Etsy: platform fee % + fixed fee + payment processing (% + £), with that platform's VAT on fees
    const f = s.platforms[i.channel];
    const pvat = f.feeVatPct / 100;
    r.localShipping = n(i.localShipping);
    r.miscExpense = n(i.miscExpense);
    r.platformFees = (P * f.feePct / 100 + f.fixedFee + P * f.paymentPct / 100 + f.paymentFixed) * (1 + pvat);
    r.adFees = P * n(i.adPct) / 100 * (1 + pvat);
    r.costBeforeTax = landed + r.localShipping + r.miscExpense + r.platformFees + r.adFees;
  }
  r.finalCost = r.costBeforeTax + tax;
  r.profit = P - r.finalCost;
  r.roi = landed > 0 ? r.profit / landed * 100 : null;
  r.belowTarget = r.roi != null && r.roi < s.roiTargetPct;
  return r;
}

/**
 * MRG-06: the lowest selling price (to the penny, rounded up) that reaches the ROI target.
 * Every cost is either fixed or a share of the price, so price = (fixed + target × landed) ÷ (1 − share).
 * Null when no price can reach it (the shares add up to 100% or more) or there is no landed cost to measure ROI against.
 */
export function lowestPriceForRoi(i: MarginInput, s: MarginSettings, targetPct = s.roiTargetPct): number | null {
  const vat = s.feeVatPct / 100;
  const base = computeMargin({ ...i, sellingPrice: 0 }, s);
  if (!(base.landed > 0)) return null;
  const tax = effectiveTaxPct(i) / 100;
  let share: number;
  if (i.channel === 'AMAZON') {
    const ref = n(i.referralPct) / 100;
    share = ref * (1 + vat) + ref * s.dstPct / 100 + tax;
  } else if (i.channel === 'EBAY') {
    share = (s.ebayFeePct / 100) * (1 + vat) + (n(i.adPct) / 100) * (1 + vat) + tax;
  } else {
    const f = s.platforms[i.channel], pvat = f.feeVatPct / 100;
    share = ((f.feePct + f.paymentPct) / 100) * (1 + pvat) + (n(i.adPct) / 100) * (1 + pvat) + tax;
  }
  if (share >= 1) return null;
  // base.finalCost at price 0 is exactly the fixed part
  const exact = (base.finalCost + targetPct / 100 * base.landed) / (1 - share);
  let p = Math.ceil(exact * 100 - 1e-6) / 100;
  // guard against rounding: step to the first penny that really reaches the target
  for (let k = 0; k < 5 && (computeMargin({ ...i, sellingPrice: p }, s).roi ?? -Infinity) < targetPct; k++) p = Math.round(p * 100 + 1) / 100;
  return p;
}

// ---------------------------------------------------------------- labels

const round2 = (v: number) => Math.round(v * 100) / 100;

/** £ with two decimals; a loss shows as "−£0.40" (MRG-05 AC4). */
export function gbp(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const r = round2(v);
  const abs = Math.abs(r).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${r < 0 ? '−' : ''}£${abs}`;
}

export function pct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const r = round2(v);
  return `${r < 0 ? '−' : ''}${Math.abs(r).toFixed(2)}%`;
}

const rateText = (v: number) => String(Number(v));

export const taxLabel = (i: Pick<MarginInput, 'ownTaxPct' | 'companyVatPct'>) =>
  i.ownTaxPct != null ? `Own tax rate: ${rateText(i.ownTaxPct)}%` : `Company rate: ${rateText(n(i.companyVatPct))}%`;

export function roiStatus(roi: number | null | undefined, targetPct: number): { label: string; tone: 'red' | 'green' | 'grey' } {
  if (roi == null || !Number.isFinite(roi)) return { label: 'No cost entered', tone: 'grey' };
  return roi < targetPct ? { label: 'Below target', tone: 'red' } : { label: 'On target', tone: 'green' };
}

export const longDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

/** MRG-08: where the line's ₹/£ rate came from. */
export function fxLabel(source: string | null | undefined, date: string | null | undefined): string {
  if (source === 'daily') return `Rate from ${longDate(date)}`;
  if (source === 'manual') return `Entered by hand on ${longDate(date)}`;
  if (source === 'monthly') return `Monthly rate, used on ${longDate(date)}`;
  return 'No rate';
}

// ---------------------------------------------------------------- list helpers (MRG-07)

export function filterLines<T extends { channel: Channel; company_code: string }>(lines: T[], f: { channel?: Channel | null; company?: string | null }) {
  return lines.filter((l) => (!f.channel || l.channel === f.channel) && (!f.company || l.company_code === f.company));
}

export function sortLines<T extends Record<string, any>>(lines: T[], key: string, dir: 'asc' | 'desc' = 'asc'): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...lines].sort((a, b) => {
    const x = a[key], y = b[key];
    if (x == null && y == null) return 0;
    if (x == null) return 1;   // blanks last either way
    if (y == null) return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign;
    return String(x).localeCompare(String(y)) * sign;
  });
}

/** MRG-07 AC4: same costs and price, the new company's tax (an own tax rate is not carried over). */
export const copyToCompany = (i: MarginInput, companyVatPct: number): MarginInput => ({ ...i, companyVatPct, ownTaxPct: null });

// ---------------------------------------------------------------- rows from the database

/** A row of v_margin_lines. */
export interface MarginLineRow {
  id: number; channel: Channel; company_code: string; company_name: string; company_vat_pct: number | string;
  product_id: number | null; name: string; asin: string | null; fnsku: string | null; listing_status: string;
  owner: string | null; notes: string | null;
  product_cost: number | string; product_cost_currency: Cur; courier_cost: number | string; courier_currency: Cur;
  referral_pct: number | string | null; fba_fee: number | string | null; promo_per_unit: number | string | null;
  local_shipping: number | string | null; misc_expense: number | string | null; ad_pct: number | string | null;
  selling_price: number | string | null; hidden?: boolean; margin_product_id?: number; tax_override_pct: number | string | null;
  fx_rate: number | string; fx_rate_date: string | null; fx_source: string | null; updated_at?: string;
}

const num = (v: unknown) => (v == null || v === '' ? null : Number(v));

export function inputFromRow(r: MarginLineRow): MarginInput {
  return {
    channel: r.channel, productCost: Number(r.product_cost), productCostCurrency: r.product_cost_currency,
    courierCost: Number(r.courier_cost), courierCurrency: r.courier_currency, fxRate: Number(r.fx_rate),
    sellingPrice: Number(r.selling_price), companyVatPct: Number(r.company_vat_pct), ownTaxPct: num(r.tax_override_pct),
    referralPct: num(r.referral_pct), fbaFee: num(r.fba_fee), promoPerUnit: num(r.promo_per_unit),
    localShipping: num(r.local_shipping), miscExpense: num(r.misc_expense), adPct: num(r.ad_pct),
  };
}

// ---------------------------------------------------------------- export (MRG-07 AC5)

export const EXPORT_COLUMNS = [
  'name', 'company', 'company_name', 'channel', 'asin', 'fnsku', 'listing_status', 'owner', 'notes',
  'product_cost', 'product_cost_currency', 'courier_cost', 'courier_currency', 'fx_rate', 'fx_rate_label',
  'referral_pct', 'fba_fee', 'promo_per_unit', 'local_shipping', 'misc_expense', 'ad_pct', 'selling_price', 'tax_rate',
  'landed_cost', 'referral_fee', 'referral_fee_vat', 'fba_fee_vat', 'fba_surcharge', 'digital_services_tax', 'ebay_fees', 'ad_fees',
  'platform_fees', 'cost_before_tax', 'tax', 'final_cost', 'profit', 'roi_pct', 'status', 'lowest_price_for_target',
] as const;

const d2 = (v: number | null) => (v == null ? '' : round2(v).toFixed(2));

export function exportRow(r: MarginLineRow, s: MarginSettings): Record<(typeof EXPORT_COLUMNS)[number], string | number | null> {
  const i = inputFromRow(r);
  const m = computeMargin(i, s);
  const amazon = r.channel === 'AMAZON';
  const low = lowestPriceForRoi(i, s);
  return {
    name: r.name, company: r.company_code, company_name: r.company_name, channel: platformLabel(r.channel),
    asin: r.asin, fnsku: r.fnsku, listing_status: r.listing_status === 'listed' ? 'Listed' : 'Not listed', owner: r.owner, notes: r.notes,
    product_cost: i.productCost, product_cost_currency: i.productCostCurrency, courier_cost: i.courierCost, courier_currency: i.courierCurrency,
    fx_rate: i.fxRate, fx_rate_label: fxLabel(r.fx_source, r.fx_rate_date),
    referral_pct: amazon ? i.referralPct ?? '' : '', fba_fee: amazon ? i.fbaFee ?? '' : '', promo_per_unit: amazon ? i.promoPerUnit ?? '' : '',
    local_shipping: amazon ? '' : i.localShipping ?? '', misc_expense: amazon ? '' : i.miscExpense ?? '', ad_pct: amazon ? '' : i.adPct ?? '',
    selling_price: d2(i.sellingPrice), tax_rate: taxLabel(i),
    landed_cost: d2(m.landed),
    referral_fee: amazon ? d2(m.referralFee) : '', referral_fee_vat: amazon ? d2(m.referralFeeVat) : '', fba_fee_vat: amazon ? d2(m.fbaFeeVat) : '',
    fba_surcharge: amazon ? d2(m.fbaSurcharge) : '', digital_services_tax: amazon ? d2(m.digitalServicesTax) : '',
    ebay_fees: r.channel === 'EBAY' ? d2(m.ebayFees) : '', ad_fees: amazon ? '' : d2(m.adFees),
    platform_fees: amazon || r.channel === 'EBAY' ? '' : d2(m.platformFees),
    cost_before_tax: d2(m.costBeforeTax), tax: d2(m.tax), final_cost: d2(m.finalCost), profit: d2(m.profit), roi_pct: d2(m.roi),
    status: roiStatus(m.roi, s.roiTargetPct).label,
    lowest_price_for_target: low == null ? 'Target not reachable' : d2(low),
  };
}

// ---------------------------------------------------------------- MRG-09: one product line, every platform

export interface ProductCosts { productCost: number; productCostCurrency: Cur; courierCost: number; courierCurrency: Cur; fxRate: number }

export interface PlatformEntry {
  channel: Channel; companyCode: string; companyName?: string; companyVatPct: number; ownTaxPct: number | null;
  sellingPrice: number | null; hidden?: boolean;
  referralPct?: number | null; fbaFee?: number | null; promoPerUnit?: number | null;
  localShipping?: number | null; miscExpense?: number | null; adPct?: number | null;
}

export interface ComparisonRow {
  channel: Channel; label: string; companyCode: string | null; companyName: string | null;
  state: 'priced' | 'not_priced'; stateLabel: string;
  price: number | null; result: MarginResult | null;
  fees: number | null;           // everything between landed cost and tax, apart from shipping and misc
  shippingMisc: number | null;
  status: { label: string; tone: 'red' | 'green' | 'grey' };
  best: boolean; feesNotSetUp: boolean; lowest: number | null;
}

/** Shopify, OnBuy or Etsy with every fee still at 0. */
export const feesNotSetUp = (channel: Channel, s: MarginSettings) => {
  if (channel === 'AMAZON' || channel === 'EBAY') return false;
  const f = s.platforms[channel];
  return !f.feePct && !f.fixedFee && !f.paymentPct && !f.paymentFixed;
};

export const entryInput = (c: ProductCosts, e: PlatformEntry): MarginInput => ({
  ...c, channel: e.channel, sellingPrice: n(e.sellingPrice), companyVatPct: n(e.companyVatPct), ownTaxPct: e.ownTaxPct,
  referralPct: e.referralPct, fbaFee: e.fbaFee, promoPerUnit: e.promoPerUnit, localShipping: e.localShipping, miscExpense: e.miscExpense, adPct: e.adPct,
});

/** MRG-09 AC1-AC5: one row per platform that is not hidden, worked out from the one set of costs. */
export function compareProduct(c: ProductCosts, entries: PlatformEntry[], s: MarginSettings) {
  const landed = toGbp(c.productCost, c.productCostCurrency, c.fxRate) + toGbp(c.courierCost, c.courierCurrency, c.fxRate);
  const byChannel = new Map(entries.map((e) => [e.channel, e]));
  const hidden = PLATFORMS.filter((p) => byChannel.get(p.code)?.hidden).map((p) => p.code);
  const rows: ComparisonRow[] = PLATFORMS.filter((p) => !byChannel.get(p.code)?.hidden).map((p) => {
    const e = byChannel.get(p.code);
    const priced = e != null && e.sellingPrice != null && Number.isFinite(Number(e.sellingPrice));
    const base = { channel: p.code, label: p.label, companyCode: e?.companyCode ?? null, companyName: e?.companyName ?? null, feesNotSetUp: feesNotSetUp(p.code, s) };
    if (!priced) {
      return { ...base, state: 'not_priced' as const, stateLabel: 'Not priced', price: null, result: null, fees: null, shippingMisc: null,
        status: { label: 'Not priced', tone: 'grey' as const }, best: false, lowest: e ? lowestPriceForRoi(entryInput(c, e), s) : null };
    }
    const i = entryInput(c, e!);
    const m = computeMargin(i, s);
    const shippingMisc = m.localShipping + m.miscExpense;
    return { ...base, state: 'priced' as const, stateLabel: 'Priced', price: Number(e!.sellingPrice), result: m,
      fees: m.costBeforeTax - m.landed - shippingMisc, shippingMisc, status: roiStatus(m.roi, s.roiTargetPct), best: false, lowest: lowestPriceForRoi(i, s) };
  });
  // AC3: the highest ROI is "Best return" (all of them if tied)
  const rois = rows.map((r) => r.result?.roi).filter((x): x is number => x != null);
  if (rois.length) {
    const top = Math.max(...rois);
    for (const r of rows) if (r.result?.roi != null && round2(r.result.roi) === round2(top)) r.best = true;
  }
  return { landed, rows, hidden };
}

/** Name key for spotting the same product typed twice: case, spacing and punctuation ignored. */
export const matchKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** MRG-09 AC6: likely matches between product lines: same ASIN or same name, and no platform in common. */
export function findMatches(lines: { id: number; name: string; asin: string | null; channels: Channel[] }[]) {
  const out: { a: number; b: number; reason: 'asin' | 'name' }[] = [];
  const sorted = [...lines].sort((x, y) => x.id - y.id);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const x = sorted[i], y = sorted[j];
      if (x.channels.some((c) => y.channels.includes(c))) continue;
      const asin = x.asin && y.asin && x.asin.trim().toUpperCase() === y.asin.trim().toUpperCase();
      const name = matchKey(x.name) !== '' && matchKey(x.name) === matchKey(y.name);
      if (asin || name) out.push({ a: x.id, b: y.id, reason: asin ? 'asin' : 'name' });
    }
  }
  return out;
}
