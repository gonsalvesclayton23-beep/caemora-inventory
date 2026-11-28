// LOS-01..LOS-04: losses (lost shipments, damaged returns, refunds without the item back, expired goods), accounted monthly.

export const LOSS_TYPES = {
  lost_in_transit: 'Shipment lost in transit',
  damaged_return: 'Return came back damaged',
  refunded_no_return: 'Delivered, but the platform refunded the buyer',
  expired: 'Goods expired',
} as const;
export type LossType = keyof typeof LOSS_TYPES;

export const LOSS_PLATFORMS = [
  ['AMAZON', 'Amazon FBA'], ['AMAZON_FBM', 'Amazon FBM'], ['EBAY', 'eBay'], ['SHOPIFY', 'Shopify'],
  ['ONBUY', 'OnBuy'], ['ETSY', 'Etsy'], ['TIKTOK', 'TikTok'], ['OTHER', 'Other'],
] as const;
export const platformName = (p: string | null | undefined) => (p ? LOSS_PLATFORMS.find(([k]) => k === p)?.[1] ?? p : '—');

const r2 = (n: number) => Math.round(n * 100) / 100;

/** LOS-02: goods at landed cost, and net loss = goods + refund − recovered (£). */
export function lossValue(v: { qty: number; unitCostGbp: number; refundGbp: number | null; recoveredGbp: number | null }) {
  const goods = r2((v.qty || 0) * (v.unitCostGbp || 0));
  return { goods, net: r2(goods + (v.refundGbp ?? 0) - (v.recoveredGbp ?? 0)) };
}

export interface LossRow {
  month: string; type: string; company_code: string; platform: string | null; qty: number;
  goods_gbp: number | string; refund_gbp: number | string; recovered_gbp: number | string; net_loss_gbp: number | string;
}

/** LOS-03: per month (newest first): entries, units, goods, refunds, recovered, net, and net by type, company and platform. */
export function monthlyLossReport(rows: LossRow[]) {
  const months = [...new Set(rows.map((r) => r.month.slice(0, 10)))].sort().reverse();
  const add = (o: Record<string, number>, k: string, v: number) => { o[k] = r2((o[k] ?? 0) + v); };
  return months.map((month) => {
    const mine = rows.filter((r) => r.month.slice(0, 10) === month);
    const byType: Record<string, number> = {}, byCompany: Record<string, number> = {}, byPlatform: Record<string, number> = {};
    let goods = 0, refund = 0, recovered = 0, net = 0, units = 0;
    for (const r of mine) {
      const n = Number(r.net_loss_gbp);
      goods += Number(r.goods_gbp); refund += Number(r.refund_gbp); recovered += Number(r.recovered_gbp); net += n; units += Number(r.qty);
      add(byType, r.type, n); add(byCompany, r.company_code, n); add(byPlatform, r.platform ?? 'none', n);
    }
    return { month, entries: mine.length, units, goods: r2(goods), refund: r2(refund), recovered: r2(recovered), net: r2(net), byType, byCompany, byPlatform };
  });
}

export const LOSS_EXPORT_COLUMNS = [
  'date', 'month', 'type', 'company', 'platform', 'product', 'qty', 'unit_cost_gbp', 'goods_gbp', 'refund_gbp', 'recovered_gbp',
  'net_loss_gbp', 'shipment', 'reference', 'notes', 'recorded_by', 'recorded_at',
] as const;
