'use client';
import { useActionState, useEffect, useMemo, useState } from 'react';
import {
  computeMargin, fxLabel, gbp, lowestPriceForRoi, pct, roiStatus, taxLabel, type MarginInput, type MarginSettings,
} from '@/lib/margin';
import type { Result } from '@/lib/data';
import { createMarginLine, updateMarginLine } from './actions';

export interface LineValues {
  id?: number; product_id?: number | null;
  channel: 'AMAZON' | 'EBAY'; company_code: string; name: string; asin: string; fnsku: string; owner: string; notes: string;
  listing_status: 'listed' | 'not_listed';
  product_cost: string; product_cost_currency: 'INR' | 'GBP'; courier_cost: string; courier_currency: 'INR' | 'GBP';
  fx_rate: string; fx_rate_date: string | null; fx_source: string | null;
  referral_pct: string; fba_fee: string; promo_per_unit: string; local_shipping: string; misc_expense: string; ad_pct: string;
  selling_price: string; tax_override_pct: string;
}

type Company = { code: string; name: string; default_vat_pct: number };

const toneClass = { red: 'text-red-600 dark:text-red-400', green: 'text-emerald-600 dark:text-emerald-400', grey: 'text-slate-500' } as const;
const f = (s: string) => (s.trim() === '' ? null : Number(s));

