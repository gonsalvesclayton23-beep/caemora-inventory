import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProfile, isAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { referenceData } from '@/lib/data';
import { LossForm } from '../LossForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Loss' };

const str = (v: unknown) => (v == null ? '' : String(Number(v)));

export default async function LossPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const me = await getProfile();
  const supabase = await createClient();
  const [{ companies }, { data: products }, { data: l }] = await Promise.all([
    referenceData(), supabase.from('products').select('id, name').eq('active', true).order('name').limit(10000),
    supabase.from('v_losses').select('*').eq('id', id).maybeSingle(),
  ]);
  if (!l) notFound();
  return (
    <div className="space-y-4">
      <Link href={`/losses?month=${l.month}`} className="text-sm text-slate-500 hover:underline">← Losses</Link>
      <h1 className="text-2xl font-semibold">Loss: {l.product_name}</h1>
      <p className="text-sm text-slate-500">Recorded by {l.recorded_by_name ?? '—'} on {new Date(l.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' })}. Every change is kept in the Audit log.</p>
      <LossForm lossId={l.id} canEdit={me.role !== 'viewer'} canDelete={isAdmin(me)} products={(products ?? []) as any[]} companies={companies}
        initial={{
          occurred_on: l.occurred_on, type: l.type, company_code: l.company_code, platform: l.platform ?? '', shipment_id: l.shipment_id,
          shipment_label: l.shipment_id ? (l.amazon_shipment_id ?? (l.box_no ? `Box ${l.box_no}` : `#${l.shipment_id}`)) : null,
          rows: [{ id: l.id, product_id: l.product_id, product_name: l.product_name, qty: String(l.qty), unit_cost_gbp: Number(l.unit_cost_gbp).toFixed(2),
            refund_gbp: str(l.refund_gbp), recovered_gbp: str(l.recovered_gbp), reference: l.reference ?? '', notes: l.notes ?? '' }],
        }} />
    </div>
  );
}
