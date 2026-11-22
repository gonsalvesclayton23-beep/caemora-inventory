import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockParts, INDIA_TZ, monthStart, money2, UK_TZ } from '../lib/tz.ts';

test('UK is GMT in winter and BST in summer; India is always IST (+5:30)', () => {
  const winter = new Date('2026-11-22T09:15:00Z');
  assert.deepEqual(clockParts(winter, UK_TZ), { time: '09:15', day: 'Sun 22 Nov', zone: 'GMT' });
  assert.equal(clockParts(winter, INDIA_TZ).time, '14:45');

  const summer = new Date('2026-07-01T09:15:00Z');
  assert.equal(clockParts(summer, UK_TZ).time, '10:15');
  assert.equal(clockParts(summer, UK_TZ).zone, 'BST');
  assert.equal(clockParts(summer, INDIA_TZ).time, '14:45');
});

test('clocks across the October 2026 changeover (BST ends 01:00 UTC on 25 Oct)', () => {
  assert.equal(clockParts(new Date('2026-10-25T00:30:00Z'), UK_TZ).time, '01:30'); // BST
  assert.equal(clockParts(new Date('2026-10-25T01:30:00Z'), UK_TZ).time, '01:30'); // GMT, clocks went back
  assert.equal(clockParts(new Date('2026-10-25T00:30:00Z'), INDIA_TZ).time, '06:00');
  assert.equal(clockParts(new Date('2026-10-25T01:30:00Z'), INDIA_TZ).time, '07:00');
});

test('clocks across the March 2026 changeover (BST starts 01:00 UTC on 29 Mar)', () => {
  assert.equal(clockParts(new Date('2026-03-29T00:30:00Z'), UK_TZ).time, '00:30');
  assert.equal(clockParts(new Date('2026-03-29T01:30:00Z'), UK_TZ).time, '02:30');
});

test('each clock shows its own date when they differ', () => {
  const lateUk = new Date('2026-11-22T20:00:00Z');
  assert.deepEqual([clockParts(lateUk, UK_TZ).time, clockParts(lateUk, UK_TZ).day], ['20:00', 'Sun 22 Nov']);
  assert.deepEqual([clockParts(lateUk, INDIA_TZ).time, clockParts(lateUk, INDIA_TZ).day], ['01:30', 'Mon 23 Nov']);
});

test('current month is the UK month, not the server month', () => {
  // 23:30 UTC on 31 Mar 2026 is already 00:30 on 1 Apr in London (BST)
  assert.equal(monthStart(new Date('2026-03-31T23:30:00Z')), '2026-04-01');
  assert.equal(monthStart(new Date('2026-11-30T23:30:00Z')), '2026-11-01'); // GMT: still November
});

test('money formatting: 2 decimals, Indian grouping for ₹', () => {
  assert.equal(money2(123456, 'INR'), '₹1,23,456.00');
  assert.equal(money2(12345.678, 'GBP'), '£12,345.68');
  assert.equal(money2(0, 'GBP'), '£0.00');
});
