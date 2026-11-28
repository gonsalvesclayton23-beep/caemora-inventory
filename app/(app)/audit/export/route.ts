import { getProfile, isAdmin } from '@/lib/auth';
import { AUDIT_EXPORT_COLUMNS, auditTime, auditZone, describeEntry, details, parseAuditFilters } from '@/lib/audit';
import { auditPage } from '../query';

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** AUD export: the filtered log as CSV (admins only; the database also refuses anyone else). Up to 20,000 entries. */
export async function GET(req: Request) {
  const me = await getProfile();
  if (!isAdmin(me)) return new Response('Not allowed', { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const f = parseAuditFilters(sp);
  const zone = auditZone(sp.tz);   // AUD AC8: the same time zone as the screen
  const rows: any[] = [];
  for (let offset = 0; offset < 20000; offset += 1000) {   // the API returns at most 1,000 rows at a time
    const page = await auditPage(f, 1000, offset);
    if (page.error) return new Response(page.error.message, { status: 400 });
    rows.push(...page.rows.map((r) => ({ r, l: page.lookups })));
    if (page.rows.length < 1000) break;
  }
  const lines = rows.map(({ r, l }) => {
    const d = describeEntry(r, l);
    const changes = d.changes.length ? d.changes.map((c) => `${c.field}: ${c.old} → ${c.new}`) : details(r).map((c) => `${c.field}: ${c.value}`);
    const x = { when_uk: auditTime(r.changed_at, zone), who: r.changed_by_name ?? '', email: r.changed_by_email ?? (r.table_name === 'auth' ? r.new_data?.email : '') ?? '',
      area: d.area, action: d.action, record: d.record, changes: changes.join('; '), reason: r.reason ?? '' };
    return AUDIT_EXPORT_COLUMNS.map((c) => cell(x[c])).join(',');
  });
  const name = ['audit-log', f.from, f.to, zone === 'india' ? 'india-time' : 'uk-time'].filter(Boolean).join('-');
  return new Response('﻿' + [AUDIT_EXPORT_COLUMNS.map((c) => (c === 'when_uk' ? `when_${zone}` : c)).join(','), ...lines].join('\n'), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}.csv"` },
  });
}
