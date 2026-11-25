# Caemora Inventory: Requirements

Nov 21, 2026 · @Clayton

## How to use this document

This is the single list of what the Caemora inventory app must do. Every requirement has an ID, a status and acceptance criteria (AC) that prove it works. Each AC becomes an automated test before it is built.

### Adding a requirement

1. Pick the area it belongs to (Products, Purchases, Shipments…) and take the next ID, e.g. PUR-07.
2. Write it in the template below, with 2 to 5 ACs, using real product names, quantities and ₹/£ amounts.
3. Add a row to the index table in Requirements with status Proposed.
4. Questions go in a comment on the requirement, or in Open questions at the end.

### Status meanings

| Status | Meaning |
| --- | --- |
| Proposed | Written, not yet agreed |
| Agreed | Clayton has approved it for building |
| Built | In the app and its ACs pass |
| Changed | Agreed or built, then edited; needs re-testing |
| Dropped | Decided against (keep it, with the reason) |

### Template

```
PUR-00  <short title>
As a   <India data entry / UK admin / viewer>
I want <what>
So that <why>

AC1  Given <what is true before>
     When  <what someone does>
     Then  <what the app must do>
AC2  …
```

Rules: one requirement per need, one check per AC, write what should happen even if the app differs today. Any language is fine.

## Product overview

The app replaces the MIT-2026 Excel tracker: it records stock bought in India and China, tracks it to Amazon or the UK, works out landed cost per unit, and reconciles what each company owes each supplier.

### Companies

Each company has its own bank account and pays for the stock sent to it.

| Code | Company | Sells on |
| --- | --- | --- |
| CMR | Caemora Ltd | Amazon FBA/FBM, eBay, OnBuy, Shopify |
| ARC | ARC | Amazon FBA |
| GOE | Goenche Ltd | Amazon FBA |
| YD | YouDent | eBay (YD-eBay), FBM |
| ALS | Al Store | Amazon FBA |
| GEN | Gentech | Sole-trader eBay store |
| GOA | Goa Sales | Limited sales |

### Suppliers

- **Peace Enterprises**: India buying partner, priced in ₹, paid by Wise from each company's account.
- **Folkbella**: India supplier paid directly in ₹ (Selsun, Regaine, Betadine, Persol).
- **Alibaba sellers**: China, priced and paid in £ (Amex, Apple Pay).
- **UK packaging suppliers**: stationery and boxes, in £.

### Users and roles

| Role | Who | Can |
| --- | --- | --- |
| Admin | Clayton (UK) | Everything: payments, rate card, settle months, users |
| Data entry | India team | Enter and edit purchases, shipments and products in open months; record receipts any time; cannot see payments |
| Viewer | e.g. accountant | Read everything including money; change nothing |

Live at caemora-inventory.vercel.app (Vercel + Supabase, London). Data imported from MIT-2026.xlsx, Jan–Nov 2026: 1,245 purchase lines, totals checked against the sheet.

## Requirements

43 requirements across 9 areas: 23 are built, 2 are changed and need re-testing (PRD-03, ACC-01), 1 is dropped (PRD-06), 6 are agreed for batch 1 and 11 are proposed (added 21–25 Nov 2026: PRD-07, PUR-06, SHP-06, SHP-07, LC-04, LC-05, REC-05, REC-06, REC-07, ACC-03, ACC-04, UI-01, UI-02, UI-03, UI-04). Details and ACs follow the index.

| ID | Requirement | Who | Status |
| --- | --- | --- | --- |
| PRD-01 | Find a product by name, FNSKU or ASIN | Data entry | Built |
| PRD-02 | One product sold by several companies | All | Built |
| PRD-03 | Add a new product while entering a purchase | Admin | Changed |
| PRD-04 | Warn when a new product looks like an existing one | Data entry | Agreed |
| PRD-05 | Agreed courier rate per product | Admin | Built |
| PRD-06 | Scan the FNSKU barcode to pick a product | Data entry | Dropped |
| PRD-07 | Product list: create products first, no duplicate names, optional ASIN | Admin | Agreed |
| PUR-01 | Enter one invoice with several products, in ₹ or £ | Data entry | Built |
| PUR-02 | Pre-fill last price and agreed courier | Data entry | Built |
| PUR-03 | Warn about likely mistakes before saving | Data entry | Built |
| PUR-04 | Edit or delete a line; settled months locked | Data entry, Admin | Built |
| PUR-05 | Filter purchases and export to CSV | All | Built |
| PUR-06 | Group several products into one shipment box | Data entry | Proposed |
| SHP-01 | Record a shipment or box with its IDs | Data entry | Built |
| SHP-02 | Record what was received, short or defective | Data entry | Built |
| SHP-03 | Allow receipts after a month is settled | Data entry | Built |
| SHP-04 | Flag shipments in transit too long | All | Built |
| SHP-05 | Track Amazon claims and reimbursements | Data entry, Admin | Proposed |
| SHP-06 | Live FBA shipment status from Amazon Seller Central | All | Proposed |
| SHP-07 | Courier tracking link (DPD, Parcelforce, Royal Mail) | All | Proposed |
| LC-01 | Landed cost per unit in ₹ and £ | All | Built |
| LC-02 | Landed cost per unit actually received | All | Built |
| LC-03 | Monthly ₹/£ rate from Wise payments | Admin | Built |
| LC-04 | See what went up since last month: price, courier and landed cost | Admin | Proposed |
| LC-05 | Question a supplier about an increase | Admin | Proposed |
| REC-01 | Balance owed per company, supplier and month | Admin, Viewer | Built |
| REC-02 | Record payments and the account that paid | Admin | Built |
| REC-03 | Credit notes, for one or all companies | Admin | Built |
| REC-04 | Settle and reopen a month | Admin | Built |
| REC-05 | Attach invoices and payment receipts | Admin, Data entry | Proposed |
| REC-06 | Opening and closing payments, linked to the month's invoices | Admin | Proposed |
| REC-07 | Track money owed back to personal accounts (Clayton, Alroy) | Admin | Proposed |
| FLG-01 | Automatic flags on purchases, shipments, payments | All | Built |
| FLG-02 | Flags inbox; acknowledge, resolve, clear old ones | Admin | Built |
| ACC-01 | Logins, roles and activation | Admin | Changed |
| ACC-02 | Change my password | All | Built |
| ACC-03 | Audit trail of every change, by user | Admin, Viewer | Agreed |
| ACC-04 | Login history for each user | Admin | Agreed |
| IMP-01 | Import MIT-2026.xlsx with totals checked | Admin | Built |
| UI-01 | Keep each month separate | All | Agreed |
| UI-02 | Chart of units sent by each supplier | All | Proposed |
| UI-03 | Clear, easy-to-understand layout | All | Agreed |
| UI-04 | Daily FX rate on the dashboard | All | Proposed |

