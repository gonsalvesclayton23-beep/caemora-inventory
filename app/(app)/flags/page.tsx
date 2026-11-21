import Link from 'next/link';
import { getProfile, isAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { RULE_LABELS, monthLabel } from '@/lib/format';
import { setFlagStatus } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Flags' };

const SEV = { critical: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200', warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200', info: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' } as const;

export default async function FlagsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await getProfile();
  const supabase = await createClient();

  let q = supabase.from('flags').select('id, rule, severity, entity_type, entity_id, period_month, company_code, message, status, created_at')
    .eq('status', sp.status ?? 'open').order('period_month', { ascending: false }).order('id', { ascending: false }).limit(300);
  if (sp.rule) q = q.eq('rule', sp.rule);
  if (sp.severity) q = q.eq('severity', sp.severity);
  if (sp.company) q = q.eq('company_code', sp.company);
  const { data: flags, error } = await q;

  const filter = (k: string, v?: string) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([, x]) => x) as [string, string][]);
    if (v) p.set(k, v); else p.delete(k);
    return `/flags?${p}`;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Flags</h1>
      <div className="flex flex-wrap gap-2 text-sm">
        {['open', 'acknowledged', 'resolved'].map((s) => (
          <Link key={s} href={filter('status', s)} className={`rounded-full border px-3 py-1 ${(sp.status ?? 'open') === s ? 'border-indigo-600 text-indigo-600' : 'border-slate-300'}`}>{s}</Link>
        ))}
        {sp.rule && <Link href={filter('rule')} className="rounded-full bg-slate-200 px-3 py-1 dark:bg-slate-800">{RULE_LABELS[sp.rule] ?? sp.rule} ✕</Link>}
        {sp.severity && <Link href={filter('severity')} className="rounded-full bg-slate-200 px-3 py-1 dark:bg-slate-800">{sp.severity} ✕</Link>}
      </div>
      {error && <p className="text-red-600">{error.message}</p>}
      <ul className="space-y-2">
        {(flags ?? []).map((f) => (
          <li key={f.id} className="card flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded px-2 py-0.5 ${SEV[f.severity as keyof typeof SEV]}`}>{RULE_LABELS[f.rule] ?? f.rule}</span>
                {f.company_code && <span className="text-slate-500">{f.company_code}</span>}
                {f.period_month && <span className="text-slate-500">{monthLabel(f.period_month)}</span>}
              </div>
              <p className="mt-1 text-sm">{f.message}</p>
            </div>
            {isAdmin(me) && f.status !== 'resolved' && (
              <form action={setFlagStatus} className="flex shrink-0 gap-2">
                <input type="hidden" name="id" value={f.id} />
                {f.status === 'open' && <button name="status" value="acknowledged" className="btn-ghost border border-slate-300 dark:border-slate-700">Acknowledge</button>}
                <button name="status" value="resolved" className="btn-ghost border border-slate-300 dark:border-slate-700">Resolve</button>
              </form>
            )}
          </li>
        ))}
        {flags?.length === 0 && <li className="text-sm text-slate-500">Nothing here.</li>}
      </ul>
    </div>
  );
}
