// Margins (MRG-01..MRG-08), the calculations. Worked examples from the margin calculator file, 26 Nov 2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMargin, copyToCompany, DEFAULT_MARGIN_SETTINGS as S, EXPORT_COLUMNS, filterLines, fxLabel, gbp, lowestPriceForRoi,
  pct, roiStatus, sortLines, taxLabel, type MarginInput,
} from '../lib/margin.ts';

const r2 = (n: number) => Math.round(n * 100) / 100;

// Antifungal Soap - KetoSkin AF 75g, ASIN B0FMHY3KW5, FNSKU X002DRQU19, CMR (7.5%)
const soap: MarginInput = {
  channel: 'AMAZON', productCost: 90, productCostCurrency: 'INR', courierCost: 70, courierCurrency: 'INR', fxRate: 115,
  referralPct: 8, fbaFee: 2.42, promoPerUnit: 1.5, sellingPrice: 8.99, companyVatPct: 7.5, ownTaxPct: null,
};
// Colgate dental floss 50m, Youdent Ltd (0%)
const floss: MarginInput = {
  channel: 'EBAY', productCost: 155, productCostCurrency: 'INR', courierCost: 15, courierCurrency: 'INR', fxRate: 120,
  localShipping: 2.76, miscExpense: 0.05, adPct: 12, sellingPrice: 7.69, companyVatPct: 0, ownTaxPct: null,
};

// MRG-01 -------------------------------------------------------------------------------
test('MRG-01 AC1: CMR at 7.5%, £8.99 → tax £0.67', () => {
  assert.equal(gbp(computeMargin(soap, S).tax), '£0.67');
});
test('MRG-01 AC2: Youdent Ltd at 0%, £7.69 → tax £0.00', () => {
  assert.equal(gbp(computeMargin(floss, S).tax), '£0.00');
});
test('MRG-01 AC3: a CMR product with its own 0% → tax £0.00, "Own tax rate: 0%"', () => {
  const own = { ...soap, ownTaxPct: 0 };
  assert.equal(gbp(computeMargin(own, S).tax), '£0.00');
  assert.equal(taxLabel(own), 'Own tax rate: 0%');
});
test('MRG-01 AC4: "Use company rate" goes back to 7.5%', () => {
  const back = { ...soap, ownTaxPct: null };
  assert.equal(taxLabel(back), 'Company rate: 7.5%');
  assert.equal(gbp(computeMargin(back, S).tax), '£0.67');
});
test('MRG-01 AC5: company rate 7.5% → 8% recalculates lines without their own rate', () => {
  assert.equal(gbp(computeMargin({ ...soap, companyVatPct: 8 }, S).tax), '£0.72');
  assert.equal(gbp(computeMargin({ ...soap, companyVatPct: 8, ownTaxPct: 0 }, S).tax), '£0.00');
});

// MRG-02 -------------------------------------------------------------------------------
test('MRG-02 AC1: FBA surcharge 2% → 2.5% updates surcharge, final cost, profit and ROI', () => {
  const a = computeMargin(soap, S), b = computeMargin(soap, { ...S, fbaSurchargePct: 2.5 });
  assert.equal(r2(b.fbaSurcharge), 0.06);
  assert.ok(b.finalCost > a.finalCost && b.profit < a.profit && b.roi! < a.roi!);
});
test('MRG-02 AC2: ROI target 30% flags every line below 30%', () => {
  assert.equal(roiStatus(28, 30).label, 'Below target');
  assert.equal(roiStatus(31, 30).label, 'On target');
  assert.equal(computeMargin({ ...soap, sellingPrice: 7.55 }, { ...S, roiTargetPct: 30 }).belowTarget, true);
});

// MRG-03 -------------------------------------------------------------------------------
test('MRG-03 AC1: landed cost £1.39', () => {
  assert.equal(gbp(computeMargin(soap, S).landed), '£1.39');
});
test('MRG-03 AC2: referral £0.72, referral VAT £0.14, FBA VAT £0.48, surcharge £0.05, DST £0.06', () => {
  const m = computeMargin(soap, S);
  assert.deepEqual([m.referralFee, m.referralFeeVat, m.fbaFeeVat, m.fbaSurcharge, m.digitalServicesTax].map(gbp),
    ['£0.72', '£0.14', '£0.48', '£0.05', '£0.06']);
});
test('MRG-03 AC3: cost before tax £6.77, tax £0.67, final cost £7.44', () => {
  const m = computeMargin(soap, S);
  assert.deepEqual([m.costBeforeTax, m.tax, m.finalCost].map(gbp), ['£6.77', '£0.67', '£7.44']);
});
test('MRG-03 AC4: profit £1.55, ROI 111.13%', () => {
  const m = computeMargin(soap, S);
  assert.equal(gbp(m.profit), '£1.55');
  assert.equal(pct(m.roi), '111.13%');
});
test('MRG-03 AC5: 2-pack → final cost £11.72, profit £2.27, ROI 82.82%', () => {
  const m = computeMargin({ ...soap, productCost: 180, courierCost: 135, referralPct: 15, fbaFee: 2.72, promoPerUnit: 2, sellingPrice: 13.99 }, S);
  assert.deepEqual([gbp(m.finalCost), gbp(m.profit), pct(m.roi)], ['£11.72', '£2.27', '82.82%']);
});