## Build plan for Claude Code

There are 17 items to build (15 Proposed, 2 Changed). Build them in 4 batches, one Claude Code session per batch, and mark each batch Agreed before it starts.

| Batch | Requirements | Why this order | Set up first |
| --- | --- | --- | --- |
| 1 Foundations | PRD-07, PRD-03, PRD-04, ACC-01, ACC-03, ACC-04, UI-01, UI-03, plus a NFR-01 desktop re-check | Later batches rely on the product list, roles, the audit trail and month views | Mark the batch Agreed |
| 2 Money | REC-06, REC-07, REC-05, LC-04, LC-05 | REC-06 changes how payments are stored; LC-05 builds on LC-04 | Supabase Pro, for daily backups and file storage for REC-05 |
| 3 Chart | UI-02, UI-04 | Uses the month views from batch 1 | Nothing |
| 4 Shipments | PUR-06, SHP-07, SHP-05, SHP-06 | SHP-06 waits on Amazon access, the slowest thing to set up | Register as an Amazon Selling Partner API developer, authorise each Seller Central account, and put the keys in Vercel's settings (NFR-08) |

Move to Vercel Pro before the app is used with real business data (NFR-05).

### Handing a batch to Claude Code

1. Export this doc as Markdown and save it as `docs/requirements.md` in the app's repo.
2. Add one line to `CLAUDE.md`: "Requirements are in docs/requirements.md. Build only the IDs named in the prompt; every AC is an automated test."
3. Start the batch with the prompt below, changing the batch number and IDs.
4. When its ACs pass, set those requirements to Built here and export again.

```
Read docs/requirements.md. Build batch 1: PRD-07, PRD-03, PRD-04, ACC-01, ACC-03, ACC-04, UI-01, UI-03.

1. For each AC of these IDs, write an automated test first, named by ID and AC (e.g. "PRD-07 AC2"). Show me the list of tests before you build.
2. Then build until every new test passes, and keep all existing tests passing.
3. Follow every NFR, especially NFR-02 (access rules enforced in the database) and NFR-04 (never add ₹ and £ together).
4. Do not change behaviour for any requirement not listed. If an AC is unclear or conflicts with another, stop and ask me.
5. Finish with: tests added, files changed, database migrations, and anything you could not do.
```

## Products (PRD)

### PRD-01  Find a product by name, FNSKU or ASIN

**As** the India team **I want** to find the right product quickly when entering a purchase **so that** every unit is booked to the correct product.

- **AC1** Given "ENO fruit salt Sachet-Flavor Regular 30's" exists. When I type "eno reg". Then it is listed with last month's price and courier.
- **AC2** Given ENO Regular 30's has FNSKU X0024JP139 for ARC. When I type "X0024JP139". Then ENO Regular 30's is the only match.
- **AC3** Given ENO Regular 30's has ASIN B0DFZJVQJN. When I type "B0DFZJVQJN". Then ENO Regular 30's is listed.

### PRD-02  One product sold by several companies

**As** the India team **I want** the same product to carry each company's own FNSKU **so that** stock lands in the right Amazon account.

- **AC1** Given Colgate Slim Soft is X002PXPSXR for Goenche and X002QVJTH9 for Caemora. When I choose company Caemora and add Colgate Slim Soft. Then the line uses X002QVJTH9.
- **AC2** Given Vicks Inhaler is listed only for Goenche. When I choose ARC and search "Vicks". Then it shows "not yet listed for ARC".

### PRD-03  Add a new product while entering a purchase

**As** the UK admin **I want** to create a missing product without leaving the purchase I am entering **so that** I don't have to stop entering the invoice.

- **AC1** Given "Himalaya Neem Face Wash 150ml" does not exist and I am admin entering a purchase. When I choose "Create product" from the search. Then the New product form (PRD-07) opens, and once saved the product is added to the purchase line.
- **AC2** Given I am data entry and the product does not exist. When I search for it. Then I see "Not in product list: ask an admin" and have no option to create it.
- **AC3** Given an admin creates a product during a purchase. Then it has no agreed courier rate until one is set (PRD-05).

**Changed 21 Nov 2026:** only an admin can create products (PRD-07). Data entry can no longer add a product while entering a purchase; they see "Not in product list: ask an admin". ACs rewritten 22 Nov 2026; they need re-testing.

### PRD-04  Warn when a new product looks like an existing one  \[Agreed\]

**As** the India team **I want** a warning before I create a duplicate **so that** one product does not end up under two names.

- **AC1** Given "Colgate Zig Zag Toothbrush (Pack of 6)" exists. When I try to add "Colgate ZigZag Toothbrush Pack of 6". Then the app shows "Similar product exists" with the existing one to pick.
- **AC2** Given the FNSKU I type already belongs to a product. When I try to add a new product with it. Then the app stops me and offers the existing product.

### PRD-05  Agreed courier rate per product

**As** the UK admin **I want** to set the agreed courier rate per unit and the month it starts **so that** overcharges are caught automatically.

