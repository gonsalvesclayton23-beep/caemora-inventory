# Caemora Inventory Management System

Purchases, shipments, landed cost and supplier reconciliation for Caemora Ltd, ARC UK G Ltd, Youdent Ltd, Goenche Ltd, Goasales, Gentech and Al Store.
Replaces the MIT-2026.xlsx tracker. What it must do, with acceptance criteria: [docs/requirements.md](docs/requirements.md).

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
Each company has its own bank account and pays the supplier for the stock sent to it, so reconciliation is per
**vendor × company × month** (`v_reconciliation`): opening (previous closing) + purchases − credit notes − payments = closing balance due.
`v_vendor_balance` adds the companies together; credit notes with no company count only there.
Every payment records the account it came from (`paid_from_company`, null = a personal account); `v_payments_by_account`
shows payments made on another company's behalf.
Selling one product through several companies' accounts is normal: a product has one listing per company/FNSKU.

### Screens

| Screen | Who | What |
|---|---|---|
| Dashboard | all | Open flags, shipments in transit, this month's purchases, balance owed per company and supplier |
| Purchases → New | admin, data entry | One invoice: company, vendor, ₹/£, invoice no., shipment/box, then products. Fills the agreed courier and last price, and warns before saving |
| Purchases | all | Filter by month, company, text; edit a line; CSV export |
| Shipments | all | In transit / received; mark received and enter defective/short per line (allowed after a month is settled) |
| Products | all | Product master; admins edit the agreed courier rate and the month it applies from |
| Flags | all (data entry: purchase & shipment flags) | Inbox; admins acknowledge or resolve |
| Reconciliation | admin, viewer | Per supplier and month: each company's opening, purchases, credit notes, payments, closing; payments with the paying account; add payments and credit notes; settle or reopen the month |
| Landed cost | admin, viewer | ₹ and £ per unit by product, company and month; per unit received; CSV export |
| Product margins | all (admin edits) | One line per product: costs and exchange rate entered once, then price, company and fees per platform (Amazon, eBay, Shopify, OnBuy, Etsy), compared side by side with profit, ROI, "Best return" and "Below target"; lowest price for the ROI target; possible matches to merge (admin confirms each); fees and ROI target per platform; price and settings history; CSV export. Separate from purchases, shipments and payments |
| Audit log | admin | Who changed what and when (changed fields old → new), sign-ins, sign-outs and failed sign-ins; filter by person, area, action and dates; CSV export. Viewing is not recorded; entries cannot be edited or deleted |
| Admin | admin | Users and roles, flag thresholds, ₹/£ overrides, mark old flags as seen |

## Setting up (one-off)

No software to install: everything is pasted into the Supabase and Vercel websites.

1. **Supabase project**: at supabase.com create a project (region **London**, save the database password somewhere safe).
2. **Database**: *SQL Editor → New query*, paste all of `supabase/setup.sql`, **Run**. (It is the migrations + seed in one file; rebuild it with `npm run setup:sql`.)
3. **Turn off public sign-up**: *Authentication → Sign In / Providers → Email*: untick "Allow new users to sign up". Logins are created by you.
4. **Your login**: *Authentication → Users → Add user → Create new user*, tick "Auto confirm". Then in SQL Editor:
   ```sql
   update profiles set role = 'admin', active = true, full_name = 'Your Name'
    where email = 'you@example.com';
   ```
5. **Import the spreadsheet**: paste `import-output/import.sql` (made by `npm run import:sql`) into a new SQL Editor query and Run.
   It is one transaction and checks every month × company × currency total against the sheet; if anything is off, nothing is saved.
6. **Nightly flag refresh** (optional): *Database → Extensions*, enable `pg_cron`, then run:
   ```sql
   select cron.schedule('refresh-flags', '15 2 * * *', 'select refresh_all_flags(); select recompute_fx_from_payments();');
   ```
7. **Website**: at vercel.com, *Add New → Project*, import this GitHub repo. Under *Environment Variables* add
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase: *Project Settings → API*; the anon/publishable key, never the service_role key). Deploy.
8. **The India team**: create each login as in step 4 (with a temporary password), then on the app's *Admin* page set their role and tick Active.
   They change the password under *My account*.

Alternatively, with Node installed, `DATABASE_URL=… npm run import:load` loads directly (same checks).

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
