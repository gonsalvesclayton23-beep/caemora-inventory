// MRG-22 (28 Nov 2026): the margin line as a calculator: a display, keys, quick price buttons and a receipt. Figures unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { displayState, nudgePrice, receiptLines, roundTo99 } from '../lib/calculator.ts';
import { compareProduct, DEFAULT_MARGIN_SETTINGS as S, type PlatformEntry, type ProductCosts } from '../lib/margin.ts';

const soap: ProductCosts = { productCost: 90, productCostCurrency: 'INR', courierCost: 70, courierCurrency: 'INR', fxRate: 115 };
const fba: PlatformEntry = { channel: 'AMAZON', companyCode: 'CMR', companyName: 'Caemora Ltd', companyVatPct: 7.5, ownTaxPct: null, sellingPrice: 8.99, referralPct: 8, fbaFee: 2.42, promoPerUnit: 1.5 };
const form = readFileSync('app/(app)/margins/ProductForm.tsx', 'utf8');

test('MRG-22 AC1: the display shows profit per unit, ROI and the status', () => {
  const c = compareProduct(soap, [fba], S);
  assert.deepEqual(displayState(c.rows[0], c.landed), { profit: '£1.55', roi: 'ROI 111.13%', landed: '£1.39', final: '£7.44', status: 'On target · Best return', tone: 'green' });
  const low = compareProduct(soap, [{ ...fba, sellingPrice: 7.6 }], { ...S, roiTargetPct: 30 });
  assert.equal(displayState(low.rows[0], low.landed).tone, 'red');
  assert.match(displayState(low.rows[0], low.landed).status, /^Below target/);
  const none = compareProduct(soap, [], S);
  assert.deepEqual(displayState(none.rows[0], none.landed), { profit: '—', roi: 'Enter a selling price', landed: '£1.39', final: '—', status: 'Not priced', tone: 'grey' });
});

test('MRG-22 AC2: −10p, +10p and Round .99 change the price; Min sets the lowest price for the ROI target', () => {
  assert.equal(nudgePrice('8.99', 0.1), '9.09');
  assert.equal(nudgePrice('8.99', -0.1), '8.89');
  assert.equal(nudgePrice('0.05', -0.1), '0.00');
  assert.equal(nudgePrice('', 0.1), '0.10');
  assert.equal(roundTo99('8.42'), '8.99');
  assert.equal(roundTo99('9.00'), '9.99');
  assert.equal(roundTo99('8.99'), '8.99');
  assert.match(form, /Min \{gbp\(/);
});

test('MRG-22 AC3: the receipt lists every cost and adds up to the final cost, then profit and ROI', () => {
  const lines = receiptLines(soap, fba, S);
  assert.deepEqual(lines.slice(0, 2).map((l) => l.label), ['Landed cost', 'Referral fee']);
  assert.deepEqual(lines.slice(-4).map((l) => [l.label, l.text]), [['Final cost', '£7.44'], ['Selling price', '£8.99'], ['PROFIT', '£1.55'], ['ROI', '111.13%']]);
  const costs = lines.filter((l) => l.kind === 'cost' || l.kind === 'vat').reduce((t, l) => t + l.amount!, 0);
  assert.equal(Math.round(costs * 100), Math.round(7.4438 * 100));
});

test('MRG-23 AC1: one calculator per platform, all on one screen (no tabs); hidden platforms left out', () => {
  assert.doesNotMatch(form, /role="tablist"/);
  assert.match(form, /visible\.map\(\(x\) => renderCalc\(x\)\)/);
  assert.match(form, /!v\.platforms\[code\]\.hidden/);
});
test('MRG-23 AC2: the calculators are compact, several to a row', () => {
  const css = readFileSync('app/globals.css', 'utf8');
  const big = Number(css.match(/\.calc-lcd \.big \{ font-size: ([\d.]+)rem/)![1]);
  assert.ok(big <= 1.75, `display digits ${big}rem`);
  assert.match(form, /grid gap-4 md:grid-cols-2 xl:grid-cols-3/);
});
test('MRG-23 AC3: each calculator has its own receipt, opened on request; read-only for anyone who is not an admin', () => {
  assert.match(form, /<details className="calc-receipt/);
  assert.match(form, /calc-key[\s\S]*disabled=\{!canEdit\}/);
  assert.match(form, /\{canEdit && \(\s*<div className="calc-ops/);
});
