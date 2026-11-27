import Link from 'next/link';
import { getProfile, isAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { CASE_STATUS, caseState, parseCaseFilters, TONE } from '@/lib/cases';
import { dateLabel } from '@/lib/format';
import { UK_TZ } from '@/lib/tz';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cases' };


export default async function CasesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await getProfile();
  const admin = isAdmin(me);
  const sp = await searchParams;
  const f = parseCaseFilters(sp);
  const status = f.status ?? 'not_resolved';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: UK_TZ }).format(new Date());
  const supabase = await createClient();
  let q = supabase.from('v_cases').select('*').order('due_on').order('id').limit(500);
  if (f.person) q = q.eq('assigned_to', f.person);
  if (status === 'not_resolved') q = q.neq('status', 'resolved'); else q = q.eq('status', status);
  if (f.rule) q = q.eq('rule', f.rule);
  if (f.overdue) q = q.eq('overdue', true);
  const [{ data: cases, error }, { data: rules }, { data: people }] = await Promise.all([
    q, supabase.from('case_rules').select('rule, label').order('label'),
    admin ? supabase.from('profiles').select('id, full_name').eq('active', true).in('role', ['admin', 'data_entry']).order('full_name') : { data: [] },
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{me.role === 'data_entry' ? 'My cases' : 'Cases'}</h1>
      <p className="text-sm text-slate-500">
        A case is a flag that needs someone to act. {admin ? 'Choose which flag types create cases, and who gets them, on the Admin page.' : 'It closes by itself when the problem is fixed, or press Resolve and say what was done.'}
      </p>
      <form className="flex flex-wrap items-end gap-2">
        {admin && (
          <label><span className="label text-xs">Person</span>
            <select name="person" defaultValue={f.person ?? ''} className="input w-44">
              <option value="">Everyone</option>
              {(people ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </label>
        )}
        <label><span className="label text-xs">Status</span>
          <select name="status" defaultValue={status} className="input w-44">
            <option value="not_resolved">Open or in progress</option>
            {Object.entries(CASE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label><span className="label text-xs">Flag type</span>
          <select name="rule" defaultValue={f.rule ?? ''} className="input w-56">
            <option value="">All types</option>
            {(rules ?? []).map((r: any) => <option key={r.rule} value={r.rule}>{r.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="overdue" value="1" defaultChecked={f.overdue} /> Overdue only</label>
        <button className="btn">Show</button>
      </form>
      {error && <p className="text-red-600">{error.message}</p>}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>What is wrong</th><th>Type</th>{me.role !== 'data_entry' && <th>Assigned to</th>}<th>Due</th><th>Status</th></tr></thead>
          <tbody>
            {(cases ?? []).map((c: any) => {
              const st = caseState(c, today);
              return (
                <tr key={c.id}>
                  <td><Link href={`/cases/${c.id}`} className="font-medium hover:underline">{c.title}</Link>
                    {c.external_ref && <div className="text-xs text-slate-500">{c.rule === 'raise_amazon_case' ? 'Amazon case' : 'Ref'} {c.external_ref}</div>}</td>
                  <td className="whitespace-nowrap text-xs">{c.rule_label}</td>
                  {me.role !== 'data_entry' && <td className="whitespace-nowrap">{c.assigned_name ?? '—'}</td>}
                  <td className={`whitespace-nowrap ${st.label === 'Overdue' ? 'font-medium text-red-600 dark:text-red-400' : ''}`}>{dateLabel(c.due_on)}</td>
                  <td><span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${TONE[st.tone]}`}>{st.label}</span></td>
                </tr>
              );
            })}
            {!cases?.length && <tr><td colSpan={5} className="py-6 text-center text-slate-500">No cases here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