- **AC1** Given I set Vicks Inhaler to ₹30 per unit from Nov 2026. When a Nov line is entered at ₹35 courier per unit. Then it is flagged "Courier above rate card".
- **AC2** Given the same rate. When an Oct line had ₹35 courier. Then the Oct line is not flagged (rate starts in Nov).
- **AC3** Given I am data entry. When I try to change an agreed rate. Then the app refuses.

### PRD-06  Scan the FNSKU barcode to pick a product  \[Dropped\]

**Dropped 22 Nov 2026:** the app is now desktop-first (NFR-01), and a laptop cannot scan a box label with its camera. A USB barcode scanner that types the FNSKU into the search box would still work through PRD-01, with no extra build.

**As** the India team **I want** to scan the label on the box with my phone camera **so that** I don't type FNSKUs by hand.

- **AC1** Given I am on the New purchase screen on my phone. When I scan the label X0024JP139. Then ENO Regular 30's is added for the chosen company.
- **AC2** Given the scanned FNSKU is unknown. When I scan it. Then the app offers to add a new product with that FNSKU.

### PRD-07  Product list: create products first, no duplicate names, optional ASIN  \[Agreed\]

**As** the UK admin **I want** every product created once in the product list before it is used **so that** each entry picks the same product and no name appears twice.

- **AC1** Given I am admin and open Products > New product. When I enter "Himalaya Neem Face Wash 150ml", FNSKU X00ABC1234 for ARC and ASIN B0CXYZ1234. Then it saves and anyone searching "neem" on New purchase finds it straight away.
- **AC2** Given "ENO fruit salt Sachet-Flavor Regular 30's" exists. When I try to create "eno fruit salt sachet-flavor regular 30's " (other capitals, extra space). Then the app refuses with "This product already exists" and opens the existing one.
- **AC3** Given a product has no ASIN yet. When I leave ASIN blank. Then it saves, shows "No ASIN" on the product, and the ASIN can be added later.
- **AC4** Given I type ASIN "12345". Then the app refuses: "An ASIN is 10 letters and numbers, e.g. B0DFZJVQJN".
- **AC5** Given a product is not in the list. When I search for it on New purchase. Then data entry sees "Not in product list: ask an admin" and an admin sees a button to create it, and the line cannot be saved until the product exists.

## Purchases (PUR)

### PUR-01  Enter one invoice with several products, in ₹ or £

**As** the India team **I want** to enter a whole invoice from my laptop **so that** we stop using the Excel sheet.

- **AC1** Given I am logged in as data entry. When I enter invoice PE-131 for ARC: 50 units ENO Regular 30's at ₹260 + ₹130 courier. Then it saves and shows a total of ₹19,500.
- **AC2** Given vendor Alibaba is chosen. When I open the form. Then the currency switches to £.
- **AC3** Given I choose "New shipment" with FBA15MY6VJDX. When I save. Then the products are linked to that shipment.

### PUR-02  Pre-fill last price and agreed courier

**As** the India team **I want** the usual price and courier filled in for me **so that** entry is fast and consistent.

- **AC1** Given ENO Regular 30's was ₹260 + ₹130 courier last month, and no rate card is set. When I add it. Then price ₹260 and courier ₹130 are filled in.
- **AC2** Given an agreed courier rate of ₹125 exists. When I add the product. Then courier is filled with ₹125, not last month's ₹130.

### PUR-03  Warn about likely mistakes before saving

**As** the India team **I want** to see warnings while I type **so that** errors are fixed before they reach Clayton.

- **AC1** Given ENO Regular 30's was ₹260 last month. When I enter ₹300 (more than 5% change). Then I see "Price was ₹260 last time".
- **AC2** Given a ₹120 product. When I enter courier ₹150. Then I see "Courier is more than the product price".
- **AC3** Given currency is ₹. When I enter a price of 2.6. Then I see "₹2.6 looks like a £ price".
- **AC4** Given I am entering a purchase. When I leave the invoice number empty. Then I see "No invoice number: this will be flagged".
- **AC5** Given any warning shows. When I press Save. Then it still saves (warnings never block).

### PUR-04  Edit or delete a line; settled months locked

**As** the India team and the admin **I want** to correct mistakes, but not change money after a month is settled **so that** settled accounts stay final.

- **AC1** Given November is open. When I change a quantity. Then it saves and the line total updates.
- **AC2** Given October is settled and I am data entry. When I change a price in October. Then the app refuses: "October 2026 is settled. Ask an admin."
- **AC3** Given October is settled and I am admin. When I change a price with reason "Corrected invoice". Then it saves, is logged with my reason, and a critical flag is raised.
- **AC4** Given I delete a line. Then the deletion is kept in the change history.

### PUR-05  Filter purchases and export to CSV

**As** anyone **I want** to find and export purchases **so that** I can check them or share them.

- **AC1** Given I filter Nov 2026 and ARC. Then only ARC's November lines show, with totals per currency.
- **AC2** Given I search "PE-131" or "FBA15MY6VJDX". Then the matching lines show.
- **AC3** Given a filtered list. When I press Export CSV. Then I download exactly those lines with ₹ and £ totals.

### PUR-06  Group several products into one shipment box  \[Proposed\]

**As** the India team **I want** to put several purchased products, even from different invoices, into one shipment box **so that** we know exactly what each box contains.

This builds on PUR-01 AC3 and SHP-01 AC2, which link one invoice at a time to a box.

- **AC1** Given invoice PE-131 for ARC has 5 lines: 50 ENO Regular 30's, 40 Colgate Slim Soft, 30 Vicks Inhaler, 20 Himalaya Neem Face Wash 150ml and 10 Betadine. When I tick all 5 and choose "Put in one box" with box 3, FBA15MRYZWHR. Then one shipment is created holding all 5 products, 150 units in total.
- **AC2** Given box 3 exists. When I open it. Then I see its contents: each product, its units, its invoice number and company, and the total of 150 units.
- **AC3** Given ARC lines on invoices PE-131 and PE-140. When I add lines from both to box 3. Then the box lists both, each with its own invoice number.
- **AC4** Given a line of 50 ENO Regular 30's. When I put 30 in box 3 and 20 in box 4. Then each box shows its part and the line shows "50 shipped in 2 boxes". If I try to put 60 in total, the app refuses.
- **AC5** Given one line is for ARC and another for Goenche. When I try to put both in the same Amazon (FBA) box. Then the app refuses: "An Amazon shipment can only hold one company's stock".

