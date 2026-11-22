'use client';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createProduct, savePurchase, searchProducts, type ProductHit, type PurchaseInput } from '../actions';
import { money } from '@/lib/format';

interface Props {
  companies: { code: string; name: string }[];
  vendors: { id: number; name: string; default_currency: 'INR' | 'GBP' }[];
  months: { month: string; status: string }[];
  defaultMonth: string;
  shipments: { id: number; company_code: string | null; label: string }[];
  thresholds: { priceChangePct: number; suspectInrBelow: number; rateTolerancePct: number };
  initialShipment?: { id: number; company_code: string | null };
}

interface Line {
  key: number;
  product: ProductHit;
  listingId: number | null;
  qty: string;
  unitPrice: string;
  courierPerUnit: string;
  remarks: string;
}

const n = (s: string) => (s.trim() === '' ? null : Number(s));

export function warningsFor(line: Line, currency: 'INR' | 'GBP', t: Props['thresholds']): string[] {
  const w: string[] = [];
  const price = n(line.unitPrice);
  const courier = n(line.courierPerUnit) ?? 0;
  const last = line.product.last && line.product.last.currency === currency ? line.product.last : null;
  if (price == null || price === 0) w.push('Price is blank');
  if (currency === 'INR' && price != null && price > 0 && price < t.suspectInrBelow) w.push(`₹${price} looks like a £ price`);
  if (last?.unit_price && price != null && Math.abs(price - last.unit_price) / last.unit_price * 100 > t.priceChangePct)
    w.push(`Price was ${money(last.unit_price, currency)} last time`);
  if (last && courier !== Number(last.courier_per_unit)) w.push(`Courier was ${money(last.courier_per_unit, currency)}/unit last time`);
  if (price != null && courier > price) w.push('Courier is more than the product price');
  const agreed = line.product.agreed_courier_per_unit;
  if (agreed != null && line.product.agreed_courier_currency === currency && courier > agreed * (1 + t.rateTolerancePct / 100))
    w.push(`Courier is above the agreed ${money(agreed, currency)}/unit`);
  return w;
}

