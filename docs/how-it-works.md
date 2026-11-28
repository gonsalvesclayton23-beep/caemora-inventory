# How CIMS works

CIMS (Caemora Inventory Management System) replaced the MIT-2026.xlsx tracker. This guide explains, in plain English, what the app does, the rules it follows and why. It is updated with every change.

- What the app must do, with acceptance criteria: [requirements.md](requirements.md)
- Setting up and developing: [README](../README.md)

Last updated: 28 Nov 2026 (DSH-05, company ticker; My cases off the dashboard).

---

## 1. The business in one paragraph

Clayton's companies buy stock in India, mostly from **Peace Enterprises** (in ₹), and some in the UK and China (Folkbella, Alibaba, in £). The stock is packed into **boxes (shipments)**. Most go to an **Amazon warehouse** (FBA shipment IDs such as `FBA15MRYZWHR`); some go **Home (UK)** for eBay and other merchant-fulfilled sales. Each company pays the supplier for the stock sent to it, from its own bank account. The app tracks what was bought, what was shipped and received, what it cost landed in ₹ and £, what each company owes, and the margin on each product on each sales platform.

## 2. Companies

Codes never change; names and VAT do (admin only, every change logged).

| Code | Name | Default VAT |
|---|---|---|
| CMR | Caemora Ltd | 7.5% Flat Rate VAT |
| ARC | ARC UK G Ltd | 7.5% Flat Rate VAT |
| YD | Youdent Ltd | 0% |
| GOE | Goenche Ltd | 0% |
| GOA | Goasales | 0% |
| GEN | Gentech (sole trader eBay store) | 0% |
| ALS | Al Store | 0% |

Lists always follow this order. Selling one product through several companies' accounts is normal: a product has one listing (FNSKU) per company.

## 3. Who can do what

| | Admin (UK) | India team (data entry) | Viewer (e.g. accountant) |
|---|:-:|:-:|:-:|
| Purchases, shipments, products | edit | edit (open months only) | read |
| Received / defective counts | edit, any time | edit, any time (settled months too) | read |
| Payments, credit notes, reconciliation | edit | **hidden** | read |
| Settle / reopen a month | ✓ | | |
| Product margins and their fees | edit | read | read |
| Cases | all; reassign; set the rules | **only their own, never payment cases** | read all |
| Audit log | ✓ | | |
| Admin (users, settings, case rules) | ✓ | | |

New logins start **inactive**: an admin sets the role and ticks Active. All of these rules are enforced **in the database** (row-level security and triggers), so they hold whatever screen or script touches the data.

## 4. The screens (menu order)

| Screen | What it is for |
|---|---|
| **Dashboard** | A moving ticker of the four companies (Caemora and YouDent logos, Goenche Ltd and ARC UK G Ltd names; pauses on hover, still if the device has motion turned off), today's £→₹ rate (with 30-day history and this month's Wise rate), UK and India clocks, **sales for the last 12 months** for Caemora Ltd, ARC UK G Ltd, Youdent Ltd and Goenche Ltd (see §6a), this month's spend per company (₹ and £ apart), units per month chart, open and critical flag counts, shipments in transit. (The "Balance owed to suppliers" and "Open flags by type" sections were removed on 27 Nov 2026: balances are on Reconciliation, flags on Flags.) |
| **Purchases** | All purchase lines for a month, **grouped by shipment** (PUR-07): each shipment's header shows its ID, company, destination, status, products, units, ₹ and £ totals and what was received; its products are listed underneath. Lines not yet in a box are under "Not in a shipment yet". A switch shows the old plain list. Filters: month, company, search. CSV export (one row per line). "+ New purchase" enters one invoice |
| **Shipments** | Boxes in transit and received. On a box: destination, status, tracking, and per product **sent / received / defective / short**, who counted it and when, the count history, and the shortage follow-up |
| **Invoices** | Upload and find invoice files |
| **Products** | Product master and the agreed courier rate card (admin edits) |
| **Flags** | Automatic warnings (see §7); admins acknowledge or resolve |
| **Cases** | Flags that need someone to act, each with an owner and due date (see §8) |
| **Reconciliation** | Per supplier, company and month: opening, purchases, credit notes, payments, closing; settle or reopen a month (admin, viewer) |
| **Landed cost** | ₹ and £ per unit by product, company and month; per unit received (admin, viewer) |
| **Product margins** | One line per product, compared across Amazon, eBay, Shopify, OnBuy and Etsy (see §10) |
| **Audit log** | Who changed what and when, plus sign-ins (admin only, see §11) |
| **Enter sales** (admin; link on the dashboard) | Type each company's monthly sales (see §6a) |
| **Admin** | Users and roles, company VAT, case rules, flag thresholds, monthly ₹/£ overrides, mark old flags as seen |

