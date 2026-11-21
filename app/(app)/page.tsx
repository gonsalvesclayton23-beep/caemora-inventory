import Link from 'next/link';
import { canViewMoney, getProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { money, monthLabel, RULE_LABELS } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const me = await getProfile();
  const supabase = await createClient();

  const [{ data: flags }, { count: inTransit }, { data: latest }] = await Promise.all([
    supabase.from('flags').select('rule, severity').eq('status', 'open').limit(10000),
    supabase.from('shipments').select('id', { count: 'exact', head: true }).eq('status', 'in_transit'),
    supabase.from('periods').select('month, status').order('month', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const month = latest?.month as string | undefined;

  const byRule = new Map<string, number>();
  for (const f of flags ?? []) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
  const critical = (flags ?? []).filter((f) => f.severity === 'critical').length;

  const { data: monthLines } = month
    ? await supabase.from('v_purchase_lines').select('company_code, line_total_inr, line_total_gbp, qty').eq('period_month', month).limit(5000)
    : { data: [] };
  const byCompany = new Map<string, { inr: number; gbp: number; qty: number }>();
  for (const l of monthLines ?? []) {
    const c = byCompany.get(l.company_code) ?? { inr: 0, gbp: 0, qty: 0 };
    c.inr += Number(l.line_total_inr ?? 0); c.gbp += Number(l.line_total_gbp ?? 0); c.qty += l.qty;
    byCompany.set(l.company_code, c);
  }

  // what each company owes Peace (its latest month with activity)
  const companyOwed = new Map<string, number>();
  if (canViewMoney(me)) {
    const { data } = await supabase.from('v_reconciliation')
      .select('company_code, closing_balance, period_month')
      .eq('vendor_name', 'Peace Enterprises').eq('currency', 'INR').not('company_code', 'is', null)
      .order('period_month', { ascending: false }).limit(2000);
    for (const r of data ?? []) if (!companyOwed.has(r.company_code)) companyOwed.set(r.company_code, Number(r.closing_balance));
  }

  // overall balance per supplier at the latest month each one has activity
  let owed: { vendor_name: string; currency: string; closing_balance: number; period_month: string }[] = [];
  if (canViewMoney(me)) {
    const { data } = await supabase.from('v_vendor_balance')
      .select('vendor_name, currency, closing_balance, period_month').order('period_month', { ascending: false }).limit(2000);
    const seen = new Set<string>();
    for (const r of data ?? []) {
      const k = `${r.vendor_name}|${r.currency}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (Math.abs(Number(r.closing_balance)) >= 1) owed.push(r);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {month && <p className="text-sm text-slate-500">{monthLabel(month)} · {latest?.status === 'settled' ? 'settled' : 'open'}</p>}
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link href="/flags" className="card"><div className="text-sm text-slate-500">Open flags</div><div className="text-2xl font-semibold tabular-nums">{flags?.length ?? 0}</div></Link>
        <Link href="/flags?severity=critical" className="card"><div className="text-sm text-slate-500">Critical</div><div className="text-2xl font-semibold tabular-nums text-red-600">{critical}</div></Link>
        <Link href="/shipments" className="card"><div className="text-sm text-slate-500">In transit</div><div className="text-2xl font-semibold tabular-nums">{inTransit ?? 0}</div></Link>
        <div className="card"><div className="text-sm text-slate-500">Units bought this month</div><div className="text-2xl font-semibold tabular-nums">{[...byCompany.values()].reduce((s, c) => s + c.qty, 0).toLocaleString('en-GB')}</div></div>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-medium">Purchases this month</h2>
        <table className="table">
          <thead><tr><th>Company</th><th className="num">Units</th><th className="num">₹</th><th className="num">£</th>{canViewMoney(me) && <th className="num">Owes Peace</th>}</tr></thead>
          <tbody>
            {[...byCompany.entries()].sort().map(([c, v]) => (
              <tr key={c}>
                <td>{c}</td><td className="num">{v.qty.toLocaleString('en-GB')}</td>
                <td className="num">{money(v.inr, 'INR')}</td><td className="num">{money(v.gbp, 'GBP')}</td>
                {canViewMoney(me) && <td className={`num ${(companyOwed.get(c) ?? 0) < 0 ? 'text-emerald-600' : ''}`}>{companyOwed.has(c) ? money(companyOwed.get(c), 'INR') : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {canViewMoney(me) && (
        <section className="card overflow-x-auto">
          <h2 className="mb-2 font-medium">Balance owed to suppliers</h2>
          <table className="table">
            <thead><tr><th>Supplier</th><th>As of</th><th className="num">Owed</th></tr></thead>
            <tbody>
              {owed.sort((a, b) => Number(b.closing_balance) - Number(a.closing_balance)).map((o) => (
                <tr key={`${o.vendor_name}${o.currency}`}>
                  <td>{o.vendor_name}</td><td>{monthLabel(o.period_month)}</td>
                  <td className={`num ${Number(o.closing_balance) < 0 ? 'text-emerald-600' : ''}`}>{money(o.closing_balance, o.currency as 'INR' | 'GBP')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Negative = paid in advance / in credit.</p>
        </section>
      )}

      <section className="card">
        <h2 className="mb-2 font-medium">Open flags by type</h2>
        <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
          {[...byRule.entries()].sort((a, b) => b[1] - a[1]).map(([rule, n]) => (
            <li key={rule}><Link href={`/flags?rule=${rule}`} className="flex justify-between py-2"><span>{RULE_LABELS[rule] ?? rule}</span><span className="tabular-nums">{n}</span></Link></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
