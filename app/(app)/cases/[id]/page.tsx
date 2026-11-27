import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProfile, isAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { caseState, outcomeLabel, resolutionLabel, TONE } from '@/lib/cases';
import { dateLabel } from '@/lib/format';
import { UK_TZ } from '@/lib/tz';
import { OutcomeForm, ReassignForm, ReferenceForm, ResolveForm, StatusForm } from '../forms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Case' };

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: UK_TZ });

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const me = await getProfile();
  const admin = isAdmin(me);
  const supabase = await createClient();
  const [{ data: c }, { data: events }, { data: people }] = await Promise.all([
    supabase.from('v_cases').select('*').eq('id', id).maybeSingle(),
    supabase.from('v_case_events').select('*').eq('case_id', id).order('at'),
    admin ? supabase.from('profiles').select('id, full_name, role').eq('active', true).in('role', ['admin', 'data_entry']).order('full_name') : { data: [] },
  ]);
  if (!c) notFound();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: UK_TZ }).format(new Date());
  const st = caseState(c, today);
  const canAct = admin || (me.role === 'data_entry' && c.assigned_to === me.id);
  const shortage = c.entity_type === 'shipment_items';
  const amazon = c.rule === 'raise_amazon_case';
  const choices = (people ?? []).filter((p: any) => c.staff_ok || p.role === 'admin').map((p: any) => ({ id: p.id, name: p.full_name, role: p.role }));

  return (
    <div className="space-y-4">
      <Link href="/cases" className="text-sm text-slate-500 hover:underline">← Cases</Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs text-slate-500">{c.rule_label}</div>
          <h1 className="text-xl font-semibold">{c.title}</h1>
        </div>
        <span className={`rounded px-2 py-1 text-sm ${TONE[st.tone]}`}>{st.label}</span>
      </div>
      <div className="card grid gap-3 text-sm sm:grid-cols-4">
        <div><div className="text-slate-500">Assigned to</div><div className="font-medium">{c.assigned_name ?? '—'}</div></div>
        <div><div className="text-slate-500">Due</div><div className={`font-medium ${st.label === 'Overdue' ? 'text-red-600 dark:text-red-400' : ''}`}>{dateLabel(c.due_on)}</div></div>
        <div><div className="text-slate-500">{amazon ? 'Amazon case' : 'Reference'}</div><div className="font-medium">{c.external_ref ?? '—'}{amazon && c.external_ref && <div className="text-xs font-normal text-sky-700 dark:text-sky-400">Case raised with Amazon</div>}</div></div>
        <div><div className="text-slate-500">Where</div><Link href={c.link} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">Open the {c.entity_type === 'purchase_lines' ? 'purchase line' : c.entity_type === 'payments' ? 'reconciliation' : 'box'} →</Link></div>
        {c.status === 'resolved' && (
          <div className="sm:col-span-4">
            <span className="font-medium">{resolutionLabel(c.resolution)}</span>
            {c.outcome && <>: {outcomeLabel(c.outcome, c.outcome_gbp)}</>}
            {c.resolution_note && <span className="text-slate-500"> · {c.resolution_note}</span>}
          </div>
        )}
      </div>

      {canAct && c.status !== 'resolved' && (
        <div className="card space-y-4">
          <StatusForm id={c.id} status={c.status} />
          {shortage && <ReferenceForm id={c.id} current={c.external_ref} amazon={amazon} />}
          {shortage ? <OutcomeForm id={c.id} amazon={amazon} /> : <ResolveForm id={c.id} />}
          {shortage && <details className="text-sm"><summary className="cursor-pointer text-slate-500">Close without an outcome</summary><div className="mt-2"><ResolveForm id={c.id} /></div></details>}
          {!shortage && <p className="text-xs text-slate-500">This case also closes by itself when the problem is fixed on the {c.entity_type === 'purchase_lines' ? 'purchase line' : 'record'}.</p>}
        </div>
      )}
      {canAct && c.status === 'resolved' && <div className="card"><StatusForm id={c.id} status={c.status} /></div>}
      {admin && c.status !== 'resolved' && (
        <div className="card space-y-2">
          <h2 className="font-medium">Reassign</h2>
          {!c.staff_ok && <p className="text-xs text-slate-500">About payments or money: admins only.</p>}
          <ReassignForm id={c.id} people={choices} current={c.assigned_to} />
        </div>
      )}

      <div className="card">
        <h2 className="mb-2 font-medium">History</h2>
        <ul className="space-y-1 text-sm">
          {(events ?? []).map((e: any) => (
            <li key={e.id}><span className="text-slate-500">{when(e.at)}</span> · {e.by_name ?? 'Automatic'} ·{' '}
              {e.kind === 'created' && <>Created, assigned to {e.to_name ?? '—'}{e.note && ` (${e.note})`}</>}
              {e.kind === 'reassigned' && <>Reassigned from {e.from_name ?? '—'} to {e.to_name ?? '—'}{e.note && `: “${e.note}”`}</>}
              {e.kind === 'status' && <>Marked {e.note}</>}
              {e.kind === 'reopened' && <>Reopened</>}
              {e.kind === 'reference' && <>{e.note}</>}
              {e.kind === 'resolved' && <>Resolved{e.note && `: ${e.note}`}</>}
              {e.kind === 'outcome' && <>Outcome: {e.note}</>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
