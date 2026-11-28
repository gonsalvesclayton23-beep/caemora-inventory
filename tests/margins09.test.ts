// MRG-09: one line per product, compared across Amazon, eBay, Shopify, OnBuy and Etsy (file of 26 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareProduct, DEFAULT_MARGIN_SETTINGS as S, findMatches, gbp, pct, type MarginSettings, type PlatformEntry, type ProductCosts,
} from '../lib/margin.ts';

// Antifungal Soap - KetoSkin AF 75g, ASIN B0FMHY3KW5
const soap: ProductCosts = { productCost: 90, productCostCurrency: 'INR', courierCost: 70, courierCurrency: 'INR', fxRate: 115 };
const amazon: PlatformEntry = { channel: 'AMAZON', companyCode: 'CMR', companyName: 'Caemora Ltd', companyVatPct: 7.5, ownTaxPct: null, sellingPrice: 8.99, referralPct: 8, fbaFee: 2.42, promoPerUnit: 1.5 };
const ebay: PlatformEntry = { channel: 'EBAY', companyCode: 'YD', companyName: 'Youdent Ltd', companyVatPct: 0, ownTaxPct: null, sellingPrice: 7.69, adPct: 12, localShipping: 2.76, miscExpense: 0.05 };
const row = (c: ReturnType<typeof compareProduct>, ch: string) => c.rows.find((r) => r.channel === ch)!;

test('MRG-09 AC1: landed cost £1.39 is worked out once and every platform uses it', () => {
  const c = compareProduct(soap, [amazon, ebay], S);
  assert.equal(gbp(c.landed), '£1.39');
  for (const ch of ['AMAZON', 'EBAY']) assert.equal(row(c, ch).result!.landed, c.landed);
});

test('MRG-09 AC2: one row per platform: Amazon and eBay figures', () => {
  const c = compareProduct(soap, [amazon, ebay], S);
  const a = row(c, 'AMAZON'), e = row(c, 'EBAY');
  assert.deepEqual([a.label, a.companyName, gbp(a.price), gbp(a.fees), gbp(a.result!.tax), gbp(a.result!.finalCost), gbp(a.result!.profit), pct(a.result!.roi)],
    ['Amazon FBA', 'Caemora Ltd', '£8.99', '£5.38', '£0.67', '£7.44', '£1.55', '111.13%']);
  assert.deepEqual([e.label, e.companyName, gbp(e.price), gbp(e.fees), gbp(e.shippingMisc), gbp(e.result!.tax), gbp(e.result!.finalCost), gbp(e.result!.profit), pct(e.result!.roi)],
    ['eBay', 'Youdent Ltd', '£7.69', '£2.65', '£2.81', '£0.00', '£6.85', '£0.84', '60.39%']);
  assert.deepEqual(c.rows.map((r) => r.channel), ['AMAZON', 'AMAZON_FBM', 'EBAY', 'SHOPIFY', 'ONBUY', 'ETSY']);
});

test('MRG-09 AC3: highest ROI is "Best return"; under 25% is "Below target" in red', () => {
  const c = compareProduct(soap, [amazon, ebay], S);
  assert.equal(row(c, 'AMAZON').best, true);
  assert.equal(row(c, 'EBAY').best, false);
  const low = compareProduct(soap, [amazon, { ...ebay, companyCode: 'CMR', companyVatPct: 7.5 }], S);
  assert.deepEqual(row(low, 'EBAY').status, { label: 'Below target', tone: 'red' });
  assert.deepEqual(row(low, 'AMAZON').status, { label: 'On target', tone: 'green' });
});

