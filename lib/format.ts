export type Currency = 'INR' | 'GBP' | 'USD' | 'CNY';
const SYMBOL: Record<Currency, string> = { INR: '₹', GBP: '£', USD: '$', CNY: '¥' };

export function money(amount: number | string | null | undefined, currency: Currency = 'INR', dp?: number) {
  if (amount == null || amount === '') return '—';
  const n = Number(amount);
  const digits = dp ?? (currency === 'INR' && Math.abs(n) >= 100 ? 0 : 2);
  const locale = currency === 'INR' ? 'en-IN' : 'en-GB';
  return `${n < 0 ? '−' : ''}${SYMBOL[currency]}${Math.abs(n).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export const monthLabel = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export const dateLabel = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' }) : '—';

export const RULE_LABELS: Record<string, string> = {
  price_change: 'Price changed',
  courier_change: 'Courier changed',
  courier_above_price: 'Courier > product price',
  courier_above_rate_card: 'Courier above rate card',
  missing_invoice_no: 'Missing invoice no.',
  missing_invoice_date: 'Missing invoice date',
  blank_price: 'Blank price',
  suspect_currency: 'Looks like £ entered as ₹',
  receipt_discrepancy: 'Short/defective, no remark',
  long_in_transit: 'In transit too long',
  duplicate_tracking: 'Duplicate tracking no.',
  unconfirmed_payment: 'Unconfirmed payment',
  payment_missing_reference: 'Payment without reference',
  settled_month_edit: 'Edit to settled month',
};
