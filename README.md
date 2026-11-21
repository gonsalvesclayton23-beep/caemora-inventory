# Caemora Inventory

Purchases, shipments, landed cost and supplier reconciliation for Caemora, ARC, Goenche, YouDent, Al Store, Gentech and Goa Sales.
Replaces the MIT-2026.xlsx tracker.

- **Next.js** (TypeScript) web app, mobile-friendly: deploy to Vercel
- **Supabase** Postgres + logins: all rules (roles, settled-month lock, flags, audit) live in the database, so they hold whatever screen or script touches the data

## How it fits together

| Area | Where |
|---|---|
| Tables | `supabase/migrations/20261121000001_schema.sql` |
| Roles, row-level security, settled-month lock, audit log | `…000002_security.sql` |
| Automatic flags, FX, landed cost, reconciliation views | `…000003_flags_and_views.sql` |
| Companies, vendors, flag thresholds | `supabase/seed.sql` |
| Importer for MIT-2026.xlsx | `scripts/import/` |
| Web app | `app/`, `lib/` |

### Roles

| | Admin (UK) | Data entry (India) | Viewer |
|---|:-:|:-:|:-:|
| Purchases, shipments, products | edit | edit (open months only) | read |
| Agreed rate card | edit | read | read |
| Payments, credit notes, reconciliation | edit | **hidden** | read |
| Settle / reopen a month | ✓ | | |
| Edit a settled month | with a reason (logged + flagged) | blocked | |
| Flags | all, can resolve | purchase & shipment flags | all |

New sign-ups start **inactive**. An admin sets their role and activates them.

### Flags (re-checked on every save and nightly)

`price_change` (> 5% vs previous month) · `courier_change` · `courier_above_price` · `courier_above_rate_card` ·
`missing_invoice_no` · `blank_price` · `suspect_currency` (₹ price under 20) · `receipt_discrepancy` ·
`long_in_transit` (> 21 days) · `duplicate_tracking` · `unconfirmed_payment` · `payment_missing_reference` · `settled_month_edit`.
Thresholds are in the `settings` table.

### Money

Every amount carries its currency. ₹→£ uses each month's actual rate from that month's Wise payments
(`fx_rates`, source `payments`). An admin can override a month (source `manual`).
Reconciliation is per **vendor × company × month**: opening (previous closing) + purchases − credit notes − payments = closing balance due.

## Setting up (one-off)

1. **Create a Supabase project** (region: London). In *SQL Editor*, run the three migration files in order, then `supabase/seed.sql`.
   Or with the Supabase CLI: `supabase link` then `supabase db push`.
2. **Create your login**: *Authentication → Users → Add user*. Then in SQL Editor:
   ```sql
   update profiles set role = 'admin', active = true, full_name = 'Your Name' where id = (select id from auth.users where email = 'you@example.com');
   ```
3. **Nightly flag refresh**: *Database → Extensions → enable pg_cron*, then:
   ```sql
   select cron.schedule('refresh-flags', '15 2 * * *', 'select refresh_all_flags(); select recompute_fx_from_payments();');
   ```
4. **Import the sheet** (from your computer, with Node 20+):
   ```bash
   npm install
   ```
   ```bash
   npm run import:dry
   ```
   Read `import-output/import-report.md`, fix anything listed (in the sheet, or in `scripts/import/overrides.json`), and repeat. Then:
   ```bash
   DATABASE_URL='postgresql://…session pooler URL…' npm run import:load
   ```
   The load runs in one transaction and checks every month × company × currency total against the sheet before committing.
5. **Deploy**: import the repo in Vercel and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`).
6. **Invite the India team**: *Authentication → Users → Invite*. Then set their role to `data_entry` and `active = true`.

## Developing

```bash
bash supabase/tests/run.sh --keep
```
Starts a throwaway Postgres on port 54329 and runs the database tests (roles, lock, flags, reconciliation).

```bash
bash scripts/dev-db.sh
```
Builds `caemora_dev` on that Postgres and loads the full workbook into it.

```bash
npm run dev
```
Runs the app (needs a Supabase project in `.env.local`).
