import Link from 'next/link';
import { Filters } from '@/components/Filters';
import { referenceData } from '@/lib/data';
import { getProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { dateLabel, monthLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Shipments' };

const STATUS_LABEL: Record<string, string> = {
  in_transit: 'In transit', received: 'Received', received_partial: 'Received, short/defective', lost: 'Lost', cancelled: 'Cancelled',
};
const STATUS_STYLE: Record<string, string> = {
  in_transit: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  received: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  received_partial: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  lost: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  cancelled: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await getProfile();
  const { companies, periods } = await referenceData();
  const status = sp.status ?? 'in_transit';
  const supabase = await createClient();

  let q = supabase.from('shipments')
    .select('id, period_month, company_code, channel, box_no, amazon_shipment_id, tracking_no, created_on, created_at, status, received_on, purchase_lines:shipment_items(qty, short_qty, defective_qty)')
    .order('created_on', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).limit(300);
  if (status !== 'all') q = q.eq('status', status);
  if (sp.month) q = q.eq('period_month', sp.month);
  if (sp.company) q = q.eq('company_code', sp.company);
  if (sp.q) { const t = sp.q.replace(/[%,()"\\]/g, ' ').trim(); q = q.or(`amazon_shipment_id.ilike."%${t}%",tracking_no.ilike."%${t}%",box_no.ilike."${t}"`); }
  const { data: shipments, error } = await q;
  const today = Date.now();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Shipments</h1>
        {me.role !== 'viewer' && (
          <div className="flex gap-2">
            <Link href="/shipments/pack" className="btn-ghost border border-slate-300 dark:border-slate-700">Put in a box</Link>
            <Link href="/shipments/new" className="btn">+ New shipment</Link>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {['in_transit', 'received_partial', 'received', 'lost', 'all'].map((s) => (
          <Link key={s} href={`/shipments?${new URLSearchParams({ ...(sp as Record<string, string>), status: s })}`}
            className={`rounded-full border px-3 py-1 ${status === s ? 'border-indigo-600 text-indigo-600' : 'border-slate-300 dark:border-slate-700'}`}>
            {s === 'all' ? 'All' : STATUS_LABEL[s]}
          </Link>
        ))}
      </div>
      <Filters periods={periods} companies={companies} values={sp} search extra={<input type="hidden" name="status" value={status} />} />
      {error && <p className="text-red-600">{error.message}</p>}
      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {(shipments ?? []).map((s: any) => {
          const units = s.purchase_lines.reduce((t: number, l: any) => t + l.qty, 0);
          const missing = s.purchase_lines.reduce((t: number, l: any) => t + l.short_qty + l.defective_qty, 0);
          const since = s.created_on ?? s.created_at?.slice(0, 10);
          const days = since ? Math.floor((today - new Date(since).getTime()) / 86400000) : null;
          return (
            <li key={s.id}><Link href={`/shipments/${s.id}`} className="card block hover:border-indigo-400">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.amazon_shipment_id ?? (s.box_no ? `Box ${s.box_no}` : s.tracking_no ?? `Shipment #${s.id}`)}</div>
                  <div className="truncate text-xs text-slate-500">{s.company_code} · {s.channel ?? ''} · {s.tracking_no ?? 'no tracking'}</div>
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${STATUS_STYLE[s.status]}`}>{STATUS_LABEL[s.status]}</span>
              </div>
              <div className="mt-2 flex justify-between text-xs text-slate-500">
                <span>{s.purchase_lines.length} products · {units} units{missing ? ` · ${missing} short/defective` : ''}</span>
                <span>{s.status === 'in_transit' && days != null ? `${days} days` : s.received_on ? `received ${dateLabel(s.received_on)}` : monthLabel(s.period_month)}</span>
              </div>
            </Link></li>
          );
        })}
      </ul>
      {shipments?.length === 0 && <p className="text-sm text-slate-500">No shipments.</p>}
    </div>
  );
}