## 5. Purchases and shipments

- **A purchase line** = one product on one invoice: company, supplier, quantity, unit price, courier per unit, currency (₹ or £), invoice number and **invoice date** (required for new purchases; the line's month follows the invoice date).
- **Boxes (PUR-06).** Lines are put into boxes. A line can be split over several boxes ("30 of 50"). An Amazon (FBA) box holds one company's stock; Home boxes may mix companies. A box's contents can change only while it is **In transit**.
- **Destination (SHP-08).** Each box is **Amazon warehouse** (it has an FBA… ID) or **Home (UK)**. Only an admin can change it.
- **Receiving (SHP-08).** "**Received**" = every unit that arrived, damaged ones included. **Short = sent − received.** **Defective** is entered separately. Admins and the India team can enter or correct counts at any time, including for settled months; each count records who and when, and every change is kept in the box's count history. Entering more than was sent is refused (over-delivery is not handled yet).
- **Purchases tab (PUR-07).** Shows each month grouped by shipment, newest first. A split line appears under each box with that box's units and share of the value. A shipment's lines from other months are not mixed in; its header says, for example, "+3 lines in Oct 2026". A box in transit shows no received count. Each shipment ends with a **total row** (PUR-07 AC7): total units, goods (price × units), courier paid (courier × units) and the total, one row per currency.

## 6. Money

- Every amount carries its currency. **₹ and £ are never added together**; totals are shown side by side.
- **Monthly rate:** ₹ per £ for each month comes from that month's Wise payments; an admin can override a month.
- **Daily rate (UI-04):** the European Central Bank rate is fetched once a day (about 15:30 UK time) by a Vercel scheduled job. It needs `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` (the Supabase **secret** key) in Vercel. Purchases with an invoice date from 25 Nov 2026 lock that day's rate on the line; older lines keep the monthly rate.
- **Landed cost** = (unit price + courier per unit), converted with the line's rate.
- **Reconciliation** is per supplier × company × month: opening (previous closing) + purchases − credit notes − payments = closing balance due. Credit notes with no company count only in the overall supplier balance. Each payment records which company's account paid it.
- **Settled months are locked.** The India team cannot change them. An admin can, with a reason, which raises a critical flag. Receiving (counts, status, tracking, notes, destination) stays open after settling. Prices, quantities bought and companies stay locked.

## 6a. Sales (DSH-04)

- The app is not connected to Amazon or eBay yet, so **sales are typed in by an admin** on **Enter sales** (link on the dashboard): one figure per company per month, **in £ including VAT, across Amazon, eBay and every other platform** that company sells on. An empty box means "not entered".
- The dashboard shows a tile for **Caemora Ltd, ARC UK G Ltd, Youdent Ltd and Goenche Ltd**: the total for the **current month and the 11 before it**, how many months are not entered yet, and a small bar per month (hover for the figure).
- **Everyone** can see the tiles; only an admin can enter or change figures. Every change is in the Audit log.
- Automatic sales from Amazon and eBay is for later; it would fill the same figures.

## 7. Flags

Raised and cleared automatically on every save (and nightly if the Supabase scheduled job is enabled). Thresholds are in Admin.

| Flag | When |
|---|---|
| Price changed | unit price moved more than 5% vs the previous month |
| Courier changed | courier per unit changed vs the previous month |
| Courier > product price | courier per unit above the unit price |
| Courier above rate card | above the product's agreed courier rate (critical) |
| No invoice number / No invoice date | missing on a line |
| No price | blank or ₹0 price (critical) |
| Looks like £ entered as ₹ | a ₹ price under ₹20 |
| Short/defective, no remark | a short line with no remark |
| In transit too long | more than 21 days |
| Duplicate tracking no. | same tracking number on two boxes |
| Unconfirmed payment / Payment without reference | payments (India team cannot see these) |
| Edit to settled month | an admin changed a settled month (critical) |
| Check with supplier | a **Home** box line is short or defective |
| Raise Amazon case | an **Amazon** box line is short or defective |

A flag a person resolved stays resolved; one cleared automatically re-opens if the problem returns.

## 8. Cases (FLG-03)

- A **case** is a flag that needs someone to act. It has an **owner**, a **status** (Open, In progress, Resolved) and a **due date** (3 working days, Mon–Fri; bank holidays not skipped).
- **Which flags create cases** and **who gets them** are set in **Admin → Cases**. To begin with: no invoice number, no invoice date, no price and courier above rate card go to the person who entered the line; "Check with supplier" and "Raise Amazon case" go to the admin until someone is chosen. Lines with no person (spreadsheet imports) go to the admin.
- **Payment and money cases only ever go to an admin**, and the India team never sees them.
- People see their open cases on the **Cases** tab, with a red number badge on the Cases menu item (since 28 Nov 2026 not on the dashboard). Overdue cases are red.
- A case **closes by itself** when the problem is fixed ("Resolved by fix"). Otherwise the owner presses **Resolve** and must add a note. An admin can **reassign** with a note; the history keeps every step.
- **Shortage cases:** enter the **Amazon case ID** ("Case raised with Amazon"; also saved on the box line for the future Amazon claims screen, SHP-05). Close with the **outcome**: units found, replacement sent, supplier credit note, or Amazon reimbursed (with the £ amount). The box then shows "Shortage resolved".
- Flags that were already open when cases were introduced (27 Nov 2026) did **not** become cases.

## 9. Products

The product master holds each product's name, its listings (company, FNSKU, ASIN) and its **agreed courier rate** with the month it applies from (admin only). Purchases are checked against it.

## 10. Product margins (MRG-01 to MRG-09)

- A separate section with its own data; it never changes purchases, shipments or payments. Everyone can see it; only an admin changes it.
- **One line per product.** Entered once: name, ASIN, FNSKU, product cost and courier cost (₹ or £), and the exchange rate (locked on the line until "Use today's rate"). **Landed cost** is worked out once and used by every platform.
- **Per platform** (Amazon, eBay, Shopify, OnBuy, Etsy): the company that sells it there (sets the tax), the selling price, and that platform's own costs.
- **Formulas.** Amazon: referral fee % of price + VAT on it, FBA fee + VAT on it, FBA surcharge (2% of FBA fee), Digital Services Tax (2% of referral + FBA fee), promo/ads £ per unit. eBay: fee 12.8% + £0.30 with VAT, ads % of price with VAT, shipping and misc. Shopify/OnBuy/Etsy: platform fee %, fixed fee and payment fee (% + £) with that platform's VAT, ads %, shipping and misc. **Tax** = price × the company's VAT (or the line's own rate). **Profit** = price − final cost. **ROI** = profit ÷ landed cost.
- Shows **Best return**, **Below target** (ROI under 25%, in red), **Not priced**, **Fees not set up** (Shopify, OnBuy and Etsy fees start at 0 until entered), and the **lowest price for the ROI target**. Platforms not sold on can be hidden. Price history is kept.
- Old separate Amazon/eBay lines for the same product are offered as **possible matches**; an admin confirms each one (choosing whose costs to keep). Nothing merges on its own.

## 11. Audit log

Every add, change and delete made in the app is recorded with who and when, plus sign-ins, sign-outs and failed sign-ins (with the email typed). Viewing pages is not recorded. The log cannot be edited or deleted, by anyone. Admins see it in plain English: area, what happened, which record, and only the fields that changed (old → new). Filter by person, area, action and dates; export to CSV.

## 12. What runs on its own

| What | When | Needs |
|---|---|---|
| Flag checks | on every save | nothing |
| Nightly flag refresh and monthly rates from payments | 02:15 nightly | the Supabase `pg_cron` job in the README (optional) |
| Daily £→₹ rate from the ECB | about 15:30 UK time | Vercel cron + `CRON_SECRET` + `SUPABASE_SERVICE_ROLE_KEY` |
| Cases opening and closing | when a flag opens or clears | nothing |

## 13. How a change goes live

1. If the change touches the database, there is one file in `supabase/updates/`: paste all of it into **Supabase → SQL Editor → New query** and **Run, once**. "Already exists" means it was already applied: the editor runs the whole file as one transaction, so nothing half-applies.
2. Merge the pull request on GitHub. Vercel redeploys the site.
3. `supabase/setup.sql` is the full database for a brand-new project only, never for the live one.

Updates so far, in order: dashboard and invoices (22 Nov) → boxes (25 Nov) → daily FX (25 Nov) → companies and VAT (26 Nov) → margins (26 Nov) → margin platforms (26 Nov) → audit log (27 Nov) → cases and receiving (27 Nov) → company sales (27 Nov).

## 14. Decisions log

| Date | Decision |
|---|---|
| 21 Nov 2026 | Reconciliation is per supplier × company × month; each company pays for the stock sent to it |
| 22 Nov 2026 | Future purchases must have an invoice date; invoice files can be uploaded |
| 25 Nov 2026 | Daily ECB rate applies from 25 Nov 2026 onwards only; earlier lines keep the monthly rate |
| 25 Nov 2026 | Receipts are recorded per box for split lines; Home/FBM boxes may mix companies; contents fixed once received |
| 26 Nov 2026 | Company names and Default VAT as in §2; codes unchanged |
| 26 Nov 2026 | Margins: eBay fee 12.8% + £0.30; DST 2% of referral + FBA; Amazon ads £/unit, eBay ads %; admin-only editing; no import of old margin sheets |
| 26 Nov 2026 | MRG-09: one line per product across platforms; Amazon "Fees" = everything between landed cost and tax (£5.38 in the example); merges only when an admin confirms, choosing whose costs to keep; "Copy to another company" replaced by each platform's company |
| 27 Nov 2026 | App renamed "CIMS - (Caemora Inventory Management System)"; Margins renamed "Product margins" |
| 27 Nov 2026 | Audit log: admins only; sign-ins, sign-outs and failed sign-ins recorded; CSV export |
| 27 Nov 2026 | Cases: only new flags become cases; starting case types and owners as in §8; working days Mon–Fri |
| 27 Nov 2026 | Receiving: "received" includes defective; short = sent − received; more than sent is refused for now; Amazon case ID kept on the box line for SHP-05 (built later) |
| 27 Nov 2026 | PUR-07: Purchases grouped by shipment, with a plain-list switch; a shipment shows only the selected month's lines (others counted on its header) |
| 27 Nov 2026 | PUR-07 AC7: each shipment on the Purchases tab ends with a total row: units, goods, courier paid, total (per currency) |
| 28 Nov 2026 | DSH-05: a moving company ticker at the top of the dashboard (Caemora and YouDent logos from Clayton's image; Goenche Ltd and ARC UK G Ltd as names). "My cases" removed from the dashboard (changes FLG-03 AC2): the Cases tab and its menu badge are enough |
| 27 Nov 2026 | DSH-04: dashboard drops "Balance owed to suppliers" and "Open flags by type"; shows last-12-months sales for CMR, ARC, YD and GOE; sales typed in by an admin for now (automation later); £ including VAT, all platforms; everyone can see them |
