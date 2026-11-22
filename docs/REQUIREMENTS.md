# Caemora Inventory: Requirements

Last updated 22 Nov 2026 · Owner: Clayton

## How to use this document

This is the single list of what the Caemora inventory app must do. Every requirement has an ID, a status and acceptance criteria (AC) that prove it works. Each AC becomes an automated test before it is built.

**Adding a requirement**

1. Pick the area it belongs to (Products, Purchases, Shipments…) and take the next ID, e.g. `PUR-07`.
2. Write it in the template below, with 2 to 5 ACs, using real product names, quantities and ₹/£ amounts.
3. Add a row to the index table in Requirements with status **Proposed**.
4. Questions go in Open questions at the end (or a GitHub issue that names the ID).

To edit on GitHub: open this file, click the pencil icon (Edit), make the change, then **Commit changes**. Every edit is kept in the file's history.

**Status meanings**

| Status | Meaning |
| --- | --- |
| Proposed | Written, not yet agreed |
| Agreed | Clayton has approved it for building |
| Built | In the app and its ACs pass |
| Changed | Agreed or built, then edited; needs re-testing |
| Dropped | Decided against (keep it, with the reason) |

**Template**

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

Rules: one requirement per need, one check per AC, write what *should* happen even if the app differs today. Any language is fine.

## Product overview

The app replaces the MIT-2026 Excel tracker: it records stock bought in India and China, tracks it to Amazon or the UK, works out landed cost per unit, and reconciles what each company owes each supplier.

**Companies** (each has its own bank account and pays for the stock sent to it)

| Code | Company | Sells on |
| --- | --- | --- |
| CMR | Caemora Ltd | Amazon FBA/FBM, eBay, OnBuy, Shopify |
| ARC | ARC | Amazon FBA |
| GOE | Goenche Ltd | Amazon FBA |
| YD | YouDent | eBay (YD-eBay), FBM |
| ALS | Al Store | Amazon FBA |
| GEN | Gentech | Sole-trader eBay store |
| GOA | Goa Sales | Limited sales |

**Suppliers**

- Peace Enterprises: India buying partner, priced in ₹, paid by Wise from each company's account.
- Folkbella: India supplier paid directly in ₹ (Selsun, Regaine, Betadine, Persol).
- Alibaba sellers: China, priced and paid in £ (Amex, Apple Pay).
- UK packaging suppliers: stationery and boxes, in £.

**Users and roles**

| Role | Who | Can |
| --- | --- | --- |
| Admin | Clayton (UK) | Everything: payments, rate card, settle months, users |
| Data entry | India team | Enter and edit purchases, shipments and products in open months; record receipts any time; cannot see payments |
| Viewer | e.g. accountant | Read everything including money; change nothing |

Live at caemora-inventory.vercel.app (Vercel + Supabase, London). Data imported from MIT-2026.xlsx, Jan–Nov 2026: 1,245 purchase lines, totals checked against the sheet.

## Requirements

29 requirements across 8 areas: 26 are built, 3 are proposed. Details and ACs follow the index.

