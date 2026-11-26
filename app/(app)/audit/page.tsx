import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getProfile, isAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AREA_OPTIONS, AUDIT_ACTIONS, AUDIT_PAGE_SIZE, describeEntry, details, parseAuditFilters, ukTime } from '@/lib/audit';
import { auditPage } from './query';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Audit log' };

const actionTone: Record<string, string> = {
  INSERT: 'text-emerald-700 dark:text-emerald-400', DELETE: 'text-red-600 dark:text-red-400', SIGN_IN_FAILED: 'text-red-600 dark:text-red-400',
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await getProfile();
  if (!isAdmin(me)) redirect('/');
  const sp = await searchParams;
  const f = parseAuditFilters(sp);
  const supabase = await createClient();
  const [{ rows, error, count, lookups }, { data: people }] = await Promise.all([
    auditPage(f, AUDIT_PAGE_SIZE, f.offset),
    supabase.from('profiles').select('id, full_name, email').order('full_name'),
  ]);
  const pages = Math.max(1, Math.ceil(count / AUDIT_PAGE_SIZE));
  const keep = Object.fromEntries(Object.entries({ user: f.user, area: f.area, action: f.action, from: f.from, to: f.to }).filter(([, v]) => v)) as Record<string, string>;
  const pageLink = (n: number) => `/audit?${new URLSearchParams({ ...keep, page: String(n) })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <a href={`/audit/export?${new URLSearchParams(keep)}`} className="btn-ghost border border-slate-300 dark:border-slate-700">Export CSV</a>
      </div>
      <p className="text-sm text-slate-500">Every change anyone makes, and every sign-in, sign-out and failed sign-in. Viewing pages is not recorded. Entries cannot be edited or deleted. Times are UK time.</p>

      <form className="flex flex-wrap items-end gap-2">
        <label><span className="label text-xs">Person</span>
          <select name="user" defaultValue={f.user ?? ''} className="input w-48">
            <option value="">Everyone</option>
            {(people ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
        </label>
        <label><span className="label text-xs">Area</span>
          <select name="area" defaultValue={f.area ?? ''} className="input w-52">
            <option value="">All areas</option>
            {AREA_OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <label><span className="label text-xs">What happened</span>
          <select name="action" defaultValue={f.action ?? ''} className="input w-44">
            <option value="">Anything</option>
            {Object.entries(AUDIT_ACTIONS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <label><span className="label text-xs">From</span><input type="date" name="from" defaultValue={f.from ?? ''} className="input w-40" /></label>
        <label><span className="label text-xs">To</span><input type="date" name="to" defaultValue={f.to ?? ''} className="input w-40" /></label>
        <button className="btn">Show</button>
        {Object.keys(keep).length > 0 && <Link href="/audit" className="btn-ghost">Clear</Link>}
      </form>

      {error && <p className="text-red-600">{error.message}</p>}
      <p className="text-sm text-slate-500">{count.toLocaleString('en-GB')} entr{count === 1 ? 'y' : 'ies'}{pages > 1 ? ` · page ${f.page} of ${pages}` : ''}</p>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>When</th><th>Who</th><th>Area</th><th>What</th><th>Record</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const d = describeEntry(r, lookups);
              const extra = details(r);
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-xs">{ukTime(r.changed_at)}</td>
                  <td className="whitespace-nowrap">{r.changed_by_name || r.changed_by_email || (r.changed_by ? 'Unknown user' : r.action === 'SIGN_IN_FAILED' ? '—' : 'System')}</td>
                  <td className="whitespace-nowrap">{d.area}</td>
                  <td className={`whitespace-nowrap font-medium ${actionTone[r.action] ?? ''}`}>{d.action}</td>
                  <td className="max-w-xs">{d.record}</td>
                  <td className="text-xs">
                    {d.changes.length > 0 && <ul>{d.changes.map((c) => <li key={c.field}><span className="text-slate-500">{c.field}:</span> {c.old} → {c.new}</li>)}</ul>}
                    {extra.length > 0 && (
                      <details><summary className="cursor-pointer text-slate-500">{r.action === 'DELETE' ? 'What was deleted' : 'What was entered'}</summary>
                        <ul className="mt-1">{extra.map((c) => <li key={c.field}><span className="text-slate-500">{c.field}:</span> {c.value}</li>)}</ul>
                      </details>
                    )}
                    {r.reason && <div className="text-slate-500">Reason: {r.reason}</div>}
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6} className="py-6 text-center text-slate-500">Nothing matches these filters.</td></tr>}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          {f.page > 1 && <Link href={pageLink(f.page - 1)} className="btn-ghost border border-slate-300 dark:border-slate-700">← Newer</Link>}
          {f.page < pages && <Link href={pageLink(f.page + 1)} className="btn-ghost border border-slate-300 dark:border-slate-700">Older →</Link>}
        </div>
      )}
    </div>
  );
}
