// FLG-03 (cases) and SHP-08 (receiving and shortages): labels and small calculations used by the screens.

/** Mon–Fri working days (UK bank holidays not skipped). Same rule as add_working_days() in the database. */
export function addWorkingDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  let n = 0;
  while (n < Math.max(days, 0)) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return d.toISOString().slice(0, 10);
}

export const CASE_STATUS = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' } as const;
export type CaseStatus = keyof typeof CASE_STATUS;

export function caseState(c: { status: string; due_on: string }, today: string): { label: string; tone: 'red' | 'amber' | 'blue' | 'green' } {
  if (c.status === 'resolved') return { label: 'Resolved', tone: 'green' };
  if (c.due_on < today) return { label: 'Overdue', tone: 'red' };
  return c.status === 'in_progress' ? { label: 'In progress', tone: 'blue' } : { label: 'Open', tone: 'amber' };
}

export const myCasesLabel = (n: number) => `My cases (${n})`;

export function caseLink(c: { entity_type: string; entity_id: number; shipment_id: number | null }): string {
  if (c.entity_type === 'purchase_lines') return `/purchases/${c.entity_id}`;
  if (c.entity_type === 'shipments') return `/shipments/${c.entity_id}`;
  if (c.entity_type === 'shipment_items') return c.shipment_id ? `/shipments/${c.shipment_id}` : '/shipments';
  if (c.entity_type === 'payments') return '/reconciliation';
  return '/flags';
}

export function resolutionLabel(r: string | null | undefined): string {
  if (r === 'fix') return 'Resolved by fix';
  if (r === 'owner') return 'Resolved by owner';
  if (r === 'outcome') return 'Resolved with outcome';
  return '';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** FLG-03 AC5: filters from the address bar; anything unexpected is ignored. */
export function parseCaseFilters(sp: Record<string, string | undefined>) {
  return {
    person: sp.person && UUID.test(sp.person) ? sp.person : null,
    status: sp.status && (sp.status in CASE_STATUS || sp.status === 'not_resolved') ? sp.status : null,
    rule: sp.rule && /^[a-z_]{1,40}$/.test(sp.rule) ? sp.rule : null,
    overdue: sp.overdue === '1' || sp.overdue === 'on',
  };
}

// ---------------------------------------------------------------- SHP-08

/** Received = units that arrived (defective ones included); short = sent − received. */
export function shortFromReceived(sent: number, received: number): { short: number } | { error: string } {
  if (!Number.isFinite(received) || received < 0) return { error: 'Received cannot be negative.' };
  if (received > sent) return { error: `More than the ${sent} sent: check the count (extra units are not recorded yet).` };
  return { short: sent - Math.floor(received) };
}

export function boxReceiptSummary(items: { qty: number; short_qty: number; defective_qty: number }[]): string {
  const sent = items.reduce((t, i) => t + i.qty, 0);
  const short = items.reduce((t, i) => t + i.short_qty, 0);
  const defective = items.reduce((t, i) => t + i.defective_qty, 0);
  return [`Received: ${(sent - short).toLocaleString('en-GB')} of ${sent.toLocaleString('en-GB')}`, short ? `${short} short` : null, defective ? `${defective} defective` : null]
    .filter(Boolean).join(', ');
}

export const OUTCOMES = {
  units_found: 'Units found',
  replacement_sent: 'Replacement sent',
  supplier_credit_note: 'Supplier credit note',
  amazon_reimbursed: 'Amazon reimbursed',
} as const;
export type Outcome = keyof typeof OUTCOMES;

export function outcomeLabel(o: string, gbp: number | null | undefined): string {
  const label = OUTCOMES[o as Outcome] ?? o;
  return gbp != null && Number(gbp) > 0 ? `${label} £${Number(gbp).toFixed(2)}` : label;
}

/** What the box line shows about its shortage (null when nothing is short or defective). */
export function shortageStatus(i: { short_qty: number; defective_qty: number; amazon_case_id: string | null; outcome: string | null; outcome_gbp: number | null }): string | null {
  if (i.outcome) return `Shortage resolved: ${outcomeLabel(i.outcome, i.outcome_gbp)}`;
  if (!i.short_qty && !i.defective_qty) return null;
  if (i.amazon_case_id) return 'Case raised with Amazon';
  return [i.short_qty ? `${i.short_qty} short` : null, i.defective_qty ? `${i.defective_qty} defective` : null].filter(Boolean).join(', ');
}

export const DESTINATIONS = { amazon: 'Amazon warehouse', home: 'Home (UK)' } as const;

/** colours for a case's state */
export const TONE = {
  red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300', amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  blue: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300', green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
} as const;