| ID | Requirement | Who | Status |
| --- | --- | --- | --- |
| PRD-01 | Find a product by name, FNSKU or ASIN | Data entry | Built |
| PRD-02 | One product sold by several companies | All | Built |
| PRD-03 | Add a new product while entering a purchase | Data entry | Built |
| PRD-04 | Warn when a new product looks like an existing one | Data entry | Proposed |
| PRD-05 | Agreed courier rate per product | Admin | Built |
| PRD-06 | Scan the FNSKU barcode to pick a product | Data entry | Proposed |
| PUR-01 | Enter one invoice with several products, in ₹ or £ | Data entry | Built |
| PUR-02 | Pre-fill last price and agreed courier | Data entry | Built |
| PUR-03 | Warn about likely mistakes before saving | Data entry | Built |
| PUR-04 | Edit or delete a line; settled months locked | Data entry, Admin | Built |
| PUR-05 | Filter purchases and export to CSV | All | Built |
| SHP-01 | Record a shipment or box with its IDs | Data entry | Built |
| SHP-02 | Record what was received, short or defective | Data entry | Built |
| SHP-03 | Allow receipts after a month is settled | Data entry | Built |
| SHP-04 | Flag shipments in transit too long | All | Built |
| SHP-05 | Track Amazon claims and reimbursements | Data entry, Admin | Proposed |
| SHP-06 | Create a shipment on its own, then add purchases to it | Data entry | Built |
| LC-01 | Landed cost per unit in ₹ and £ | Admin, Viewer | Built |
| LC-02 | Landed cost per unit actually received | Admin, Viewer | Built |
| LC-03 | Monthly ₹/£ rate from Wise payments | Admin | Built |
| REC-01 | Balance owed per company, supplier and month | Admin, Viewer | Built |
| REC-02 | Record payments and the account that paid | Admin | Built |
| REC-03 | Credit notes, for one or all companies | Admin | Built |
| REC-04 | Settle and reopen a month | Admin | Built |
| FLG-01 | Automatic flags on purchases, shipments, payments | All | Built |
| FLG-02 | Flags inbox; acknowledge, resolve, clear old ones | Admin | Built |
| ACC-01 | Logins, roles and activation | Admin | Built |
| ACC-02 | Change my password | All | Built |
| IMP-01 | Import MIT-2026.xlsx with totals checked | Admin | Built |

### Products (PRD)

```
PRD-01  Find a product by name, FNSKU or ASIN
As the India team
I want to find the right product quickly when entering a purchase
So that every unit is booked to the correct product

AC1  Given "ENO fruit salt Sachet-Flavor Regular 30's" exists
     When  I type "eno reg"
     Then  it is listed with last month's price and courier
AC2  Given ENO Regular 30's has FNSKU X0024JP139 for ARC
     When  I type "X0024JP139"
     Then  ENO Regular 30's is the only match
AC3  Given ENO Regular 30's has ASIN B0DFZJVQJN
     When  I type "B0DFZJVQJN"
     Then  ENO Regular 30's is listed
```

```
PRD-02  One product sold by several companies
As the India team
I want the same product to carry each company's own FNSKU
So that stock lands in the right Amazon account

AC1  Given Colgate Slim Soft is X002PXPSXR for Goenche and X002QVJTH9 for Caemora
     When  I choose company Caemora and add Colgate Slim Soft
     Then  the line uses X002QVJTH9
AC2  Given Vicks Inhaler is listed only for Goenche
     When  I choose ARC and search "Vicks"
     Then  it shows "not yet listed for ARC"
```

```
PRD-03  Add a new product while entering a purchase
As the India team
I want to add a product that is not in the list
So that I don't have to stop entering the invoice

AC1  Given "Himalaya Neem Face Wash 150ml" does not exist
     When  I add it with FNSKU X00ABC1234 for ARC
     Then  it is created and added to the purchase
AC2  Given I am data entry
     When  I add a product
     Then  it has no agreed courier rate until an admin sets one
```

```
PRD-04  Warn when a new product looks like an existing one   [Proposed]
As the India team
I want a warning before I create a duplicate
So that one product does not end up under two names

AC1  Given "Colgate Zig Zag Toothbrush (Pack of 6)" exists
     When  I try to add "Colgate ZigZag Toothbrush Pack of 6"
     Then  the app shows "Similar product exists" with the existing one to pick
AC2  Given the FNSKU I type already belongs to a product
     When  I try to add a new product with it
     Then  the app stops me and offers the existing product
```

```
PRD-05  Agreed courier rate per product
As the UK admin
I want to set the agreed courier rate per unit and the month it starts
So that overcharges are caught automatically

AC1  Given I set Vicks Inhaler to ₹30 per unit from Nov 2026
     When  a Nov line is entered at ₹35 courier per unit
     Then  it is flagged "Courier above rate card"
AC2  Given the same rate
     When  an Oct line had ₹35 courier
     Then  the Oct line is not flagged (rate starts in Nov)
AC3  Given I am data entry
     When  I try to change an agreed rate
     Then  the app refuses
```

