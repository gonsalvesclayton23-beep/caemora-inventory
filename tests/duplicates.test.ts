// PRD-08 (new product in a purchase) and MRG-19 (new margin line), 28 Nov 2026: recognise a product that already exists.
// Exact duplicates (same name ignoring capitals, spaces and punctuation, or an ASIN/FNSKU already used) are refused;
// similar names are only listed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { duplicateMessage, findDuplicates, productKey } from '../lib/duplicates.ts';

const existing = [
  { id: 1, name: 'Colgate Floss 50m', asins: ['B0FLOSS001'], fnskus: ['X002FLOSS1'] },
  { id: 2, name: 'Colgate dental floss 50m (pack of 2)', asins: [], fnskus: [] },
  { id: 3, name: 'ENO Regular 30\'s', asins: ['B0ENO00030'], fnskus: [] },
];

for (const [id, where] of [['PRD-08', 'a new product in a purchase'], ['MRG-19', 'a new margin line']] as const) {
  test(`${id} AC1: ${where}: a name that already exists, in any capitals or spacing, shows "Already created"`, () => {
    assert.equal(productKey('colgate floss – 50M'), productKey('Colgate Floss 50m'));
    const d = findDuplicates({ name: 'colgate floss – 50M' }, existing);
    assert.deepEqual(d.exact, { id: 1, name: 'Colgate Floss 50m', reason: 'name' });
    assert.equal(duplicateMessage(d.exact!), 'Already created: Colgate Floss 50m');
  });
  test(`${id} AC2: ${where}: a different product is not a duplicate`, () => {
    assert.equal(findDuplicates({ name: 'Vicks Inhaler Nasal Stick' }, existing).exact, null);
  });
  test(`${id} AC3: ${where}: an ASIN or FNSKU already on another product is a duplicate, named`, () => {
    const a = findDuplicates({ name: 'Something new', asin: 'b0eno00030' }, existing).exact!;
    assert.deepEqual(a, { id: 3, name: 'ENO Regular 30\'s', reason: 'asin', code: 'B0ENO00030' });
    assert.equal(duplicateMessage(a), 'Already created: ENO Regular 30\'s (ASIN B0ENO00030)');
    assert.equal(duplicateMessage(findDuplicates({ name: 'x', fnsku: 'X002FLOSS1' }, existing).exact!), 'Already created: Colgate Floss 50m (FNSKU X002FLOSS1)');
  });
  test(`${id} AC4: ${where}: similar names are listed but do not count as duplicates`, () => {
    const d = findDuplicates({ name: 'Colgate Floss 50m (pack of 3)' }, existing);
    assert.equal(d.exact, null);
    assert.deepEqual(d.similar.map((x) => x.id).sort(), [1, 2]);
  });
}

test('PRD-08 / MRG-19: the screens offer "Use this one" (purchase) and "Open it" (margins)', () => {
  assert.match(readFileSync('app/(app)/purchases/new/PurchaseForm.tsx', 'utf8'), /Use this one/);
  assert.match(readFileSync('app/(app)/margins/ProductForm.tsx', 'utf8'), /Open it/);
});
