import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { referenceData } from '@/lib/data';
import { UK_TZ } from '@/lib/tz';
import { LossForm, type LossValues } from '../LossForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Record a loss' };

const blankRow = { product_id: null, product_name: '', qty: '1', unit_cost_gbp: '', refund_gbp: '', recovered_gbp: '', reference: '', notes: '' };

/** LOS-01 / LOS-04: a new loss; with ?shipment=ID, one line per product of that lost box (loss_lines_for_shipment). */
export default async function NewLoss({ searchParams }: { searchParams: Promise<{ shipment?: string }> }) {
  const me = await getProfile();
  if (me.role === 'viewer') redirect('/losses');
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ companies }, { data: products }] = await Promise.all([
    referenceData(), supabase.from('products').select('id, name').eq('active', true).order('name').limit(10000),
  ]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: UK_TZ }).format(new Date());
  let initial: LossValues = { occurred_on: today, type: 'damaged_return', company_code: companies[0]?.code ?? 'CMR', platform: '', shipment_id: null, rows: [{ ...blankRow }] };

  if (sp.shipment) {
    const id = Number(sp.shipment);
    const [{ data: box }, { data: lines }] = await Promise.all([
      supabase.from('shipments').select('id, box_no, amazon_shipment_id, company_code, destination').eq('id', id).maybeSingle(),
      supabase.rpc('loss_lines_for_shipment', { p_shipment: id }),
    ]);
    if (box && lines?.length) {
      initial = {
        occurred_on: today, type: 'lost_in_transit', company_code: box.company_code ?? (lines as any[])[0].company_code,
        platform: box.destination === 'amazon' ? 'AMAZON' : '', shipment_id: box.id,
        shipment_label: box.amazon_shipment_id ?? (box.box_no ? `Box ${box.box_no}` : `#${box.id}`),
        rows: (lines as any[]).map((l) => ({
          product_id: l.product_id, product_name: l.product_name, qty: String(Math.max(l.qty - l.already_recorded, 0) || l.qty),
          unit_cost_gbp: l.unit_cost_gbp == null ? '' : Number(l.unit_cost_gbp).toFixed(2), refund_gbp: '', recovered_gbp: '',
          reference: box.amazon_shipment_id ?? '', notes: '', already: l.already_recorded,
        })),
      };
    }
  }
  return (
    <div className="space-y-4">
      <Link href="/losses" className="text-sm text-slate-500 hover:underline">← Losses</Link>
      <h1 className="text-2xl font-semibold">Record a loss</h1>
      <LossForm initial={initial} products={(products ?? []) as any[]} companies={companies} canEdit />
    </div>
  );
}