```
PRD-06  Scan the FNSKU barcode to pick a product   [Proposed]
As the India team
I want to scan the label on the box with my phone camera
So that I don't type FNSKUs by hand

AC1  Given I am on the New purchase screen on my phone
     When  I scan the label X0024JP139
     Then  ENO Regular 30's is added for the chosen company
AC2  Given the scanned FNSKU is unknown
     When  I scan it
     Then  the app offers to add a new product with that FNSKU
```

### Purchases (PUR)

```
PUR-01  Enter one invoice with several products, in ₹ or £
As the India team
I want to enter a whole invoice from my phone
So that we stop using the Excel sheet

AC1  Given I am logged in as data entry
     When  I enter invoice PE-131 for ARC: 50 units ENO Regular 30's at ₹260 + ₹130 courier
     Then  it saves and shows a total of ₹19,500
AC2  Given vendor Alibaba is chosen
     When  I open the form
     Then  the currency switches to £
AC3  Given I choose "New shipment" with FBA15MY6VJDX
     When  I save
     Then  the products are linked to that shipment
```

```
PUR-02  Pre-fill last price and agreed courier
As the India team
I want the usual price and courier filled in for me
So that entry is fast and consistent

AC1  Given ENO Regular 30's was ₹260 + ₹130 courier last month
     And   no rate card is set
     When  I add it
     Then  price ₹260 and courier ₹130 are filled in
AC2  Given an agreed courier rate of ₹125 exists
     When  I add the product
     Then  courier is filled with ₹125, not last month's ₹130
```

```
PUR-03  Warn about likely mistakes before saving
As the India team
I want to see warnings while I type
So that errors are fixed before they reach Clayton

AC1  Given ENO Regular 30's was ₹260 last month
     When  I enter ₹300 (more than 5% change)
     Then  I see "Price was ₹260 last time"
AC2  Given I enter courier ₹150 on a ₹120 product
     Then  I see "Courier is more than the product price"
AC3  Given currency is ₹
     When  I enter a price of 2.6
     Then  I see "₹2.6 looks like a £ price"
AC4  Given the invoice number is empty
     Then  I see "No invoice number: this will be flagged"
AC5  Given any warning shows
     When  I press Save
     Then  it still saves (warnings never block)
```

```
PUR-04  Edit or delete a line; settled months locked
As the India team and the admin
I want to correct mistakes, but not change money after a month is settled
So that settled accounts stay final

AC1  Given November is open
     When  I change a quantity
     Then  it saves and the line total updates
AC2  Given October is settled and I am data entry
     When  I change a price in October
     Then  the app refuses: "October 2026 is settled. Ask an admin."
AC3  Given October is settled and I am admin
     When  I change a price with reason "Corrected invoice"
     Then  it saves, is logged with my reason, and a critical flag is raised
AC4  Given I delete a line
     Then  the deletion is kept in the change history
```

```
PUR-05  Filter purchases and export to CSV
As anyone
I want to find and export purchases
So that I can check them or share them

AC1  Given I filter Nov 2026 and ARC
     Then  only ARC's November lines show, with totals per currency
AC2  Given I search "PE-131" or "FBA15MY6VJDX"
     Then  the matching lines show
AC3  Given a filtered list
     When  I press Export CSV
     Then  I download exactly those lines with ₹ and £ totals
```

### Shipments and receiving (SHP)

```
SHP-01  Record a shipment or box with its IDs
As the India team
I want each box to carry its box no., Amazon shipment ID, tracking no. and date
So that we can follow it to Amazon or the UK

AC1  Given I create box 3 with FBA15MRYZWHR and tracking 15509743236023
     Then  it shows under Shipments as "In transit" with its products and units
AC2  Given a box is in transit
     When  I add another purchase to it ("Add to existing")
     Then  its products appear in that box
```

