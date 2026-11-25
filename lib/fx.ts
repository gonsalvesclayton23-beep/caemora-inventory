// UI-04: the European Central Bank's daily reference rates, turned into ₹ per £.
// The ECB quotes every currency per euro, so ₹ per £ = (₹ per €) ÷ (£ per €).
export const ECB_SOURCE = 'European Central Bank';
export const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml';

export interface DailyRate { date: string; inrPerGbp: number; eurInr: number; eurGbp: number }

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Every day in an ECB XML file that has both GBP and INR, newest first. */
export function dailyRates(xml: string): DailyRate[] {
  const out: DailyRate[] = [];
  const day = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>\s*(?=<Cube\s+time=|<\/Cube>)/g;
  for (const m of xml.matchAll(day)) {
    const rate = (cur: string) => Number(new RegExp(`currency=['"]${cur}['"]\\s+rate=['"]([\\d.]+)['"]`).exec(m[2])?.[1]);
    const eurGbp = rate('GBP'), eurInr = rate('INR');
    if (eurGbp > 0 && eurInr > 0) out.push({ date: m[1], inrPerGbp: round(eurInr / eurGbp, 4), eurInr, eurGbp });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** AC1/AC3: the rate for `today`, or the last one published before it, labelled with its date. */
export function latestRate(rates: { date: string; inrPerGbp: number }[], today: string) {
  const r = [...rates].sort((a, b) => b.date.localeCompare(a.date)).find((x) => x.date <= today);
  if (!r) return null;
  return { ...r, source: ECB_SOURCE, label: r.date === today ? 'Today' : `Rate from ${longDate(r.date)}` };
}

/** AC1 */
export const rateLine = (r: { inrPerGbp: number }) => `£1 = ₹${r.inrPerGbp.toFixed(2)}`;

/** AC2: today's rate against the month's Wise rate, in ₹ and %. */
export function compareWithWise(daily: number, wise: number) {
  const diff = daily - wise;
  const pct = (diff / wise) * 100;
  const side = diff >= 0 ? 'above' : 'below';
  return { diff, pct, text: `₹${Math.abs(diff).toFixed(2)} (${Math.abs(pct).toFixed(2)}%) ${side} the Wise rate` };
}

/** AC4: the last 30 days of published rates, oldest first. */
export function last30Days<T extends { date: string }>(rates: T[], today: string): T[] {
  const from = new Date(`${today}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 30);
  const start = from.toISOString().slice(0, 10);
  return rates.filter((r) => r.date > start && r.date <= today).sort((a, b) => a.date.localeCompare(b.date));
}
