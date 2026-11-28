import Link from 'next/link';
import { canViewMoney, getProfile, isAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { byCompanyOrder, referenceData } from '@/lib/data';
import { money, monthLabel } from '@/lib/format';
import { monthStart, money2 } from '@/lib/tz';
import { Clocks } from '@/components/Clocks';
import { OriginCharts } from '@/components/OriginCharts';
import { originSeries, ORIGINS } from '@/lib/origin';
import { FxCard } from '@/components/FxCard';
import { latestRate, last30Days } from '@/lib/fx';
import { UK_TZ } from '@/lib/tz';
import { CompanyTicker } from '@/components/CompanyTicker';
import { last12Months, SALES_COMPANIES, salesTiles } from '@/lib/sales';
import { SalesBars } from '@/components/SalesBars';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const me = await getProfile();
  const supabase = await createClient();
  const { companies } = await referenceData();
  const companyOrder = byCompanyOrder(companies);

  // DSH-01/02: the current month is the UK month; all monthly figures come from dashboard_monthly()
  const month = monthStart(new Date());
  const [{ data: flags }, { count: inTransit }, { data: latest }, { data: monthly }] = await Promise.all([
    supabase.from('flags').select('rule, severity').eq('status', 'open').limit(10000),
    supabase.from('shipments').select('id', { count: 'exact', head: true }).eq('status', 'in_transit'),
    supabase.from('periods').select('month, status').eq('month', month).maybeSingle(),
    supabase.rpc('dashboard_monthly', { p_months: 12, p_end: month }),
  ]);
  const months = ((monthly ?? []) as { month: string; units: number; spend_inr: number; spend_gbp: number; missing_currency: number }[])
    .map((m) => ({ month: m.month, units: Number(m.units), inr: Number(m.spend_inr), gbp: Number(m.spend_gbp), missing: Number(m.missing_currency) }));
  const thisMonth = months.at(-1);
  const lastMonth = months.at(-2);
  const missingCurrency = months.reduce((s, m) => s + m.missing, 0);

  // UI-04: today's ECB rate (or the last published), this month's Wise rate (decision: current month only), 30 days of history
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: UK_TZ }).format(new Date());
  const [{ data: dailyRows }, { data: wiseRow }] = await Promise.all([
    supabase.from('daily_fx_rates').select('rate_date, inr_per_gbp, fetched_at').order('rate_date', { ascending: false }).limit(40),
    supabase.from('fx_rates').select('inr_per_gbp').eq('month', month).maybeSingle(),
  ]);
  const daily = (dailyRows ?? []).map((r) => ({ date: r.rate_date as string, inrPerGbp: Number(r.inr_per_gbp), fetched: r.fetched_at as string }));
  const latestFx = latestRate(daily, today);
  const fetched = daily.find((d) => d.date === latestFx?.date)?.fetched;


  const critical = (flags ?? []).filter((f) => f.severity === 'critical').length;

  const { data: monthLines } = await supabase.from('v_purchase_lines')
    .select('company_code, line_total_inr, line_total_gbp, qty').eq('period_month', month).limit(5000);
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

  // DSH-06: units, goods and courier per month for India (₹) and China (£)
  const { data: originRows } = await supabase.rpc('dashboard_by_origin', { p_months: 12, p_end: month });
  const originData = Object.fromEntries(ORIGINS.map((o) => [o.code, originSeries((originRows ?? []) as any[], o.code, today)]));

  // DSH-04: each company's sales, last 12 months (typed in by an admin for now)
  const months12 = last12Months(today);
  const { data: salesRows } = await supabase.from('company_sales').select('company_code, month, amount_gbp')
    .in('company_code', [...SALES_COMPANIES]).gte('month', months12[0]).lte('month', months12[11]);
  const salesTilesData = salesTiles((salesRows ?? []) as any[], companies, today);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-500">{monthLabel(month)} · {latest?.status === 'settled' ? 'settled' : 'open'}</p>
        </div>
        <Clocks />
      </header>

      <CompanyTicker />

      <FxCard latest={latestFx ? { date: latestFx.date, inrPerGbp: latestFx.inrPerGbp } : null} label={latestFx?.label ?? ''}
        updated={fetched ? new Date(fetched).toLocaleString('en-GB', { timeZone: UK_TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' UK time' : null}
        wise={wiseRow ? Number(wiseRow.inr_per_gbp) : null} wiseMonth={monthLabel(month)}
        history={last30Days(daily, today).map(({ date, inrPerGbp }) => ({ date, inrPerGbp }))} />

      {/* DSH-04: sales, straight after the exchange rate */}
      <section className="card space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Sales, last 12 months</h2>
          <span className="text-xs text-slate-500">
            £, including VAT, all platforms · {monthLabel(months12[0])} to {monthLabel(months12[11])}
            {isAdmin(me) && <> · <Link href="/sales" className="text-indigo-600 hover:underline dark:text-indigo-400">Enter sales</Link></>}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {salesTilesData.map((t) => (
            <div key={t.code} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="text-sm text-slate-500">{t.name}</div>
              <div className="text-2xl font-semibold tabular-nums">{money(t.total, 'GBP', 0)}</div>
              <div className="text-xs text-slate-500">{t.missing === 12 ? 'No months entered yet' : t.missing ? `${t.missing} month${t.missing === 1 ? '' : 's'} not entered` : 'All 12 months entered'}</div>
              <SalesBars name={t.name} months={t.months} />
            </div>
          ))}
        </div>
      </section>

      {/* DSH-02: spend by currency, never added together or converted */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {([['INR', 'Spent (INR)', 'inr'], ['GBP', 'Spent (GBP)', 'gbp']] as const).map(([cur, title, key]) => (
          <div key={cur} className="card">
            <div className="text-sm text-slate-500">{title} · {monthLabel(month)}</div>
            <div className="text-2xl font-semibold tabular-nums">{money2(thisMonth?.[key] ?? 0, cur)}</div>
            <div className="text-xs text-slate-500">{lastMonth ? `${monthLabel(lastMonth.month)}: ${money2(lastMonth[key], cur)}` : ''}</div>
          </div>
        ))}
      </section>
      {missingCurrency > 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {missingCurrency} purchase{missingCurrency === 1 ? '' : 's'} missing currency: not included in the totals.
        </p>
      )}

      {/* DSH-06 (replaces the combined DSH-01 chart): India in ₹ and China in £, each with units and cost per unit */}
      <OriginCharts series={originData} />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link href="/flags" className="card"><div className="text-sm text-slate-500">Open flags</div><div className="text-2xl font-semibold tabular-nums">{flags?.length ?? 0}</div></Link>
        <Link href="/flags?severity=critical" className="card"><div className="text-sm text-slate-500">Critical</div><div className="text-2xl font-semibold tabular-nums text-red-600">{critical}</div></Link>
        <Link href="/shipments" className="card"><div className="text-sm text-slate-500">In transit</div><div className="text-2xl font-semibold tabular-nums">{inTransit ?? 0}</div></Link>
        <div className="card"><div className="text-sm text-slate-500">Units this month</div><div className="text-2xl font-semibold tabular-nums">{(thisMonth?.units ?? 0).toLocaleString('en-GB')}</div></div>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-medium">Purchases this month</h2>
        <table className="table">
          <thead><tr><th>Company</th><th className="num">Units</th><th className="num">₹</th><th className="num">£</th>{canViewMoney(me) && <th className="num">Owes Peace</th>}</tr></thead>
          <tbody>
            {[...byCompany.entries()].sort((a, b) => companyOrder(a[0], b[0])).map(([c, v]) => (
              <tr key={c}>
                <td>{c}</td><td className="num">{v.qty.toLocaleString('en-GB')}</td>
                <td className="num">{money(v.inr, 'INR')}</td><td className="num">{money(v.gbp, 'GBP')}</td>
                {canViewMoney(me) && <td className={`num ${(companyOwed.get(c) ?? 0) < 0 ? 'text-emerald-600' : ''}`}>{companyOwed.has(c) ? money(companyOwed.get(c), 'INR') : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

    </div>
  );
}
