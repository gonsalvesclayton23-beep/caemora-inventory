'use client';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import {
  breakdown, compareProduct, currencyCheck, entryInput, fxLabel, gbp, pct, PLATFORMS, taxLabel, validateCosts, type Channel, type MarginSettings, type PlatformEntry, type ProductCosts,
} from '@/lib/margin';
import type { Result } from '@/lib/data';
import { checkMarginDuplicate, saveMarginProduct } from './actions';
import type { PlatformValues, ProductValues } from './values';
import { displayState, nudgePrice, receiptLines, roundTo99 } from '@/lib/calculator';

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
  // MRG-19: a line that already exists (same name, ASIN or FNSKU) is shown, and not saved twice
  const [dup, setDup] = useState<Awaited<ReturnType<typeof checkMarginDuplicate>> | null>(null);
  const renamed = !v.id || v.name !== initial.name || v.asin !== initial.asin || v.fnsku !== initial.fnsku;
  useEffect(() => {
    if (!canEdit || !renamed) { setDup(null); return; }
    const t = setTimeout(async () => setDup(await checkMarginDuplicate({ name: v.name, asin: v.asin, fnsku: v.fnsku, id: v.id ?? null })), 300);
    return () => clearTimeout(t);
  }, [v.name, v.asin, v.fnsku, v.id, canEdit, renamed]);
  const onSubmit = (ev: React.FormEvent<HTMLFormElement>) => {
    const errs = validateCosts(v);
    setCostErrors(errs);
    if (Object.keys(errs).length || needsAnswer || dup?.exact) ev.preventDefault();
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

  // MRG-22: the margin line as a calculator: platform tabs, a display, keys, quick price buttons and a receipt
  const visible = PLATFORMS.filter(({ code }) => !v.platforms[code].hidden);
  const [tab, setTab] = useState<Channel>(visible[0]?.code ?? 'AMAZON');
  const active = visible.find((x) => x.code === tab) ?? visible[0];
  const calcKey = (code: Channel, k: keyof PlatformValues, label: string, big = false) => (
    <label key={`${code}${String(k)}`} className={`calc-key ${big ? 'price col-span-3' : ''}`}><span className="l">{label}</span>
      <input value={String(v.platforms[code][k] ?? '')} onChange={(e) => setPl(code, { [k]: e.target.value })} inputMode="decimal" disabled={!canEdit} />
    </label>
  );
  const renderCalculator = () => {
    if (!active) return <p className="card text-sm text-slate-500">Every platform is hidden. Show one below.</p>;
    const code = active.code;
    const p = v.platforms[code];
    const r = cmp.rows.find((x) => x.channel === code)!;
    const e = entries.find((x) => x.channel === code)!;
    const d = displayState(r, cmp.landed);
    const receipt = r.state === 'priced' ? receiptLines(costs, e, settings) : [];
    return (
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
        <div className="calc space-y-4">
          <div className="flex items-center justify-between text-[11px] tracking-[.18em] text-slate-500">
            <span>CIMS · MARGIN CALCULATOR</span><span className="tabular-nums">{v.cae_code ?? 'NEW LINE'}</span>
          </div>
          <div role="tablist" aria-label="Platform" className="flex flex-wrap gap-1.5">
            {visible.map((x) => (
              <button key={x.code} type="button" role="tab" aria-selected={x.code === code} className="calc-tab" onClick={() => setTab(x.code)}>{x.label}</button>
            ))}
          </div>
          <div className={`calc-lcd ${d.tone === 'red' ? 'is-red' : ''}`} aria-live="polite">
            <div className="flex justify-between gap-2 text-xs opacity-80"><span>PROFIT PER UNIT</span><span>LANDED {d.landed} · FINAL {d.final}</span></div>
            <div className="big tabular-nums">{d.profit}</div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xl tabular-nums">{d.roi}</span>
              <span className="rounded-full bg-black/30 px-2 py-0.5 font-sans text-xs">{d.status}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {calcKey(code, 'selling_price', 'Selling price (£)', true)}
            {code === 'AMAZON' && <>{calcKey(code, 'referral_pct', 'Referral fee %')}{calcKey(code, 'fba_fee', 'FBA fee £')}{calcKey(code, 'promo_per_unit', 'Ads £/unit')}{calcKey(code, 'misc_expense', 'Miscellaneous £')}</>}
            {code === 'AMAZON_FBM' && <>{calcKey(code, 'referral_pct', 'Referral fee %')}{calcKey(code, 'local_shipping', 'Local courier £')}{calcKey(code, 'promo_per_unit', 'Ads £/unit')}{calcKey(code, 'misc_expense', 'Miscellaneous £')}</>}
            {code === 'EBAY' && calcKey(code, 'category_fee_pct', 'Category fee %')}
            {code !== 'AMAZON' && code !== 'AMAZON_FBM' && <>{calcKey(code, 'ad_pct', 'Ads %')}{calcKey(code, 'local_shipping', code === 'EBAY' ? 'Local shipping £' : 'Shipping £')}{calcKey(code, 'misc_expense', 'Miscellaneous £')}</>}
            <label className="calc-key" title={taxLabel(e)}><span className="l">{p.tax_override_pct === '' ? 'Tax % (company)' : 'Own tax %'}</span>
              <input value={p.tax_override_pct} onChange={(ev) => setPl(code, { tax_override_pct: ev.target.value })} placeholder={String(Number(companies.find((c) => c.code === p.company_code)?.default_vat_pct ?? 0))} inputMode="decimal" disabled={!canEdit} />
            </label>
            <label className="calc-key"><span className="l">Company</span>
              <select value={p.company_code} onChange={(ev) => setPl(code, { company_code: ev.target.value })} disabled={!canEdit}>
                {companies.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </label>
            <label className="calc-key"><span className="l">Listing</span>
              <select value={p.listing_status} onChange={(ev) => setPl(code, { listing_status: ev.target.value as PlatformValues['listing_status'] })} disabled={!canEdit}>
                <option value="listed">Listed</option><option value="not_listed">Not listed</option>
              </select>
            </label>
          </div>
          {canEdit && (
            <div className="calc-ops grid grid-cols-4 gap-2.5">
              <button type="button" className="calc-op" onClick={() => setPl(code, { selling_price: nudgePrice(p.selling_price, -0.1) })}>−10p</button>
              <button type="button" className="calc-op" onClick={() => setPl(code, { selling_price: nudgePrice(p.selling_price, 0.1) })}>+10p</button>
              <button type="button" className="calc-op" onClick={() => setPl(code, { selling_price: roundTo99(p.selling_price) })}>Round .99</button>
              <button type="button" className="calc-op go" disabled={r.lowest == null} title={`Lowest price for ${settings.roiTargetPct}% ROI`}
                onClick={() => r.lowest != null && setPl(code, { selling_price: r.lowest.toFixed(2) })}>{r.lowest == null ? 'Target not reachable' : <>Min {gbp(r.lowest)}</>}</button>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span>{r.feesNotSetUp ? `${active.label} fees are all 0 until set under “Fees and ROI target”.` : `Min = lowest price for ${settings.roiTargetPct}% ROI.`}</span>
            {canEdit && <button type="button" className="underline" onClick={() => setPl(code, { hidden: true })}>Not sold on {active.label}: hide</button>}
          </div>
        </div>
        <div className="receipt" aria-label={`Receipt for ${active.label}`}>
          <div className="text-center font-bold tracking-[.2em]">RECEIPT</div>
          <div className="mb-3 text-center text-xs text-stone-500">{active.label}{r.state === 'priced' ? ` · ${gbp(r.price)}` : ''}</div>
          {receipt.length === 0 ? <p className="py-6 text-center text-stone-500">Enter a selling price to see the breakdown.</p> : receipt.map((l, i) => (
            <div key={i}>
              {(l.kind === 'total' || l.kind === 'profit') && <div className="my-2 border-t border-dashed border-stone-400" />}
              <div className={`ln ${l.kind === 'vat' ? 'pl-4 text-stone-500' : ''} ${l.kind === 'total' ? 'font-bold' : ''} ${l.kind === 'profit' ? `text-base font-bold ${l.amount! < 0 ? 'text-red-700' : 'text-green-700'}` : ''}`}>
                <span>{l.label}</span><span className="dots" /><span className="w-14 text-right text-stone-500">{l.pct != null ? `${Number(l.pct.toFixed(3))}%` : ''}</span>
                <span className="w-20 text-right tabular-nums">{l.text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <form ref={formRef} action={action} onSubmit={onSubmit} noValidate className="space-y-4">
      <input type="hidden" name="payload" value={payload} />

      {/* entered once per product (MRG-09) */}
      <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><span className="label">Caemora product ID</span>
          <div className="py-2 font-semibold tabular-nums">{v.cae_code ?? <span className="font-normal text-slate-500">Given when saved (next number)</span>}</div>
        </div>
        <div className="sm:col-span-2 lg:col-span-3"><label><span className="label">Product</span><input value={v.name} onChange={setP('name')} className="input" disabled={!canEdit} /></label>
          {dup?.message && (
            <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <span>{dup.message}</span>
              <a href={`/margins/${dup.exact!.id}`} className="btn-ghost border border-amber-400">Open it</a>
            </div>
          )}
          {!dup?.exact && (dup?.matches.length ?? 0) > 0 && (
            <div className="mt-1 rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700">
              <div className="mb-1 font-medium text-slate-600 dark:text-slate-300">Already created (check it isn&apos;t one of these):</div>
              <ul className="space-y-0.5">{dup!.matches.map((x) => (
                <li key={x.id} className="flex justify-between gap-2"><span><span className="tabular-nums text-slate-500">{x.code}</span> {x.name}</span>
                  <a href={`/margins/${x.id}`} className="underline">Open it</a></li>
              ))}</ul>
            </div>
          )}
          {!dup?.exact && !(dup?.matches.length) && (dup?.similar.length ?? 0) > 0 && (
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Similar lines already created: {dup!.similar.map((x, i) => <span key={x.id}>{i > 0 && ' · '}<a href={`/margins/${x.id}`} className="underline">{x.name}</a></span>)}. Save only if this is a different product.</p>
          )}
        </div>
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

      {renderCalculator()}
      {cmp.hidden.length > 0 && (
        <p className="text-sm text-slate-500">
          Hidden (not sold on): {cmp.hidden.map((code) => (
            <span key={code} className="mr-3">{PLATFORMS.find((x) => x.code === code)!.label}
              {canEdit && <button type="button" className="ml-1 underline" onClick={() => { setPl(code, { hidden: false }); setTab(code); }}>show</button>}</span>
          ))}
        </p>
      )}

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

      {canEdit && (
        <div className="sticky bottom-16 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm md:bottom-4 dark:border-slate-800 dark:bg-slate-900/95">
          <button className="btn" disabled={pending}>{pending ? 'Saving…' : v.id ? 'Save' : 'Create line'}</button>
          {dirty && <span className="text-sm font-medium text-amber-600 dark:text-amber-400">Not saved</span>}
          {dup?.message && <span className="text-sm text-red-600">{dup.message}: open it instead of saving a second line</span>}
          {s?.error && <span className="text-sm text-red-600">{s.error}</span>}
          {s?.ok && !dirty && <span className="text-sm text-emerald-600">{s.status ?? 'Saved.'}</span>}
          <button type="button" className={`${ghost} ml-auto`} disabled={!dirty} onClick={() => setV(saved)}>Undo changes</button>
        </div>
      )}
    </form>
  );
}
