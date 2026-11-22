// Time-zone aware helpers. Never use the device's local time for business dates or the clocks.
export const UK_TZ = 'Europe/London';
export const INDIA_TZ = 'Asia/Kolkata';

/** "HH:MM" (24-hour) and "Sun 22 Nov" for an instant in a time zone. */
export function clockParts(at: Date, timeZone: string): { time: string; day: string; zone: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      weekday: 'short', day: 'numeric', month: 'short', timeZoneName: 'short',
    }).formatToParts(at).map((p) => [p.type, p.value]),
  );
  return { time: `${parts.hour}:${parts.minute}`, day: `${parts.weekday} ${parts.day} ${parts.month}`, zone: parts.timeZoneName };
}

/** First day of the month (YYYY-MM-01) that `at` falls in, in the given zone (default UK). */
export function monthStart(at: Date, timeZone = UK_TZ): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(at).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-01`;
}

/** Money with exactly 2 decimals; ₹ uses Indian digit grouping (1,23,456.00), £ uses 12,345.67. */
export function money2(amount: number, currency: 'INR' | 'GBP'): string {
  const s = Math.abs(amount).toLocaleString(currency === 'INR' ? 'en-IN' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount < 0 ? '−' : ''}${currency === 'INR' ? '₹' : '£'}${s}`;
}
