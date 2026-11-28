// MRG-10..MRG-18 (28 Nov 2026), with Clayton's answers: VAT applies to the FBM referral fee; FBA also has a misc field;
// Amazon FBA and FBM sit together under "Amazon"; Shopify/OnBuy/Etsy platform fee settings renamed; Etsy payment fee £0.20.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  breakdown, breakdownText, computeMargin, currencyCheck, DEFAULT_MARGIN_SETTINGS as S, EXPORT_COLUMNS, gbp, pct, PLATFORMS,
  platformGroup, validateCosts, type MarginInput, type MarginSettings,
} from '../lib/margin.ts';
import { NAV } from '../lib/nav.ts';

const soap: MarginInput = {
  channel: 'AMAZON', productCost: 90, productCostCurrency: 'INR', courierCost: 70, courierCurrency: 'INR', fxRate: 115,
  referralPct: 8, fbaFee: 2.42, promoPerUnit: 1.5, sellingPrice: 8.99, companyVatPct: 7.5, ownTaxPct: null,
};
const fbm: MarginInput = { ...soap, channel: 'AMAZON_FBM', fbaFee: null, localShipping: 2.76, miscExpense: 0.05 };
const lines = (i: MarginInput, s: MarginSettings = S) => breakdown(i, s).map(breakdownText);

// MRG-10 ------------------------------------------------------------------------------------------
test('MRG-10 AC1/AC2: Product margins is second in the menu, for everyone; the rest keep their order', () => {
  assert.deepEqual(NAV.map((n) => n.href), ['/', '/margins', '/purchases', '/shipments', '/invoices', '/products', '/flags', '/cases', '/reconciliation', '/landed-cost', '/audit', '/admin']);
  assert.equal(NAV[1].who, 'all');
});

// MRG-11 ------------------------------------------------------------------------------------------
test('MRG-11 AC1: blank product or courier cost is not saved, with a message on the empty field', () => {
  assert.deepEqual(validateCosts({ product_cost: '', courier_cost: '' }),
    { product_cost: 'Enter a product cost', courier_cost: 'Enter a courier cost (enter 0 if there is none)' });
});
test('MRG-11 AC2: a courier cost of 0 is valid', () => {
  assert.deepEqual(validateCosts({ product_cost: '90', courier_cost: '0' }), {});
});
test('MRG-11 AC3/AC4: ₹2.60 looks like £; £90 looks like ₹', () => {
  assert.deepEqual(currencyCheck(2.6, 'INR', S), { message: '₹2.60 looks like a £ amount. Is the currency right?', change: 'Change to £', keep: 'Keep ₹', switchTo: 'GBP' });
  assert.deepEqual(currencyCheck(90, 'GBP', S), { message: '£90 looks like a ₹ amount. Is the currency right?', change: 'Change to ₹', keep: 'Keep £', switchTo: 'INR' });
  assert.equal(currencyCheck(90, 'INR', S), null);
  assert.equal(currencyCheck(2.6, 'GBP', S), null);
});
test('MRG-11 AC5: the limits (under ₹20, over £50) are settings', () => {
  assert.equal(S.suspectInrBelow, 20);
  assert.equal(S.suspectGbpAbove, 50);
  assert.equal(currencyCheck(25, 'INR', { ...S, suspectInrBelow: 30 })?.switchTo, 'GBP');
  assert.equal(currencyCheck(90, 'GBP', { ...S, suspectGbpAbove: 100 }), null);
});

