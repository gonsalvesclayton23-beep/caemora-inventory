// LOS-01..LOS-04 (28 Nov 2026): record losses (lost shipments, damaged returns, refunds without the item back, expired goods)
// and account for them each month.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOSS_TYPES, LOSS_EXPORT_COLUMNS, lossValue, monthlyLossReport } from '../lib/losses.ts';
import { NAV } from '../lib/nav.ts';

test('LOS-01 AC1: a Losses tab for everyone, with the four types of loss', () => {
  assert.deepEqual(NAV.find((n) => n.href === '/losses'), { href: '/losses', label: 'Losses', who: 'all' });
  assert.deepEqual(Object.entries(LOSS_TYPES), [
    ['lost_in_transit', 'Shipment lost in transit'], ['damaged_return', 'Return came back damaged'],
    ['refunded_no_return', 'Delivered, but the platform refunded the buyer'], ['expired', 'Goods expired'],
  ]);
});

test('LOS-02 AC1: net loss = goods at landed cost + refund to the buyer − recovered', () => {
  assert.deepEqual(lossValue({ qty: 3, unitCostGbp: 1.39, refundGbp: 8.99, recoveredGbp: 2 }), { goods: 4.17, net: 11.16 });
  assert.deepEqual(lossValue({ qty: 2, unitCostGbp: 1.3913, refundGbp: null, recoveredGbp: null }), { goods: 2.78, net: 2.78 });
});

test('LOS-03 AC1: the monthly report totals each month by type, company and platform', () => {
  const rows = [
    { month: '2026-11-01', type: 'lost_in_transit', company_code: 'CMR', platform: 'AMAZON', qty: 10, goods_gbp: 13.9, refund_gbp: 0, recovered_gbp: 5, net_loss_gbp: 8.9 },
    { month: '2026-11-01', type: 'expired', company_code: 'YD', platform: null, qty: 4, goods_gbp: 6, refund_gbp: 0, recovered_gbp: 0, net_loss_gbp: 6 },
    { month: '2026-10-01', type: 'expired', company_code: 'YD', platform: 'EBAY', qty: 1, goods_gbp: 1.5, refund_gbp: 7.69, recovered_gbp: 0, net_loss_gbp: 9.19 },
  ];
  const r = monthlyLossReport(rows);
  assert.deepEqual(r.map((m) => [m.month, m.entries, m.units, m.net]), [['2026-11-01', 2, 14, 14.9], ['2026-10-01', 1, 1, 9.19]]);
  assert.deepEqual(r[0].byType, { lost_in_transit: 8.9, expired: 6 });
  assert.deepEqual(r[0].byCompany, { CMR: 8.9, YD: 6 });
  assert.deepEqual(r[0].byPlatform, { AMAZON: 8.9, none: 6 });
  assert.deepEqual(LOSS_EXPORT_COLUMNS.slice(0, 6), ['date', 'month', 'type', 'company', 'platform', 'product']);
  assert.ok(LOSS_EXPORT_COLUMNS.includes('net_loss_gbp'));
});

test('LOS-04 AC1: a lost box offers "Record as loss", which fills in its contents', () => {
  const page = readFileSync('app/(app)/shipments/[id]/page.tsx', 'utf8');
  assert.match(page, /status === 'lost'[\s\S]*Record as loss/);
  assert.match(readFileSync('app/(app)/losses/new/page.tsx', 'utf8'), /loss_lines_for_shipment/);
});