export function LineForm({ initial, companies, settings, canEdit, costNote }: {
  initial: LineValues; companies: Company[]; settings: MarginSettings; canEdit: boolean; costNote?: string | null;
}) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [s, action, pending] = useActionState<Result | null, FormData>(initial.id ? updateMarginLine : createMarginLine, null);
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const set = (k: keyof LineValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => { if (s?.ok) setSaved(v); }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
  // MRG-05 AC2: warn before leaving with changes not saved
  useEffect(() => {
    if (!dirty || !canEdit) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, canEdit]);

  const company = companies.find((c) => c.code === v.company_code);
  const fxTyped = v.fx_rate !== initial.fx_rate;
  const input: MarginInput = {
    channel: v.channel, productCost: f(v.product_cost) ?? 0, productCostCurrency: v.product_cost_currency,
    courierCost: f(v.courier_cost) ?? 0, courierCurrency: v.courier_currency, fxRate: f(v.fx_rate) ?? 0,
    sellingPrice: f(v.selling_price) ?? 0, companyVatPct: Number(company?.default_vat_pct ?? 0), ownTaxPct: f(v.tax_override_pct),
    referralPct: f(v.referral_pct), fbaFee: f(v.fba_fee), promoPerUnit: f(v.promo_per_unit),
    localShipping: f(v.local_shipping), miscExpense: f(v.misc_expense), adPct: f(v.ad_pct),
  };
  const m = useMemo(() => computeMargin(input, settings), [JSON.stringify(input), settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const low = useMemo(() => lowestPriceForRoi(input, settings), [JSON.stringify(input), settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const status = roiStatus(m.roi, settings.roiTargetPct);
  const amazon = v.channel === 'AMAZON';

  const num = (k: keyof LineValues, label: string, hint?: string) => (
    <label><span className="label">{label}</span>
      <input name={k} value={String(v[k] ?? '')} onChange={set(k)} inputMode="decimal" className="input" disabled={!canEdit} />
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
  const cur = (k: 'product_cost_currency' | 'courier_currency') => (
    <select name={k} value={v[k]} onChange={set(k)} className="input w-20" disabled={!canEdit} aria-label="Currency">
      <option value="INR">₹</option><option value="GBP">£</option>
    </select>
  );
  const row = (label: string, value: number | null, strong = false) => (
    <tr><td className={strong ? 'font-medium' : ''}>{label}</td><td className={`num ${strong ? 'font-medium' : ''}`}>{gbp(value)}</td></tr>
  );

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      {v.product_id && <input type="hidden" name="product_id" value={v.product_id} />}
      <input type="hidden" name="fx_source" value={fxTyped ? 'manual' : (v.fx_source ?? '')} />
      <input type="hidden" name="fx_rate_date" value={v.fx_rate_date ?? ''} />

      <div className="space-y-4">
        <div className="card grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="label">Product</span><input name="name" value={v.name} onChange={set('name')} className="input" disabled={!canEdit} /></label>
          <label><span className="label">Channel</span>
            <select name="channel" value={v.channel} onChange={set('channel')} className="input" disabled={!canEdit || !!v.id}>
              <option value="AMAZON">Amazon</option><option value="EBAY">eBay</option>
            </select>
            {v.id && <input type="hidden" name="channel" value={v.channel} />}
          </label>
          <label><span className="label">Company</span>
            <select name="company_code" value={v.company_code} onChange={set('company_code')} className="input" disabled={!canEdit}>
              {companies.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </label>
          <label><span className="label">ASIN</span><input name="asin" value={v.asin} onChange={set('asin')} className="input" disabled={!canEdit} /></label>
          <label><span className="label">FNSKU</span><input name="fnsku" value={v.fnsku} onChange={set('fnsku')} className="input" disabled={!canEdit} /></label>
          <label><span className="label">Owner</span><input name="owner" value={v.owner} onChange={set('owner')} className="input" disabled={!canEdit} /></label>
          <label><span className="label">Listing</span>
            <select name="listing_status" value={v.listing_status} onChange={set('listing_status')} className="input" disabled={!canEdit}>
              <option value="listed">Listed</option><option value="not_listed">Not listed</option>
            </select>
          </label>
        </div>

        <div className="card grid gap-3 sm:grid-cols-2">
          <div><span className="label">Product cost</span>
            <div className="flex gap-2"><input name="product_cost" value={v.product_cost} onChange={set('product_cost')} inputMode="decimal" className="input" disabled={!canEdit} />{cur('product_cost_currency')}</div>
            {costNote && <span className="text-xs text-slate-500">{costNote}</span>}
          </div>
          <div><span className="label">Courier cost</span>
            <div className="flex gap-2"><input name="courier_cost" value={v.courier_cost} onChange={set('courier_cost')} inputMode="decimal" className="input" disabled={!canEdit} />{cur('courier_currency')}</div>
          </div>
          <label><span className="label">Exchange rate (₹ per £)</span>
            <input name="fx_rate" value={v.fx_rate} onChange={set('fx_rate')} inputMode="decimal" className="input" disabled={!canEdit} />
            <span className="text-xs text-slate-500">{fxTyped ? 'Entered by hand (saved with today\'s date)' : fxLabel(v.fx_source, v.fx_rate_date)}</span>
          </label>
          <div><span className="label">Tax rate (%)</span>
            <div className="flex gap-2">
              <input name="tax_override_pct" value={v.tax_override_pct} onChange={set('tax_override_pct')} placeholder={String(company?.default_vat_pct ?? 0)} inputMode="decimal" className="input" disabled={!canEdit} />
              {canEdit && v.tax_override_pct !== '' && <button type="button" className="btn-ghost whitespace-nowrap border border-slate-300 dark:border-slate-700" onClick={() => setV((x) => ({ ...x, tax_override_pct: '' }))}>Use company rate</button>}
            </div>
            <span className="text-xs text-slate-500">{taxLabel(input)}{v.tax_override_pct === '' && canEdit ? ' · type a rate to give this product its own' : ''}</span>
          </div>
          {amazon ? <>
            {num('referral_pct', 'Referral fee (% of price)')}
            {num('fba_fee', 'FBA fee (£ per unit)')}
            {num('promo_per_unit', 'Promo / ads (£ per unit)')}
          </> : <>
            {num('local_shipping', 'Local shipping (£)')}
            {num('misc_expense', 'Misc. expense (£)')}
            {num('ad_pct', 'Ads (% of price)')}
          </>}
          {num('selling_price', 'Selling price (£)')}
          <label className="sm:col-span-2"><span className="label">Notes</span><textarea name="notes" value={v.notes} onChange={set('notes')} rows={2} className="input" disabled={!canEdit} /></label>
        </div>
      </div>

      <div className="space-y-4">
        <div className="card lg:sticky lg:top-4">
          <table className="table">
            <tbody>
              {row('Landed cost', m.landed)}
              {amazon ? <>
                {row('Referral fee', m.referralFee)}
                {row('VAT on referral fee', m.referralFeeVat)}
                {row('FBA fee', m.fbaFee)}
                {row('VAT on FBA fee', m.fbaFeeVat)}
                {row(`FBA surcharge (${settings.fbaSurchargePct}%)`, m.fbaSurcharge)}
                {row(`Digital Services Tax (${settings.dstPct}%)`, m.digitalServicesTax)}
                {row('Promo / ads', m.promo)}
              </> : <>
                {row('Local shipping', m.localShipping)}
                {row('Misc. expense', m.miscExpense)}
                {row(`eBay fees (${settings.ebayFeePct}% + ${gbp(settings.ebayFixedFee)}, incl. VAT)`, m.ebayFees)}
                {row('Ad fees (incl. VAT)', m.adFees)}
              </>}
              {row('Cost before tax', m.costBeforeTax, true)}
              {row(`Tax (${m.taxPct}%)`, m.tax)}
              {row('Final cost', m.finalCost, true)}
              <tr><td className="font-medium">Profit</td><td className={`num font-semibold ${m.profit < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{gbp(m.profit)}</td></tr>
              <tr><td className="font-medium">ROI</td><td className={`num font-semibold ${toneClass[status.tone]}`}>{pct(m.roi)}</td></tr>
            </tbody>
          </table>
          <p className={`mt-2 text-sm font-medium ${toneClass[status.tone]}`}>{status.label} (target {settings.roiTargetPct}%)</p>
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
            <div className="text-slate-500">Lowest price for {settings.roiTargetPct}% ROI</div>
            {low == null
              ? <div className="font-medium">Target not reachable</div>
              : <div className="flex items-center justify-between gap-2"><span className="text-lg font-semibold">{gbp(low)}</span>
                  {canEdit && <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={() => setV((x) => ({ ...x, selling_price: low.toFixed(2) }))}>Use this price</button>}
                </div>}
          </div>
          {canEdit && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button className="btn" disabled={pending}>{pending ? 'Saving…' : v.id ? 'Save' : 'Create line'}</button>
              {dirty && <span className="text-sm font-medium text-amber-600 dark:text-amber-400">Not saved</span>}
              {s?.error && <span className="text-sm text-red-600">{s.error}</span>}
              {s?.ok && !dirty && <span className="text-sm text-emerald-600">{s.status ?? 'Saved.'}</span>}
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
