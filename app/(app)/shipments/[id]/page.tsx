import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { dateLabel, monthLabel } from '@/lib/format';
import ReceiveForm from './ReceiveForm';

export const dynamic = 'force-dynamic';

export default async function ShipmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  const me = await getProfile();
  const supabase = await createClient();
  const [{ data: s }, { data: lines }] = await Promise.all([
    supabase.from('shipments').select('*').eq('id', Number(id)).maybeSingle(),
    // PUR-06 AC2: the box's contents, each with its units, invoice number and company
    supabase.from('v_shipment_contents').select('id, purchase_line_id, product_name, invoice_no, company_code, qty, line_qty, defective_qty, short_qty, received_qty')
      .eq('shipment_id', Number(id)).order('invoice_no').order('id'),
  ]);
  if (!s) notFound();
  // receipt remarks live on the purchase line (as before)
  const lineIds = (lines ?? []).map((l) => l.purchase_line_id);
  const { data: remarks } = lineIds.length
    ? await supabase.from('purchase_lines').select('id, remarks').in('id', lineIds)
    : { data: [] };
  const contents = (lines ?? []).map((l) => ({ ...l, remarks: (remarks ?? []).find((r) => r.id === l.purchase_line_id)?.remarks ?? null }));

  return (
    <div className="space-y-4">
      <Link href="/shipments" className="text-sm text-slate-500 hover:underline">← Shipments</Link>
      <header>
        <h1 className="text-xl font-semibold">{s.amazon_shipment_id ?? (s.box_no ? `Box ${s.box_no}` : `Shipment #${s.id}`)}</h1>
        <p className="text-sm text-slate-500">
          {s.company_code} · {s.channel ?? ''} · {monthLabel(s.period_month)} · sent {dateLabel(s.created_on)}
          {s.uk_shipment_id && ` · ${s.uk_shipment_id}`}{s.import_ref && ` · imported`}
        </p>
      </header>
      {created && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Shipment created. Now add the purchases that are in it.</p>}
      {me.role !== 'viewer' && (
        <div className="flex flex-wrap gap-2">
          <Link href={`/purchases/new?shipment=${s.id}`} className="btn">+ Add purchase to this shipment</Link>
          {s.status === 'in_transit' && <Link href={`/shipments/pack?box=${s.id}`} className="btn-ghost border border-slate-300 dark:border-slate-700">+ Add lines already bought</Link>}
        </div>
      )}
      {!lines?.length && <p className="text-sm text-slate-500">No products in this shipment yet.</p>}
      <ReceiveForm shipment={s} contents={contents as any} canEdit={me.role !== 'viewer'} />
    </div>
  );
}
