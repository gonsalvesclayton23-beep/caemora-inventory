import Link from 'next/link';
import { getProfile, isAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { money, monthLabel } from '@/lib/format';
import { RateCardForm } from '../admin/forms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Products' };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; company?: string }> }) {
  const { q, company } = await searchParams;
  const me = await getProfile();
  const supabase = await createClient();
  let query = supabase.from('products')
    .select(`id, name, category, agreed_courier_per_unit, agreed_courier_currency, agreed_courier_from, notes, ${company ? 'listings!inner' : 'listings'}(company_code, channel, fnsku, asin)`)
    .eq('active', true).order('name').limit(400);
  if (q) query = query.ilike('name', `%${q.replace(/[%,()]/g, ' ').trim()}%`);
  if (company) query = query.eq('listings.company_code', company.toUpperCase());
  const { data: products, error } = await query;

  // last purchase of each product, for a quick price check
  const ids = (products ?? []).map((p: any) => p.id);
  const { data: recent } = ids.length
    ? await supabase.from('purchase_lines').select('product_id, unit_price, courier_per_unit, currency, period_month')
        .in('product_id', ids).order('period_month', { ascending: false }).order('id', { ascending: false }).limit(2000)
    : { data: [] };
  const last = new Map<number, any>();
  for (const r of recent ?? []) if (!last.has(r.product_id)) last.set(r.product_id, r);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Products</h1>
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search name…" className="input max-w-md" />
        <input name="company" defaultValue={company} placeholder="Company (e.g. ARC)" className="input w-40 uppercase" />
        <button className="btn">Search</button>
      </form>
      <p className="text-sm text-slate-500">The agreed courier rate is checked on every purchase from its “from” month. {isAdmin(me) ? 'Edit it in the right-hand column.' : 'Only an admin can change it.'}</p>
      {error && <p className="text-red-600">{error.message}</p>}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Product</th><th>Listings</th><th>Last bought</th><th className="num">Agreed courier / unit</th></tr></thead>
          <tbody>
            {(products ?? []).map((p: any) => {
              const l = last.get(p.id);
              return (
                <tr key={p.id}>
                  <td>
                    <Link href={`/landed-cost?q=${encodeURIComponent(p.name)}`} className="hover:underline">{p.name}</Link>
                    {p.category === 'consumable' && <span className="ml-2 text-xs text-slate-500">consumable</span>}
                    {p.notes && <div className="max-w-md truncate text-xs text-slate-400" title={p.notes}>{p.notes}</div>}
                  </td>
                  <td className="text-xs text-slate-500">
                    {p.listings.map((x: any) => <div key={`${x.company_code}${x.fnsku ?? x.channel}`}>{x.company_code} · {x.channel}{x.fnsku ? ` · ${x.fnsku}` : ''}</div>)}
                  </td>
                  <td className="whitespace-nowrap text-xs">{l ? <>{money(l.unit_price, l.currency)} + {money(l.courier_per_unit, l.currency)}<div className="text-slate-500">{monthLabel(l.period_month)}</div></> : '—'}</td>
                  <td className="num">
                    {isAdmin(me) ? <RateCardForm p={p} /> : <>{money(p.agreed_courier_per_unit, p.agreed_courier_currency)}{p.agreed_courier_from && <div className="text-xs text-slate-500">from {monthLabel(p.agreed_courier_from)}</div>}</>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