// MRG-12 ------------------------------------------------------------------------------------------
test('MRG-12 AC1: money figures have a currency symbol and 2 decimals', () => {
  assert.equal(gbp(0.7192), '£0.72');
  for (const l of breakdown(soap, S)) assert.match(gbp(l.amount), /^−?£\d[\d,]*\.\d\d$/);
});
test('MRG-12 AC2/AC3: % fees show the % and the £; VAT on its own line', () => {
  const t = lines(soap);
  assert.ok(t.includes('Referral fee 8% = £0.72'), t.join(' | '));
  assert.ok(t.includes('VAT on referral fee 20% = £0.14'));
  assert.ok(lines({ channel: 'EBAY', productCost: 155, productCostCurrency: 'INR', courierCost: 15, courierCurrency: 'INR', fxRate: 120,
    localShipping: 2.76, miscExpense: 0.05, adPct: 12, sellingPrice: 7.69, companyVatPct: 0, ownTaxPct: null }).includes('Ads 12% = £0.92'));
});
test('MRG-12 AC4: a new price updates every % fee', () => {
  assert.ok(lines({ ...soap, sellingPrice: 9.49 }).includes('Referral fee 8% = £0.76'));
});
test('MRG-12: the breakdown adds up to the final cost', () => {
  for (const i of [soap, fbm]) {
    const m = computeMargin(i, S);
    assert.equal(Math.round((m.landed + breakdown(i, S).reduce((t, l) => t + l.amount, 0)) * 1e6), Math.round(m.finalCost * 1e6));
  }
});

// MRG-13 ------------------------------------------------------------------------------------------
test('MRG-13 AC1: advertising is "Ads" everywhere; no "Promo"', () => {
  assert.ok(lines(soap).includes('Ads = £1.50'));
  assert.ok(EXPORT_COLUMNS.includes('ads_per_unit' as any) && EXPORT_COLUMNS.includes('ads_pct' as any));
  assert.ok(!EXPORT_COLUMNS.some((c) => /promo/.test(c)));
  const files = ['app/(app)/margins/ProductForm.tsx', 'lib/margin.ts', 'lib/audit.ts', 'app/(app)/margins/actions.ts', 'app/(app)/margins/settings/page.tsx'];
  for (const f of files) assert.doesNotMatch(readFileSync(f, 'utf8').replace(/promo_per_unit|promoPerUnit/g, ''), /Promo/i, f);
});
test('MRG-13 AC2: lines saved with "Promo/ads" keep their amounts, now shown as Ads', () => {
  assert.equal(gbp(computeMargin(soap, S).ads), '£1.50');
});

// MRG-14 ------------------------------------------------------------------------------------------
test('MRG-14 AC1: FBA unchanged: final cost £7.44, profit £1.55, ROI 111.13%', () => {
  const m = computeMargin(soap, S);
  assert.deepEqual([gbp(m.finalCost), gbp(m.profit), pct(m.roi)], ['£7.44', '£1.55', '111.13%']);
  assert.ok(lines({ ...soap, miscExpense: 0 }).includes('Miscellaneous = £0.00'), 'FBA has a misc field (0 by default)');
});
test('MRG-14 AC2: FBM breakdown (VAT on the referral fee applies), no FBA lines', () => {
  assert.deepEqual(lines(fbm), [
    'Referral fee 8% = £0.72', 'VAT on referral fee 20% = £0.14', 'Digital Services Tax 2% = £0.01', 'Local courier = £2.76',
    'Miscellaneous = £0.05', 'Ads = £1.50', 'Tax 7.5% = £0.67',
  ]);
});
test('MRG-14 AC3: FBM final cost £7.25, profit £1.74, ROI 124.85% (with VAT on the referral fee)', () => {
  const m = computeMargin(fbm, S);
  assert.deepEqual([gbp(m.finalCost), gbp(m.profit), pct(m.roi)], ['£7.25', '£1.74', '124.85%']);
});
test('MRG-14 AC4: FBA and FBM are two Amazon rows, together under "Amazon"', () => {
  assert.deepEqual(PLATFORMS.map((p) => p.label), ['Amazon FBA', 'Amazon FBM', 'eBay', 'Shopify', 'OnBuy', 'Etsy']);
  assert.equal(platformGroup('AMAZON'), 'Amazon');
  assert.equal(platformGroup('AMAZON_FBM'), 'Amazon');
});

