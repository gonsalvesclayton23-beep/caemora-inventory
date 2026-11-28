'use client';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import {
  breakdown, compareProduct, currencyCheck, entryInput, fxLabel, gbp, pct, PLATFORMS, taxLabel, validateCosts, type Channel, type MarginSettings, type PlatformEntry, type ProductCosts,
} from '@/lib/margin';
import type { Result } from '@/lib/data';
import { saveMarginProduct } from './actions';
import type { PlatformValues, ProductValues } from './values';

const tone = { red: 'text-red-600 dark:text-red-400', green: 'text-emerald-600 dark:text-emerald-400', grey: 'text-slate-500' } as const;
const f = (s: string) => (s.trim() === '' ? null : Number(s));
const ghost = 'btn-ghost border border-slate-300 dark:border-slate-700';

type Company = { code: string; name: string; default_vat_pct: number };

export function ProductForm({ initial, companies, settings, canEdit, costNote }: {
  initial: ProductValues; companies: Company[]; settings: MarginSettings; canEdit: boolean; costNote?: string | null;
}) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [s, action, pending] = useActionState<Result | null, FormData>(saveMarginProduct, null);
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  useEffect(() => { if (s?.ok) setSaved(v); }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
  // MRG-05 AC2: warn before leaving with changes not saved
  useEffect(() => {
    if (!dirty || !canEdit) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, canEdit]);

  const setP = (k: keyof ProductValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((x) => ({ ...x, [k]: e.target.value }));
  const setPl = (ch: Channel, patch: Partial<PlatformValues>) =>
    setV((x) => ({ ...x, platforms: { ...x.platforms, [ch]: { ...x.platforms[ch], ...patch } } }));

  const costs: ProductCosts = {
    productCost: f(v.product_cost) ?? 0, productCostCurrency: v.product_cost_currency, courierCost: f(v.courier_cost) ?? 0,
    courierCurrency: v.courier_currency, fxRate: f(v.fx_rate) ?? 0,
  };
  const entries: PlatformEntry[] = PLATFORMS.map(({ code }) => {
    const p = v.platforms[code];
    const c = companies.find((x) => x.code === p.company_code);
    return {
      channel: code, companyCode: p.company_code, companyName: c?.name, companyVatPct: Number(c?.default_vat_pct ?? 0), ownTaxPct: f(p.tax_override_pct),
      sellingPrice: f(p.selling_price), hidden: p.hidden, referralPct: f(p.referral_pct), fbaFee: f(p.fba_fee), promoPerUnit: f(p.promo_per_unit),
      localShipping: f(p.local_shipping), miscExpense: f(p.misc_expense), adPct: f(p.ad_pct), categoryPct: f(p.category_fee_pct),
    };
  });
  const key = JSON.stringify([costs, entries]);
  const cmp = useMemo(() => compareProduct(costs, entries, settings), [key, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const fxTyped = v.fx_rate !== initial.fx_rate;

  // MRG-11: product and courier cost are required; a product cost that looks like the other currency asks first
  const formRef = useRef<HTMLFormElement>(null);
  const [costErrors, setCostErrors] = useState<Partial<Record<'product_cost' | 'courier_cost', string>>>({});
  const [kept, setKept] = useState<string | null>(initial.id ? `${initial.product_cost}|${initial.product_cost_currency}` : null);
  const warnKey = `${v.product_cost}|${v.product_cost_currency}`;
  const warn = currencyCheck(f(v.product_cost), v.product_cost_currency, settings);
  const needsAnswer = !!warn && kept !== warnKey;
  const onSubmit = (ev: React.FormEvent<HTMLFormElement>) => {
    const errs = validateCosts(v);
    setCostErrors(errs);
    if (Object.keys(errs).length || needsAnswer) ev.preventDefault();
  };
  const payload = JSON.stringify({ ...v, fx_source: fxTyped ? null : v.fx_source });

  const num = (ch: Channel, k: keyof PlatformValues, label: string) => (
    <label><span className="label text-xs">{label}</span>
      <input value={String(v.platforms[ch][k] ?? '')} onChange={(e) => setPl(ch, { [k]: e.target.value })} inputMode="decimal" className="input text-right tabular-nums" disabled={!canEdit} />
    </label>
  );
  const cur = (k: 'product_cost_currency' | 'courier_currency') => (
    <select value={v[k]} onChange={setP(k)} className="input w-20" disabled={!canEdit} aria-label="Currency">
      <option value="INR">₹</option><option value="GBP">£</option>
    </select>
  );

  const renderBox = ({ code, label }: { code: Channel; label: string }, inCard: boolean) => {
          const p = v.platforms[code];
          const r = cmp.rows.find((x) => x.channel === code)!;
          const e = entries.find((x) => x.channel === code)!;
          return (
            <div key={code} className={`${inCard ? 'card ' : 'rounded-lg border border-slate-200 p-3 dark:border-slate-800 '}space-y-3`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium">{label}</h3>
                {canEdit && <button type="button" className="text-xs text-slate-500 underline" onClick={() => setPl(code, { hidden: true })}>Not sold here: hide</button>}
              </div>
              {r.feesNotSetUp && <p className="text-xs text-amber-600 dark:text-amber-400">Fees not set up: {label}&apos;s fees are all 0 until an admin enters them under “Fees and ROI target”.</p>}
              <div className="grid grid-cols-2 gap-2">
                <label className="col-span-2"><span className="label text-xs">Company (sets the tax)</span>
                  <select value={p.company_code} onChange={(ev) => setPl(code, { company_code: ev.target.value })} className="input" disabled={!canEdit}>
                    {companies.map((c) => <option key={c.code} value={c.code}>{c.name} ({Number(c.default_vat_pct)}%)</option>)}
                  </select>
                </label>
                {num(code, 'selling_price', 'Selling price (£)')}
                <div><span className="label text-xs">Own tax rate (%)</span>
                  <input value={p.tax_override_pct} onChange={(ev) => setPl(code, { tax_override_pct: ev.target.value })} placeholder="company rate" inputMode="decimal" className="input" disabled={!canEdit} />
                </div>
                <div className="col-span-2 flex items-center justify-between text-xs text-slate-500">
                  <span>{taxLabel(e)}</span>
                  {canEdit && p.tax_override_pct !== '' && <button type="button" className="underline" onClick={() => setPl(code, { tax_override_pct: '' })}>Use company rate</button>}
                </div>
                {code === 'AMAZON' && <>
                  {num(code, 'referral_pct', 'Referral fee %')}
                  {num(code, 'fba_fee', 'FBA fee (£ per unit)')}
                  {num(code, 'misc_expense', 'Miscellaneous (£ per order)')}
                  {num(code, 'promo_per_unit', 'Ads (£ per unit)')}
                </>}
                {code === 'AMAZON_FBM' && <>
                  {num(code, 'referral_pct', 'Referral fee %')}
                  {num(code, 'local_shipping', 'Local courier (£ per order)')}
                  {num(code, 'misc_expense', 'Miscellaneous (£ per order)')}
                  {num(code, 'promo_per_unit', 'Ads (£ per unit)')}
                </>}
                {code === 'EBAY' && num(code, 'category_fee_pct', 'Category fee %')}
                {code !== 'AMAZON' && code !== 'AMAZON_FBM' && <>
                  {num(code, 'local_shipping', code === 'EBAY' ? 'Local shipping (£)' : 'Shipping (£)')}
                  {num(code, 'misc_expense', 'Miscellaneous (£)')}
                  {num(code, 'ad_pct', 'Ads %')}
                </>}
                <label><span className="label text-xs">Listing</span>
                  <select value={p.listing_status} onChange={(ev) => setPl(code, { listing_status: ev.target.value as PlatformValues['listing_status'] })} className="input" disabled={!canEdit}>
                    <option value="listed">Listed</option><option value="not_listed">Not listed</option>
                  </select>
                </label>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800/50">
                <span className="text-slate-500">Lowest price for {settings.roiTargetPct}% ROI: </span>
                {r.lowest == null ? <span className="font-medium">Target not reachable</span> : <>
                  <span className="font-semibold">{gbp(r.lowest)}</span>
                  {canEdit && <button type="button" className="ml-2 underline" onClick={() => setPl(code, { selling_price: r.lowest!.toFixed(2) })}>Use this price</button>}
                </>}
              </div>
              {/* MRG-12: every fee as £ (with its %), VAT on its own line, figures lined up */}
              {r.state === 'priced' && (
                <table className="w-full text-sm">
                  <tbody>
                    <tr><td className="py-0.5 text-slate-500">Landed cost</td><td></td><td className="py-0.5 text-right tabular-nums">{gbp(cmp.landed)}</td></tr>
                    {breakdown(entryInput(costs, e), settings).map((l, li) => (
                      <tr key={li}>
                        <td className={`py-0.5 ${l.label.startsWith('VAT on') ? 'pl-3 text-slate-500' : ''}`}>{l.label}</td>
                        <td className="py-0.5 pr-2 text-right tabular-nums text-slate-500">{l.pct != null ? `${Number(l.pct.toFixed(3))}%` : ''}</td>
                        <td className="py-0.5 text-right tabular-nums">{gbp(l.amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-200 font-medium dark:border-slate-700"><td className="py-0.5">Final cost</td><td></td><td className="py-0.5 text-right tabular-nums">{gbp(r.result!.finalCost)}</td></tr>
                    <tr className="font-medium"><td className="py-0.5">Profit</td><td></td><td className={`py-0.5 text-right tabular-nums ${r.result!.profit < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{gbp(r.result!.profit)}</td></tr>
                  </tbody>
                </table>
              )}
            </div>
          );
  };

  return (
    <form ref={formRef} action={action} onSubmit={onSubmit} noValidate className="space-y-4">
      <input type="hidden" name="payload" value={payload} />

      {/* entered once per product (MRG-09) */}
      <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="sm:col-span-2"><span className="label">Product</span><input value={v.name} onChange={setP('name')} className="input" disabled={!canEdit} /></label>
        <label><span className="label">ASIN</span><input value={v.asin} onChange={setP('asin')} className="input" disabled={!canEdit} /></label>
        <label><span className="label">FNSKU</span><input value={v.fnsku} onChange={setP('fnsku')} className="input" disabled={!canEdit} /></label>
        <div><span className="label">Product cost</span>
          <div className="flex gap-2"><input value={v.product_cost} onChange={setP('product_cost')} inputMode="decimal" required aria-invalid={!!costErrors.product_cost} className={`input text-right tabular-nums ${costErrors.product_cost ? 'border-red-500' : ''}`} disabled={!canEdit} />{cur('product_cost_currency')}</div>
          {costErrors.product_cost && <span className="text-xs text-red-600">{costErrors.product_cost}</span>}
          {costNote && <span className="block text-xs text-slate-500">{costNote}</span>}
          {warn && canEdit && kept !== warnKey && (
            <div role="alert" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <p>{warn.message}</p>
              <div className="mt-1 flex gap-2">
                <button type="button" className={ghost} onClick={() => setV((x) => ({ ...x, product_cost_currency: warn.switchTo }))}>{warn.change}</button>
                <button type="button" className={ghost} onClick={() => { setKept(warnKey); setTimeout(() => formRef.current?.requestSubmit(), 0); }}>{warn.keep}</button>
              </div>
            </div>
          )}
        </div>
        <div><span className="label">Courier cost</span>
          <div className="flex gap-2"><input value={v.courier_cost} onChange={setP('courier_cost')} inputMode="decimal" required aria-invalid={!!costErrors.courier_cost} className={`input text-right tabular-nums ${costErrors.courier_cost ? 'border-red-500' : ''}`} disabled={!canEdit} />{cur('courier_currency')}</div>
          {costErrors.courier_cost && <span className="text-xs text-red-600">{costErrors.courier_cost}</span>}
        </div>
        <label><span className="label">Exchange rate (₹ per £)</span>
          <input value={v.fx_rate} onChange={setP('fx_rate')} inputMode="decimal" className="input" disabled={!canEdit} />
          <span className="text-xs text-slate-500">{fxTyped ? 'Entered by hand (saved with today\'s date)' : fxLabel(v.fx_source, v.fx_rate_date)}</span>
        </label>
        <div><span className="label">Landed cost</span><div className="py-2 text-lg font-semibold">{gbp(cmp.landed)}</div>
          <span className="text-xs text-slate-500">Used by every platform</span></div>
        <label><span className="label">Owner</span><input value={v.owner} onChange={setP('owner')} className="input" disabled={!canEdit} /></label>
        <label className="sm:col-span-2 lg:col-span-3"><span className="label">Notes</span><input value={v.notes} onChange={setP('notes')} className="input" disabled={!canEdit} /></label>
      </div>

      {/* MRG-09 AC2/AC3: the comparison */}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr>
            <th>Platform</th><th>Company</th><th className="num">Price</th><th className="num">Fees</th><th className="num">Shipping &amp; misc</th>
            <th className="num">Tax</th><th className="num">Final cost</th><th className="num">Profit</th><th className="num">ROI</th><th></th>
          </tr></thead>
          <tbody>
            {cmp.rows.map((r) => (
              <tr key={r.channel} className={r.status.tone === 'red' ? 'bg-red-50/60 dark:bg-red-950/20' : ''}>
                <td className="font-medium">{r.label}</td>
                <td className="whitespace-nowrap">{r.state === 'priced' ? r.companyName : '—'}</td>
                {r.state === 'priced' ? <>
                  <td className="num">{gbp(r.price)}</td><td className="num">{gbp(r.fees)}</td><td className="num">{gbp(r.shippingMisc)}</td>
                  <td className="num">{gbp(r.result!.tax)}</td><td className="num">{gbp(r.result!.finalCost)}</td>
                  <td className={`num ${r.result!.profit < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{gbp(r.result!.profit)}</td>
                  <td className={`num font-semibold ${tone[r.status.tone]}`}>{pct(r.result!.roi)}</td>
                </> : <td colSpan={7} className="text-slate-500">Not priced</td>}
                <td className="whitespace-nowrap text-xs">
                  {r.best && <span className="mr-1 rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Best return</span>}
                  {r.state === 'priced' && r.status.tone === 'red' && <span className="mr-1 font-medium text-red-600 dark:text-red-400">Below target</span>}
                  {r.feesNotSetUp && <span className="text-amber-600 dark:text-amber-400">Fees not set up</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">ROI target {settings.roiTargetPct}%. ROI = profit ÷ landed cost.</p>
      </div>

      {/* entered per platform */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(() => {
          // MRG-14: Amazon FBA and FBM sit together in one "Amazon" section
          const visible = PLATFORMS.filter(({ code }) => !v.platforms[code].hidden);
          const groups = [...new Set(visible.map((x) => x.group))].map((g) => ({ g, items: visible.filter((x) => x.group === g) }));
          return groups.map(({ g, items }) => items.length > 1
            ? <section key={g} className="card space-y-3 md:col-span-2"><h3 className="font-semibold">{g}</h3>
                <div className="grid gap-3 md:grid-cols-2">{items.map((x) => renderBox(x, false))}</div></section>
            : renderBox(items[0], true));
        })()}
      </div>

      {cmp.hidden.length > 0 && (
        <p className="text-sm text-slate-500">
          Hidden (not sold on): {cmp.hidden.map((code) => (
            <span key={code} className="mr-3">{PLATFORMS.find((x) => x.code === code)!.label}
              {canEdit && <button type="button" className="ml-1 underline" onClick={() => setPl(code, { hidden: false })}>show</button>}</span>
          ))}
        </p>
      )}

      {canEdit && (
        <div className="sticky bottom-16 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm md:bottom-4 dark:border-slate-800 dark:bg-slate-900/95">
          <button className="btn" disabled={pending}>{pending ? 'Saving…' : v.id ? 'Save' : 'Create line'}</button>
          {dirty && <span className="text-sm font-medium text-amber-600 dark:text-amber-400">Not saved</span>}
          {s?.error && <span className="text-sm text-red-600">{s.error}</span>}
          {s?.ok && !dirty && <span className="text-sm text-emerald-600">{s.status ?? 'Saved.'}</span>}
          <button type="button" className={`${ghost} ml-auto`} disabled={!dirty} onClick={() => setV(saved)}>Undo changes</button>
        </div>
      )}
    </form>
  );
}