```
SHP-02  Record what was received, short or defective
As the India team
I want to record what Amazon or the UK actually received
So that shortages are claimed and landed cost is right

AC1  Given box FBA15MRYZWHR was sent with 45 units
     When  I mark it Received on 04 Nov with 0 short
     Then  it shows "Received" with that date
AC2  Given the same box
     When  I enter 2 short and 1 defective with remark "case raised"
     Then  it shows "Received, short/defective" and the line shows 42 received
AC3  Given a line has short units but no remark
     Then  an info flag "Short/defective, no remark" is raised
```

```
SHP-03  Allow receipts after a month is settled
As the India team
I want to record receipts for boxes sent in a settled month
So that late arrivals are still tracked

AC1  Given October is settled and an October box arrives in November
     When  I mark it received with 1 short
     Then  it saves
AC2  Given the same box
     When  I try to change its price, quantity or company
     Then  the app refuses
```

```
SHP-04  Flag shipments in transit too long
As the UK admin
I want boxes stuck in transit to be flagged
So that I chase them

AC1  Given a box was sent 22 days ago and is still in transit
     Then  a "In transit too long" flag is raised (limit 21 days, set in Admin)
AC2  Given the box is then marked received
     Then  the flag clears by itself
```

```
SHP-05  Track Amazon claims and reimbursements   [Proposed: screen to be added]
As the UK admin
I want each lost or damaged unit's case ID, reimbursement ID and £ paid back
So that I know which claims are still open

AC1  Given 26 units of Colgate Zig Zag were missing (case 12151530462)
     When  the reimbursement 7965309542 of £38.22 is recorded
     Then  the line shows the case as reimbursed
AC2  Given lines with a case ID but no reimbursement after 30 days
     Then  they appear in an "Open claims" list
```

```
SHP-06  Create a shipment on its own, then add purchases to it
As the India team
I want to create a shipment or box before entering what is in it
So that I can record the Amazon shipment ID and tracking as soon as the box is packed

AC1  Given I am on Shipments
     When  I press "+ New shipment" and enter ARC, box 3, FBA15MRYZWHR, tracking 15509743236023, 27 Oct 2026
     Then  the shipment is created as "In transit" and its page opens, showing 0 products
AC2  Given that new shipment
     When  I press "Add purchase to this shipment"
     Then  New purchase opens with this shipment already chosen and company set to ARC
AC3  Given shipment FBA15MRYZWHR box 3 already exists
     When  I try to create it again
     Then  the app refuses and links to the existing one
AC4  Given I am a Viewer
     Then  I do not see "+ New shipment"
AC5  Given October is settled and I am data entry
     When  I try to create a shipment in October
     Then  the app refuses: "October 2026 is settled. Ask an admin."
```

### Landed cost (LC)

```
LC-01  Landed cost per unit in ₹ and £
As the UK admin
I want product + courier cost per unit, by company and month, in both currencies
So that I can price on Amazon and check margins

AC1  Given ARC bought 70 ENO Regular 30's in Nov at ₹260 + ₹130 courier
     And   the Nov rate is ₹123.68 per £
     Then  landed cost shows ₹390.00 and £3.15 per unit
AC2  Given an Alibaba line of 25 Shower Filters at £2.74 + £1.31
     Then  it shows £4.05 per unit and the ₹ equivalent at that month's rate
AC3  Given I search a product
     Then  I see its landed cost month by month
AC4  Given any filter
     When  I press Export CSV
     Then  I download the same rows
```

```
LC-02  Landed cost per unit actually received
As the UK admin
I want cost per sellable unit when units arrive short or damaged
So that I see the true cost of what I can sell

AC1  Given 100 units cost ₹39,000 and 4 arrived short
     Then  cost per unit received shows ₹406.25
```

```
LC-03  Monthly ₹/£ rate from Wise payments
As the UK admin
I want each month's rate taken from what Wise actually charged
So that £ figures match the bank

AC1  Given two Nov Wise payments: ₹246,322 for £1,987.20 and ₹160,000 for £1,290.71
     Then  the Nov rate is ₹406,322 ÷ £3,277.91 = ₹123.96 per £
AC2  Given I type 125 for Nov on the Admin page
     Then  125 is used and marked "manual"
AC3  Given a month has no payments yet
     Then  the previous month's rate is used
```

