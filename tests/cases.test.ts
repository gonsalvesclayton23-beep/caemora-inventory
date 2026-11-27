// FLG-03 (cases) and SHP-08 (receiving and shortages), 27 Nov 2026: the parts worked out in the app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addWorkingDays, boxReceiptSummary, caseLink, caseState, myCasesLabel, OUTCOMES, outcomeLabel, parseCaseFilters, resolutionLabel,
  shortageStatus, shortFromReceived,
} from '../lib/cases.ts';
import { NAV } from '../lib/nav.ts';

// FLG-03 ---------------------------------------------------------------------------------------
test('FLG-03 AC1: due 3 working days away (Mon–Fri): raised Fri 27 Nov → due Wed 2 Dec', () => {
  assert.equal(addWorkingDays('2026-11-27', 3), '2026-12-02');
  assert.equal(addWorkingDays('2026-11-23', 3), '2026-11-26');   // Mon → Thu
  assert.equal(addWorkingDays('2026-11-28', 3), '2026-12-02');   // Sat → Wed
});
test('FLG-03 AC2: "My cases (2)", a Cases tab with a badge, and each case links to its line', () => {
  assert.equal(myCasesLabel(2), 'My cases (2)');
  assert.deepEqual(NAV.find((n) => n.href === '/cases'), { href: '/cases', label: 'Cases', who: 'all' });
  assert.equal(caseLink({ entity_type: 'purchase_lines', entity_id: 131, shipment_id: null }), '/purchases/131');
  assert.equal(caseLink({ entity_type: 'shipment_items', entity_id: 9, shipment_id: 3 }), '/shipments/3');
  assert.equal(caseLink({ entity_type: 'shipments', entity_id: 3, shipment_id: null }), '/shipments/3');
});
test('FLG-03 AC4: closed by the fix, or by the owner with a note', () => {
  assert.equal(resolutionLabel('fix'), 'Resolved by fix');
  assert.equal(resolutionLabel('owner'), 'Resolved by owner');
});
test('FLG-03 AC5: past its due date → "Overdue" in red; filters by person, status, flag type and overdue', () => {
  assert.deepEqual(caseState({ status: 'open', due_on: '2026-11-26' }, '2026-11-27'), { label: 'Overdue', tone: 'red' });
  assert.deepEqual(caseState({ status: 'in_progress', due_on: '2026-11-26' }, '2026-11-27'), { label: 'Overdue', tone: 'red' });
  assert.deepEqual(caseState({ status: 'open', due_on: '2026-11-27' }, '2026-11-27'), { label: 'Open', tone: 'amber' });
  assert.deepEqual(caseState({ status: 'in_progress', due_on: '2026-12-02' }, '2026-11-27'), { label: 'In progress', tone: 'blue' });
  assert.deepEqual(caseState({ status: 'resolved', due_on: '2026-11-01' }, '2026-11-27'), { label: 'Resolved', tone: 'green' });
  assert.deepEqual(parseCaseFilters({ person: '00000000-0000-0000-0000-00000000000b', status: 'open', rule: 'missing_invoice_no', overdue: '1' }),
    { person: '00000000-0000-0000-0000-00000000000b', status: 'open', rule: 'missing_invoice_no', overdue: true });
  assert.deepEqual(parseCaseFilters({ person: 'x', status: 'nope', rule: "'; drop", overdue: '' }), { person: null, status: null, rule: null, overdue: false });
});

// SHP-08 ---------------------------------------------------------------------------------------
test('SHP-08 AC1: box 3 counted 48 and 40 of 50 and 40 → "Received: 88 of 90, 2 short"', () => {
  assert.equal(boxReceiptSummary([{ qty: 50, short_qty: 2, defective_qty: 0 }, { qty: 40, short_qty: 0, defective_qty: 0 }]), 'Received: 88 of 90, 2 short');
});
test('SHP-08 AC2: corrected 48 → 50: shortage drops to 0', () => {
  assert.deepEqual(shortFromReceived(50, 50), { short: 0 });
  assert.equal(boxReceiptSummary([{ qty: 50, short_qty: 0, defective_qty: 0 }, { qty: 40, short_qty: 0, defective_qty: 0 }]), 'Received: 90 of 90');
});
test('SHP-08 received = units that arrived (defective included); short = sent − received; more than sent is refused', () => {
  assert.deepEqual(shortFromReceived(40, 38), { short: 2 });
  assert.deepEqual(shortFromReceived(40, 41), { error: 'More than the 40 sent: check the count (extra units are not recorded yet).' });
  assert.deepEqual(shortFromReceived(40, -1), { error: 'Received cannot be negative.' });
  assert.equal(boxReceiptSummary([{ qty: 40, short_qty: 2, defective_qty: 1 }]), 'Received: 38 of 40, 2 short, 1 defective');
});
test('SHP-08 AC4: once the Amazon case ID is entered, the shortage shows "Case raised with Amazon"', () => {
  assert.equal(shortageStatus({ short_qty: 2, defective_qty: 0, amazon_case_id: '12151530462', outcome: null, outcome_gbp: null }), 'Case raised with Amazon');
  assert.equal(shortageStatus({ short_qty: 2, defective_qty: 0, amazon_case_id: null, outcome: null, outcome_gbp: null }), '2 short');
  assert.equal(shortageStatus({ short_qty: 0, defective_qty: 0, amazon_case_id: null, outcome: null, outcome_gbp: null }), null);
});
test('SHP-08 AC5: outcomes; the box shows "Shortage resolved" with the outcome', () => {
  assert.deepEqual(Object.keys(OUTCOMES), ['units_found', 'replacement_sent', 'supplier_credit_note', 'amazon_reimbursed']);
  assert.equal(outcomeLabel('amazon_reimbursed', 38.22), 'Amazon reimbursed £38.22');
  assert.equal(shortageStatus({ short_qty: 2, defective_qty: 0, amazon_case_id: '1215', outcome: 'amazon_reimbursed', outcome_gbp: 38.22 }), 'Shortage resolved: Amazon reimbursed £38.22');
  assert.equal(shortageStatus({ short_qty: 2, defective_qty: 0, amazon_case_id: null, outcome: 'replacement_sent', outcome_gbp: null }), 'Shortage resolved: Replacement sent');
});