## Shipments and receiving (SHP)

### SHP-01  Record a shipment or box with its IDs

**As** the India team **I want** each box to carry its box no., Amazon shipment ID, tracking no. and date **so that** we can follow it to Amazon or the UK.

- **AC1** Given I create box 3 with FBA15MRYZWHR and tracking 15509743236023. Then it shows under Shipments as "In transit" with its products and units.
- **AC2** Given a box is in transit. When I add another purchase to it ("Add to existing"). Then its products appear in that box.

### SHP-02  Record what was received, short or defective

**As** the India team **I want** to record what Amazon or the UK actually received **so that** shortages are claimed and landed cost is right.

- **AC1** Given box FBA15MRYZWHR was sent with 45 units. When I mark it Received on 04 Nov with 0 short. Then it shows "Received" with that date.
- **AC2** Given the same box. When I enter 2 short and 1 defective with remark "case raised". Then it shows "Received, short/defective" and the line shows 42 received.
- **AC3** Given a line has short units but no remark. Then an info flag "Short/defective, no remark" is raised.

### SHP-03  Allow receipts after a month is settled

**As** the India team **I want** to record receipts for boxes sent in a settled month **so that** late arrivals are still tracked.

- **AC1** Given October is settled and an October box arrives in November. When I mark it received with 1 short. Then it saves.
- **AC2** Given the same box. When I try to change its price, quantity or company. Then the app refuses.

### SHP-04  Flag shipments in transit too long

**As** the UK admin **I want** boxes stuck in transit to be flagged **so that** I chase them.

- **AC1** Given a box was sent 22 days ago and is still in transit. Then an "In transit too long" flag is raised (limit 21 days, set in Admin).
- **AC2** Given the box is then marked received. Then the flag clears by itself.

### SHP-05  Track Amazon claims and reimbursements  \[Proposed: screen to be added\]

**As** the UK admin **I want** each lost or damaged unit's case ID, reimbursement ID and £ paid back **so that** I know which claims are still open.

- **AC1** Given 26 units of Colgate Zig Zag were missing (case 12151530462). When the reimbursement 7965309542 of £38.22 is recorded. Then the line shows the case as reimbursed.
- **AC2** Given lines with a case ID but no reimbursement after 30 days. Then they appear in an "Open claims" list.

### SHP-06  Live FBA shipment status from Amazon Seller Central  \[Proposed\]

**As** the UK admin **I want** each FBA box's status and units received pulled from Amazon Seller Central automatically **so that** I see what Amazon has done without checking Seller Central or receiving by hand.

This uses Amazon's Selling Partner API (Fulfillment Inbound), which needs each company's Seller Central account (CMR, ARC, GOE, ALS) to authorise the app once.

- **AC1** Given ARC's Seller Central account is connected and box FBA15MRYZWHR is in it. When Amazon changes its status to Receiving. Then the box shows "Receiving (Amazon)" within 1 hour, with the time it was last updated.
- **AC2** Given Amazon reports FBA15MRYZWHR as Closed with 45 units shipped and 43 received. Then the receipt (SHP-02) fills in 43 received and 2 short, marked "from Amazon", and data entry only adds the remark.
- **AC3** Given the app has 45 units on the box but Amazon shows 40 shipped. Then a warning flag "Units sent don't match Amazon" is raised.
- **AC4** Given Amazon cannot be reached for 24 hours. Then each box shows its last update time, an info flag is raised, and manual receiving still works.
- **AC5** Given a company's Seller Central account is not connected. Then its boxes are received by hand as today and marked "Manual".

### SHP-07  Courier tracking link (DPD, Parcelforce, Royal Mail)  \[Proposed\]

**As** the UK admin **I want** to open a box's tracking page in one click **so that** I can check where a parcel is without copying the number into each courier's website.

No paid tracking service: the app links to the courier's own tracking page and does not pull live updates (live tracking is in the Backlog).

- **AC1** Given box 3 has DPD tracking 15509743236023. When I click Track. Then DPD's tracking page for 15509743236023 opens in a new tab.
- **AC2** Given I enter a tracking number. When I save the box. Then I must pick the courier: DPD, Parcelforce, Royal Mail or Other.
- **AC3** Given the courier is Other. Then the number shows without a link, with "Track on the courier's website".

## Landed cost (LC)

### LC-01  Landed cost per unit in ₹ and £

**As** the UK admin **I want** product + courier cost per unit, by company and month, in both currencies **so that** I can price on Amazon and check margins.

- **AC1** Given ARC bought 70 ENO Regular 30's in Nov at ₹260 + ₹130 courier, and the Nov rate is ₹123.96 per £ (LC-03). Then landed cost shows ₹390.00 and £3.15 per unit.
- **AC2** Given an Alibaba line of 25 Shower Filters at £2.74 + £1.31. Then it shows £4.05 per unit and the ₹ equivalent at that month's rate.
- **AC3** Given I search a product. Then I see its landed cost month by month.
- **AC4** Given any filter. When I press Export CSV. Then I download the same rows.

### LC-02  Landed cost per unit actually received

**As** the UK admin **I want** cost per sellable unit when units arrive short or damaged **so that** I see the true cost of what I can sell.

- **AC1** Given 100 units cost ₹39,000 and 4 arrived short. Then cost per unit received shows ₹406.25.

### LC-03  Monthly ₹/£ rate from Wise payments

**As** the UK admin **I want** each month's rate taken from what Wise actually charged **so that** £ figures match the bank.

