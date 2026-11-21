// npm run import:dry            -> parse + write import-output/ report
// npm run import:load           -> same, then load into $DATABASE_URL (add -- --replace to wipe and reload)
// Options: --file <path.xlsx>   --out <dir>
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.ts';
import { load } from './load.ts';
import { parseWorkbook } from './parse.ts';
import { writeReport } from './report.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const file = opt('--file') ?? ['MIT-2026.xlsx', 'MIT-2026 (1).xlsx'].map((f) => join(root, f)).find(existsSync);
if (!file || !existsSync(file)) { console.error('Workbook not found. Pass --file <path>.'); process.exit(1); }
const outDir = opt('--out') ?? join(root, 'import-output');
const overridesPath = join(here, 'overrides.json');
const overrides = existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, 'utf8')) : {};
delete overrides._help;

const parsed = await parseWorkbook(file, overrides);
const issues = parsed.issues;
const built = build(parsed, issues);
writeReport(outDir, parsed, built, issues);

const count = (s: string) => issues.filter((i) => i.severity === s).length;
console.log(`Parsed ${parsed.lines.length} lines, ${parsed.shipments.length} shipments, ${parsed.payments.length} payments, ${parsed.creditNotes.length} credit notes`);
console.log(`${built.products.length} products, ${built.listings.length} listings, ${built.vendors.length} vendors`);
console.log(`Issues: ${count('error')} errors (rows skipped), ${count('warn')} warnings, ${count('info')} notes`);
console.log(`Report: ${join(outDir, 'import-report.md')}`);

if (args.includes('--load')) {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('Set DATABASE_URL to load.'); process.exit(1); }
  const res = await load(url, parsed, built, { replace: args.includes('--replace') });
  console.log(`Loaded ${res.lines} lines, ${res.products} products, ${res.listings} listings, ${res.shipments} shipments. Totals verified.`);
  console.log('Open flags:', res.flags.map((f: any) => `${f.rule} ${f.n}`).join(', '));
}
