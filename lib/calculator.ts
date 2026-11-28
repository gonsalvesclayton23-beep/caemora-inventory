// MRG-22: the margin line as a calculator: what the display shows, the quick price buttons and the receipt.
// Only presentation: every figure comes from the existing calculations (lib/margin.ts).
import { breakdown, computeMargin, entryInput, gbp, pct, type ComparisonRow, type MarginSettings, type PlatformEntry, type ProductCosts } from './margin';

/** The green display: profit per unit, ROI, landed and final cost, and the status. */
export function displayState(r: ComparisonRow, landed: number) {
  if (r.state !== 'priced' || !r.result) {
    return { profit: '—', roi: 'Enter a selling price', landed: gbp(landed), final: '—', status: 'Not priced', tone: 'grey' as const };
  }
  const below = r.status.tone === 'red';
  const status = [r.status.label, r.best ? 'Best return' : null, r.feesNotSetUp ? 'Fees not set up' : null].filter(Boolean).join(' · ');
  return {
    profit: gbp(r.result.profit), roi: `ROI ${pct(r.result.roi)}`, landed: gbp(landed), final: gbp(r.result.finalCost),
    status, tone: below ? ('red' as const) : r.status.tone === 'green' ? ('green' as const) : ('grey' as const),
  };
}

/** −10p / +10p: never below £0. */
export function nudgePrice(price: string, delta: number): string {
  const p = Number(price) || 0;
  return Math.max(0, Math.round((p + delta) * 100) / 100).toFixed(2);
}

/** Round .99: the same pound, ending in 99p (£8.42 → £8.99; £9.00 → £9.99). */
export function roundTo99(price: string): string {
  const p = Number(price) || 0;
  return (Math.floor(p + 1e-9) + 0.99).toFixed(2);
}

export interface ReceiptLine { label: string; pct?: number; amount?: number; text: string; kind: 'cost' | 'vat' | 'total' | 'price' | 'profit' | 'roi' }

/** The receipt: landed cost, every fee (VAT on its own line), final cost, selling price, profit and ROI. */
export function receiptLines(costs: ProductCosts, e: PlatformEntry, s: MarginSettings): ReceiptLine[] {
  const i = entryInput(costs, e);
  const m = computeMargin(i, s);
  return [
    { label: 'Landed cost', amount: m.landed, text: gbp(m.landed), kind: 'cost' },
    ...breakdown(i, s).map((l) => ({ ...l, text: gbp(l.amount), kind: l.label.startsWith('VAT on') ? ('vat' as const) : ('cost' as const) })),
    { label: 'Final cost', amount: m.finalCost, text: gbp(m.finalCost), kind: 'total' },
    { label: 'Selling price', amount: i.sellingPrice, text: gbp(i.sellingPrice), kind: 'price' },
    { label: 'PROFIT', amount: m.profit, text: gbp(m.profit), kind: 'profit' },
    { label: 'ROI', text: pct(m.roi), kind: 'roi' },
  ];
}