- **AC1** Given two Nov Wise payments: ₹246,322 for £1,987.20 and ₹160,000 for £1,290.71. Then the Nov rate is ₹406,322 ÷ £3,277.91 = ₹123.96 per £.
- **AC2** Given I type 125 for Nov on the Admin page. Then 125 is used and marked "manual".
- **AC3** Given a month has no payments yet. Then the previous month's rate is used.

### LC-04  See what went up since last month: price, courier and landed cost  \[Proposed\]

**As** the UK admin (payment maker) **I want** to see, per product, how the product price, the courier per unit and the landed cost per unit changed from the last month it was bought **so that** I can question the supplier before I pay.

Where a month has several prices for the same product and company, the average weighted by units is used. Amounts stay in their own currency (NFR-04).

- **AC1** Given ARC bought ENO Regular 30's in Oct at ₹250 + ₹120 courier and in Nov at ₹260 + ₹130. When I open Cost changes for Nov 2026. Then the row shows price ₹250 → ₹260 (+₹10, +4.0%), courier ₹120 → ₹130 (+₹10, +8.3%) and landed cost ₹370 → ₹390 (+₹20, +5.4%).
- **AC2** Given Cost changes for Nov 2026 and supplier Peace. When I tick "Increases only". Then only products whose price, courier or landed cost went up are listed, largest ₹ increase in landed cost first.
- **AC3** Given ENO Regular 30's was bought in Sep and Nov but not in Oct. When I open Cost changes for Nov 2026. Then it is compared with Sep and labelled "vs Sep 2026".
- **AC4** Given Himalaya Neem Face Wash 150ml was first bought in Nov. Then it shows "New this month" and no change.
- **AC5** Given an Alibaba Shower Filter went from £2.74 to £2.90. Then the change shows as +£0.16 (+5.8%), in £, not converted to ₹.

### LC-05  Question a supplier about an increase  \[Proposed\]

**As** the UK admin (payment maker) **I want** to mark an increase as queried with the supplier and record their answer **so that** no increase is paid without an explanation.

- **AC1** Given ENO Regular 30's courier went from ₹120 to ₹130 in Nov (LC-04). When I press "Query supplier" and write "Why +₹10 courier per unit?". Then the row shows "Queried" with my note and today's date.
- **AC2** Given Peace replies that the box size changed. When I record the reply and choose "Accepted". Then the row shows "Accepted" and leaves the Open queries list.
- **AC3** Given Peace agrees the ₹10 was an overcharge on 70 units. When I choose "Credit due". Then the row shows "Credit due ₹700" until a credit note is linked to it (REC-03).
- **AC4** Given three queried Peace products for Nov 2026. When I press "Export for supplier". Then I download those three rows with old and new price, courier and my question, in ₹.

## Reconciliation, payments and settled months (REC)

### REC-01  Balance owed per company, supplier and month

**As** the UK admin **I want** to see what each company owes each supplier every month **so that** I pay the right amount from the right bank account.

- **AC1** Given Goenche bought ₹208,497 from Peace in Oct, had a ₹1,086 credit note and paid ₹270,000, and it started Oct owing ₹3,330. Then Oct closing shows −₹59,259 (in credit).
- **AC2** Given Oct closing is −₹59,259. Then Nov opening is −₹59,259.
- **AC3** Given all companies are shown. Then a Total row adds them up for that supplier.
- **AC4** Given I am data entry. Then I cannot open Reconciliation or see payments.

### REC-02  Record payments and the account that paid

**As** the UK admin **I want** to record each Wise/Revolut/Amex payment with the bank account it left **so that** payments made from another company's account are visible.

- **AC1** Given I add ₹160,000 for ARC, paid from ARC, £1,290.71, Wise ref 2497343413. Then it appears under ARC as paid from "own".
- **AC2** Given a payment for ARC was paid from Caemora's account. Then it is highlighted as paid from CMR.
- **AC3** Given a payment has no date, method or £ amount. Then it shows as Unconfirmed and is not deducted until I press "Confirm paid".

### REC-03  Credit notes, for one or all companies

**As** the UK admin **I want** to record supplier credit notes **so that** overcharges reduce what we owe.

- **AC1** Given a ₹2,730 credit for ARC in Oct ("Excess billing on ARC"). Then ARC's Oct balance falls by ₹2,730.
- **AC2** Given a ₹6,786 credit for all companies in Nov. Then it shows on its own row and reduces the supplier Total only.

### REC-04  Settle and reopen a month

**As** the UK admin **I want** to close a month once it is paid and checked **so that** nobody changes it afterwards by mistake.

- **AC1** Given October is open. When I press "Settle October 2026". Then it shows as settled and data entry can no longer change its money fields.
- **AC2** Given October is settled. When I reopen it with reason "Late invoice from Peace". Then it opens and a critical flag records who reopened it and why.

### REC-05  Attach invoices and payment receipts  \[Proposed\]

**As** the UK admin **I want** to upload the supplier invoice against each purchase and the receipt against each payment **so that** I have the proof to hand when I reconcile and when a supplier disputes an amount.

- **AC1** Given invoice PE-131. When data entry uploads PE-131.pdf. Then every line of PE-131, including ENO Regular 30's, shows a paperclip that opens the file in one tap.
- **AC2** Given the ₹160,000 ARC payment with Wise ref 2497343413. When I upload the Wise receipt. Then it shows on the payment and on ARC's November Reconciliation row.
- **AC3** Given November has 5 payments and 2 have no receipt. Then Reconciliation shows "2 payments without a receipt" for November.
- **AC4** Given I upload a PDF, JPG, PNG or Word file up to 10 MB. Then it saves. Given a 25 MB file. Then the app refuses: "Files must be 10 MB or less".
- **AC5** Given I am data entry. Then I can upload and open invoices but never see payment receipts. A deleted file stays in the audit trail (ACC-03).

### REC-06  Opening and closing payments, linked to the month's invoices  \[Proposed\]

