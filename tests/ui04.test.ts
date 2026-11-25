// UI-04 (decision B, 25 Nov 2026): daily £→₹ rate from the European Central Bank. App-side logic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareWithWise, dailyRates, last30Days, latestRate, rateLine } from '../lib/fx.ts';

const xml = readFileSync(join(import.meta.dirname, 'fixtures', 'ecb-sample.xml'), 'utf8');
const rates = dailyRates(xml);

test('UI-04: ECB euro rates are turned into ₹ per £ (INR per EUR ÷ GBP per EUR)', () => {
  assert.equal(rates.length, 5);
  assert.deepEqual(rates[0], { date: '2026-11-24', inrPerGbp: 124.1093, eurInr: 104.5, eurGbp: 0.842 });
});

test('UI-04 AC1: today\'s rate shows as "£1 = ₹X" with the source and when it was last updated', () => {
  const r = latestRate(rates, '2026-11-24')!;
  assert.equal(rateLine(r), '£1 = ₹124.11');
  assert.equal(r.source, 'European Central Bank');
  assert.equal(r.label, 'Today');
});

test('UI-04 AC2: next to the Wise rate (₹123.96), with the difference in ₹ and %', () => {
  const c = compareWithWise(124.1093, 123.96);
  assert.equal(c.text, '₹0.15 (0.12%) above the Wise rate');
  assert.equal(compareWithWise(123.5, 123.96).text, '₹0.46 (0.37%) below the Wise rate');
});

test('UI-04 AC3: on a weekend the last published rate shows, labelled with its date', () => {
  // Sunday 22 Nov 2026: the ECB last published on Friday 20 Nov
  const r = latestRate(rates, '2026-11-22')!;
  assert.equal(r.date, '2026-11-20');
  assert.equal(r.label, 'Rate from 20 Nov 2026');
});

test('UI-04 AC4: the chart has the last 30 days of daily rates, oldest first', () => {
  const pts = last30Days(rates, '2026-11-24');
  assert.deepEqual(pts.map((p) => p.date), ['2026-10-20', '2026-11-20', '2026-11-23', '2026-11-24'].filter((d) => d >= '2026-10-26'));
  assert.ok(pts.every((p, i) => i === 0 || p.date > pts[i - 1].date));
});
