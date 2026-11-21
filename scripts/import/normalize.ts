// Helpers that turn the free-text values of MIT-2026.xlsx into clean values.

export type Severity = 'error' | 'warn' | 'info';
export interface Issue {
  ref: string;          // "Nov!26" = tab Nov, row 26
  severity: Severity;   // error = row not imported
  type: string;
  message: string;
}

export const COMPANY_ALIASES: Record<string, string> = {
  caemora: 'CMR', cmr: 'CMR', 'caemora -amex': 'CMR', 'caemora-amex': 'CMR', 'caemora-debit': 'CMR',
  arc: 'ARC', 'arc-wise': 'ARC',
  goenche: 'GOE', goe: 'GOE',
  yd: 'YD', 'yd-ebay': 'YD', youdent: 'YD', 'youdent ltd': 'YD', ydent: 'YD', ebay: 'YD', 'yd-wise': 'YD',
  als: 'ALS', alstore: 'ALS', 'al store': 'ALS',
  gentech: 'GEN',
  'goa sales': 'GOA', goa: 'GOA',
};

export function companyCode(raw: unknown): string | null {
  if (raw == null) return null;
  const key = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return null;
  return COMPANY_ALIASES[key] ?? null;
}

/** "FBA\nCMR", "FBA GOE", "FBM\nSELF" -> channel + company hints */
export function parseCompCell(raw: unknown): { channel?: 'FBA' | 'FBM'; company?: string } {
  if (raw == null || typeof raw !== 'string') return {};
  const parts = raw.toUpperCase().split(/[\s\n]+/).filter(Boolean);
  const out: { channel?: 'FBA' | 'FBM'; company?: string } = {};
  if (parts.includes('FBA')) out.channel = 'FBA';
  if (parts.includes('FBM')) out.channel = 'FBM';
  for (const p of parts) {
    const c = companyCode(p === 'GOENCHE' ? 'goenche' : p);
    if (c) out.company = c;
  }
  return out;
}

export const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  aug: 8, sept: 9, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function tabMonth(tab: string, year = 2026): string | null {
  const m = MONTHS[tab.trim().toLowerCase()];
  return m ? `${year}-${String(m).padStart(2, '0')}-01` : null;
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function validYmd(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1;
}

const monthGap = (y: number, m: number, ty: number, tm: number) => Math.abs((y * 12 + m) - (ty * 12 + tm));

/**
 * Parse a date cell. Accepts Date objects and text like 07.01.26, 18.11,2026, 19/05/26.
 * Repairs the two common mistakes in the sheet: wrong year (2022/2025) and day/month swapped by Excel.
 */
export function parseDate(raw: unknown, monthIso: string, field: string, ref: string, issues: Issue[]): string | null {
  if (raw == null || raw === '') return null;
  let y: number, m: number, d: number;
  if (raw instanceof Date) {
    y = raw.getUTCFullYear(); m = raw.getUTCMonth() + 1; d = raw.getUTCDate();
  } else if (typeof raw === 'number') {
    if (raw > 30000 && raw < 60000) { // Excel serial
      const dt = new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
      y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate();
    } else return null;
  } else {
    const s = String(raw).trim().replace(/,/g, '.');
    const mt = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (!mt) {
      issues.push({ ref, severity: 'warn', type: 'bad_date', message: `${field}: could not read date "${raw}"` });
      return null;
    }
    d = +mt[1]; m = +mt[2]; y = +mt[3]; if (y < 100) y += 2000;
  }
  const [ty, tm] = monthIso.split('-').map(Number);

  if (y !== ty && monthGap(ty, m, ty, tm) <= 2) {
    issues.push({ ref, severity: 'info', type: 'date_repaired', message: `${field}: year ${y} corrected to ${ty} (${iso(y, m, d)})` });
    y = ty;
  }
  if (monthGap(y, m, ty, tm) > 2 && validYmd(y, d, m) && monthGap(y, d, ty, tm) <= 1) {
    issues.push({ ref, severity: 'info', type: 'date_repaired', message: `${field}: day/month swapped (${iso(y, m, d)} → ${iso(y, d, m)})` });
    [m, d] = [d, m];
  }
  if (!validYmd(y, m, d)) {
    issues.push({ ref, severity: 'warn', type: 'bad_date', message: `${field}: invalid date "${String(raw)}"` });
    return null;
  }
  return iso(y, m, d);
}

export type ShipStatus = 'in_transit' | 'received' | 'received_partial' | 'lost';

export function parseStatus(raw: unknown): { status?: ShipStatus; by?: string } {
  if (raw == null) return {};
  const s = String(raw).trim();
  if (!s) return {};
  const low = s.toLowerCase();
  if (/lost/.test(low)) return { status: 'lost' };
  const by = s.match(/rec(?:ei)?v?e?d\.?\s*(?:by|at)\s+(.+)$/i);
  if (by) return { status: 'received', by: titleCase(by[1]) };
  if (/^rec/.test(low)) return { status: 'received' };
  if (/transit/.test(low)) return { status: 'in_transit' };
  // a bare name ("Clayton") means that person received it
  if (/^[a-z]+$/i.test(s)) return { status: 'received', by: titleCase(s) };
  return {};
}

export const titleCase = (s: string) => s.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** Numbers from cells that may be text such as "£84.62" or "1,206.56". */
export function num(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = String(raw).replace(/[£₹,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export const hasPound = (...vals: unknown[]) => vals.some((v) => typeof v === 'string' && v.includes('£'));

export const text = (raw: unknown): string | null => {
  if (raw == null) return null;
  const s = (raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw)).replace(/\s+/g, ' ').trim();
  return s ? s : null;
};

/** Key used to match product names that differ only in spacing, punctuation or case. */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\(?\s*5\s*g\s*ea\s*\)?/g, ' ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(new|pk|pack|of)\b/g, (w) => (w === 'pk' ? 'pack' : w))
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ new$/, '');
}

export const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;