**As** the UK admin **I want** to record each supplier's opening payment and closing payment per company and month, linked to that month's invoices **so that** I pay the right balance from each company's account and every invoice shows the payments and receipts that covered it.

How it works today: the supplier spreads items across several companies, sends a rough opening amount for each company, then at closing sends the remaining amount per company.

- **AC1** Given Peace asks for an opening amount of ₹100,000 for ARC for Nov 2026. When I record it as an Opening payment for ARC, Peace, Nov 2026. Then it shows as Opening and reduces ARC's November balance.
- **AC2** Given ARC's November Peace invoices total ₹250,000, with a ₹2,000 credit note and the ₹100,000 opening payment. Then the app shows Closing due ₹148,000.
- **AC3** Given Peace's closing figure for ARC is ₹150,000. When I enter it. Then the app shows the ₹2,000 difference from its own ₹148,000 before I pay.
- **AC4** Given I record the ₹148,000 Closing payment with its Wise receipt. Then every November Peace invoice for ARC, e.g. PE-131, lists both the opening and closing payments and their receipts (admin and viewer only).
- **AC5** Given invoice PE-131 has lines for both ARC and Goenche. Then ARC's payments link only to ARC's lines and Goenche's payments only to Goenche's lines.

### REC-07  Track money owed back to personal accounts (Clayton, Alroy)  \[Proposed\]

**As** the UK admin **I want** payments made from the Clayton or Alroy personal accounts recorded as owed back by the company they paid for **so that** each person is repaid exactly what they put in.

- **AC1** Given a ₹50,000 Peace payment for ARC was paid from Clayton's personal account for £403.36. When I record it with "Paid from: Clayton (personal)". Then it reduces ARC's balance with Peace and shows "ARC owes Clayton £403.36".
- **AC2** Given ARC owes Clayton £403.36. When I record a repayment of £403.36 from ARC's account to Clayton. Then ARC owes Clayton £0.00 and the item is closed.
- **AC3** Given amounts owed to both Clayton and Alroy by several companies. When I open "Owed to personal accounts". Then I see a total per person and per company, in £.
- **AC4** Given I am data entry. Then I cannot see personal-account payments or amounts owed.

## Flags, access and import (FLG, ACC, IMP)

### FLG-01  Automatic flags on purchases, shipments and payments

**As** the UK admin **I want** problems raised for me automatically, on save and every night **so that** I don't have to check every row.

- **AC1** Given ENO Regular 30's was ₹260 in Oct. When a Nov line is saved at ₹275 (+5.8%). Then a "Price changed" warning flag is raised.
- **AC2** Given ENO Regular 30's courier was ₹130 per unit in Oct. When a Nov line is saved at ₹135. Then a "Courier changed" warning flag is raised.
- **AC3** Given a line with price ₹120. When it is saved with courier ₹150 per unit. Then a "Courier above product price" warning flag is raised.
- **AC4** Given Vicks Inhaler's rate card is ₹30 per unit from Nov 2026. When a Nov line of 100 units is saved at ₹35 courier per unit. Then a critical "Courier above rate card" flag is raised showing a ₹500 overcharge.
- **AC5** Given a line is saved with no invoice number. Then a "No invoice number" warning flag is raised.
- **AC6** Given a line is saved with a blank or ₹0 price. Then a critical "No price" flag is raised.
- **AC7** Given currency is ₹. When a line is saved at ₹2.60. Then a "Looks like £ entered as ₹" warning flag is raised (any ₹ price under ₹20).
- **AC8** Given box 3 has tracking 15509743236023. When box 4 is saved with the same number. Then a "Duplicate tracking number" warning flag is raised.
- **AC9** Given October 2026 is settled. When an admin changes a price there with reason "Corrected invoice". Then a critical flag records who made the change and why.
- **AC10** Given a "No invoice number" flag is open on a line. When invoice number PE-131 is added. Then the flag resolves by itself.

### FLG-02  Flags inbox

**As** the UK admin **I want** one list of open flags I can work through **so that** nothing is missed.

- **AC1** Given open flags exist. Then I can filter by type, severity and status and open the line each refers to.
- **AC2** When I press Acknowledge or Resolve. Then the flag moves to that list.
- **AC3** When I mark all flags before Nov 2026 as seen (Admin page). Then imported history leaves the inbox but stays on record.
- **AC4** Given I am data entry. Then I see purchase and shipment flags only, never payment flags.

### ACC-01  Logins, roles and activation

**As** the UK admin **I want** to control who can log in and what they can do **so that** data entry cannot see or change money.

- **AC1** Given a new login is created. Then it is inactive and shows "Waiting for access" until I activate it.
- **AC2** Given I set Tanvi to Data entry and tick Active on the Admin page. Then she can enter purchases and see Landed cost, but cannot see Reconciliation or payments.
- **AC3** Given a Viewer. Then they can read everything and change nothing.

**Changed 22 Nov 2026:** data entry can now see landed cost (LC-01, LC-02), but still not payments or reconciliation. AC2 needs re-testing.

### ACC-02  Change my password

**As** any user **I want** to change my own password **so that** I can keep my login secure without asking an admin.

- **AC1** Given I am logged in. When I set a new password of 10+ characters on My account, typed twice. Then it changes and my next login uses it.

### ACC-03  Audit trail of every change, by user  \[Agreed\]

**As** the UK admin **I want** one screen showing every change, with the login of the person who made it **so that** I know who changed what, when and why. This builds on NFR-03, which records the changes.

- **AC1** Given Tanvi changes the quantity on invoice PE-131 from 50 to 70 at 14:05 on 21 Nov 2026. When I open Audit trail. Then I see Tanvi (Data entry), 21 Nov 2026 14:05, PE-131 ENO Regular 30's, Quantity 50 → 70, and her reason.
- **AC2** Given changes by Tanvi and Clayton in Nov. When I filter user Tanvi and Nov 2026. Then only Tanvi's November changes show, and I can export them to CSV.
- **AC3** Given a purchase line was deleted. Then the audit trail shows who deleted it, when, and every value it had.
- **AC4** Given I am admin or anyone else. When I try to edit or delete an audit entry. Then the app refuses: the audit trail can never be changed.
- **AC5** Given I am data entry. Then I see only changes to purchases, shipments and products, never payment changes (as FLG-02 AC4).

