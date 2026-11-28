// Audit log (27 Nov 2026): admins see who changed what, plus sign-ins. Viewing pages is not recorded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AUDIT_EXPORT_COLUMNS, describeEntry, parseAuditFilters, AUDIT_PAGE_SIZE } from '../lib/audit.ts';
import { NAV } from '../lib/nav.ts';

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [];
});

test('AUD AC1: an "Audit log" tab for admins only', () => {
  const n = NAV.find((x) => x.href === '/audit');
  assert.deepEqual(n, { href: '/audit', label: 'Audit log', who: 'admin' });
});

test('AUD AC2: a change shows area, action, the record and only the fields that changed, old → new', () => {
  const d = describeEntry({
    table_name: 'purchase_lines', action: 'UPDATE', row_key: '42',
    old_data: { id: 42, description: 'Antifungal Soap 75g', invoice_no: 'INV-123', unit_price: '90.0000', qty: 10, updated_at: '2026-11-26T10:00:00Z', line_total: 1600 },
    new_data: { id: 42, description: 'Antifungal Soap 75g', invoice_no: 'INV-123', unit_price: '95.0000', qty: 10, updated_at: '2026-11-27T10:00:00Z', line_total: 1650 },
  });
  assert.equal(d.area, 'Purchase');
  assert.equal(d.action, 'Changed');
  assert.equal(d.record, 'Antifungal Soap 75g · INV-123');
  assert.deepEqual(d.changes, [{ field: 'Unit price', old: '90', new: '95' }]);
});
test('AUD AC2: added and deleted records, and names looked up for product margins', () => {
  const add = describeEntry({ table_name: 'shipments', action: 'INSERT', row_key: '7', old_data: null, new_data: { id: 7, tracking_no: 'TRK1', status: 'in_transit' } });
  assert.deepEqual([add.area, add.action, add.record], ['Shipment', 'Added', 'TRK1']);
  const del = describeEntry({ table_name: 'payments', action: 'DELETE', row_key: '3', old_data: { id: 3, reference: 'WISE-9', amount: '5000.0000' }, new_data: null });
  assert.deepEqual([del.area, del.action, del.record], ['Payment', 'Deleted', 'WISE-9']);
  const price = describeEntry({ table_name: 'margin_lines', action: 'UPDATE', row_key: '5',
    old_data: { id: 5, margin_product_id: 1, channel: 'AMAZON', selling_price: '8.9900' }, new_data: { id: 5, margin_product_id: 1, channel: 'AMAZON', selling_price: '9.4900' } },
    { marginProducts: new Map([[1, 'Antifungal Soap 75g']]) });
  assert.deepEqual([price.area, price.record, price.changes], ['Product margin', 'Antifungal Soap 75g · Amazon', [{ field: 'Selling price', old: '8.99', new: '9.49' }]]);
});

test('AUD AC3: viewing pages records nothing: only signing in and out writes to the log from the app', () => {
  const writers = files('app').filter((f) => /record_sign_in_event|from\('audit_log'\)\.(insert|update|delete)/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(writers, ['app/login/actions.ts']);
});

test('AUD AC4: sign-in, sign-out and failed sign-in are described', () => {
  const ok = describeEntry({ table_name: 'auth', action: 'SIGN_IN', row_key: null, old_data: null, new_data: { email: 'a@x.test' } });
  const out = describeEntry({ table_name: 'auth', action: 'SIGN_OUT', row_key: null, old_data: null, new_data: { email: 'a@x.test' } });
  const bad = describeEntry({ table_name: 'auth', action: 'SIGN_IN_FAILED', row_key: null, old_data: null, new_data: { email: 'guess@x.test' } });
  assert.deepEqual([ok.area, ok.action, out.action, bad.action, bad.record], ['Sign-in', 'Signed in', 'Signed out', 'Failed sign-in', 'guess@x.test']);
});

test('AUD AC5: filters by person, area, action and dates; 100 per page, newest first', () => {
  const f = parseAuditFilters({ user: '00000000-0000-0000-0000-00000000000a', area: 'purchase_lines', action: 'UPDATE', from: '2026-11-01', to: '2026-11-27', page: '2' });
  assert.equal(AUDIT_PAGE_SIZE, 100);
  assert.deepEqual(f, { user: '00000000-0000-0000-0000-00000000000a', area: 'purchase_lines', action: 'UPDATE', from: '2026-11-01', to: '2026-11-27', page: 2, offset: 100 });
  assert.deepEqual(parseAuditFilters({ area: 'drop table', action: 'x', from: 'soon', page: '-3' }), { user: null, area: null, action: null, from: null, to: null, page: 1, offset: 0 });
});

test('AUD AC6: suppliers, flags and "Not a match" have readable names', () => {
  assert.equal(describeEntry({ table_name: 'vendors', action: 'UPDATE', row_key: '1', old_data: { id: 1, name: 'Peace Enterprises', notes: null }, new_data: { id: 1, name: 'Peace Enterprises', notes: 'new bank' } }).area, 'Supplier');
  const fl = describeEntry({ table_name: 'flags', action: 'UPDATE', row_key: '9', old_data: { id: 9, rule: 'price_change', message: 'Price up 8%', status: 'open' }, new_data: { id: 9, rule: 'price_change', message: 'Price up 8%', status: 'acknowledged' } });
  assert.deepEqual([fl.area, fl.record, fl.changes], ['Flag', 'Price changed: Price up 8%', [{ field: 'Status', old: 'open', new: 'acknowledged' }]]);
  const bulk = describeEntry({ table_name: 'flags', action: 'BULK', row_key: null, old_data: null, new_data: { count: 120, before: '2026-11-01', rule: null } });
  assert.deepEqual([bulk.action, bulk.record], ['Marked as seen', '120 flags from before Nov 2026']);
  assert.equal(describeEntry({ table_name: 'margin_match_dismissed', action: 'INSERT', row_key: null, old_data: null, new_data: { a_id: 1, b_id: 2 } }).action, 'Not a match');
});

test('AUD export: CSV has when, who, area, action, record and changes', () => {
  assert.deepEqual(AUDIT_EXPORT_COLUMNS, ['when_uk', 'who', 'email', 'area', 'action', 'record', 'changes', 'reason']);
});

test('AUD AC8: the log shows every time in one time zone, UK or India, chosen on the screen (UK unless India is picked)', async () => {
  const { auditTime, auditZone, AUDIT_ZONES } = await import('../lib/audit.ts');
  assert.deepEqual(Object.keys(AUDIT_ZONES), ['uk', 'india']);
  assert.equal(auditZone(undefined), 'uk');
  assert.equal(auditZone('india'), 'india');
  assert.equal(auditZone('mars'), 'uk');
  // 10:00 UTC on 27 Nov = 10:00 UK (GMT) = 15:30 India
  assert.equal(auditTime('2026-11-27T10:00:00Z', 'uk'), '27 Nov 2026, 10:00:00 UK');
  assert.equal(auditTime('2026-11-27T10:00:00Z', 'india'), '27 Nov 2026, 15:30:00 India');
  // summer: UK is on BST
  assert.equal(auditTime('2026-07-01T10:00:00Z', 'uk'), '01 Jul 2026, 11:00:00 UK');
  const page = readFileSync('app/(app)/audit/page.tsx', 'utf8'), csv = readFileSync('app/(app)/audit/export/route.ts', 'utf8');
  assert.doesNotMatch(page + csv, /ukTime\(/, 'no screen is fixed to UK time any more');
});
