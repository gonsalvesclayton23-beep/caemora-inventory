// DSH-05: the companies in the dashboard ticker, in order. A logo where there is one, otherwise the name.
export const TICKER_COMPANIES: { code: string; name: string; logo?: string }[] = [
  { code: 'CMR', name: 'Caemora Ltd', logo: '/logos/caemora.png' },
  { code: 'YD', name: 'Youdent Ltd', logo: '/logos/youdent.png' },
  { code: 'GOE', name: 'Goenche Ltd' },
  { code: 'ARC', name: 'ARC UK G Ltd' },
];

/** DSH-07: the platforms we sell on, after the companies. Logos from Simple Icons (CC0) where available; Amazon and OnBuy
 * are not in that set, so they show as names until their logo files are supplied. withName: the mark is an icon, not a wordmark. */
export const TICKER_PLATFORMS: { name: string; logo?: string; withName?: boolean }[] = [
  { name: 'Amazon' },
  { name: 'eBay', logo: '/logos/platforms/ebay.svg' },
  { name: 'Shopify', logo: '/logos/platforms/shopify.svg', withName: true },
  { name: 'Etsy', logo: '/logos/platforms/etsy.svg', withName: true },
  { name: 'OnBuy' },
  { name: 'TikTok', logo: '/logos/platforms/tiktok.svg', withName: true },
];