### ACC-04  Login history for each user  \[Agreed\]

**As** the UK admin **I want** to see who is logged in and each user's login history **so that** every change can be traced to one person and shared logins are spotted.

- **AC1** Given I am logged in. Then every screen shows "Logged in as \<name> (\<role>)" at the top.
- **AC2** Given Tanvi logged in at 09:12 on 21 Nov 2026 from her laptop. When I open Admin > Users > Tanvi. Then I see her last login, 21 Nov 2026 09:12, and a list of her logins with date, time and device.
- **AC3** Given 3 failed password attempts for Tanvi. Then they show in her login history and a warning flag is raised.
- **AC4** Given Tanvi's login is used on two different devices at the same time. Then a warning flag "Possible shared login" is raised.

### IMP-01  Import MIT-2026.xlsx with totals checked

**As** the UK admin **I want** Jan–Nov 2026 loaded from MIT-2026.xlsx only if every total matches the sheet **so that** the app starts from figures I trust.

- **AC1** Given the Jan–Nov 2026 tabs. When the import runs. Then 1,245 purchase lines, 275 shipments, 163 payments and 5 credit notes are loaded.
- **AC2** Given any month × company × currency total differs from the sheet. Then nothing is saved and the difference is reported.
- **AC3** Given the import has already run. When it is run again. Then it refuses ("Purchases already exist").

## Interface (UI)

### UI-01  Keep each month separate  \[Agreed\]

**As** anyone using the app **I want** each month's purchases, shipments and costs shown on their own, like the monthly tabs in MIT-2026 **so that** one month's stock is never mixed up with another's.

A purchase belongs to the month of its invoice date, not the date it was entered.

- **AC1** Given I open Purchases. Then the current month (Nov 2026) is shown, with a month picker for Jan–Nov 2026.
- **AC2** Given I pick October 2026. Then Purchases, Shipments and Landed cost show only October lines and October totals per company and currency, and the month stays picked as I move between those screens.
- **AC3** Given I am viewing October and enter a purchase with invoice date 05 Nov 2026. When I save. Then it is saved in November and the app shows "Saved to November 2026".
- **AC4** Given October is settled. Then October shows a "Settled" lock in the month picker.
- **AC5** Given I choose "All months". Then lines from every month show with a Month column and a subtotal per month.

### UI-02  Chart of units sent by each supplier  \[Proposed\]

**As** the UK admin **I want** a chart of how many units each supplier sends each month **so that** I can see who supplies most and spot a sudden rise or drop.

A switch at the top shows either **Units bought** (units on purchase lines, by invoice month; the default) or **Units shipped** (units in boxes, by the date each box was sent).

- **AC1** Given Nov 2026 purchases of 1,200 units from Peace, 300 from Folkbella and 25 from Alibaba. When I open the Dashboard. Then a bar chart shows one bar per supplier for Nov with those units.
- **AC2** Given Jan–Nov 2026 data. When I choose "Last 6 months". Then the chart shows units per supplier for each month Jun–Nov, one colour per supplier.
- **AC3** Given I filter company ARC and switch to Units shipped. Then the chart counts only units in ARC's boxes, by the date each box was sent.
- **AC4** Given I click Peace's Nov bar. Then Peace's Nov purchase lines open, and their units add up to the bar.
- **AC5** Given I am data entry. Then I can see the chart, because it shows units only and no money.

### UI-03  Clear, easy-to-understand layout  \[Agreed\]

**As** anyone using the app **I want** screens that are simple, consistent and labelled in plain words **so that** the India team and I can use the app without training or mistakes.

- **AC1** Given I log in as data entry. Then the home screen shows three large buttons, "New purchase", "Record receipt" and "Shipments", and no money figures.
- **AC2** Given I log in as admin. Then the home screen shows open flags, open supplier queries (LC-05) and this month's totals per currency, each one tap from its list.
- **AC3** Given any status is shown (In transit, Received, Short, Settled). Then it has both a colour and a word, never colour alone.
- **AC4** Given any form field. Then it has a plain label with its currency and an example, e.g. "Courier per unit (₹), e.g. 130", and the menu is in the same place and order on every screen.
- **AC5** Given an India team member who has not used the app before. When they are asked to enter invoice PE-131 with 3 products on a laptop. Then they finish it in under 5 minutes without help.

### UI-04  Daily FX rate on the dashboard  \[Proposed\]

**As** the UK admin and the India team **I want** today's £ to ₹ exchange rate shown on the dashboard **so that** we can see how the rate is moving before we price stock or pay suppliers.

The daily rate is for information only. Landed cost and reconciliation keep using the monthly Wise rate (LC-03). It comes from a free published source, such as the European Central Bank's daily reference rates, so it adds no cost (NFR-05).

- **AC1** Given I open the dashboard on 25 Nov 2026. Then it shows today's rate as "£1 = ₹X", with the source and the time it was last updated.
- **AC2** Given November's Wise rate is ₹123.96 per £ (LC-03). Then the dashboard shows today's rate next to it, with the difference in ₹ and %.
- **AC3** Given the source has not published today's rate (e.g. a weekend). Then the last published rate shows, labelled with its date, e.g. "Rate from 21 Nov 2026".
- **AC4** Given I click the rate. Then a chart of the last 30 days' daily rates opens.
- **AC5** Given today's rate changes. Then no landed cost, balance or payment changes, because those use the monthly Wise rate.

## Non-functional requirements

These apply to every screen and are checked on each release.

