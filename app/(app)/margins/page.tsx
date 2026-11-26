import Link from 'next/link';
import { getProfile, isAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { referenceData } from '@/lib/data';
import {
  computeMargin, filterLines, fxLabel, gbp, inputFromRow, lowestPriceForRoi, pct, roiStatus, sortLines, taxLabel, type Channel, type MarginLineRow,
} from '@/lib/margin';
import { marginSettings } from './data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Margins' };

const SORTS = { name: 'Product', company_name: 'Company', selling_price: 'Price', profit: 'Profit', roi: 'ROI' } as const;
const tone = { red: 'text-red-600 dark:text-red-400', green: 'text-emerald-600 dark:text-emerald-400', grey: 'text-slate-500' } as const;

export default async function MarginsPage({ searchParams }: { searchParams: Promise<{ channel?: string; company?: string; sort?: string; dir?: string; q?: string }> }) {
  const sp = await searchParams;
  const channel: Channel = sp.channel === 'EBAY' ? 'EBAY' : 'AMAZON';
  const company = sp.company?.toUpperCase() || '';
  const sort = (sp.sort && sp.sort in SORTS ? sp.sort : 'name') as keyof typeof SORTS;
  const dir = sp.dir === 'desc' ? 'desc' : 'asc';
  const me = await getProfile();
  const supabase = await createClient();
  const [{ companies }, { settings }, { data, error }] = await Promise.all([
    referenceData(), marginSettings(),
    supabase.from('v_margin_lines').select('*').eq('channel', channel).order('name').limit(2000),
  ]);
  let rows = filterLines((data ?? []) as MarginLineRow[], { channel, company }).map((r) => {
    const i = inputFromRow(r);
    const m = computeMargin(i, settings);
    return { ...r, i, m, roi: m.roi, profit: m.profit, selling_price: Number(r.selling_price), low: lowestPriceForRoi(i, settings) };
  });
  if (sp.q) { const q = sp.q.toLowerCase(); rows = rows.filter((r) => [r.name, r.asin, r.fnsku].some((x) => x?.toLowerCase().includes(q))); }
  rows = sortLines(rows, sort, dir);
  const below = rows.filter((r) => r.m.belowTarget).length;

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ channel, ...(company && { company }), ...(sp.q && { q: sp.q }), sort, dir, ...over });
    return `/margins?${p}`;
  };
  const head = (k: keyof typeof SORTS, num = false) => (
    <th className={num ? 'num' : ''}>
      <Link href={qs({ sort: k, dir: sort === k && dir === 'asc' ? 'desc' : 'asc' })} className="hover:underline">
        {SORTS[k]}{sort === k ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
      </Link>
    </th>
  );
  const exportQs = new URLSearchParams({ channel, ...(company && { company }) });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Margins</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/margins/settings" className="btn-ghost border border-slate-300 dark:border-slate-700">Fees and ROI target</Link>
          <a href={`/margins/export?${exportQs}`} className="btn-ghost border border-slate-300 dark:border-slate-700">Export CSV</a>
          {isAdmin(me) && <Link href={`/margins/new?channel=${channel}`} className="btn">New line</Link>}
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {(['AMAZON', 'EBAY'] as const).map((c) => (
          <Link key={c} href={`/margins?${new URLSearchParams({ channel: c, ...(company && { company }) })}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${c === channel ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {c === 'AMAZON' ? 'Amazon' : 'eBay'}
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap gap-2">
        <input type="hidden" name="channel" value={channel} />
        <select name="company" defaultValue={company} className="input w-52">
          <option value="">All companies</option>
          {companies.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <input name="q" defaultValue={sp.q} placeholder="Product, ASIN or FNSKU" className="input max-w-xs" />
        <button className="btn">Show</button>
      </form>

      <p className="text-sm text-slate-500">
        {rows.length} line{rows.length === 1 ? '' : 's'} · ROI target {settings.roiTargetPct}%{below ? <> · <span className="text-red-600 dark:text-red-400">{below} below target</span></> : null}.
        {' '}Figures are worked out from the inputs, the fees and the company&apos;s tax each time; they do not change purchases, shipments or payments.
      </p>
      {error && <p className="text-red-600">{error.message}</p>}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr>
            {head('name')}{head('company_name')}<th>Tax</th><th className="num">Landed</th>{head('selling_price', true)}<th className="num">Final cost</th>
            {head('profit', true)}{head('roi', true)}<th>Status</th><th className="num">Lowest for {settings.roiTargetPct}%</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const st = roiStatus(r.m.roi, settings.roiTargetPct);
              return (
                <tr key={r.id} className={st.tone === 'red' ? 'bg-red-50/60 dark:bg-red-950/20' : ''}>
                  <td>
                    <Link href={`/margins/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                    <div className="text-xs text-slate-500">{[r.asin, r.fnsku, r.listing_status === 'not_listed' ? 'not listed' : null, r.owner].filter(Boolean).join(' · ')}</div>
                    <div className="text-xs text-slate-400">₹{Number(r.fx_rate).toFixed(2)}/£ · {fxLabel(r.fx_source, r.fx_rate_date)}</div>
                  </td>
                  <td className="whitespace-nowrap">{r.company_name}</td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{taxLabel(r.i)}</td>
                  <td className="num">{gbp(r.m.landed)}</td>
                  <td className="num">{gbp(r.selling_price)}</td>
                  <td className="num">{gbp(r.m.finalCost)}</td>
                  <td className={`num ${r.m.profit < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{gbp(r.m.profit)}</td>
                  <td className={`num font-medium ${tone[st.tone]}`}>{pct(r.m.roi)}</td>
                  <td className={`whitespace-nowrap text-sm ${tone[st.tone]}`}>{st.label}</td>
                  <td className="num">{r.low == null ? <span className="text-xs text-slate-500">Target not reachable</span> : gbp(r.low)}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={10} className="py-6 text-center text-slate-500">No {channel === 'AMAZON' ? 'Amazon' : 'eBay'} lines yet.{isAdmin(me) ? ' Use “New line” to add one.' : ''}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
