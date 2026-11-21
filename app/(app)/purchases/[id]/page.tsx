import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProfile, isAdmin } from '@/lib/auth';
import { referenceData } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { money, monthLabel, RULE_LABELS } from '@/lib/format';
import EditLineForm from './EditLineForm';

export const dynamic = 'force-dynamic';

export default async function LinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getProfile();
  const supabase = await createClient();
  const [{ data: line }, { companies, vendors, periods }, { data: flags }, { data: history }] = await Promise.all([
    supabase.from('v_purchase_lines').select('*').eq('id', Number(id)).maybeSingle(),
    referenceData(),
    supabase.from('flags').select('id, rule, severity, message, status').eq('entity_type', 'purchase_lines').eq('entity_id', Number(id)).neq('status', 'resolved'),
    supabase.from('audit_log').select('id, action, reason, changed_at, changed_by').eq('table_name', 'purchase_lines').eq('row_key', id).order('id', { ascending: false }).limit(20),
  ]);
  if (!line) notFound();
  const settled = periods.find((p) => p.month === line.period_month)?.status === 'settled';

  return (
    <div className="space-y-4">
      <Link href={`/purchases?month=${line.period_month}`} className="text-sm text-slate-500 hover:underline">← Purchases</Link>
      <header>
        <h1 className="text-xl font-semibold">{line.product_name}</h1>
        <p className="text-sm text-slate-500">
          {line.company_code} · {monthLabel(line.period_month)}{settled && ' · settled'} · {line.vendor_name}
          {line.fnsku && ` · ${line.fnsku}`}{line.import_ref && ` · imported from ${line.import_ref}`}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card"><div className="text-xs text-slate-500">Line total</div><div className="font-semibold tabular-nums">{money(line.line_total, line.currency)}</div></div>
        <div className="card"><div className="text-xs text-slate-500">Landed / unit</div><div className="font-semibold tabular-nums">{money(line.landed_per_unit_inr, 'INR')} · {money(line.landed_per_unit_gbp, 'GBP')}</div></div>
        <div className="card"><div className="text-xs text-slate-500">Per unit received</div><div className="font-semibold tabular-nums">{money(line.landed_per_received_unit, line.currency)}</div></div>
        <div className="card"><div className="text-xs text-slate-500">Shipment</div><div className="text-sm">{line.shipment_id ? <Link className="underline" href={`/shipments/${line.shipment_id}`}>{line.amazon_shipment_id ?? line.tracking_no ?? `#${line.shipment_id}`}</Link> : '—'} <span className="text-slate-500">{line.shipment_status?.replace('_', ' ')}</span></div></div>
      </section>

      {!!flags?.length && (
        <ul className="space-y-1">
          {flags.map((f) => <li key={f.id} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">⚠ {RULE_LABELS[f.rule] ?? f.rule}: {f.message}</li>)}
        </ul>
      )}

      <EditLineForm line={line} companies={companies} vendors={vendors} settled={settled} admin={isAdmin(me)} canEdit={me.role !== 'viewer'} />

      {isAdmin(me) && !!history?.length && (
        <section className="card">
          <h2 className="mb-2 font-medium">Change history</h2>
          <ul className="space-y-1 text-sm">
            {history.map((h) => <li key={h.id}>{new Date(h.changed_at).toLocaleString('en-GB')} · {h.action.toLowerCase()}{h.reason && ` · “${h.reason}”`}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
