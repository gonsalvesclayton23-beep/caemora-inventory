import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth';
import { referenceData } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { monthStart, UK_TZ } from '@/lib/tz';
import PackForm, { type PackLine } from './PackForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Put in a box' };

/** PUR-06: tick purchased lines (from any invoice) and put them, or part of them, in one box. */
export default async function PackPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await getProfile();
  if (me.role === 'viewer') redirect('/shipments');
  const supabase = await createClient();
  const { companies } = await referenceData();

  const { data: box } = sp.box
    ? await supabase.from('shipments').select('id, company_code, channel, box_no, amazon_shipment_id, status').eq('id', Number(sp.box)).maybeSingle()
    : { data: null };
  const company = sp.company ?? box?.company_code ?? '';

  // lines from the last 3 months for the chosen company (or an invoice search), with what is still to box
  let q = supabase.from('v_purchase_lines')
    .select('id, company_code, product_name, fnsku, invoice_no, invoice_date, qty, order_month:period_month')
    .eq('category', 'stock').order('invoice_date', { ascending: false, nullsFirst: false }).order('id').limit(500);
  if (company) q = q.eq('company_code', company);
  if (sp.invoice) q = q.ilike('invoice_no', `%${sp.invoice.replace(/[%,()"\\]/g, ' ').trim()}%`);
  else {
    const since = new Date(); since.setUTCMonth(since.getUTCMonth() - 2);
    q = q.gte('period_month', monthStart(since));
  }
  const { data: rows } = company || sp.invoice ? await q : { data: [] };
  const ids = (rows ?? []).map((r) => r.id);
  const { data: boxed } = ids.length ? await supabase.from('v_line_boxes').select('purchase_line_id, boxed_qty, summary').in('purchase_line_id', ids) : { data: [] };
  const lines: PackLine[] = (rows ?? []).map((r) => {
    const b = (boxed ?? []).find((x) => x.purchase_line_id === r.id);
    return { id: r.id, company: r.company_code, product: r.product_name, fnsku: r.fnsku, invoice: r.invoice_no, qty: r.qty,
             left: r.qty - (b?.boxed_qty ?? 0), summary: b?.summary ?? null };
  }).filter((l) => l.left > 0);

  const { data: openBoxes } = await supabase.from('shipments')
    .select('id, company_code, channel, box_no, amazon_shipment_id, tracking_no').eq('status', 'in_transit').order('id', { ascending: false }).limit(100);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: UK_TZ }).format(new Date());

  return (
    <div className="space-y-4">
      <Link href="/shipments" className="text-sm text-slate-500 hover:underline">← Shipments</Link>
      <h1 className="text-2xl font-semibold">Put in a box</h1>
      <p className="text-sm text-slate-500">Tick the lines going in the box and how many units of each. Lines can come from different invoices, and one line can be split across boxes.</p>

      <form className="flex flex-wrap items-end gap-2">
        {sp.box && <input type="hidden" name="box" value={sp.box} />}
        <label><span className="label">Company</span>
          <select name="company" defaultValue={company} className="input w-44">
            <option value="">Choose…</option>
            {companies.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </label>
        <label><span className="label">Invoice no. (optional), e.g. PE-131</span><input name="invoice" defaultValue={sp.invoice ?? ''} className="input w-48" /></label>
        <button className="btn">Show lines</button>
      </form>

      {!company && !sp.invoice
        ? <p className="text-sm text-slate-500">Choose a company to see its lines that are not yet fully in boxes.</p>
        : <PackForm lines={lines} company={company} companies={companies} openBoxes={openBoxes ?? []} preselectBox={box?.status === 'in_transit' ? box.id : null} today={today} />}
    </div>
  );
}
