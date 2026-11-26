import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getProfile, isAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { referenceData } from '@/lib/data';
import { monthLabel } from '@/lib/format';
import { LineForm, type LineValues } from '../LineForm';
import { marginSettings, todaysRate } from '../data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New margin line' };

export default async function NewMarginLine({ searchParams }: { searchParams: Promise<{ channel?: string; company?: string; product?: string; q?: string }> }) {
  const sp = await searchParams;
  const me = await getProfile();
  if (!isAdmin(me)) redirect('/margins');
  const channel = sp.channel === 'EBAY' ? 'EBAY' : 'AMAZON';
  const supabase = await createClient();
  const [{ companies }, { settings }, fx] = await Promise.all([referenceData(), marginSettings(), todaysRate()]);
  const companyCode = companies.some((c) => c.code === sp.company?.toUpperCase()) ? sp.company!.toUpperCase() : companies[0]?.code ?? 'CMR';

  // pick a product: fills the name, ASIN/FNSKU (that company's listing) and the latest purchase cost, which can be edited
  let product: any = null, last: any = null;
  if (sp.product) {
    const id = Number(sp.product);
    const [{ data: p }, { data: l }] = await Promise.all([
      supabase.from('products').select('id, name, listings(company_code, asin, fnsku)').eq('id', id).maybeSingle(),
      supabase.from('purchase_lines').select('unit_price, courier_per_unit, currency, period_month, invoice_date')
        .eq('product_id', id).not('unit_price', 'is', null).order('period_month', { ascending: false }).order('id', { ascending: false }).limit(1),
    ]);
    product = p; last = l?.[0] ?? null;
  }
  const { data: found } = sp.q && !product
    ? await supabase.from('products').select('id, name').eq('active', true).ilike('name', `%${sp.q.replace(/[%,()]/g, ' ').trim()}%`).order('name').limit(30)
    : { data: null };

  const listing = product?.listings?.find((x: any) => x.company_code === companyCode) ?? product?.listings?.[0];
  const cur = (c: string | undefined) => (c === 'GBP' ? 'GBP' : 'INR') as 'INR' | 'GBP';
  const initial: LineValues = {
    product_id: product?.id ?? null, channel, company_code: companyCode, name: product?.name ?? '',
    asin: listing?.asin ?? '', fnsku: listing?.fnsku ?? '', owner: me.full_name ?? '', notes: '', listing_status: 'listed',
    product_cost: last ? String(Number(last.unit_price)) : '', product_cost_currency: cur(last?.currency),
    courier_cost: last ? String(Number(last.courier_per_unit)) : '', courier_currency: cur(last?.currency),
    fx_rate: fx.rate ? String(fx.rate) : '', fx_rate_date: fx.date, fx_source: fx.source,
    referral_pct: '', fba_fee: '', promo_per_unit: '',
    local_shipping: channel === 'EBAY' ? String(settings.ebayLocalShipping) : '', misc_expense: channel === 'EBAY' ? String(settings.ebayMisc) : '', ad_pct: '',
    selling_price: '', tax_override_pct: '',
  };
  const costNote = last ? `From the latest purchase (${monthLabel(last.period_month)}); you can change it.` : product ? 'No purchase with a price yet; enter the cost.' : null;
  const base = { channel, company: companyCode };

  return (
    <div className="space-y-4">
      <Link href={`/margins?channel=${channel}`} className="text-sm text-slate-500 hover:underline">← Margins</Link>
      <h1 className="text-2xl font-semibold">New {channel === 'AMAZON' ? 'Amazon' : 'eBay'} line</h1>
      <div className="card space-y-2">
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="channel" value={channel} />
          <label><span className="label">Company</span>
            <select name="company" defaultValue={companyCode} className="input w-52">{companies.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
          </label>
          <label className="min-w-64 flex-1"><span className="label">Find a product (optional)</span><input name="q" defaultValue={sp.q} placeholder="Product name" className="input" /></label>
          <button className="btn">Find</button>
          {product && <Link href={`/margins/new?${new URLSearchParams(base)}`} className="btn-ghost">Clear product</Link>}
        </form>
        {found && (found.length
          ? <ul className="max-h-60 overflow-y-auto text-sm">{found.map((p: any) => (
              <li key={p.id}><Link href={`/margins/new?${new URLSearchParams({ ...base, product: String(p.id) })}`} className="block rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">{p.name}</Link></li>
            ))}</ul>
          : <p className="text-sm text-slate-500">No product matches. You can still type the line in below.</p>)}
        {product && <p className="text-sm">Using <span className="font-medium">{product.name}</span>.</p>}
      </div>
      <LineForm key={`${channel}-${companyCode}-${product?.id ?? ''}`} initial={initial} companies={companies} settings={settings} canEdit costNote={costNote} />
    </div>
  );
}
