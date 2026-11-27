// PUR-07: group the Purchases tab by shipment. Each shipment holds its products; split lines show under each box with
// that box's units; anything not yet in a box is listed under "Not in a shipment yet", so every unit appears once.

export interface GroupShipment {
  id: number; box_no: string | null; amazon_shipment_id: string | null; tracking_no: string | null;
  company_code: string | null; company_name: string | null; status: string; destination: string | null; created_on: string | null;
}
export interface GroupLine {
  id: number; period_month: string; product_name: string; qty: number; currency: string; line_total: number | string;
  received_qty: number; shipment_id: number | null; [k: string]: any;
}
export interface GroupItem { shipment_id: number; purchase_line_id: number; qty: number; short_qty: number }

export interface GroupRow<L extends GroupLine = GroupLine> {
  line: L;
  units: number;      // units of the line in this shipment (or not yet boxed)
  partOf: number;     // the line's full quantity
  value: number;      // this share of the line's total, in the line's currency
  received: number;   // units received in this shipment
}
export interface Group<L extends GroupLine = GroupLine> {
  shipment: GroupShipment | null;
  title: string;
  rows: GroupRow<L>[];
  products: number;
  units: number;
  totals: Record<string, number>;   // per currency, never added together
  received: string;
  otherMonths: string | null;
}

const monthName = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const round2 = (n: number) => Math.round(n * 100) / 100;

export const shipmentTitle = (s: GroupShipment) => s.amazon_shipment_id ?? (s.box_no ? `Box ${s.box_no}` : s.tracking_no ?? `Shipment #${s.id}`);

export function groupByShipment<L extends GroupLine>(lines: L[], items: GroupItem[], shipments: GroupShipment[],
  otherMonths: Map<number, { month: string; lines: number }[]> = new Map()): Group<L>[] {
  const byShipment = new Map<number, GroupRow<L>[]>();
  const loose: GroupRow<L>[] = [];
  const add = (sid: number, r: GroupRow<L>) => (byShipment.get(sid) ?? byShipment.set(sid, []).get(sid)!).push(r);
  const share = (l: L, units: number) => (l.qty ? round2(Number(l.line_total) * units / l.qty) : 0);

  for (const l of lines) {
    const its = items.filter((i) => i.purchase_line_id === l.id);
    let boxed = 0;
    if (its.length) {
      for (const i of its) {
        add(i.shipment_id, { line: l, units: i.qty, partOf: l.qty, value: share(l, i.qty), received: i.qty - i.short_qty });
        boxed += i.qty;
      }
    } else if (l.shipment_id) {
      // older lines linked to a shipment without box contents: the whole line is in it
      add(l.shipment_id, { line: l, units: l.qty, partOf: l.qty, value: share(l, l.qty), received: l.received_qty });
      boxed = l.qty;
    }
    if (boxed < l.qty) loose.push({ line: l, units: l.qty - boxed, partOf: l.qty, value: share(l, l.qty - boxed), received: 0 });
  }

  const summarise = (shipment: GroupShipment | null, title: string, rows: GroupRow<L>[]): Group<L> => {
    const totals: Record<string, number> = {};
    for (const r of rows) totals[r.line.currency] = round2((totals[r.line.currency] ?? 0) + r.value);
    const units = rows.reduce((t, r) => t + r.units, 0);
    const got = rows.reduce((t, r) => t + r.received, 0);
    const other = shipment ? otherMonths.get(shipment.id) : undefined;
    return {
      shipment, title, rows, products: new Set(rows.map((r) => r.line.id)).size, units, totals,
      // nothing is "received" while a box is still on its way
      received: shipment && !['in_transit', 'cancelled'].includes(shipment.status)
        ? `Received: ${got.toLocaleString('en-GB')} of ${units.toLocaleString('en-GB')}${units > got ? `, ${units - got} short` : ''}` : '',
      otherMonths: other?.length ? other.map((o) => `+${o.lines} line${o.lines === 1 ? '' : 's'} in ${monthName(o.month)}`).join(', ') : null,
    };
  };

  const known = new Map(shipments.map((s) => [s.id, s]));
  const groups = [...byShipment.entries()].map(([sid, rows]) => {
    const s = known.get(sid) ?? { id: sid, box_no: null, amazon_shipment_id: null, tracking_no: null, company_code: null, company_name: null, status: '', destination: null, created_on: null };
    return summarise(s, shipmentTitle(s), rows);
  });
  // newest shipment first
  groups.sort((a, b) => String(b.shipment!.created_on ?? '').localeCompare(String(a.shipment!.created_on ?? '')) || b.shipment!.id - a.shipment!.id);
  if (loose.length) groups.push(summarise(null, 'Not in a shipment yet', loose));
  return groups;
}
