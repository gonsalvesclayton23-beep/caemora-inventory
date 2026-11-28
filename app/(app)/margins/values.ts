import type { Channel, MarginSettings } from '@/lib/margin';

export interface PlatformValues {
  saved: boolean;            // a row exists in the database
  company_code: string; selling_price: string; tax_override_pct: string; hidden: boolean; listing_status: 'listed' | 'not_listed';
  referral_pct: string; fba_fee: string; promo_per_unit: string; local_shipping: string; misc_expense: string; ad_pct: string; category_fee_pct: string;
}
export interface ProductValues {
  id?: number; product_id?: number | null;
  name: string; asin: string; fnsku: string; owner: string; notes: string;
  product_cost: string; product_cost_currency: 'INR' | 'GBP'; courier_cost: string; courier_currency: 'INR' | 'GBP';
  fx_rate: string; fx_rate_date: string | null; fx_source: string | null;
  platforms: Record<Channel, PlatformValues>;
}

/** Empty platform, with shipping and misc starting from the settings. */
export function blankPlatform(ch: Channel, s: MarginSettings, company: string): PlatformValues {
  // Amazon FBA and FBM: local courier and misc have no fixed value, so they start blank (FBA has no local courier)
  const ship = ch === 'EBAY' ? s.ebayLocalShipping : ch === 'AMAZON' || ch === 'AMAZON_FBM' ? null : s.platforms[ch].shipping;
  const misc = ch === 'EBAY' ? s.ebayMisc : ch === 'AMAZON' || ch === 'AMAZON_FBM' ? null : s.platforms[ch].misc;
  return {
    saved: false, company_code: company, selling_price: '', tax_override_pct: '', hidden: false, listing_status: 'listed',
    referral_pct: '', fba_fee: '', promo_per_unit: '', local_shipping: ship == null ? '' : String(ship), misc_expense: misc == null ? '' : String(misc), ad_pct: '', category_fee_pct: '',
  };
}

