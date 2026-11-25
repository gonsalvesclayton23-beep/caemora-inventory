'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { putInBox } from '../actions';

export interface PackLine { id: number; company: string; product: string; fnsku: string | null; invoice: string | null; qty: number; left: number; summary: string | null }
interface OpenBox { id: number; company_code: string | null; channel: string | null; box_no: string | null; amazon_shipment_id: string | null; tracking_no: string | null }

export default function PackForm({ lines, company, companies, openBoxes, preselectBox, today }: {
  lines: PackLine[]; company: string; companies: { code: string; name: string }[]; openBoxes: OpenBox[]; preselectBox: number | null; today: string;
}) {
  const router = useRouter();
  const [ticked, setTicked] = useState<Record<number, string>>({});
  const [mode, setMode] = useState<'new' | 'existing'>(preselectBox ? 'existing' : 'new');
  const [boxId, setBoxId] = useState<number | ''>(preselectBox ?? '');
  const [box, setBox] = useState({ company_code: company, box_no: '', amazon_shipment_id: '', tracking_no: '', courier: '', created_on: today, channel: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const chosen = lines.filter((l) => ticked[l.id] !== undefined);
  const units = chosen.reduce((t, l) => t + (Number(ticked[l.id]) || 0), 0);
  const allTicked = lines.length > 0 && chosen.length === lines.length;

  const toggle = (l: PackLine) => setTicked((t) => {
    const n = { ...t };
    if (n[l.id] !== undefined) delete n[l.id]; else n[l.id] = String(l.left);
    return n;
  });
  const toggleAll = () => setTicked(allTicked ? {} : Object.fromEntries(lines.map((l) => [l.id, String(l.left)])));

  function submit() {
    setError(null);
    start(async () => {
      const res = await putInBox({
        lines: chosen.map((l) => ({ lineId: l.id, qty: Number(ticked[l.id]) || 0 })),
        shipmentId: mode === 'existing' && boxId ? Number(boxId) : null,
        newBox: mode === 'new' ? box : null,
      });
      if (res.error) setError(res.error);
      else if (res.shipmentId) router.push(`/shipments/${res.shipmentId}`);
    });
  }

  return (
    <div className="space-y-4">
      <section className="card overflow-x-auto">
        <table className="table">
          <thead><tr>
            <th><input type="checkbox" checked={allTicked} onChange={toggleAll} aria-label="Tick all" /></th>
            <th>Product</th><th>Invoice</th><th>Co.</th><th className="num">Bought</th><th className="num">Not yet in a box</th><th className="num">Put in this box</th>
          </tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className={ticked[l.id] !== undefined ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''}>
                <td><input type="checkbox" checked={ticked[l.id] !== undefined} onChange={() => toggle(l)} aria-label={`Tick ${l.product}`} /></td>
                <td>{l.product}<div className="text-xs text-slate-500">{l.fnsku ?? ''}{l.summary ? ` · ${l.summary}` : ''}</div></td>
                <td>{l.invoice ?? '—'}</td>
                <td>{l.company}</td>
                <td className="num">{l.qty}</td>
                <td className="num">{l.left}</td>
                <td className="num">
                  {ticked[l.id] !== undefined && (
                    <input value={ticked[l.id]} onChange={(e) => setTicked({ ...ticked, [l.id]: e.target.value })} inputMode="numeric"
                      className="input w-20 text-right" aria-label={`Units of ${l.product} in this box`} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {lines.length === 0 && <p className="text-sm text-slate-500">Every line here is already in a box.</p>}
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">Which box?</h2>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1"><input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} /> New box</label>
          <label className="flex items-center gap-1"><input type="radio" checked={mode === 'existing'} onChange={() => setMode('existing')} /> A box already in transit</label>
        </div>
        {mode === 'new' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <label><span className="label">Company *</span>
              <select className="input" value={box.company_code} onChange={(e) => setBox({ ...box, company_code: e.target.value })}>
                <option value="">Choose…</option>
                {companies.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select></label>
            <label><span className="label">Box no., e.g. 3</span><input className="input" value={box.box_no} onChange={(e) => setBox({ ...box, box_no: e.target.value })} /></label>
            <label><span className="label">Amazon shipment ID, e.g. FBA15MRYZWHR</span><input className="input uppercase" value={box.amazon_shipment_id} onChange={(e) => setBox({ ...box, amazon_shipment_id: e.target.value })} /></label>
            <label><span className="label">Tracking no.</span><input className="input" value={box.tracking_no} onChange={(e) => setBox({ ...box, tracking_no: e.target.value })} /></label>
            <label><span className="label">Courier</span><input className="input" value={box.courier} onChange={(e) => setBox({ ...box, courier: e.target.value })} /></label>
            <label><span className="label">Date sent</span><input type="date" className="input" value={box.created_on} onChange={(e) => setBox({ ...box, created_on: e.target.value })} /></label>
            <label><span className="label">Going to</span>
              <select className="input" value={box.channel} onChange={(e) => setBox({ ...box, channel: e.target.value })}>
                <option value="">Amazon if an Amazon ID is given, else UK</option>
                <option value="FBA">Amazon (FBA): one company only</option>
                <option value="FBM">UK (FBM): companies can mix</option>
              </select></label>
          </div>
        ) : (
          <select className="input max-w-xl" value={boxId} onChange={(e) => setBoxId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Choose a box…</option>
            {openBoxes.map((b) => (
              <option key={b.id} value={b.id}>{[b.company_code, b.amazon_shipment_id, b.box_no && `Box ${b.box_no}`, b.tracking_no].filter(Boolean).join(' · ') || `Box #${b.id}`}</option>
            ))}
          </select>
        )}
      </section>

      <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900">
        <span className="text-sm">{chosen.length} lines ticked · {units.toLocaleString('en-GB')} units</span>
        <div className="flex items-center gap-3">
          {error && <span className="text-sm text-red-600">{error}</span>}
          <button className="btn" disabled={pending || chosen.length === 0} onClick={submit}>{pending ? 'Saving…' : 'Put in one box'}</button>
        </div>
      </div>
    </div>
  );
}
