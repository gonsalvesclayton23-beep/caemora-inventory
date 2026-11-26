import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getProfile, isAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { findMatches, fxLabel, gbp, platformLabel } from '@/lib/margin';
import { MatchForm } from '../forms';
import { load } from './load';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Possible matches' };

const money = (v: number, c: string) => (c === 'GBP' ? gbp(v) : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);

export default async function MatchesPage() {
  const me = await getProfile();
  if (!isAdmin(me)) redirect('/margins');
  const supabase = await createClient();
  const [{ products }, { data: dismissed }] = await Promise.all([load(), supabase.from('margin_match_dismissed').select('a_id, b_id')]);
  const skip = new Set((dismissed ?? []).map((d: any) => `${d.a_id}-${d.b_id}`));
  const byId = new Map(products.map((p) => [p.id, p]));
  const matches = findMatches(products.map((p) => ({ id: p.id, name: p.name, asin: p.asin, channels: p.rows.map((r: any) => r.channel) })))
    .filter((m) => !skip.has(`${m.a}-${m.b}`));

  const side = (p: any, a: number, b: number, checked: boolean) => (
    <label className={`block cursor-pointer rounded-lg border p-3 text-sm ${checked ? 'border-indigo-400' : 'border-slate-200 dark:border-slate-700'}`}>
      <div className="mb-1 flex items-center gap-2">
        <input type="radio" name="keep" value={p.id} defaultChecked={checked} />
        <span className="font-medium">{p.name}</span>
      </div>
      <div className="text-xs text-slate-500">{[p.asin, p.fnsku].filter(Boolean).join(' · ') || 'no ASIN'}</div>
      <div className="mt-2">Product {money(Number(p.product_cost), p.product_cost_currency)} + courier {money(Number(p.courier_cost), p.courier_currency)} at ₹{Number(p.fx_rate).toFixed(2)}/£</div>
      <div className="text-xs text-slate-500">{fxLabel(p.fx_source, p.fx_rate_date)}</div>
      <ul className="mt-2 text-xs">{p.rows.map((r: any) => (
        <li key={r.id}>{platformLabel(r.channel)} · {r.company_name} · {r.selling_price == null ? 'not priced' : gbp(Number(r.selling_price))}{r.hidden ? ' · hidden' : ''}</li>
      ))}</ul>
      <span className="sr-only">{a}-{b}</span>
    </label>
  );

  return (
    <div className="space-y-4">
      <Link href="/margins" className="text-sm text-slate-500 hover:underline">← Product margins</Link>
      <h1 className="text-2xl font-semibold">Possible matches</h1>
      <p className="text-sm text-slate-500">
        These lines have the same ASIN or the same name and are on different platforms. Nothing is merged until you confirm it.
        Confirming makes one line: every platform&apos;s price, fees and price history are kept; the product cost, courier and exchange rate come from the line you tick.
      </p>
      {matches.length === 0 && <p className="card text-sm text-slate-500">No possible matches. </p>}
      {matches.map((m) => {
        const a = byId.get(m.a)!, b = byId.get(m.b)!;
        // default: keep the Amazon line's costs
        const keep = b.rows.some((r: any) => r.channel === 'AMAZON') && !a.rows.some((r: any) => r.channel === 'AMAZON') ? b.id : a.id;
        return (
          <div key={`${m.a}-${m.b}`} className="card space-y-2">
            <div className="text-sm text-slate-500">Same {m.reason === 'asin' ? `ASIN (${a.asin})` : 'name'}. Keep the costs and rate of:</div>
            <MatchForm a={a.id} b={b.id} defaultKeep={keep}>
              <div className="grid gap-3 md:grid-cols-2">{side(a, m.a, m.b, keep === a.id)}{side(b, m.a, m.b, keep === b.id)}</div>
            </MatchForm>
          </div>
        );
      })}
    </div>
  );
}
