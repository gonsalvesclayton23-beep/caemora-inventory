import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProfile, isAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { referenceData } from '@/lib/data';
import { gbp, longDate, platformLabel } from '@/lib/margin';
import { ProductForm } from '../ProductForm';
import { DeleteForm, TodaysRateForm } from '../forms';
import { marginSettings, productValues, todaysRate } from '../data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Margin line' };

export default async function MarginProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const me = await getProfile();
  const admin = isAdmin(me);
  const supabase = await createClient();
  const [{ companies }, { settings }, fx, { data: p }, { data: lines }, { data: history }] = await Promise.all([
    referenceData(), marginSettings(), todaysRate(),
    supabase.from('margin_products').select('*').eq('id', id).maybeSingle(),
    supabase.from('margin_lines').select('*').eq('margin_product_id', id),
    supabase.from('v_margin_price_history').select('*').eq('margin_product_id', id).order('changed_at', { ascending: false }).limit(100),
  ]);
  if (!p) notFound();
  const initial = productValues(p, lines ?? [], settings, companies[0]?.code ?? 'CMR');
  const stamp = [p.updated_at, ...(lines ?? []).map((l: any) => l.updated_at)].join('|');
  const newerRate = fx.source === 'daily' && fx.rate != null && (Number(p.fx_rate) !== fx.rate || p.fx_rate_date !== fx.date);

  return (
    <div className="space-y-4">
      <Link href="/margins" className="text-sm text-slate-500 hover:underline">← Margins</Link>
      <h1 className="text-2xl font-semibold">{p.name}</h1>
      {sp.saved && <p className="text-sm text-emerald-600">Line created.</p>}
      {!admin && <p className="text-sm text-slate-500">Only an admin can change margins.</p>}

      {/* key: after a save or "Use today's rate" the form starts again from what is saved */}
      <ProductForm key={stamp} initial={initial} companies={companies} settings={settings} canEdit={admin} />

      <div className="grid gap-4 lg:grid-cols-2">
        {admin && (
          <div className="card space-y-4">
            <div>
              <h2 className="mb-1 font-medium">Exchange rate</h2>
              <p className="mb-2 text-sm text-slate-500">This line keeps its rate (₹{Number(p.fx_rate).toFixed(2)}/£) for every platform until you change it. {newerRate ? `Today's rate is ₹${fx.rate!.toFixed(2)}/£ (${longDate(fx.date)}).` : ''}</p>
              <TodaysRateForm id={p.id} />
            </div>
            <div>
              <h2 className="mb-1 font-medium">Delete</h2>
              <DeleteForm id={p.id} />
            </div>
          </div>
        )}
        <div className="card">
          <h2 className="mb-2 font-medium">Price history</h2>
          {history?.length ? (
            <table className="table">
              <thead><tr><th>When</th><th>Platform</th><th>Who</th><th className="num">Old</th><th className="num">New</th></tr></thead>
              <tbody>{history.map((h: any) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap">{new Date(h.changed_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' })}</td>
                  <td>{platformLabel(h.channel)}</td><td>{h.changed_by_name ?? '—'}</td>
                  <td className="num">{h.old_price == null ? '—' : gbp(Number(h.old_price))}</td><td className="num">{h.new_price == null ? '—' : gbp(Number(h.new_price))}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p className="text-sm text-slate-500">No price has been changed since the line was created.</p>}
        </div>
      </div>
    </div>
  );
}
