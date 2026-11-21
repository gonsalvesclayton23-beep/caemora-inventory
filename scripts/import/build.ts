// Builds the product master, listings and vendors from parsed lines.
import { Issue, nameKey } from './normalize.ts';
import type { Parsed, RawLine } from './parse.ts';

export interface Product {
  key: string;                 // import_ref
  name: string;
  category: 'stock' | 'consumable';
  names: Map<string, number>;  // every spelling seen -> count
  agreedCourierPerUnit: number | null;
  agreedCourierCurrency: 'INR' | 'GBP';
  agreedCourierFrom: string | null;
  lines: RawLine[];
}

export interface Listing {
  key: string;
  productKey: string;
  company: string;
  channel: 'FBA' | 'FBM' | 'EBAY';
  asin: string | null;
  fnsku: string | null;
}

export interface Vendor { name: string; kind: 'india_partner' | 'supplier' | 'alibaba' | 'other'; country: string; currency: 'INR' | 'GBP' }

export interface Built {
  products: Product[];
  listings: Listing[];
  vendors: Vendor[];
  lineProduct: Map<RawLine, string>;
  lineListing: Map<RawLine, string>;
  possibleDuplicates: [string, string, number][];
}

class UnionFind {
  parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let p = this.parent.get(x)!;
    if (p !== x) { p = this.find(p); this.parent.set(x, p); }
    return p;
  }
  union(a: string, b: string) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.parent.set(rb, ra); }
}