// MRG-15 ------------------------------------------------------------------------------------------
const ebay: MarginInput = { channel: 'EBAY', productCost: 155, productCostCurrency: 'INR', courierCost: 15, courierCurrency: 'INR', fxRate: 120,
  localShipping: 2.76, miscExpense: 0.05, adPct: 12, sellingPrice: 7.69, companyVatPct: 0, ownTaxPct: null, categoryPct: 3 };
test('MRG-15 AC1/AC2/AC3: selling fee, category fee, and one VAT line on all eBay fees', () => {
  const t = lines(ebay);
  assert.ok(t.includes('Selling fee 12.8% = £0.98'), t.join(' | '));
  assert.ok(t.includes('Category fee 3% = £0.23'));
  assert.ok(t.includes('Fixed fee = £0.30'));
  assert.ok(t.includes('VAT on eBay fees 20% = £0.30'));        // (0.98 + 0.23 + 0.30) × 20%
  assert.ok(t.includes('VAT on Ads 20% = £0.18'));
});
test('MRG-15 AC4: no category fee shows "0% = £0.00", and the figures match today\'s', () => {
  const none = { ...ebay, categoryPct: null };
  assert.ok(lines(none).includes('Category fee 0% = £0.00'));
  assert.equal(gbp(computeMargin({ ...none, productCost: 155, courierCost: 15 }, S).finalCost), '£6.88');
});

// MRG-16 / MRG-17 / MRG-18 -----------------------------------------------------------------------------
const other = (channel: 'SHOPIFY' | 'ONBUY' | 'ETSY', fees: Partial<MarginSettings['platforms']['SHOPIFY']>): [MarginInput, MarginSettings] => [
  { channel, productCost: 90, productCostCurrency: 'INR', courierCost: 70, courierCurrency: 'INR', fxRate: 115, sellingPrice: 9.99,
    companyVatPct: 7.5, ownTaxPct: null, localShipping: 2.76, miscExpense: 0.05 },
  { ...S, platforms: { ...S.platforms, [channel]: { ...S.platforms[channel], ...fees } } },
];
test('MRG-16 AC1/AC2: Shopify selling fee 2% = £0.20, beside the payment processing fee; the setting drives every row', () => {
  const [i, s] = other('SHOPIFY', { feePct: 2, paymentPct: 1.5, paymentFixed: 0.2 });
  const t = lines(i, s);
  assert.ok(t.includes('Selling fee 2% = £0.20'), t.join(' | '));
  assert.ok(t.some((x) => x.startsWith('Payment processing fee')));
  assert.ok(lines(i, { ...s, platforms: { ...s.platforms, SHOPIFY: { ...s.platforms.SHOPIFY, feePct: 3 } } }).includes('Selling fee 3% = £0.30'));
});
test('MRG-17 AC1/AC2: OnBuy sales fee 9% = £0.90; the setting drives every row', () => {
  const [i, s] = other('ONBUY', { feePct: 9 });
  assert.ok(lines(i, s).includes('Sales fee 9% = £0.90'));
  assert.ok(lines(i, { ...s, platforms: { ...s.platforms, ONBUY: { ...s.platforms.ONBUY, feePct: 10 } } }).includes('Sales fee 10% = £1.00'));
});
test('MRG-18 AC1/AC2/AC3: Etsy transaction fee 6.5% = £0.65 and payment fee £0.20 (the default); both are settings', () => {
  assert.equal(S.platforms.ETSY.paymentFixed, 0.2);
  const [i, s] = other('ETSY', { feePct: 6.5 });
  const t = lines(i, s);
  assert.ok(t.includes('Transaction fee 6.5% = £0.65'), t.join(' | '));
  assert.ok(t.includes('Payment fee = £0.20'));
  assert.ok(lines(i, { ...s, platforms: { ...s.platforms, ETSY: { ...s.platforms.ETSY, paymentFixed: 0.25 } } }).includes('Payment fee = £0.25'));
});

test('MRG-12 AC1: column headings over figures are right-aligned too, so each figure sits under its own heading', () => {
  const css = readFileSync('app/globals.css', 'utf8');
  assert.match(css, /\.table th\.num\s*\{[^}]*text-right/);
});
