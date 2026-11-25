// NFR-09: responsive. Loading signs on every screen; long lists open in full.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PURCHASES_ALL_MONTHS_LIMIT } from '../lib/limits.ts';

const APP = join(import.meta.dirname, '..', 'app', '(app)');

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? pages(p) : f === 'page.tsx' ? [p] : [];
  });
}

test('NFR-09: every screen shows a loading sign while it loads', () => {
  // a loading.tsx at the top of the signed-in area covers every page beneath it
  const loading = join(APP, 'loading.tsx');
  assert.ok(existsSync(loading), 'app/(app)/loading.tsx is missing');
  assert.match(readFileSync(loading, 'utf8'), /Loading/);
  assert.ok(pages(APP).length >= 10);
});

test('NFR-09: buttons that save show they are working and cannot be pressed twice', () => {
  const forms = pages(APP).map((p) => p.replace('page.tsx', ''))
    .flatMap((d) => readdirSync(d).filter((f) => /Form\.tsx$|forms\.tsx$/.test(f)).map((f) => join(d, f)));
  assert.ok(forms.length >= 5);
  for (const f of forms) {
    const src = readFileSync(f, 'utf8');
    assert.match(src, /disabled=\{[^}]*pending/, `${f}: a save button is not disabled while saving`);
  }
});

test('NFR-09: "All months" opens every purchase line (1,245 imported, room to grow)', () => {
  assert.ok(PURCHASES_ALL_MONTHS_LIMIT >= 1245 * 2);
  const page = readFileSync(join(APP, 'purchases', 'page.tsx'), 'utf8');
  assert.match(page, /PURCHASES_ALL_MONTHS_LIMIT/);
});
