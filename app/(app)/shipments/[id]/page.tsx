import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProfile, isAdmin } from '@/lib/auth';
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
  // SHP-08: counts (who, when), shortage follow-up, the case for each line, and the count history
  const itemIds = (lines ?? []).map((l) => l.id);
  const [{ data: receipts }, { data: itemCases }, { data: history }] = itemIds.length ? await Promise.all([
    supabase.from('v_box_receipts').select('*').in('id', itemIds),
    supabase.from('v_cases').select('id, entity_id, status, assigned_name, rule').eq('entity_type', 'shipment_items').in('entity_id', itemIds).order('id', { ascending: false }),
    supabase.from('v_receipt_history').select('*').eq('shipment_id', Number(id)).order('at', { ascending: false }).limit(100),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const contents = (lines ?? []).map((l) => {
    const r = (receipts ?? []).find((x: any) => x.id === l.id) as any;
    const c = (itemCases ?? []).find((x: any) => x.entity_id === l.id) as any;
    return {
      ...l, remarks: (remarks ?? []).find((x) => x.id === l.purchase_line_id)?.remarks ?? null,
      counted_by_name: r?.counted_by_name ?? null, counted_at: r?.counted_at ?? null, amazon_case_id: r?.amazon_case_id ?? null,
      outcome: r?.outcome ?? null, outcome_gbp: r?.outcome_gbp == null ? null : Number(r.outcome_gbp),
      case_id: c?.id ?? null, case_status: c?.status ?? null, case_owner: c?.assigned_name ?? null,
    };
  });
  const names = new Map((lines ?? []).map((l) => [l.id, l.product_name]));

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
      <ReceiveForm shipment={s} contents={contents as any} canEdit={me.role !== 'viewer'} admin={isAdmin(me)} />
      {(history?.length ?? 0) > 0 && (
        <section className="card">
          <h2 className="mb-2 font-medium">Count history</h2>
          <ul className="space-y-1 text-sm">
            {history!.map((h: any) => (
              <li key={h.id}>
                <span className="text-slate-500">{new Date(h.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' })}</span>
                {' · '}{h.by_name ?? 'System'} · {names.get(h.item_id) ?? 'Product'}:
                {h.old_received !== h.new_received && <> received {h.old_received} → {h.new_received}</>}
                {h.old_defective !== h.new_defective && <> defective {h.old_defective} → {h.new_defective}</>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
