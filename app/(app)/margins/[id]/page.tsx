import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProfile, isAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { referenceData } from '@/lib/data';
import { gbp, longDate, type MarginLineRow } from '@/lib/margin';
import { LineForm, type LineValues } from '../LineForm';
import { CopyForm, DeleteForm, TodaysRateForm } from '../forms';
import { marginSettings, todaysRate } from '../data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Margin line' };

const str = (v: unknown) => (v == null ? '' : String(Number(v)));

export default async function MarginLinePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; copied?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await getProfile();
  const admin = isAdmin(me);
  const supabase = await createClient();
  const [{ companies }, { settings }, fx, { data }, { data: history }] = await Promise.all([
    referenceData(), marginSettings(), todaysRate(),
    supabase.from('v_margin_lines').select('*').eq('id', Number(id)).maybeSingle(),
    supabase.from('v_margin_price_history').select('*').eq('line_id', Number(id)).order('changed_at', { ascending: false }).limit(50),
  ]);
  if (!data) notFound();
  const r = data as MarginLineRow;
  const initial: LineValues = {
    id: r.id, product_id: r.product_id, channel: r.channel, company_code: r.company_code, name: r.name,
    asin: r.asin ?? '', fnsku: r.fnsku ?? '', owner: r.owner ?? '', notes: r.notes ?? '', listing_status: r.listing_status === 'not_listed' ? 'not_listed' : 'listed',
    product_cost: str(r.product_cost), product_cost_currency: r.product_cost_currency === 'GBP' ? 'GBP' : 'INR',
    courier_cost: str(r.courier_cost), courier_currency: r.courier_currency === 'GBP' ? 'GBP' : 'INR',
    fx_rate: str(r.fx_rate), fx_rate_date: r.fx_rate_date, fx_source: r.fx_source,
    referral_pct: str(r.referral_pct), fba_fee: str(r.fba_fee), promo_per_unit: str(r.promo_per_unit),
    local_shipping: str(r.local_shipping), misc_expense: str(r.misc_expense), ad_pct: str(r.ad_pct),
    selling_price: str(r.selling_price), tax_override_pct: str(r.tax_override_pct),
  };
  const newerRate = fx.source === 'daily' && fx.rate != null && (Number(r.fx_rate) !== fx.rate || r.fx_rate_date !== fx.date);

  return (
    <div className="space-y-4">
      <Link href={`/margins?channel=${r.channel}`} className="text-sm text-slate-500 hover:underline">← Margins</Link>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">{r.name}</h1>
        <span className="text-sm text-slate-500">{r.channel === 'AMAZON' ? 'Amazon' : 'eBay'} · {r.company_name}</span>
      </div>
      {sp.saved && <p className="text-sm text-emerald-600">Line created.</p>}
      {sp.copied && <p className="text-sm text-emerald-600">Copied. Costs and price are the same; tax uses {r.company_name}&apos;s rate.</p>}
      {!admin && <p className="text-sm text-slate-500">Only an admin can change margins.</p>}

      {/* key: after "Use today's rate" or a save the form starts again from what is saved */}
      <LineForm key={`${r.updated_at}`} initial={initial} companies={companies} settings={settings} canEdit={admin} />

      <div className="grid gap-4 lg:grid-cols-2">
        {admin && (
          <div className="card space-y-4">
            <div>
              <h2 className="mb-1 font-medium">Exchange rate</h2>
              <p className="mb-2 text-sm text-slate-500">This line keeps its rate (₹{Number(r.fx_rate).toFixed(2)}/£) until you change it. {newerRate ? `Today's rate is ₹${fx.rate!.toFixed(2)}/£ (${longDate(fx.date)}).` : ''}</p>
              <TodaysRateForm id={r.id} />
            </div>
            <div>
              <h2 className="mb-1 font-medium">Copy to another company</h2>
              <p className="mb-2 text-sm text-slate-500">Same costs and price; tax at that company&apos;s rate.</p>
              <CopyForm id={r.id} companies={companies.filter((c) => c.code !== r.company_code)} />
            </div>
            <div>
              <h2 className="mb-1 font-medium">Delete</h2>
              <DeleteForm id={r.id} />
            </div>
          </div>
        )}
        <div className="card">
          <h2 className="mb-2 font-medium">Price history</h2>
          {history?.length ? (
            <table className="table">
              <thead><tr><th>When</th><th>Who</th><th className="num">Old</th><th className="num">New</th></tr></thead>
              <tbody>{history.map((h: any) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap">{new Date(h.changed_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' })}</td>
                  <td>{h.changed_by_name ?? '—'}</td><td className="num">{gbp(Number(h.old_price))}</td><td className="num">{gbp(Number(h.new_price))}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p className="text-sm text-slate-500">The price has not been changed since the line was created.</p>}
        </div>
      </div>
    </div>
  );
}
