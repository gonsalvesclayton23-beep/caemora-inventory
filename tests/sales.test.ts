// DSH-04 (27 Nov 2026): the dashboard shows each company's sales for the last 12 months, typed in by an admin for now.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { last12Months, SALES_COMPANIES, salesTiles } from '../lib/sales.ts';

const dashboard = readFileSync('app/(app)/page.tsx', 'utf8');

test('DSH-04 AC1: "Balance owed to suppliers" and "Open flags by type" are gone from the dashboard', () => {
  assert.doesNotMatch(dashboard, /Balance owed to suppliers/);
  assert.doesNotMatch(dashboard, /Open flags by type/);
  assert.match(dashboard, /Sales, last 12 months/);
});

const companies = [
  { code: 'CMR', name: 'Caemora Ltd' }, { code: 'ARC', name: 'ARC UK G Ltd' }, { code: 'YD', name: 'Youdent Ltd' },
  { code: 'GOE', name: 'Goenche Ltd' }, { code: 'GOA', name: 'Goasales' },
];

test('DSH-04 AC2: one tile per company (Caemora Ltd, ARC UK G Ltd, Youdent Ltd, Goenche Ltd), with its 12-month total', () => {
  assert.deepEqual(SALES_COMPANIES, ['CMR', 'ARC', 'YD', 'GOE']);
  const t = salesTiles([
    { company_code: 'CMR', month: '2026-11-01', amount_gbp: 12450 }, { company_code: 'CMR', month: '2026-10-01', amount_gbp: 10000.5 },
    { company_code: 'GOE', month: '2026-06-01', amount_gbp: 300 }, { company_code: 'GOA', month: '2026-06-01', amount_gbp: 999 },
  ], companies, '2026-11-27');
  assert.deepEqual(t.map((x) => [x.name, x.total]), [['Caemora Ltd', 22450.5], ['ARC UK G Ltd', 0], ['Youdent Ltd', 0], ['Goenche Ltd', 300]]);
});

test('DSH-04 AC3: the 12 months are this month and the 11 before; older months are not counted; a missing month shows as not entered', () => {
  assert.deepEqual(last12Months('2026-11-27'), ['2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01',
    '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']);
  const [cmr] = salesTiles([{ company_code: 'CMR', month: '2025-11-01', amount_gbp: 5000 }, { company_code: 'CMR', month: '2025-12-01', amount_gbp: 100 }], companies, '2026-11-27');
  assert.equal(cmr.total, 100);
  assert.equal(cmr.months.length, 12);
  assert.deepEqual(cmr.months[0], { month: '2025-12-01', amount: 100 });
  assert.deepEqual(cmr.months[11], { month: '2026-11-01', amount: null });
  assert.equal(cmr.missing, 11);
});

test('DSH-04 AC5: the sales tiles sit at the top, straight after the exchange rate', () => {
  const fx = dashboard.indexOf('<FxCard'), sales = dashboard.indexOf('Sales, last 12 months');
  const between = dashboard.slice(fx, sales);
  assert.ok(fx > 0 && sales > fx, 'sales come after the exchange rate');
  assert.equal(between.split('<section').length - 1, 1, 'only the sales section itself');
  assert.doesNotMatch(between, /<OriginCharts|Purchases this month/, 'nothing else in between');
});
