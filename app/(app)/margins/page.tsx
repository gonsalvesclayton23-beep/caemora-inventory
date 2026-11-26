import { Fragment } from 'react';
import Link from 'next/link';
import { getProfile, isAdmin } from '@/lib/auth';
import { referenceData } from '@/lib/data';
import { compareProduct, findMatches, fxLabel, gbp, pct, PLATFORMS, sortLines, type Channel } from '@/lib/margin';
import { createClient } from '@/lib/supabase/server';
import { marginSettings } from './data';
import { loadProducts } from './load';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Margins' };

const SORTS: Record<string, string> = { name: 'Product', landed: 'Landed', best_roi: 'Best ROI', worst_roi: 'Lowest ROI',
  ...Object.fromEntries(PLATFORMS.map((p) => [`roi_${p.code}`, `${p.label} ROI`])) };
const tone = { red: 'text-red-600 dark:text-red-400', green: 'text-emerald-600 dark:text-emerald-400', grey: 'text-slate-400' } as const;

export default async function MarginsPage({ searchParams }: { searchParams: Promise<{ company?: string; platform?: string; sort?: string; dir?: string; q?: string }> }) {
  const sp = await searchParams;
  const company = sp.company?.toUpperCase() || '';
  const platform = (PLATFORMS.some((p) => p.code === sp.platform) ? sp.platform : '') as Channel | '';
  const sort = sp.sort && sp.sort in SORTS ? sp.sort : 'name';
  const dir = sp.dir === 'desc' ? 'desc' : 'asc';
  const me = await getProfile();
  const supabase = await createClient();
  const [{ companies }, { settings }, { products, error }, { data: dismissed }] = await Promise.all([
    referenceData(), marginSettings(), loadProducts(), supabase.from('margin_match_dismissed').select('a_id, b_id'),
  ]);

  let rows = products.map((p) => {
    const c = compareProduct(p.costs, p.entries, settings);
    const priced = c.rows.filter((r) => r.state === 'priced' && (!company || r.companyCode === company));
    const rois = priced.map((r) => r.result!.roi).filter((x): x is number => x != null);
    const best_roi = rois.length ? Math.max(...rois) : null, worst_roi = rois.length ? Math.min(...rois) : null;
    const sortValue: string | number | null = sort === 'name' ? p.name : sort === 'landed' ? c.landed : sort === 'best_roi' ? best_roi : sort === 'worst_roi' ? worst_roi
      : c.rows.find((x) => `roi_${x.channel}` === sort)?.result?.roi ?? null;
    return { ...p, c, priced, landed: c.landed, best_roi, sortValue };
  });
  // company: products with a platform sold by that company; platform: products priced on it
  if (company) rows = rows.filter((r) => r.priced.length > 0 || r.entries.some((e) => e.companyCode === company));
  if (platform) rows = rows.filter((r) => r.c.rows.some((x) => x.channel === platform && x.state === 'priced'));
  if (sp.q) { const q = sp.q.toLowerCase(); rows = rows.filter((r) => [r.name, r.asin, r.fnsku].some((x: string | null) => x?.toLowerCase().includes(q))); }
  rows = sortLines(rows, 'sortValue', dir);
  const below = rows.reduce((n, r) => n + r.priced.filter((x) => x.status.tone === 'red').length, 0);

  const skip = new Set((dismissed ?? []).map((d: any) => `${d.a_id}-${d.b_id}`));
  const matches = findMatches(products.map((p) => ({ id: p.id, name: p.name, asin: p.asin, channels: p.entries.map((e) => e.channel) })))
    .filter((m) => !skip.has(`${m.a}-${m.b}`));

  const qs = (over: Record<string, string>) => `/margins?${new URLSearchParams({ ...(company && { company }), ...(platform && { platform }), ...(sp.q && { q: sp.q }), sort, dir, ...over })}`;
  const head = (k: string, label = SORTS[k], cls = '') => (
    <th className={cls}><Link href={qs({ sort: k, dir: sort === k && dir === 'asc' ? 'desc' : 'asc' })} className="hover:underline">{label}{sort === k ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</Link></th>
  );
  const exportQs = new URLSearchParams({ ...(company && { company }), ...(platform && { platform }) });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Margins</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/margins/settings" className="btn-ghost border border-slate-300 dark:border-slate-700">Fees and ROI target</Link>
          <a href={`/margins/export?${exportQs}`} className="btn-ghost border border-slate-300 dark:border-slate-700">Export CSV</a>
          {isAdmin(me) && <Link href="/margins/new" className="btn">New line</Link>}
        </div>
      </div>

      {isAdmin(me) && matches.length > 0 && (
        <Link href="/margins/matches" className="block rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {matches.length} possible match{matches.length === 1 ? '' : 'es'}: lines that look like the same product on different platforms. Review and confirm each one →
        </Link>
      )}

      <form className="flex flex-wrap gap-2">
        <select name="company" defaultValue={company} className="input w-52">
          <option value="">All companies</option>
          {companies.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <select name="platform" defaultValue={platform} className="input w-44">
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
        </select>
        <input name="q" defaultValue={sp.q} placeholder="Product, ASIN or FNSKU" className="input max-w-xs" />
        <button className="btn">Show</button>
      </form>

      <p className="text-sm text-slate-500">
        {rows.length} product{rows.length === 1 ? '' : 's'} · ROI target {settings.roiTargetPct}%{below ? <> · <span className="text-red-600 dark:text-red-400">{below} platform price{below === 1 ? '' : 's'} below target</span></> : null}.
        {' '}One line per product; each platform cell shows price and ROI. ★ = best return. They do not change purchases, shipments or payments.
      </p>
      {error && <p className="text-red-600">{error.message}</p>}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr>
            {head('name')}{head('landed', 'Landed', 'num')}
            {PLATFORMS.map((p) => <Fragment key={p.code}>{head(`roi_${p.code}`, p.label, 'num')}</Fragment>)}
            {head('best_roi', 'Best ROI', 'num')}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/margins/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                  <div className="text-xs text-slate-500">{[r.asin, r.fnsku, r.owner].filter(Boolean).join(' · ')}</div>
                  <div className="text-xs text-slate-400">₹{Number(r.fx_rate).toFixed(2)}/£ · {fxLabel(r.fx_source, r.fx_rate_date)}</div>
                </td>
                <td className="num">{gbp(r.landed)}</td>
                {PLATFORMS.map((p) => {
                  const x = r.c.rows.find((y) => y.channel === p.code);
                  if (!x) return <td key={p.code} className="num text-xs text-slate-400">hidden</td>;
                  if (x.state !== 'priced') return <td key={p.code} className="num text-xs text-slate-400">Not priced</td>;
                  const dim = company && x.companyCode !== company;
                  return (
                    <td key={p.code} className={`num whitespace-nowrap ${x.status.tone === 'red' ? 'bg-red-50/60 dark:bg-red-950/20' : ''} ${dim ? 'opacity-50' : ''}`}>
                      <div>{gbp(x.price)}</div>
                      <div className={`font-medium ${tone[x.status.tone]}`}>{x.best ? '★ ' : ''}{pct(x.result!.roi)}</div>
                      <div className="text-xs text-slate-500">{x.companyCode}{x.feesNotSetUp ? ' · fees not set up' : ''}</div>
                    </td>
                  );
                })}
                <td className="num font-medium">{pct(r.best_roi)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="py-6 text-center text-slate-500">No lines yet.{isAdmin(me) ? ' Use “New line” to add one.' : ''}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
