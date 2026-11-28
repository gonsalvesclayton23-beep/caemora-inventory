// DSH-06 (28 Nov 2026): units ordered per month, and price and courier per unit, shown separately for India (₹) and China (£).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORIGINS, originSeries, perUnit, monthSummary } from '../lib/origin.ts';

const dashboard = readFileSync('app/(app)/page.tsx', 'utf8');

test('DSH-06 AC1: two diagrams, India in ₹ and China in £', () => {
  assert.deepEqual(ORIGINS.map((o) => [o.code, o.label, o.currency]), [['IN', 'India', 'INR'], ['CN', 'China', 'GBP']]);
  assert.match(dashboard, /<OriginCharts/);
});

test('DSH-06 AC2: 1,000 units, ₹1,80,000 goods and ₹50,000 courier → ₹180 price, ₹50 courier, ₹230 per unit', () => {
  assert.deepEqual(perUnit({ units: 1000, goods: 180000, courier: 50000 }), { price: 180, courier: 50, total: 230 });
  assert.deepEqual(perUnit({ units: 0, goods: 0, courier: 0 }), { price: null, courier: null, total: null });
});

test('DSH-06 AC3: both diagrams use the same 12 months, so they line up; a month with no orders is 0 units', () => {
  const rows = [
    { month: '2026-10-01', origin: 'IN', units: 9412, goods: 1553000, courier: 451800 },
    { month: '2026-11-01', origin: 'CN', units: 300, goods: 495, courier: 120 },
  ];
  const india = originSeries(rows, 'IN', '2026-11-28'), china = originSeries(rows, 'CN', '2026-11-28');
  assert.equal(india.length, 12);
  assert.deepEqual(india.map((m) => m.month), china.map((m) => m.month));
  assert.deepEqual(india.at(-2), { month: '2026-10-01', units: 9412, goods: 1553000, courier: 451800, price: 165, courierPerUnit: 48, total: 213 });
  assert.deepEqual(india.at(-1), { month: '2026-11-01', units: 0, goods: 0, courier: 0, price: null, courierPerUnit: null, total: null });
});

test('DSH-06 AC4: hovering a month shows units, price, courier and total per unit', () => {
  const [oct] = originSeries([{ month: '2026-10-01', origin: 'IN', units: 9412, goods: 1553000, courier: 451800 }], 'IN', '2026-10-15').slice(-1);
  assert.equal(monthSummary(oct, 'INR'), 'Oct 2026: 9,412 units · price ₹165/unit · courier ₹48/unit · total ₹213/unit');
  const [nov] = originSeries([{ month: '2026-11-01', origin: 'CN', units: 300, goods: 495, courier: 120 }], 'CN', '2026-11-28').slice(-1);
  assert.equal(monthSummary(nov, 'GBP'), 'Nov 2026: 300 units · price £1.65/unit · courier £0.40/unit · total £2.05/unit');
});
