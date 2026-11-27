// PUR-07 (27 Nov 2026): on the Purchases tab, lines are grouped under their shipment, with the products listed underneath.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupByShipment, type GroupLine, type GroupShipment } from '../lib/purchase-groups.ts';

const ship = (id: number, o: Partial<GroupShipment> = {}): GroupShipment => ({
  id, box_no: null, amazon_shipment_id: null, tracking_no: null, company_code: 'CMR', company_name: 'Caemora Ltd', status: 'in_transit',
  destination: 'amazon', created_on: '2026-11-10', ...o,
});
const line = (id: number, o: Partial<GroupLine> = {}): GroupLine => ({
  id, period_month: '2026-11-01', product_name: `Product ${id}`, qty: 10, currency: 'INR', line_total: 1000, received_qty: 10, shipment_id: null, ...o,
});

const shipments = [
  ship(1, { amazon_shipment_id: 'FBA15MY7TJ8Q', status: 'lost', created_on: '2026-11-05' }),
  ship(2, { box_no: '7', company_code: 'YD', company_name: 'Youdent Ltd', destination: 'home', status: 'received', created_on: '2026-11-20' }),
];
const lines = [
  line(10, { product_name: 'KetoSkin AF Bar Soap-75g', qty: 26, line_total: 4160, received_qty: 26, shipment_id: 1 }),
  line(11, { product_name: 'ENO fruit salt 20s', qty: 50, line_total: 13500, received_qty: 50, shipment_id: 1 }),
  line(12, { product_name: 'Mouse Traps Design 3', qty: 6, currency: 'GBP', line_total: 17.34, received_qty: 6 }),
  line(13, { product_name: 'Colgate floss', qty: 50, line_total: 5000, received_qty: 48, shipment_id: null }),       // split over boxes 1 and 2
  line(14, { product_name: 'Floss box only', qty: 40, line_total: 400, currency: 'GBP', received_qty: 38, shipment_id: 2 }),
];
const items = [
  { shipment_id: 1, purchase_line_id: 10, qty: 26, short_qty: 0 },
  { shipment_id: 1, purchase_line_id: 11, qty: 50, short_qty: 0 },
  { shipment_id: 1, purchase_line_id: 13, qty: 30, short_qty: 0 },
  { shipment_id: 2, purchase_line_id: 13, qty: 20, short_qty: 2 },
  { shipment_id: 2, purchase_line_id: 14, qty: 40, short_qty: 2 },
];

test('PUR-07 AC1: lines are grouped under their shipment ID, products listed underneath', () => {
  const g = groupByShipment(lines, items, shipments);
  const fba = g.find((x) => x.shipment?.id === 1)!;
  assert.equal(fba.title, 'FBA15MY7TJ8Q');
  assert.deepEqual(fba.rows.map((r) => r.line.product_name), ['KetoSkin AF Bar Soap-75g', 'ENO fruit salt 20s', 'Colgate floss']);
  assert.equal(g.find((x) => x.shipment?.id === 2)!.title, 'Box 7');
});

test('PUR-07 AC2: the header shows products, units, ₹ and £ totals kept apart, and what was received', () => {
  const box7 = groupByShipment(lines, items, shipments).find((x) => x.shipment?.id === 2)!;
  assert.equal(box7.products, 2);
  assert.equal(box7.units, 60);
  assert.deepEqual(box7.totals, { INR: 2000, GBP: 400 });          // 20 of 50 floss = ₹2,000; the £ line apart
  assert.equal(box7.received, 'Received: 56 of 60, 4 short');
  const moving = groupByShipment(lines, items, [{ ...shipments[1], status: 'in_transit' }]).find((x) => x.shipment?.id === 2)!;
  assert.equal(moving.received, '', 'a box in transit shows no received count');
});

test('PUR-07 AC3: a line split over two boxes shows under each box with that box\'s units', () => {
  const g = groupByShipment(lines, items, shipments);
  const in1 = g.find((x) => x.shipment?.id === 1)!.rows.find((r) => r.line.id === 13)!;
  const in2 = g.find((x) => x.shipment?.id === 2)!.rows.find((r) => r.line.id === 13)!;
  assert.deepEqual([in1.units, in1.partOf, in1.value], [30, 50, 3000]);
  assert.deepEqual([in2.units, in2.partOf, in2.value, in2.received], [20, 50, 2000, 18]);
});

test('PUR-07 AC4: lines not in a shipment (or the part not yet boxed) are under "Not in a shipment yet"', () => {
  const g = groupByShipment([...lines, line(15, { product_name: 'Half boxed', qty: 50, line_total: 500, shipment_id: 1 })],
    [...items, { shipment_id: 1, purchase_line_id: 15, qty: 30, short_qty: 0 }], shipments);
  const none = g.at(-1)!;
  assert.equal(none.shipment, null);
  assert.equal(none.title, 'Not in a shipment yet');
  assert.deepEqual(none.rows.map((r) => [r.line.id, r.units]), [[12, 6], [15, 20]]);
  // nothing goes missing: every unit of every line is shown once
  for (const l of [...lines]) assert.equal(g.flatMap((x) => x.rows).filter((r) => r.line.id === l.id).reduce((t, r) => t + r.units, 0), l.qty, `line ${l.id}`);
});

test('PUR-07 AC5: newest shipment first; lines from other months are counted, not mixed in', () => {
  const g = groupByShipment(lines, items, shipments, new Map([[1, [{ month: '2026-10-01', lines: 3 }]]]));
  assert.deepEqual(g.map((x) => x.shipment?.id ?? null), [2, 1, null]);
  assert.equal(g.find((x) => x.shipment?.id === 1)!.otherMonths, '+3 lines in Oct 2026');
});

test('PUR-07 AC6: the export is unchanged: one row per line, with the shipment ID', () => {
  const route = readFileSync('app/(app)/purchases/export/route.ts', 'utf8');
  assert.match(route, /'amazon_shipment_id', 'tracking_no', 'shipment_status'/);
  assert.match(route, /\(data \?\? \[\]\)\.map\(\(r: any\) => cols\.map/);
});

test('PUR-07 AC7: each shipment ends with a total row: units, goods, courier paid and total, per currency', () => {
  const g = groupByShipment([
    line(20, { qty: 26, unit_price: 90, courier_per_unit: 70, line_total: 4160, shipment_id: 9 }),
    line(21, { qty: 50, unit_price: 180, courier_per_unit: 90, line_total: 13500, qty_note: 'split', shipment_id: null }),
    line(22, { qty: 6, unit_price: 1.65, courier_per_unit: 1.24, currency: 'GBP', line_total: 17.34, shipment_id: 9 }),
  ], [{ shipment_id: 9, purchase_line_id: 20, qty: 26, short_qty: 0 }, { shipment_id: 9, purchase_line_id: 21, qty: 30, short_qty: 0 },
      { shipment_id: 9, purchase_line_id: 22, qty: 6, short_qty: 0 }], [ship(9)]);
  const box = g.find((x) => x.shipment?.id === 9)!;
  assert.equal(box.units, 62);
  // ₹: goods 26×90 + 30×180 = 7,740; courier 26×70 + 30×90 = 4,520; total 12,260. £ apart: goods 9.90, courier 7.44, total 17.34
  assert.deepEqual(box.footer, [
    { currency: 'INR', goods: 7740, courier: 4520, total: 12260 },
    { currency: 'GBP', goods: 9.9, courier: 7.44, total: 17.34 },
  ]);
});
