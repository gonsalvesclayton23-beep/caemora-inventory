// PRD-08 and MRG-19: recognise a product that already exists (same rule as product_key() in the database).

/** Name with capitals, spaces and punctuation removed: "colgate floss – 50M" = "Colgate Floss 50m". */
export const productKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '');
const words = (name: string) => new Set(name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));

export interface Existing { id: number; name: string; asins?: (string | null)[]; fnskus?: (string | null)[] }
export type Exact = { id: number; name: string; reason: 'name' } | { id: number; name: string; reason: 'asin' | 'fnsku'; code: string };

/** An exact duplicate (refused) and similar names (shown only). */
export function findDuplicates(input: { name: string; asin?: string | null; fnsku?: string | null }, existing: Existing[], excludeId?: number | null) {
  const others = existing.filter((e) => e.id !== excludeId);
  const key = productKey(input.name ?? '');
  const up = (v: string | null | undefined) => (v ?? '').trim().toUpperCase();
  let exact: Exact | null = null;
  if (key) {
    const n = others.find((e) => productKey(e.name) === key);
    if (n) exact = { id: n.id, name: n.name, reason: 'name' };
  }
  for (const kind of ['asin', 'fnsku'] as const) {
    const code = up(input[kind]);
    if (exact || !code) continue;
    const hit = others.find((e) => (kind === 'asin' ? e.asins : e.fnskus)?.some((c) => up(c) === code));
    if (hit) exact = { id: hit.id, name: hit.name, reason: kind, code };
  }
  const mine = words(input.name ?? '');
  const similar = key.length < 4 ? [] : others.filter((e) => {
    if (e.id === exact?.id) return false;
    const k = productKey(e.name);
    if (!k || k === key) return false;
    const [short, long] = k.length < key.length ? [k, key] : [key, k];
    if (short.length >= 6 && long.includes(short)) return true;
    const theirs = words(e.name);
    const both = [...mine].filter((w) => theirs.has(w)).length;
    return both / new Set([...mine, ...theirs]).size >= 0.6;
  }).slice(0, 5).map((e) => ({ id: e.id, name: e.name }));
  return { exact, similar };
}

export const duplicateMessage = (d: Exact) =>
  `Already created: ${d.name}${d.reason === 'name' ? '' : ` (${d.reason === 'asin' ? 'ASIN' : 'FNSKU'} ${d.code})`}`;
