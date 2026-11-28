// Renames (27 Nov 2026): the app is "CIMS - (Caemora Inventory Management System)"; the Margins tab is "Product margins".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { APP_NAME, NAV } from '../lib/nav.ts';

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.(tsx?|md)$/.test(p) ? [p] : [];
});
const source = files('app').map((f) => [f, readFileSync(f, 'utf8')] as const);

test('Rename AC1: the app is called "CIMS - (Caemora Inventory Management System)" (sidebar, sign-in page, browser tab)', () => {
  assert.equal(APP_NAME, 'CIMS - (Caemora Inventory Management System)');
  for (const f of ['app/layout.tsx', 'app/login/page.tsx', 'app/(app)/layout.tsx']) assert.match(readFileSync(f, 'utf8'), /APP_NAME/, f);
  const old = source.filter(([, s]) => /Caemora Inventory(?! Management System)['"<`]/.test(s) || />Caemora</.test(s)).map(([f]) => f);
  assert.deepEqual(old, [], 'old name still shown');
});

test('Rename AC2: the Margins tab is called "Product margins" (menu, heading, back links, browser tab)', () => {
  assert.equal(NAV.find((n) => n.href === '/margins')?.label, 'Product margins');
  const old = source.filter(([, s]) => />\s*Margins\s*</.test(s) || /← Margins</.test(s) || /title: 'Margins'/.test(s)).map(([f]) => f);
  assert.deepEqual(old, [], 'old tab name still shown');
});

test('Rename AC3: addresses and every other tab are unchanged', () => {
  assert.deepEqual(NAV.map((n) => `${n.href}=${n.label}`), [
    '/=Dashboard', '/margins=Product margins', '/purchases=Purchases', '/shipments=Shipments', '/invoices=Invoices', '/products=Products', '/flags=Flags',
    '/cases=Cases', '/losses=Losses', '/reconciliation=Reconciliation', '/landed-cost=Landed cost', '/audit=Audit log', '/admin=Admin',
  ]);
});