// MRG-04 -------------------------------------------------------------------------------
test('MRG-04 AC1: landed cost £1.42', () => assert.equal(gbp(computeMargin(floss, S).landed), '£1.42'));
test('MRG-04 AC2: ad fees £1.11', () => assert.equal(gbp(computeMargin(floss, S).adFees), '£1.11'));
test('MRG-04 AC3: eBay fees (12.8% + £0.30, incl. VAT) £1.54', () => assert.equal(gbp(computeMargin(floss, S).ebayFees), '£1.54'));
test('MRG-04 AC4: final cost £6.88, profit £0.81, ROI 57.51%', () => {
  const m = computeMargin(floss, S);
  assert.deepEqual([gbp(m.finalCost), gbp(m.profit), pct(m.roi)], ['£6.88', '£0.81', '57.51%']);
});
test('MRG-04 AC5: courier entered as £0.80 is added in £ without conversion', () => {
  const m = computeMargin({ ...floss, courierCost: 0.8, courierCurrency: 'GBP' }, S);
  assert.equal(r2(m.landed), r2(155 / 120 + 0.8));
});

// MRG-05 -------------------------------------------------------------------------------
test('MRG-05 AC1: trying £9.49 updates referral fee, tax, final cost, profit and ROI', () => {
  const a = computeMargin(soap, S), b = computeMargin({ ...soap, sellingPrice: 9.49 }, S);
  for (const k of ['referralFee', 'tax', 'finalCost', 'profit', 'roi'] as const) assert.notEqual(a[k], b[k], k);
  assert.equal(gbp(b.referralFee), '£0.76');
});
test('MRG-05 AC4: a loss shows as a negative amount, e.g. "−£0.40"', () => {
  assert.equal(gbp(-0.4), '−£0.40');
  assert.ok(computeMargin({ ...soap, sellingPrice: 6.5 }, S).profit < 0);
});

// MRG-06 -------------------------------------------------------------------------------
test('MRG-06 AC1: lowest price for 25% ROI is £7.55', () => {
  const p = lowestPriceForRoi(soap, S)!;
  assert.equal(gbp(p), '£7.55');
  assert.ok(computeMargin({ ...soap, sellingPrice: p }, S).roi! >= 25);
  assert.ok(computeMargin({ ...soap, sellingPrice: p - 0.01 }, S).roi! < 25);
});
test('MRG-06 AC3: "Target not reachable" when no price can reach it', () => {
  assert.equal(lowestPriceForRoi({ ...soap, referralPct: 95 }, S), null);
  assert.equal(lowestPriceForRoi({ ...soap, productCost: 0, courierCost: 0 }, S), null);
});

// MRG-07 -------------------------------------------------------------------------------
const lines = [
  { id: 1, channel: 'AMAZON' as const, company_code: 'GOE', name: 'Colgate Slim Soft Charcoal', roi: 30.34, profit: 1 },
  { id: 2, channel: 'AMAZON' as const, company_code: 'CMR', name: 'Antifungal Soap 75g', roi: 111.13, profit: 1.55 },
  { id: 3, channel: 'EBAY' as const, company_code: 'GOE', name: 'Floss', roi: 22.33, profit: 0.3 },
  { id: 4, channel: 'AMAZON' as const, company_code: 'GOE', name: 'ENO', roi: 22.33, profit: 0.2 },
];
test('MRG-07 AC1: Amazon tab + Goenche Ltd shows only Goenche Ltd Amazon lines', () => {
  assert.deepEqual(filterLines(lines, { channel: 'AMAZON', company: 'GOE' }).map((l) => l.id), [1, 4]);
});
test('MRG-07 AC2: 22.33% is "Below target" in red, 30.34% is green (target 25%)', () => {
  assert.deepEqual(roiStatus(22.33, 25), { label: 'Below target', tone: 'red' });
  assert.deepEqual(roiStatus(30.34, 25), { label: 'On target', tone: 'green' });
});
test('MRG-07 AC3: sort by ROI, lowest first', () => {
  assert.deepEqual(sortLines(lines, 'roi', 'asc').map((l) => l.roi), [22.33, 22.33, 30.34, 111.13]);
});
test('MRG-07 AC4: copy to another company keeps the costs and recalculates tax at that company\'s rate', () => {
  const goe = { ...soap, companyVatPct: 0 };
  const copy = copyToCompany(goe, 7.5);
  assert.equal(copy.productCost, goe.productCost);
  assert.equal(copy.ownTaxPct, null);
  assert.equal(gbp(computeMargin(copy, S).tax), '£0.67');
});
test('MRG-07 AC5: export has every input and every worked-out column', () => {
  for (const c of ['name', 'company', 'channel', 'product_cost', 'product_cost_currency', 'courier_cost', 'courier_currency', 'fx_rate',
    'fx_rate_label', 'referral_pct', 'fba_fee', 'ads_per_unit', 'local_shipping', 'misc_expense', 'ads_pct', 'selling_price', 'tax_rate',
    'landed_cost', 'referral_fee', 'referral_fee_vat', 'fba_fee_vat', 'fba_surcharge', 'digital_services_tax', 'ebay_fees', 'ad_fees',
    'cost_before_tax', 'tax', 'final_cost', 'profit', 'roi_pct', 'status', 'lowest_price_for_target', 'owner', 'notes', 'asin', 'fnsku', 'listing_status']) {
    assert.ok((EXPORT_COLUMNS as readonly string[]).includes(c), c);
  }
});

// MRG-08 -------------------------------------------------------------------------------
test('MRG-08 AC1/AC5: the day\'s rate is labelled with its date', () => {
  assert.equal(fxLabel('daily', '2026-11-26'), 'Rate from 26 Nov 2026');
});
test('MRG-08 AC2: a rate typed by hand is labelled as such', () => {
  assert.equal(fxLabel('manual', '2026-11-26'), 'Entered by hand on 26 Nov 2026');
});
