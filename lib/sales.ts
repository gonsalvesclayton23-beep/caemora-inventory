// DSH-04: each company's sales for the last 12 months (£, including VAT, all platforms together).

/** The companies shown on the dashboard, in this order. */
export const SALES_COMPANIES = ['CMR', 'ARC', 'YD', 'GOE'] as const;

/** The 12 months ending with this one (UK date in, first-of-month dates out, oldest first). */
export function last12Months(today: string): string[] {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 12 + i, 1));
    return d.toISOString().slice(0, 10);
  });
}

export interface SalesRow { company_code: string; month: string; amount_gbp: number | string }

export function salesTiles(rows: SalesRow[], companies: { code: string; name: string }[], today: string) {
  const months = last12Months(today);
  return SALES_COMPANIES.map((code) => {
    const mine = new Map(rows.filter((r) => r.company_code === code).map((r) => [r.month.slice(0, 10), Number(r.amount_gbp)]));
    const series = months.map((month) => ({ month, amount: mine.has(month) ? mine.get(month)! : null }));
    const total = Math.round(series.reduce((t, s) => t + (s.amount ?? 0), 0) * 100) / 100;
    return { code, name: companies.find((c) => c.code === code)?.name ?? code, total, months: series, missing: series.filter((s) => s.amount == null).length };
  });
}
