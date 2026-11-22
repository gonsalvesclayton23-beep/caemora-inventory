'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { monthLabel } from '@/lib/format';
import { createShipment } from '../actions';

export default function NewShipmentForm({ companies, months, defaultMonth, today }: {
  companies: { code: string; name: string }[]; months: { month: string; status: string }[]; defaultMonth: string; today: string;
}) {
  const [state, action, pending] = useActionState(createShipment, null);
  const existingId = state?.status?.startsWith('existing:') ? state.status.slice('existing:'.length) : null;
  return (
    <form action={action} className="card grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label><span className="label">Company *</span>
        <select name="company_code" className="input" required defaultValue="">
          <option value="" disabled>Choose…</option>
          {companies.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </label>
      <label><span className="label">Month *</span>
        <select name="period_month" className="input" defaultValue={defaultMonth}>
          {months.map((m) => <option key={m.month} value={m.month}>{monthLabel(m.month)}{m.status === 'settled' ? ' (settled)' : ''}</option>)}
        </select>
      </label>
      <label><span className="label">Box no.</span><input name="box_no" className="input" placeholder="e.g. 3 or A" /></label>
      <label><span className="label">Amazon shipment ID</span><input name="amazon_shipment_id" className="input uppercase" placeholder="FBA15…" /></label>
      <label><span className="label">Tracking no.</span><input name="tracking_no" inputMode="numeric" className="input" /></label>
      <label><span className="label">Courier</span><input name="courier" className="input" /></label>
      <label><span className="label">Shipment date</span><input type="date" name="created_on" defaultValue={today} className="input" /></label>
      <label><span className="label">Channel</span>
        <select name="channel" className="input" defaultValue="">
          <option value="">Auto (FBA if Amazon ID given)</option>
          {['FBA', 'FBM', 'EBAY', 'ONBUY', 'SHOPIFY'].map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label className="sm:col-span-2"><span className="label">Notes</span><input name="notes" className="input" /></label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className="btn" disabled={pending}>{pending ? 'Creating…' : 'Create shipment'}</button>
        <Link href="/shipments" className="btn-ghost">Cancel</Link>
        {state?.error && (
          <span className="text-sm text-red-600">
            {state.error} {existingId && <Link href={`/shipments/${existingId}`} className="underline">Open it</Link>}
          </span>
        )}
      </div>
    </form>
  );
}