### Reconciliation, payments and settled months (REC)

```
REC-01  Balance owed per company, supplier and month
As the UK admin
I want to see what each company owes each supplier every month
So that I pay the right amount from the right bank account

AC1  Given Goenche bought ₹208,497 from Peace in Oct, had a ₹1,086 credit note and paid ₹270,000
     And   it started Oct owing ₹3,330
     Then  Oct closing shows −₹59,259 (in credit)
AC2  Given Oct closing is −₹59,259
     Then  Nov opening is −₹59,259
AC3  Given all companies are shown
     Then  a Total row adds them up for that supplier
AC4  Given I am data entry
     Then  I cannot open Reconciliation or see payments
```

```
REC-02  Record payments and the account that paid
As the UK admin
I want to record each Wise/Revolut/Amex payment with the bank account it left
So that payments made from another company's account are visible

AC1  Given I add ₹160,000 for ARC, paid from ARC, £1,290.71, Wise ref 2497343413
     Then  it appears under ARC as paid from "own"
AC2  Given a payment for ARC was paid from Caemora's account
     Then  it is highlighted as paid from CMR
AC3  Given a payment has no date, method or £ amount
     Then  it shows as Unconfirmed and is not deducted until I press "Confirm paid"
```

```
REC-03  Credit notes, for one or all companies
As the UK admin
I want to record supplier credit notes
So that overcharges reduce what we owe

AC1  Given a ₹2,730 credit for ARC in Oct ("Excess billing on ARC")
     Then  ARC's Oct balance falls by ₹2,730
AC2  Given a ₹6,786 credit for all companies in Nov
     Then  it shows on its own row and reduces the supplier Total only
```

```
REC-04  Settle and reopen a month
As the UK admin
I want to close a month once it is paid and checked
So that nobody changes it afterwards by mistake

AC1  Given October is open
     When  I press "Settle October 2026"
     Then  it shows as settled and data entry can no longer change its money fields
AC2  Given October is settled
     When  I reopen it with reason "Late invoice from Peace"
     Then  it opens and a critical flag records who reopened it and why
```

### Flags, access and import (FLG, ACC, IMP)

```
FLG-01  Automatic flags on purchases, shipments and payments
As the UK admin
I want problems raised for me automatically, on save and every night
So that I don't have to check every row

AC1  Price changed more than 5% vs an earlier month → "Price changed" (warning)
AC2  Courier per unit changed vs an earlier month → "Courier changed" (warning)
AC3  Courier per unit above the product price → warning
AC4  Courier above the agreed rate card → critical, with the ₹ overcharge
AC5  No invoice number → warning; blank or zero price → critical
AC6  ₹ price under ₹20 → "Looks like £ entered as ₹"
AC7  Same tracking number on two shipments → warning
AC8  Any change to a settled month → critical, with who and why
AC9  Given the cause is fixed (e.g. invoice number added)
     Then  the flag resolves by itself
```

```
FLG-02  Flags inbox
As the UK admin
I want one list of open flags I can work through
So that nothing is missed

AC1  Given open flags exist
     Then  I can filter by type, severity and status and open the line each refers to
AC2  When  I press Acknowledge or Resolve
     Then  the flag moves to that list
AC3  When  I mark all flags before Nov 2026 as seen (Admin page)
     Then  imported history leaves the inbox but stays on record
AC4  Given I am data entry
     Then  I see purchase and shipment flags only, never payment flags
```

```
ACC-01  Logins, roles and activation
As the UK admin
I want to control who can log in and what they can do
So that data entry cannot see or change money

AC1  Given a new login is created
     Then  it is inactive and shows "Waiting for access" until I activate it
AC2  Given I set Tanvi to Data entry and tick Active on the Admin page
     Then  she can enter purchases but cannot see Reconciliation or Landed cost
AC3  Given a Viewer
     Then  they can read everything and change nothing
```

