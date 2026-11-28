// PRD-09 / MRG-20 (show existing products from the first letter) and MRG-21 (Caemora product identifier), 28 Nov 2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findDuplicates, typeAhead } from '../lib/duplicates.ts';
import { EXPORT_COLUMNS } from '../lib/margin.ts';

const existing = [
  { id: 1, name: 'ABC variant 1' }, { id: 2, name: 'Zinc cream ABC' }, { id: 3, name: 'Colgate Floss 50m' },
  ...Array.from({ length: 10 }, (_, i) => ({ id: 10 + i, name: `Aloe gel ${i + 1}` })),
];

for (const id of ['PRD-09', 'MRG-20']) {
  test(`${id} AC1: typing "A" already lists "ABC variant 1"`, () => {
    assert.ok(typeAhead('A', existing).some((x) => x.name === 'ABC variant 1'));
    assert.deepEqual(typeAhead('AB', existing).map((x) => x.name), ['ABC variant 1', 'Zinc cream ABC']);
  });
  test(`${id} AC2: names starting with the text come first, then names containing it; at most 8`, () => {
    const a = typeAhead('a', existing);
    assert.equal(a.length, 8);
    assert.ok(a.slice(0, 8).every((x) => x.name.toLowerCase().startsWith('a')));
    assert.deepEqual(typeAhead('abc', existing).map((x) => x.id), [1, 2]);
    assert.deepEqual(typeAhead('', existing), []);
  });
  test(`${id} AC3: a notice only: a new name is not a duplicate; an exact one still is`, () => {
    assert.equal(findDuplicates({ name: 'ABC variant 2' }, existing).exact, null);
    assert.equal(findDuplicates({ name: 'abc variant-1' }, existing).exact?.id, 1);
  });
}
test('PRD-09 / MRG-20: both screens show the list under "Already created" from the first letter', () => {
  const purchase = readFileSync('app/(app)/purchases/new/PurchaseForm.tsx', 'utf8'), margins = readFileSync('app/(app)/margins/ProductForm.tsx', 'utf8');
  assert.match(purchase, /Already created/);
  assert.match(margins, /Already created/);
  assert.doesNotMatch(readFileSync('app/(app)/purchases/actions.ts', 'utf8'), /if \(term\.length < 2\) return \[\]/);
});

test('MRG-21 AC4: the Caemora product ID is on the line, in the list (searchable) and in the export', () => {
  assert.equal(EXPORT_COLUMNS[0], 'cae_code');
  assert.match(readFileSync('app/(app)/margins/page.tsx', 'utf8'), /cae_code/);
  assert.match(readFileSync('app/(app)/margins/ProductForm.tsx', 'utf8'), /Caemora product ID/);
});