const tokens = (s: string) => new Set(nameKey(s).split(' ').filter((t) => t.length > 1));
function jaccard(a: Set<string>, b: Set<string>) {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

export function build(parsed: Parsed, issues: Issue[]): Built {
  const uf = new UnionFind();
  const lineKeys = new Map<RawLine, string>();
  for (const l of parsed.lines) {
    const keys = [`n:${l.category}:${nameKey(l.description)}`];
    if (l.fnsku) keys.push(`f:${l.fnsku}`);
    // ASINs are not used for matching: the sheet has ASINs pasted onto the wrong product.
    for (const k of keys.slice(1)) uf.union(keys[0], k);
    lineKeys.set(l, keys[0]);
  }

  // group lines into products
  const groups = new Map<string, RawLine[]>();
  for (const l of parsed.lines) {
    const root = uf.find(lineKeys.get(l)!);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(l);
  }

  const products: Product[] = [];
  const lineProduct = new Map<RawLine, string>();
  let n = 0;
  for (const lines of groups.values()) {
    const names = new Map<string, number>();
    for (const l of lines) names.set(l.description, (names.get(l.description) ?? 0) + 1);
    // display name: the spelling used most recently (latest month, last row)
    const latest = [...lines].sort((a, b) => a.month.localeCompare(b.month) || rowNo(a) - rowNo(b)).at(-1)!;
    const key = `P${String(++n).padStart(4, '0')}`;
    const inr = lines.filter((l) => l.currency === 'INR' && l.courierPerUnit > 0)
      .sort((a, b) => a.month.localeCompare(b.month) || rowNo(a) - rowNo(b));
    const gbp = lines.filter((l) => l.currency === 'GBP' && l.courierPerUnit > 0)
      .sort((a, b) => a.month.localeCompare(b.month) || rowNo(a) - rowNo(b));
    const rateFrom = inr.at(-1) ?? gbp.at(-1);
    const p: Product = {
      key, name: latest.description, category: latest.category, names, lines,
      agreedCourierPerUnit: latest.category === 'stock' && rateFrom ? rateFrom.courierPerUnit : null,
      agreedCourierCurrency: rateFrom?.currency ?? 'INR',
      agreedCourierFrom: latest.category === 'stock' && rateFrom ? rateFrom.month : null,
    };
    products.push(p);
    for (const l of lines) lineProduct.set(l, key);

    const fnskuCompanies = new Map<string, Set<string>>();
    for (const l of lines) if (l.fnsku) (fnskuCompanies.get(l.fnsku) ?? fnskuCompanies.set(l.fnsku, new Set()).get(l.fnsku)!).add(l.company);
    for (const [f, cs] of fnskuCompanies) if (cs.size > 1) {
      issues.push({ ref: f, severity: 'warn', type: 'fnsku_multi_company', message: `FNSKU ${f} (${p.name}) is recorded under ${[...cs].join(', ')}. FNSKUs belong to one seller account.` });
    }
    if (names.size > 1) {
      const toks = [...names.keys()].map(tokens);
      const minSim = Math.min(...toks.slice(1).map((t) => jaccard(toks[0], t)));
      if (minSim < 0.35) issues.push({ ref: key, severity: 'warn', type: 'product_merge_check',
        message: `Merged by FNSKU but names differ a lot: ${[...names.keys()].map((s) => `"${s}"`).join(' | ')}` });
    }
  }

  // listings: one per company+FNSKU, or per company+channel+product for FBM/eBay
  const listings = new Map<string, Listing>();
  const lineListing = new Map<RawLine, string>();
  for (const l of parsed.lines) {
    if (l.category !== 'stock') continue;
    const pk = lineProduct.get(l)!;
    const key = l.fnsku ? `L:${l.company}:${l.fnsku}` : `L:${l.company}:${l.channel}:${pk}`;
    let li = listings.get(key);
    if (!li) listings.set(key, (li = { key, productKey: pk, company: l.company, channel: l.channel, asin: l.asin, fnsku: l.fnsku }));
    if (!li.asin && l.asin) li.asin = l.asin;
    lineListing.set(l, key);
  }

  // vendors seen in the sheet
  const vendors = new Map<string, Vendor>();
  const add = (v: Vendor) => { if (!vendors.has(v.name)) vendors.set(v.name, v); };
  add({ name: 'Peace Enterprises', kind: 'india_partner', country: 'IN', currency: 'INR' });
  add({ name: 'Alibaba (unspecified seller)', kind: 'alibaba', country: 'CN', currency: 'GBP' });
  add({ name: 'Packaging supplier (unspecified)', kind: 'supplier', country: 'GB', currency: 'GBP' });
  for (const l of parsed.lines) {
    if (!l.vendor) continue;
    const name = canonicalVendor(l.vendor);
    l.vendor = name;
    if (/^alibaba$/i.test(name)) { l.vendor = 'Alibaba (unspecified seller)'; continue; }
    add({ name, kind: l.currency === 'GBP' ? 'alibaba' : 'supplier', country: l.currency === 'GBP' ? 'CN' : 'IN', currency: l.currency });
  }
  for (const p of parsed.payments) {
    p.vendor = /^alibaba$/i.test(p.vendor) ? 'Alibaba (unspecified seller)' : canonicalVendor(p.vendor);
    if (!vendors.has(p.vendor)) add({ name: p.vendor, kind: p.currency === 'GBP' ? 'alibaba' : 'supplier', country: p.currency === 'GBP' ? 'CN' : 'IN', currency: p.currency });
  }

  // name-similar products that were NOT merged: list for a human to check
  const possibleDuplicates: [string, string, number][] = [];
  const stock = products.filter((p) => p.category === 'stock');
  const toks = stock.map((p) => tokens(p.name));
  for (let i = 0; i < stock.length; i++) for (let j = i + 1; j < stock.length; j++) {
    const s = jaccard(toks[i], toks[j]);
    if (s >= 0.75) possibleDuplicates.push([stock[i].name, stock[j].name, Math.round(s * 100) / 100]);
  }

  return { products, listings: [...listings.values()], vendors: [...vendors.values()], lineProduct, lineListing, possibleDuplicates };
}

const VENDOR_FIX: [RegExp, string][] = [
  [/^peace/i, 'Peace Enterprises'],
  [/^folkbella/i, 'Folkbella'],
  [/^guangzhou aoliao|^aolia pet/i, 'Guangzhou Aoliao Pet Products Co., Ltd.'],
  [/^at&m biomaterials/i, 'AT&M Biomaterials Co., Ltd'],
  [/^alibaba$/i, 'Alibaba'],
];
export function canonicalVendor(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim();
  for (const [re, name] of VENDOR_FIX) if (re.test(s)) return name;
  return s;
}

const rowNo = (l: RawLine) => Number(l.ref.split('!')[1] ?? 0);