| ID | Requirement | How it is checked |
| --- | --- | --- |
| NFR-01 | Desktop-first: every screen works on a laptop or desktop at 1366×768 or larger with no sideways scrolling; phones are not supported | Test in Chrome and Edge on a laptop at 1366×768 |
| NFR-02 | Access rules are enforced by the database, not only the screens | Database tests run as each role |
| NFR-03 | Every change to purchases, shipments, payments and products is logged with who, when and why | Change history on each line |
| NFR-04 | ₹ and £ are never added together; every amount carries its currency | Totals shown per currency |
| NFR-05 | Hosting stays under £40 a month for up to 10 users (Supabase Pro $25 + Vercel Pro $20, about £35) | Monthly Supabase and Vercel invoices. Vercel Pro is needed because the free Hobby plan is for non-commercial use only |
| NFR-06 | Daily backup of the database | Supabase Pro daily backups (kept 7 days) |
| NFR-07 | Fast: every page opens in under 2 seconds, and searching, filtering and saving respond in under 1 second, on the India team's laptops and office internet | Timed on the India team's laptops before each release; any slower page is fixed before release |
| NFR-08 | No passwords or secret keys in the spreadsheet, repo or chat | Review before each import |
| NFR-09 | Responsive: anything taking over half a second shows a loading sign, the screen never freezes, and long lists (e.g. all 1,245 purchase lines for Jan–Nov 2026) open and scroll smoothly | Tested with the full imported data on a laptop before each release |

## Backlog: future requirements

Ideas not yet written as full requirements. Move one into Requirements (with an ID and ACs) when it is ready to be agreed.

| Idea | Why it matters | Rough size |
| --- | --- | --- |
| Stock on hand per product and company, from purchases minus sales | Know what to reorder | Large |
| Amazon, eBay, Shopify and OnBuy sales sync | Margin per product using landed cost | Large |
| Reorder suggestions from sales speed and days of cover | Avoid stock-outs | Medium |
| Open claims list for Amazon case IDs (part of SHP-05) | Chase lost-unit reimbursements | Small |
| Duplicate-product cleanup screen: merge two products into one | 280 imported products, some near-duplicates | Medium |
| Supplier statement upload and auto-match to payments | Faster month-end | Medium |
| Forgot-password email link | Users reset without admin help | Small |
| WhatsApp or email alert for critical flags | Act the same day | Small |
| Live courier tracking events through a paid tracking service (was SHP-07) | See parcel movement without opening the courier's site | Medium |

## Open questions and decisions

### Open questions

- [ ] None open: all answered by 22 Nov 2026 (see Decisions made).

### Decisions made

| Date | Decision |
| --- | --- |
| 21 Nov 2026 | Each company pays its own supplier invoices from its own bank account; reconciliation is per company, with a supplier total |
| 21 Nov 2026 | Credit notes may apply to all companies (e.g. Nov ₹6,786) |
| 21 Nov 2026 | Same FNSKU or product under several companies is normal |
| 21 Nov 2026 | Oct "Closing" payments (Caemora ₹889,481, YouDent ₹207,411) were paid |
| 21 Nov 2026 | Landed cost per unit bought; £ at each month's actual Wise rate; price-change flag at 5% |
| 21 Nov 2026 | India team cannot see payments or reconciliation |
| 21 Nov 2026 | Receipts can be recorded after a month is settled; money fields stay locked |
| 21 Nov 2026 | Only the admin creates products (PRD-07); PRD-03 changed to match. Marked "maybe": revisit if it slows the India team down |
| 21 Nov 2026 | Payments are linked to invoices through opening and closing payments per company, supplier and month (REC-06) |
| 21 Nov 2026 | Anyone with access to a company's Seller Central account can authorise the app for it (SHP-06) |
| 21 Nov 2026 | Couriers to track first: DPD, Parcelforce and Royal Mail (SHP-07) |
| 22 Nov 2026 | Host on Supabase Pro ($25) and Vercel Pro ($20): about £35 a month, limit £40 (NFR-05) |
| 22 Nov 2026 | The app is desktop-first; phones are not supported (NFR-01). PRD-06 barcode scanning dropped |
| 22 Nov 2026 | A purchase belongs to the month of its invoice date (UI-01) |
| 22 Nov 2026 | Supplier chart shows units bought or units shipped, with a switch (UI-02) |
| 22 Nov 2026 | No paid tracking service: SHP-07 is a link to the courier's own tracking page; live tracking moved to Backlog |
| 22 Nov 2026 | "Clayton" and "Alroy" are personal accounts; payments from them are tracked as owed back (REC-07) |
| 22 Nov 2026 | Data entry can see landed cost, but not payments or reconciliation (ACC-01 changed) |
| 22 Nov 2026 | The Oct–Nov per-company balances that looked swapped (Al Store ₹257,001 paid, ARC ₹1,004,027 owed) were an error or work in progress in the sheet, not a requirement |
| 22 Nov 2026 | Jan–Oct 2026 are ready to settle (REC-04) |
| 25 Nov 2026 | Daily FX rate shown on the dashboard for information only; costs and balances keep the monthly Wise rate (UI-04) |
| 25 Nov 2026 | Speed targets set: pages under 2 seconds, actions under 1 second (NFR-07, NFR-09) |

## Glossary

| Term | Meaning |
| --- | --- |
| FNSKU | Amazon's label code for a product in one seller account (X00…) |
| ASIN | Amazon's product code, the same across sellers (B0…) |
| FBA / FBM | Fulfilled by Amazon / by the merchant |
| Landed cost | Product price + courier, per unit |
| Rate card | The agreed courier charge per unit for a product |
| Settled month | A month that is paid and checked; its money can no longer be changed by data entry |
| Flag | An automatic warning about a possible mistake |
| AC | Acceptance criterion: a Given / When / Then check that proves a requirement works |
| Opening payment | A rough amount the supplier asks for per company at the start of a month, before final invoices (not the same as the opening balance carried in from last month) |
| Closing payment | The remaining amount per company paid at month end: invoices minus credit notes minus the opening payment |
