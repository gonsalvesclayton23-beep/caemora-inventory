// Writes the dry-run report: a readable summary plus CSVs for detail.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Built } from './build.ts';
import type { Issue } from './normalize.ts';
import type { Parsed } from './parse.ts';

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
const money = (n: number, cur = '₹') => `${cur}${Math.round(n).toLocaleString('en-GB')}`;
const mon = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });

export function writeReport(dir: string, parsed: Parsed, built: Built, issues: Issue[]) {
  mkdirSync(dir, { recursive: true });

  writeFileSync(join(dir, 'issues.csv'), csv([
    ['ref', 'severity', 'type', 'message'],
    ...issues.map((i) => [i.ref, i.severity, i.type, i.message]),
  ]));

  writeFileSync(join(dir, 'products.csv'), csv([
    ['import_ref', 'name', 'category', 'lines', 'agreed_courier_per_unit', 'currency', 'companies', 'fnskus', 'name_variants'],
    ...built.products.map((p) => [
      p.key, p.name, p.category, p.lines.length, p.agreedCourierPerUnit, p.agreedCourierCurrency,
      [...new Set(p.lines.map((l) => l.company))].join(' '),
      [...new Set(p.lines.map((l) => l.fnsku).filter(Boolean))].join(' '),
      [...p.names.keys()].join(' | '),
    ]),
  ]));

  writeFileSync(join(dir, 'possible-duplicates.csv'), csv([
    ['product_a', 'product_b', 'similarity'], ...built.possibleDuplicates,
  ]));

  writeFileSync(join(dir, 'lines.csv'), csv([
    ['ref', 'month', 'company', 'channel', 'product', 'fnsku', 'qty', 'unit_price', 'courier_per_unit', 'currency', 'line_total', 'sheet_total', 'vendor', 'invoice_no', 'shipment_group'],
    ...parsed.lines.map((l) => [l.ref, l.month, l.company, l.channel, l.description, l.fnsku, l.qty, l.unitPrice, l.courierPerUnit, l.currency,
      Math.round(((l.unitPrice ?? 0) + l.courierPerUnit) * l.qty * 100) / 100, l.sheetTotal, l.vendor ?? (l.currency === 'GBP' ? 'Alibaba (unspecified seller)' : 'Peace Enterprises'), l.invoiceNo, l.groupId]),
  ]));

  writeFileSync(join(dir, 'payments.csv'), csv([
    ['ref', 'month', 'company', 'vendor', 'kind', 'amount', 'currency', 'amount_gbp', 'paid_on', 'method', 'reference', 'confirmed'],
    ...parsed.payments.map((p) => [p.ref, p.month, p.company, p.vendor, p.kind, p.amount, p.currency, p.amountGbp, p.paidOn, p.method, p.reference, p.confirmed]),
  ]));

  // ---------------------------------------------------------------- reconciliation preview (Peace, ₹)
  const months = [...new Set(parsed.lines.map((l) => l.month))].filter((m) => m.startsWith('2026')).sort();
  const companies = ['CMR', 'ARC', 'YD', 'GOE', 'GOA', 'GEN', 'ALS'];
  const peaceLine = (l: Parsed['lines'][number]) => l.currency === 'INR' && (!l.vendor || l.vendor === 'Peace Enterprises');
  // overall, all companies together: the real balance with Peace
  const overall: string[] = ['| Month | Opening | Purchases | Credit notes | Paid | Unconfirmed | Closing due |', '|---|--:|--:|--:|--:|--:|--:|'];
  {
    let bal = 0;
    for (const m of months) {
      const pur = parsed.lines.filter((l) => l.month === m && peaceLine(l)).reduce((s, l) => s + ((l.unitPrice ?? 0) + l.courierPerUnit) * l.qty, 0);
      const cn = parsed.creditNotes.filter((x) => x.month === m).reduce((s, x) => s + x.amount, 0);
      const pays = parsed.payments.filter((p) => p.month === m && p.vendor === 'Peace Enterprises');
      const paid = pays.filter((p) => p.confirmed).reduce((s, p) => s + p.amount, 0);
      const unconf = pays.filter((p) => !p.confirmed).reduce((s, p) => s + p.amount, 0);
      const open = bal;
      bal = open + pur - cn - paid;
      overall.push(`| ${mon(m)} | ${money(open)} | ${money(pur)} | ${cn ? money(cn) : ''} | ${money(paid)} | ${unconf ? money(unconf) : ''} | **${money(bal)}** |`);
    }
  }
  const paidFrom: string[] = ['| Months | Paid for | Paid from | Payments | ₹ |', '|---|---|---|--:|--:|'];
  {
    const g = new Map<string, { months: Set<string>; n: number; inr: number }>();
    for (const p of parsed.payments) {
      if (p.vendor !== 'Peace Enterprises' || !p.confirmed) continue;
      const k = `${p.company}|${p.paidFromCompany ?? p.paidFrom ?? '?'}`;
      const v = g.get(k) ?? { months: new Set(), n: 0, inr: 0 };
      v.months.add(p.month); v.n++; v.inr += p.amount; g.set(k, v);
    }
    for (const [k, v] of [...g.entries()].sort()) {
      const [c, from] = k.split('|');
      const ms = [...v.months].sort();
      paidFrom.push(`| ${mon(ms[0])}–${mon(ms.at(-1)!)} | ${c} | ${from === c ? 'own account' : `**${from}**`} | ${v.n} | ${money(v.inr)} |`);
    }
  }
  const recon: string[] = [];
  recon.push('| Company | Month | Opening | Purchases | Credit notes | Paid | Unconfirmed | Closing due |');
  recon.push('|---|---|--:|--:|--:|--:|--:|--:|');
  for (const c of companies) {
    let bal = 0;
    for (const m of months) {
      const pur = parsed.lines.filter((l) => l.company === c && l.month === m && peaceLine(l))
        .reduce((s, l) => s + ((l.unitPrice ?? 0) + l.courierPerUnit) * l.qty, 0);
      const cn = parsed.creditNotes.filter((x) => x.company === c && x.month === m).reduce((s, x) => s + x.amount, 0);
      const pays = parsed.payments.filter((p) => p.company === c && p.month === m && p.vendor === 'Peace Enterprises');
      const paid = pays.filter((p) => p.confirmed).reduce((s, p) => s + p.amount, 0);
      const unconf = pays.filter((p) => !p.confirmed).reduce((s, p) => s + p.amount, 0);
      if (!pur && !cn && !paid && !unconf) continue;
      const open = bal;
      bal = open + pur - cn - paid;
      recon.push(`| ${c} | ${mon(m)} | ${money(open)} | ${money(pur)} | ${cn ? money(cn) : ''} | ${money(paid)} | ${unconf ? money(unconf) : ''} | **${money(bal)}** |`);
    }
  }

  // ---------------------------------------------------------------- per-tab summary
  const tabRows: string[] = ['| Tab | Lines | ₹ purchases (app) | ₹ (sheet column) | £ purchases | Payments | Credit notes | Shipments |', '|---|--:|--:|--:|--:|--:|--:|--:|'];
  const tabs = [...new Set(parsed.lines.map((l) => l.tab))];
  for (const t of tabs) {
    const ls = parsed.lines.filter((l) => l.tab === t);
    const inr = ls.filter((l) => l.currency === 'INR').reduce((s, l) => s + ((l.unitPrice ?? 0) + l.courierPerUnit) * l.qty, 0);
    const inrSheet = ls.filter((l) => l.currency === 'INR').reduce((s, l) => s + (l.sheetTotal ?? ((l.unitPrice ?? 0) + l.courierPerUnit) * l.qty), 0);
    const gbp = ls.filter((l) => l.currency === 'GBP').reduce((s, l) => s + ((l.unitPrice ?? 0) + l.courierPerUnit) * l.qty, 0);
    const pays = parsed.payments.filter((p) => p.ref.startsWith(t + '!')).length;
    const cns = parsed.creditNotes.filter((p) => p.ref.startsWith(t + '!')).length;
    const ships = parsed.shipments.filter((s) => s.ref.startsWith(t + '!')).length;
    tabRows.push(`| ${t} | ${ls.length} | ${money(inr)} | ${money(inrSheet)} | ${money(gbp, '£')} | ${pays} | ${cns} | ${ships} |`);
  }

  // ---------------------------------------------------------------- issues by type
  const byType = new Map<string, Issue[]>();
  for (const i of issues) (byType.get(i.type) ?? byType.set(i.type, []).get(i.type)!).push(i);
  const sevOrder = { error: 0, warn: 1, info: 2 } as const;
  const types = [...byType.entries()].sort((a, b) => sevOrder[a[1][0].severity] - sevOrder[b[1][0].severity] || b[1].length - a[1].length);
  const issueMd = types.map(([type, list]) => {
    const ex = list.slice(0, 8).map((i) => `  - \`${i.ref}\` ${i.message}`).join('\n');
    return `### ${list[0].severity.toUpperCase()} · ${type} (${list.length})\n${ex}${list.length > 8 ? `\n  - …and ${list.length - 8} more in issues.csv` : ''}`;
  }).join('\n\n');

  const stockProducts = built.products.filter((p) => p.category === 'stock');
  const md = `# MIT-2026 import: dry run

Nothing has been written to a database. Review this, fix the sheet or add entries to
\`scripts/import/overrides.json\`, and run \`npm run import:dry\` again.

## Totals

- **${parsed.lines.length}** purchase lines (${parsed.lines.filter((l) => l.currency === 'GBP').length} in £), **${parsed.shipments.length}** shipments, **${parsed.payments.length}** payments, **${parsed.creditNotes.length}** credit notes
- **${stockProducts.length}** products (from ${new Set(parsed.lines.map((l) => l.description)).size} different name spellings), **${built.listings.length}** listings, **${built.vendors.length}** vendors
- **${issues.filter((i) => i.severity === 'error').length}** rows not imported · ${issues.filter((i) => i.severity === 'warn').length} warnings · ${issues.filter((i) => i.severity === 'info').length} notes

## By tab

"₹ (sheet column)" is the sum of the sheet's own *Unit / Invoice Amt*. A difference from the app's figure means a hand-typed total in the sheet (see \`total_mismatch\`).

${tabRows.join('\n')}

## Balance owed to Peace Enterprises (₹), by company

Each company pays for the stock sent to it. Purchases are ₹ lines with no other vendor.
Opening = previous month's closing. Jan opening is assumed to be ₹0.

${recon.join('\n')}

### All companies together

Credit notes with no company (e.g. Nov's ₹6,786) only appear here.

${overall.join('\n')}

## Which account paid

${paidFrom.join('\n')}

## Issues

${issueMd}

## Files

- \`issues.csv\`: every issue with its tab!row
- \`products.csv\`: product master with every name spelling and the starting rate card
- \`possible-duplicates.csv\`: products with similar names that were *not* merged
- \`lines.csv\`, \`payments.csv\`: exactly what would be loaded
`;
  writeFileSync(join(dir, 'import-report.md'), md);
}
