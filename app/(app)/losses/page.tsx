import Link from 'next/link';
import { getProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { referenceData } from '@/lib/data';
import { dateLabel, monthLabel } from '@/lib/format';
import { gbp } from '@/lib/margin';
import { LOSS_PLATFORMS, LOSS_TYPES, monthlyLossReport, platformName } from '@/lib/losses';
import { UK_TZ } from '@/lib/tz';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Losses' };

/** LOS-01..LOS-03: every loss for a month, and the monthly report (net loss by type, company and platform). */
export default async function LossesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await getProfile();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: UK_TZ }).format(new Date());
  const month = /^\d{4}-\d{2}-01$/.test(sp.month ?? '') ? sp.month! : `${today.slice(0, 7)}-01`;
  const company = sp.company?.toUpperCase() || '', type = sp.type && sp.type in LOSS_TYPES ? sp.type : '', platform = LOSS_PLATFORMS.some(([k]) => k === sp.platform) ? sp.platform! : '';
  const supabase = await createClient();
  let q = supabase.from('v_losses').select('*').eq('month', month).order('occurred_on', { ascending: false }).order('id', { ascending: false }).limit(2000);
  if (company) q = q.eq('company_code', company);
  if (type) q = q.eq('type', type);
  if (platform) q = q.eq('platform', platform);
  const yearAgo = `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`;
  const [{ companies }, { data: rows, error }, { data: all }] = await Promise.all([
    referenceData(), q,
    supabase.from('losses').select('month, type, company_code, platform, qty, goods_gbp, refund_gbp, recovered_gbp, net_loss_gbp').gt('month', yearAgo).lte('month', month).limit(20000),
  ]);
  const report = monthlyLossReport((all ?? []) as any[]);
  const thisMonth = monthlyLossReport((rows ?? []) as any[])[0];
  const names = new Map(companies.map((c) => [c.code, c.name]));
  const qs = new URLSearchParams(Object.entries({ month, company, type, platform }).filter(([, v]) => v) as [string, string][]);
  const shift = (n: number) => { const d = new Date(`${month}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

  return (
    <div className="space-y-4">
      {sp.saved && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Recorded {sp.saved} loss{sp.saved === '1' ? '' : 'es'}.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Losses</h1>
        <div className="flex gap-2">
          <a href={`/losses/export?${qs}`} className="btn-ghost border border-slate-300 dark:border-slate-700">Export CSV</a>
          {me.role !== 'viewer' && <Link href="/losses/new" className="btn">+ Record a loss</Link>}
        </div>
      </div>
      <p className="text-sm text-slate-500">Lost shipments, damaged returns, refunds where the buyer kept the item, and expired goods. Net loss = goods at landed cost + refund to the buyer − anything recovered. All in £.</p>

      <form className="flex flex-wrap items-end gap-2">
        <div className="flex items-end gap-1">
          <Link href={`/losses?${new URLSearchParams({ ...Object.fromEntries(qs), month: shift(-1) })}`} className="btn-ghost border border-slate-300 dark:border-slate-700" aria-label="Previous month">←</Link>
          <label><span className="label text-xs">Month</span><input type="month" name="m" defaultValue={month.slice(0, 7)} className="input w-40" /></label>
          <Link href={`/losses?${new URLSearchParams({ ...Object.fromEntries(qs), month: shift(1) })}`} className="btn-ghost border border-slate-300 dark:border-slate-700" aria-label="Next month">→</Link>
        </div>
        <label><span className="label text-xs">Company</span>
          <select name="company" defaultValue={company} className="input w-44"><option value="">All</option>{companies.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
        <label><span className="label text-xs">Type</span>
          <select name="type" defaultValue={type} className="input w-56"><option value="">All types</option>{Object.entries(LOSS_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label><span className="label text-xs">Platform</span>
          <select name="platform" defaultValue={platform} className="input w-40"><option value="">All</option>{LOSS_PLATFORMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <button className="btn" formAction="/losses/go">Show</button>
      </form>
      {error && <p className="text-red-600">{error.message}</p>}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[['Net loss', thisMonth?.net ?? 0, true], ['Goods lost', thisMonth?.goods ?? 0], ['Refunds to buyers', thisMonth?.refund ?? 0], ['Recovered', thisMonth?.recovered ?? 0]].map(([l, v, big]) => (
          <div key={String(l)} className="card"><div className="text-sm text-slate-500">{String(l)} · {monthLabel(month)}</div><div className={`text-2xl font-semibold tabular-nums ${big ? 'text-red-600 dark:text-red-400' : ''}`}>{gbp(Number(v))}</div></div>
        ))}
        <div className="card"><div className="text-sm text-slate-500">Entries · units</div><div className="text-2xl font-semibold tabular-nums">{thisMonth?.entries ?? 0} · {thisMonth?.units ?? 0}</div></div>
      </section>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Date</th><th>Type</th><th>Company</th><th>Platform</th><th>Product</th><th className="num">Units</th><th className="num">Goods</th>
            <th className="num">Refund</th><th className="num">Recovered</th><th className="num">Net loss</th><th>Reference</th><th>Recorded by</th></tr></thead>
          <tbody>
            {(rows ?? []).map((l: any) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap">{dateLabel(l.occurred_on)}</td>
                <td className="text-xs">{LOSS_TYPES[l.type as keyof typeof LOSS_TYPES]}</td>
                <td className="whitespace-nowrap">{l.company_name}</td>
                <td>{platformName(l.platform)}</td>
                <td><Link href={`/losses/${l.id}`} className="hover:underline">{l.product_name}</Link>
                  {l.shipment_id && <div className="text-xs text-slate-500">from <Link href={`/shipments/${l.shipment_id}`} className="underline">{l.amazon_shipment_id ?? (l.box_no ? `box ${l.box_no}` : `#${l.shipment_id}`)}</Link></div>}</td>
                <td className="num">{l.qty}</td><td className="num">{gbp(Number(l.goods_gbp))}</td><td className="num">{gbp(Number(l.refund_gbp))}</td>
                <td className="num">{gbp(Number(l.recovered_gbp))}</td><td className="num font-semibold">{gbp(Number(l.net_loss_gbp))}</td>
                <td className="text-xs">{l.reference ?? ''}</td><td className="text-xs">{l.recorded_by_name ?? '—'}</td>
              </tr>
            ))}
            {!rows?.length && <tr><td colSpan={12} className="py-6 text-center text-slate-500">No losses recorded for {monthLabel(month)}.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* LOS-03: the monthly report */}
      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-medium">Monthly report: last 12 months to {monthLabel(month)}</h2>
        <table className="table">
          <thead><tr><th>Month</th><th className="num">Entries</th><th className="num">Units</th><th className="num">Goods</th><th className="num">Refunds</th>
            <th className="num">Recovered</th><th className="num">Net loss</th><th>By type</th><th>By company</th></tr></thead>
          <tbody>
            {report.map((m) => (
              <tr key={m.month}>
                <td className="whitespace-nowrap"><Link href={`/losses?month=${m.month}`} className="hover:underline">{monthLabel(m.month)}</Link></td>
                <td className="num">{m.entries}</td><td className="num">{m.units}</td><td className="num">{gbp(m.goods)}</td><td className="num">{gbp(m.refund)}</td>
                <td className="num">{gbp(m.recovered)}</td><td className="num font-semibold">{gbp(m.net)}</td>
                <td className="text-xs">{Object.entries(m.byType).map(([k, v]) => `${LOSS_TYPES[k as keyof typeof LOSS_TYPES]} ${gbp(v)}`).join(' · ')}</td>
                <td className="text-xs">{Object.entries(m.byCompany).map(([k, v]) => `${names.get(k) ?? k} ${gbp(v)}`).join(' · ')}</td>
              </tr>
            ))}
            {!report.length && <tr><td colSpan={9} className="py-6 text-center text-slate-500">No losses in the last 12 months.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
