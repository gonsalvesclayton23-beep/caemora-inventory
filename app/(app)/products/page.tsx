import { createClient } from '@/lib/supabase/server';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Products' };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from('products')
    .select('id, name, category, agreed_courier_per_unit, agreed_courier_currency, listings(company_code, channel, fnsku, asin)')
    .eq('active', true).order('name').limit(500);
  if (q) query = query.ilike('name', `%${q}%`);
  const { data: products, error } = await query;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Products</h1>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search name…" className="input max-w-md" />
        <button className="btn">Search</button>
      </form>
      {error && <p className="text-red-600">{error.message}</p>}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Product</th><th>Listings</th><th className="num">Agreed courier / unit</th></tr></thead>
          <tbody>
            {(products ?? []).map((p: any) => (
              <tr key={p.id}>
                <td>{p.name}{p.category === 'consumable' && <span className="ml-2 text-xs text-slate-500">consumable</span>}</td>
                <td className="text-xs text-slate-500">
                  {p.listings.map((l: any) => <div key={`${l.company_code}${l.fnsku ?? l.channel}`}>{l.company_code} · {l.channel}{l.fnsku ? ` · ${l.fnsku}` : ''}</div>)}
                </td>
                <td className="num">{money(p.agreed_courier_per_unit, p.agreed_courier_currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
