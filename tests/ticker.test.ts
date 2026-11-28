// DSH-05 (28 Nov 2026): a moving ticker of the four companies on the dashboard; "My cases" leaves the dashboard
// (cases stay on the Cases tab, with the badge on the menu).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { TICKER_COMPANIES } from '../lib/ticker.ts';

const dashboard = readFileSync('app/(app)/page.tsx', 'utf8');
const ticker = readFileSync('components/CompanyTicker.tsx', 'utf8');

test('DSH-05 AC1: the ticker shows Caemora (logo), YouDent (logo), Goenche Ltd and ARC UK G Ltd (names), in that order', () => {
  assert.deepEqual(TICKER_COMPANIES.map((c) => [c.code, c.name, c.logo ?? null]), [
    ['CMR', 'Caemora Ltd', '/logos/caemora.png'],
    ['YD', 'Youdent Ltd', '/logos/youdent.png'],
    ['GOE', 'Goenche Ltd', null],
    ['ARC', 'ARC UK G Ltd', null],
  ]);
  for (const c of TICKER_COMPANIES) if (c.logo) assert.ok(existsSync(`public${c.logo}`), c.logo);
  assert.match(dashboard, /<CompanyTicker/);
});

test('DSH-05 AC2: it keeps moving in a loop, pauses on hover, and stays still for people who turn off motion', () => {
  assert.match(ticker, /animation:\s*cims-ticker/);
  assert.match(ticker, /infinite/);
  assert.match(ticker, /:hover[^{]*\{[^}]*animation-play-state:\s*paused/);
  assert.match(ticker, /prefers-reduced-motion:\s*reduce[^{]*\{[^}]*\{[^}]*animation:\s*none/);
});

test('DSH-05 AC3: "My cases" is no longer on the dashboard; the Cases tab keeps its badge', () => {
  assert.doesNotMatch(dashboard, /myCasesLabel|v_my_cases/);
  assert.match(readFileSync('app/(app)/layout.tsx', 'utf8'), /v_my_cases[\s\S]*badge\(n\.href\)/);
});

test('DSH-07 AC1: the ticker also shows the platforms: Amazon, eBay, Shopify, Etsy, OnBuy and TikTok (logo where there is one)', async () => {
  const { TICKER_PLATFORMS } = await import('../lib/ticker.ts');
  assert.deepEqual(TICKER_PLATFORMS.map((p) => [p.name, p.logo ?? null]), [
    ['Amazon', null], ['eBay', '/logos/platforms/ebay.svg'], ['Shopify', '/logos/platforms/shopify.svg'],
    ['Etsy', '/logos/platforms/etsy.svg'], ['OnBuy', null], ['TikTok', '/logos/platforms/tiktok.svg'],
  ]);
  for (const p of TICKER_PLATFORMS) if (p.logo) assert.ok(existsSync(`public${p.logo}`), p.logo);
  assert.match(ticker, /TICKER_PLATFORMS/);
});
