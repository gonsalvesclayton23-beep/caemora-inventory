import { createClient } from '@/lib/supabase/server';
import { LOSS_EXPORT_COLUMNS, LOSS_TYPES, platformName } from '@/lib/losses';

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** LOS-03: the month's losses (same filters as the screen) as CSV. */
export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const supabase = await createClient();
  let q = supabase.from('v_losses').select('*').order('occurred_on').order('id').limit(20000);
  if (/^\d{4}-\d{2}-01$/.test(sp.month ?? '')) q = q.eq('month', sp.month);
  if (sp.company) q = q.eq('company_code', sp.company.toUpperCase());
  if (sp.type) q = q.eq('type', sp.type);
  if (sp.platform) q = q.eq('platform', sp.platform);
  const { data, error } = await q;
  if (error) return new Response(error.message, { status: 400 });
  const lines = (data ?? []).map((l: any) => {
    const x: Record<string, unknown> = {
      date: l.occurred_on, month: String(l.month).slice(0, 7), type: LOSS_TYPES[l.type as keyof typeof LOSS_TYPES] ?? l.type, company: l.company_name,
      platform: l.platform ? platformName(l.platform) : '', product: l.product_name, qty: l.qty, unit_cost_gbp: Number(l.unit_cost_gbp).toFixed(2),
      goods_gbp: l.goods_gbp, refund_gbp: l.refund_gbp, recovered_gbp: l.recovered_gbp, net_loss_gbp: l.net_loss_gbp,
      shipment: l.amazon_shipment_id ?? (l.box_no ? `Box ${l.box_no}` : ''), reference: l.reference, notes: l.notes,
      recorded_by: l.recorded_by_name, recorded_at: l.created_at,
    };
    return LOSS_EXPORT_COLUMNS.map((c) => cell(x[c])).join(',');
  });
  const name = ['losses', sp.month?.slice(0, 7)].filter(Boolean).join('-');
  return new Response('﻿' + [LOSS_EXPORT_COLUMNS.join(','), ...lines].join('\n'), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}.csv"` },
  });
}