export default function PurchaseForm(props: Props) {
  const { companies, vendors, months, shipments, thresholds } = props;
  const peace = vendors.find((v) => v.name === 'Peace Enterprises') ?? vendors[0];

  const [month, setMonth] = useState(props.defaultMonth);
  const [company, setCompany] = useState(props.initialShipment?.company_code ?? companies[0]?.code ?? '');
  const [vendorId, setVendorId] = useState<number>(peace?.id ?? 0);
  const [currency, setCurrency] = useState<'INR' | 'GBP'>(peace?.default_currency ?? 'INR');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [shipMode, setShipMode] = useState<'new' | 'existing' | 'none'>(props.initialShipment ? 'existing' : 'new');
  const [shipId, setShipId] = useState<number | ''>(props.initialShipment?.id ?? '');
  const [ship, setShip] = useState({ boxNo: '', amazonShipmentId: '', trackingNo: '', courier: '', createdOn: '' });
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const keyRef = useRef(1);

  const settled = months.find((m) => m.month === month)?.status === 'settled';
  const total = lines.reduce((s, l) => s + ((n(l.unitPrice) ?? 0) + (n(l.courierPerUnit) ?? 0)) * (n(l.qty) ?? 0), 0);
  const units = lines.reduce((s, l) => s + (n(l.qty) ?? 0), 0);

  function onVendor(id: number) {
    setVendorId(id);
    const v = vendors.find((x) => x.id === id);
    if (v) setCurrency(v.default_currency);
  }

  function addProduct(p: ProductHit) {
    const listing = p.listings.find((l) => l.company_code === company) ?? null;
    const sameCur = p.last && p.last.currency === currency ? p.last : null;
    const agreed = p.agreed_courier_per_unit != null && p.agreed_courier_currency === currency ? p.agreed_courier_per_unit : null;
    setLines((ls) => [...ls, {
      key: keyRef.current++, product: p, listingId: listing?.id ?? null, qty: '',
      unitPrice: sameCur?.unit_price != null ? String(Number(sameCur.unit_price)) : '',
      courierPerUnit: agreed != null ? String(Number(agreed)) : sameCur ? String(Number(sameCur.courier_per_unit)) : '',
      remarks: '',
    }]);
  }

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function submit() {
    setError(null);
    const input: PurchaseInput = {
      month, company, vendorId, currency, invoiceNo, invoiceDate,
      shipment: shipMode === 'new' ? { mode: 'new', ...ship } : shipMode === 'existing' && shipId ? { mode: 'existing', id: Number(shipId) } : { mode: 'none' },
      lines: lines.map((l) => ({
        productId: l.product.id, listingId: l.product.listings.find((x) => x.company_code === company)?.id ?? null,
        description: l.product.name, qty: n(l.qty) ?? 0, unitPrice: n(l.unitPrice), courierPerUnit: n(l.courierPerUnit) ?? 0, remarks: l.remarks,
      })),
    };
    start(async () => {
      const res = await savePurchase(input);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <section className="card grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Month">
          <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m.month} value={m.month}>{new Date(m.month + 'T00:00:00Z').toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}{m.status === 'settled' ? ' (settled)' : ''}</option>)}
          </select>
        </Field>
        <Field label="Company">
          <select className="input" value={company} onChange={(e) => setCompany(e.target.value)}>
            {companies.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Vendor">
          <select className="input" value={vendorId} onChange={(e) => onVendor(Number(e.target.value))}>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </Field>
        <Field label="Currency">
          <div className="flex gap-2">
            {(['INR', 'GBP'] as const).map((c) => (
              <button key={c} type="button" onClick={() => setCurrency(c)} className={`flex-1 rounded-lg border px-3 py-2 ${currency === c ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200' : 'border-slate-300 dark:border-slate-700'}`}>{c === 'INR' ? '₹ Rupees' : '£ Pounds'}</button>
            ))}
          </div>
        </Field>
        <Field label="Invoice no.">
          <input className="input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="e.g. PE-131" />
          {!invoiceNo.trim() && <p className="mt-1 text-xs text-amber-600">No invoice number: this will be flagged.</p>}
        </Field>
        <Field label="Invoice date"><input className="input" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></Field>
      </section>
      {settled && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">This month is settled. Only an admin can add to it.</p>}

      <section className="card space-y-3">
        <h2 className="font-medium">Shipment / box</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          {([['new', 'New shipment'], ['existing', 'Add to existing'], ['none', 'No shipment']] as const).map(([v, label]) => (
            <label key={v} className="flex items-center gap-1"><input type="radio" checked={shipMode === v} onChange={() => setShipMode(v)} /> {label}</label>
          ))}
        </div>
        {shipMode === 'new' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Box no."><input className="input" value={ship.boxNo} onChange={(e) => setShip({ ...ship, boxNo: e.target.value })} /></Field>
            <Field label="Amazon shipment ID"><input className="input uppercase" value={ship.amazonShipmentId} onChange={(e) => setShip({ ...ship, amazonShipmentId: e.target.value })} placeholder="FBA15…" /></Field>
            <Field label="Tracking no."><input className="input" inputMode="numeric" value={ship.trackingNo} onChange={(e) => setShip({ ...ship, trackingNo: e.target.value })} /></Field>
            <Field label="Courier"><input className="input" value={ship.courier} onChange={(e) => setShip({ ...ship, courier: e.target.value })} /></Field>
            <Field label="Shipment date"><input className="input" type="date" value={ship.createdOn} onChange={(e) => setShip({ ...ship, createdOn: e.target.value })} /></Field>
          </div>
        )}
        {shipMode === 'existing' && (
          <select className="input" value={shipId} onChange={(e) => setShipId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Choose an in-transit shipment…</option>
            {shipments.filter((s) => !s.company_code || s.company_code === company).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">Products</h2>
        <ProductSearch company={company} onPick={addProduct} />
        {lines.length === 0 && <p className="text-sm text-slate-500">Search above to add products.</p>}
        <ul className="space-y-3">
          {lines.map((l) => {
            const w = warningsFor(l, currency, thresholds);
            const listing = l.product.listings.find((x) => x.company_code === company);
            const lineTotal = ((n(l.unitPrice) ?? 0) + (n(l.courierPerUnit) ?? 0)) * (n(l.qty) ?? 0);
            return (
              <li key={l.key} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{l.product.name}</div>
                    <div className="text-xs text-slate-500">
                      {listing ? `${listing.channel}${listing.fnsku ? ` · ${listing.fnsku}` : ''}` : `No ${company} listing yet`}
                      {l.product.agreed_courier_per_unit != null && ` · agreed courier ${money(l.product.agreed_courier_per_unit, l.product.agreed_courier_currency)}`}
                    </div>
                  </div>
                  <button type="button" className="btn-ghost" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove">✕</button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Field label="Qty"><input className="input" inputMode="numeric" value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} /></Field>
                  <Field label={`Price/unit ${currency === 'INR' ? '₹' : '£'}`}><input className="input" inputMode="decimal" value={l.unitPrice} onChange={(e) => update(l.key, { unitPrice: e.target.value })} /></Field>
                  <Field label="Courier/unit"><input className="input" inputMode="decimal" value={l.courierPerUnit} onChange={(e) => update(l.key, { courierPerUnit: e.target.value })} /></Field>
                </div>
                <input className="input mt-2" placeholder="Remarks (optional)" value={l.remarks} onChange={(e) => update(l.key, { remarks: e.target.value })} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <ul className="space-y-0.5">{w.map((x) => <li key={x} className="text-amber-700 dark:text-amber-400">⚠ {x}</li>)}</ul>
                  <span className="tabular-nums text-slate-600 dark:text-slate-300">{money(lineTotal, currency)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="sticky bottom-16 z-10 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg md:bottom-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="text-sm">
          <div className="font-medium tabular-nums">{money(total, currency)}</div>
          <div className="text-slate-500">{lines.length} products · {units} units</div>
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-sm text-red-600">{error}</span>}
          <button className="btn" onClick={submit} disabled={pending || !lines.length}>{pending ? 'Saving…' : 'Save purchase'}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>;
}

function ProductSearch({ company, onPick }: { company: string; onPick: (p: ProductHit) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ fnsku: '', asin: '', channel: 'FBA' });
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => start(async () => setHits(await searchProducts(q))), 250);
    return () => clearTimeout(t);
  }, [q]);

  const sorted = useMemo(() => [...hits].sort((a, b) =>
    Number(b.listings.some((l) => l.company_code === company)) - Number(a.listings.some((l) => l.company_code === company))), [hits, company]);

  function pick(p: ProductHit) { onPick(p); setQ(''); setHits([]); }

  async function create() {
    setErr(null);
    const res = await createProduct({ name: q, company, ...draft });
    if (res.error) setErr(res.error);
    else if (res.product) { pick(res.product); setCreating(false); setDraft({ fnsku: '', asin: '', channel: 'FBA' }); }
  }

  return (
    <div className="space-y-2">
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product name, FNSKU or ASIN…" />
      {sorted.length > 0 && (
        <ul className="max-h-72 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {sorted.map((p) => {
            const l = p.listings.find((x) => x.company_code === company);
            return (
              <li key={p.id}>
                <button type="button" onClick={() => pick(p)} className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800">
                  <div className="text-sm">{p.name}</div>
                  <div className="text-xs text-slate-500">
                    {l ? `${company} · ${l.fnsku ?? l.channel}` : `not yet listed for ${company}`}
                    {p.last && ` · last ${money(p.last.unit_price, p.last.currency)} + ${money(p.last.courier_per_unit, p.last.currency)} courier`}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {q.trim().length >= 3 && !creating && (
        <button type="button" className="btn-ghost text-indigo-600" onClick={() => setCreating(true)}>+ Add “{q.trim()}” as a new product</button>
      )}
      {creating && (
        <div className="grid grid-cols-1 gap-2 rounded-lg border border-dashed border-slate-300 p-3 sm:grid-cols-4 dark:border-slate-700">
          <input className="input" placeholder="FNSKU (optional)" value={draft.fnsku} onChange={(e) => setDraft({ ...draft, fnsku: e.target.value })} />
          <input className="input" placeholder="ASIN (optional)" value={draft.asin} onChange={(e) => setDraft({ ...draft, asin: e.target.value })} />
          <select className="input" value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value })}>
            {['FBA', 'FBM', 'EBAY', 'ONBUY', 'SHOPIFY'].map((c) => <option key={c}>{c}</option>)}
          </select>
          <div className="flex gap-2"><button type="button" className="btn" onClick={create}>Add</button><button type="button" className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button></div>
          {err && <p className="text-sm text-red-600 sm:col-span-4">{err}</p>}
        </div>
      )}
    </div>
  );
}
