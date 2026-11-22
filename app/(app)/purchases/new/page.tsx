import { getSettings, referenceData } from '@/lib/data';
import { monthStart, UK_TZ } from '@/lib/time';
import { createClient } from '@/lib/supabase/server';
import PurchaseForm from './PurchaseForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New purchase' };

export default async function NewPurchasePage({ searchParams }: { searchParams: Promise<{ shipment?: string }> }) {
  const { shipment: shipmentParam } = await searchParams;
  const [{ companies, vendors, periods }, thresholds] = await Promise.all([referenceData(), getSettings()]);
  const supabase = await createClient();
  const { data: shipments } = await supabase.from('shipments')
    .select('id, company_code, box_no, amazon_shipment_id, tracking_no, created_on')
    .eq('status', 'in_transit').order('id', { ascending: false }).limit(100);
  // SHP-06 AC2: arriving from a shipment's page preselects it (even if it is no longer in transit)
  let chosen = shipmentParam ? (shipments ?? []).find((s) => String(s.id) === shipmentParam) : undefined;
  if (shipmentParam && !chosen) {
    const { data } = await supabase.from('shipments').select('id, company_code, box_no, amazon_shipment_id, tracking_no, created_on')
      .eq('id', Number(shipmentParam)).maybeSingle();
    if (data) { chosen = data; (shipments ?? []).unshift(data); }
  }

  // current month first, plus any open months; settled months are listed so admins can add to them
  const current = monthStart(new Date());
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: UK_TZ }).format(new Date());
  const months = periods.some((p) => p.month === current) ? periods : [{ month: current, status: 'open' as const }, ...periods];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">New purchase</h1>
      <PurchaseForm
        companies={companies}
        vendors={vendors}
        months={months}
        defaultMonth={current}
        today={today}
        thresholds={thresholds}
        initialShipment={chosen ? { id: chosen.id, company_code: chosen.company_code } : undefined}
        shipments={(shipments ?? []).map((s) => ({
          id: s.id, company_code: s.company_code,
          label: [s.company_code, s.amazon_shipment_id, s.box_no && `Box ${s.box_no}`, s.tracking_no].filter(Boolean).join(' · '),
        }))}
      />
    </div>
  );
}
