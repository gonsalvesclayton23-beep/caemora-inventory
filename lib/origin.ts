// DSH-06: units ordered per month with price and courier per unit, for India (₹) and China (£) separately.
import { last12Months } from './sales';

export const ORIGINS = [
  { code: 'IN', label: 'India', currency: 'INR', note: 'Indian suppliers (Peace Enterprises, Folkbella…), in ₹' },
  { code: 'CN', label: 'China', currency: 'GBP', note: 'Chinese suppliers (Alibaba sellers), in £' },
] as const;

export interface OriginRow { month: string; origin: string; units: number | string; goods: number | string; courier: number | string }
export interface OriginMonth { month: string; units: number; goods: number; courier: number; price: number | null; courierPerUnit: number | null; total: number | null }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Average price and courier per unit (goods ÷ units, courier ÷ units). */
export function perUnit(m: { units: number; goods: number; courier: number }) {
  if (!m.units) return { price: null, courier: null, total: null };
  const price = r2(m.goods / m.units), courier = r2(m.courier / m.units);
  return { price, courier, total: r2(price + courier) };
}

/** The 12 months ending this one, for one origin; months with no orders are 0 units. Same months for both diagrams. */
export function originSeries(rows: OriginRow[], origin: string, today: string): OriginMonth[] {
  return last12Months(today).map((month) => {
    const r = rows.find((x) => x.origin === origin && x.month.slice(0, 10) === month);
    const units = Number(r?.units ?? 0), goods = Number(r?.goods ?? 0), courier = Number(r?.courier ?? 0);
    const u = perUnit({ units, goods, courier });
    return { month, units, goods, courier, price: u.price, courierPerUnit: u.courier, total: u.total };
  });
}

export function perUnitMoney(v: number | null, currency: string) {
  if (v == null) return '—';
  const sym = currency === 'GBP' ? '£' : '₹';
  return currency === 'GBP' ? `${sym}${v.toFixed(2)}` : `${sym}${Math.round(v).toLocaleString('en-IN')}`;
}

export const monthLong = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** What hovering a month shows. */
export function monthSummary(m: OriginMonth, currency: string) {
  if (!m.units) return `${monthLong(m.month)}: no orders`;
  return `${monthLong(m.month)}: ${m.units.toLocaleString('en-GB')} units · price ${perUnitMoney(m.price, currency)}/unit · courier ${perUnitMoney(m.courierPerUnit, currency)}/unit · total ${perUnitMoney(m.total, currency)}/unit`;
}