```
ACC-02  Change my password
AC1  Given I am logged in
     When  I set a new password of 10+ characters on My account, typed twice
     Then  it changes and my next login uses it
```

```
IMP-01  Import MIT-2026.xlsx with totals checked
AC1  Given the Jan–Nov 2026 tabs
     When  the import runs
     Then  1,245 purchase lines, 275 shipments, 163 payments and 5 credit notes are loaded
AC2  Given any month × company × currency total differs from the sheet
     Then  nothing is saved and the difference is reported
AC3  Given the import has already run
     When  it is run again
     Then  it refuses ("Purchases already exist")
```

## Non-functional requirements

These apply to every screen and are checked on each release.

| ID | Requirement | How it is checked |
| --- | --- | --- |
| NFR-01 | Works on a phone: purchase entry and receiving usable one-handed, no sideways scrolling | Test on an Android phone at 390px width |
| NFR-02 | Access rules are enforced by the database, not only the screens | Database tests run as each role |
| NFR-03 | Every change to purchases, shipments, payments and products is logged with who, when and why | Change history on each line |
| NFR-04 | ₹ and £ are never added together; every amount carries its currency | Totals shown per currency |
| NFR-05 | Hosting stays under £25 a month for up to 10 users | Vercel Hobby + Supabase Free or Pro |
| NFR-06 | Daily backup of the database | Supabase Pro daily backups, or a nightly export |
| NFR-07 | Pages load in under 3 seconds on 4G in India | Check from the India team's phones |
| NFR-08 | No passwords or secret keys in the spreadsheet, repo or chat | Review before each import |

## Backlog: future requirements

Ideas not yet written as full requirements. Move one into Requirements (with an ID and ACs) when it is ready to be agreed.

| Idea | Why it matters | Rough size |
| --- | --- | --- |
| Amazon FBA inbound sync: fill received / short from the Amazon shipment ID | Removes manual receiving for FBA boxes | Medium |
| Stock on hand per product and company, from purchases minus sales | Know what to reorder | Large |
| Amazon, eBay, Shopify and OnBuy sales sync | Margin per product using landed cost | Large |
| Reorder suggestions from sales speed and days of cover | Avoid stock-outs | Medium |
| Upload invoice PDFs and photos against a purchase | Proof for disputes and accounts | Small |
| Open claims list for Amazon case IDs (part of SHP-05) | Chase lost-unit reimbursements | Small |
| Duplicate-product cleanup screen: merge two products into one | 280 imported products, some near-duplicates | Medium |
| Supplier statement upload and auto-match to payments | Faster month-end | Medium |
| Forgot-password email link | Users reset without admin help | Small |
| WhatsApp or email alert for critical flags | Act the same day | Small |

## Open questions and decisions

**Open questions**

- [ ] Oct–Nov per-company balances look swapped (Al Store paid ₹257,001 with no purchases; ARC owes ₹1,004,027). Which purchases belong to which company?
- [ ] Are "Clayton" and "Alroy" personal accounts, and should payments from them be tracked as owed back?
- [ ] Which months should be settled now: Jan–Sep, or Jan–Oct?
- [ ] Should data entry see landed cost (but not payments)?

**Decisions made**

| Date | Decision |
| --- | --- |
| 21 Nov 2026 | Each company pays its own supplier invoices from its own bank account; reconciliation is per company, with a supplier total |
| 21 Nov 2026 | Credit notes may apply to all companies (e.g. Nov ₹6,786) |
| 21 Nov 2026 | Same FNSKU or product under several companies is normal |
| 21 Nov 2026 | Oct "Closing" payments (Caemora ₹889,481, YouDent ₹207,411) were paid |
| 21 Nov 2026 | Landed cost per unit bought; £ at each month's actual Wise rate; price-change flag at 5% |
| 21 Nov 2026 | India team cannot see payments or reconciliation |
| 21 Nov 2026 | Receipts can be recorded after a month is settled; money fields stay locked |

**Glossary**

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