test('MRG-09 AC4: eBay moved to Caemora Ltd (7.5%): tax £0.58, profit £0.26, ROI 18.93%; Amazon unchanged', () => {
  const before = compareProduct(soap, [amazon, ebay], S);
  const after = compareProduct(soap, [amazon, { ...ebay, companyCode: 'CMR', companyName: 'Caemora Ltd', companyVatPct: 7.5 }], S);
  const e = row(after, 'EBAY');
  assert.deepEqual([gbp(e.result!.tax), gbp(e.result!.profit), pct(e.result!.roi), e.status.label], ['£0.58', '£0.26', '18.93%', 'Below target']);
  assert.deepEqual(row(after, 'AMAZON'), row(before, 'AMAZON'));
});

test('MRG-09 AC5: a Shopify price of £9.99 adds a row worked out from Shopify\'s settings', () => {
  const shopify: PlatformEntry = { channel: 'SHOPIFY', companyCode: 'CMR', companyName: 'Caemora Ltd', companyVatPct: 7.5, ownTaxPct: null, sellingPrice: 9.99, adPct: 0, localShipping: 2.76, miscExpense: 0.05 };
  const fees: MarginSettings = { ...S, platforms: { ...S.platforms, SHOPIFY: { feePct: 5, fixedFee: 0.3, paymentPct: 2, paymentFixed: 0.2, feeVatPct: 20, shipping: 2.76, misc: 0.05 } } };
  const s = row(compareProduct(soap, [amazon, ebay, shopify], fees), 'SHOPIFY');
  // (9.99 × 5% + £0.30 + 9.99 × 2% + £0.20) × 1.2 = £1.44; tax 7.5% = £0.75; final 1.39 + 1.44 + 2.81 + 0.75
  assert.deepEqual([s.state, gbp(s.fees), gbp(s.result!.tax), gbp(s.result!.finalCost), gbp(s.result!.profit), s.feesNotSetUp], ['priced', '£1.44', '£0.75', '£6.39', '£3.60', false]);
});
test('MRG-09 AC5: fees still at 0 show "Fees not set up"; no price shows "Not priced"; hidden platforms are left out', () => {
  const shopify: PlatformEntry = { channel: 'SHOPIFY', companyCode: 'CMR', companyVatPct: 7.5, ownTaxPct: null, sellingPrice: 9.99, localShipping: 2.76, miscExpense: 0.05 };
  const c = compareProduct(soap, [amazon, ebay, shopify, { channel: 'ETSY', companyCode: 'CMR', companyVatPct: 7.5, ownTaxPct: null, sellingPrice: null, hidden: true }], S);
  assert.equal(row(c, 'SHOPIFY').feesNotSetUp, true);
  assert.equal(row(c, 'SHOPIFY').state, 'priced');
  assert.equal(row(c, 'ONBUY').state, 'not_priced');
  assert.equal(row(c, 'ONBUY').stateLabel, 'Not priced');
  assert.equal(row(c, 'ETSY'), undefined);
  assert.deepEqual(c.hidden, ['ETSY']);
  // a Shopify ROI higher than Amazon's would be "Best return"; a hidden or unpriced platform never is
  assert.ok(c.rows.filter((r) => r.best).every((r) => r.state === 'priced'));
});

test('MRG-09 AC6: likely matches: same ASIN or same name, Amazon line with eBay line', () => {
  const m = findMatches([
    { id: 1, name: 'Antifungal Soap - KetoSkin AF 75g', asin: 'B0FMHY3KW5', channels: ['AMAZON'] },
    { id: 2, name: 'Antifungal soap  KetoSkin AF 75g', asin: null, channels: ['EBAY'] },
    { id: 3, name: 'KetoSkin soap', asin: 'B0FMHY3KW5', channels: ['EBAY'] },
    { id: 4, name: 'Colgate dental floss 50m', asin: null, channels: ['EBAY'] },
    { id: 5, name: 'ENO', asin: 'B0FMHY3KW5', channels: ['AMAZON'] },        // same platform as 1: never paired with it
  ]);
  const pairs = m.map((x) => `${x.a}-${x.b}:${x.reason}`).sort();
  assert.deepEqual(pairs, ['1-2:name', '1-3:asin', '3-5:asin']);
});
