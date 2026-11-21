-- Caemora inventory: core schema
-- Money is stored as numeric with an explicit currency on every row, so ₹ and £ are never summed together.

create extension if not exists pgcrypto;

create type user_role       as enum ('admin', 'data_entry', 'viewer');
create type currency_code   as enum ('INR', 'GBP', 'USD', 'CNY');
create type sales_channel   as enum ('FBA', 'FBM', 'EBAY', 'ONBUY', 'SHOPIFY', 'OTHER');
create type period_status   as enum ('open', 'settled');
create type shipment_status as enum ('in_transit', 'received', 'received_partial', 'lost', 'cancelled');
create type payment_kind    as enum ('opening', 'closing', 'other');
create type flag_status     as enum ('open', 'acknowledged', 'resolved');
create type flag_severity   as enum ('info', 'warning', 'critical');
create type vendor_kind     as enum ('india_partner', 'supplier', 'alibaba', 'other');
create type line_category   as enum ('stock', 'consumable');

-- ---------------------------------------------------------------- reference data

create table companies (
  code        text primary key,                 -- CMR, ARC, GOE, YD, ALS, GEN, GOA
  name        text not null,
  aliases     text[] not null default '{}',     -- spellings seen in the old sheet, lower-case
  notes       text,
  active      boolean not null default true
);

create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  role        user_role not null default 'data_entry',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table vendors (
  id               bigint generated always as identity primary key,
  name             text not null unique,
  kind             vendor_kind not null default 'supplier',
  country          char(2),
  default_currency currency_code not null default 'INR',
  aliases          text[] not null default '{}',
  notes            text,
  active           boolean not null default true
);

create table settings (
  key         text primary key,
  value       jsonb not null,
  description text
);

-- ---------------------------------------------------------------- products

create table products (
  id                       bigint generated always as identity primary key,
  name                     text not null,
  category                 line_category not null default 'stock',
  -- rate card: the agreed courier charge per unit
  agreed_courier_per_unit  numeric(12, 4),
  agreed_courier_currency  currency_code not null default 'INR',
  agreed_courier_from      date,                       -- rate card applies to purchases from this month
  agreed_unit_price        numeric(12, 4),
  agreed_price_currency    currency_code not null default 'INR',
  notes                    text,
  active                   boolean not null default true,
  import_ref               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index products_name_idx on products (lower(name));

-- A product as sold by one company on one channel. FNSKUs are per seller account.
create table listings (
  id            bigint generated always as identity primary key,
  product_id    bigint not null references products (id) on delete cascade,
  company_code  text not null references companies (code),
  channel       sales_channel not null default 'FBA',
  asin          text,
  fnsku         text,
  sku           text,
  active        boolean not null default true,
  import_ref    text,
  created_at    timestamptz not null default now()
);
create unique index listings_company_fnsku_uq on listings (company_code, fnsku) where fnsku is not null;
create index listings_asin_idx on listings (asin);

-- ---------------------------------------------------------------- periods

create table periods (
  month       date primary key check (extract(day from month) = 1),
  status      period_status not null default 'open',
  settled_at  timestamptz,
  settled_by  uuid references auth.users (id),
  notes       text
);

create table fx_rates (
  month        date primary key references periods (month),
  inr_per_gbp  numeric(10, 4) not null check (inr_per_gbp > 0),
  source       text not null default 'manual',   -- 'payments' = weighted from that month's Wise payments
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- shipments & purchases

create table shipments (
  id                  bigint generated always as identity primary key,
  period_month        date not null references periods (month),
  company_code        text references companies (code),
  channel             sales_channel,
  box_no              text,
  amazon_shipment_id  text,
  uk_shipment_id      text,
  created_on          date,
  courier             text,
  tracking_no         text,
  status              shipment_status not null default 'in_transit',
  received_on         date,
  received_by         text,
  notes               text,
  import_ref          text,
  created_by          uuid references auth.users (id) default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index shipments_period_idx on shipments (period_month);
create index shipments_tracking_idx on shipments (tracking_no);
create index shipments_amz_idx on shipments (amazon_shipment_id);

create table purchase_lines (
  id                bigint generated always as identity primary key,
  period_month      date not null references periods (month),
  shipment_id       bigint references shipments (id) on delete set null,
  product_id        bigint not null references products (id),
  listing_id        bigint references listings (id),
  company_code      text not null references companies (code),
  vendor_id         bigint not null references vendors (id),
  category          line_category not null default 'stock',
  description       text,                      -- product text as typed / imported
  qty               integer not null check (qty >= 0),
  unit_price        numeric(12, 4),            -- null = blank price (flagged)
  currency          currency_code not null default 'INR',
  courier_per_unit  numeric(12, 4) not null default 0,
  courier_total     numeric(14, 4) generated always as (courier_per_unit * qty) stored,
  goods_total       numeric(14, 4) generated always as (coalesce(unit_price, 0) * qty) stored,
  line_total        numeric(14, 4) generated always as ((coalesce(unit_price, 0) + courier_per_unit) * qty) stored,
  invoice_no        text,
  invoice_date      date,
  defective_qty     integer not null default 0 check (defective_qty >= 0),
  short_qty         integer not null default 0 check (short_qty >= 0),
  received_qty      integer generated always as (qty - defective_qty - short_qty) stored,
  checked_by        text,
  remarks           text,
  remarks_2         text,
  amazon_case_id    text,
  reimbursement_id  text,
  reimbursed_gbp    numeric(12, 2),
  import_ref        text,
  created_by        uuid references auth.users (id) default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id),
  updated_at        timestamptz not null default now()
);
create index purchase_lines_period_idx on purchase_lines (period_month, company_code);
create index purchase_lines_product_idx on purchase_lines (product_id, period_month);
create index purchase_lines_shipment_idx on purchase_lines (shipment_id);

-- ---------------------------------------------------------------- money

create table payments (
  id             bigint generated always as identity primary key,
  period_month   date not null references periods (month),
  company_code   text not null references companies (code),
  vendor_id      bigint not null references vendors (id),
  kind           payment_kind not null default 'other',
  amount         numeric(14, 2) not null,        -- in `currency`
  currency       currency_code not null default 'INR',
  amount_gbp     numeric(14, 2),                 -- what left the UK account
  fx_rate        numeric(10, 4) generated always as (
                   case when currency = 'INR' and amount_gbp > 0 then round(amount / amount_gbp, 4) end) stored,
  paid_on        date,
  method         text,                           -- Wise, Revolut, Amex, Apple Pay...
  paid_from      text,                           -- account the money came from
  reference      text,                           -- Wise transfer no.
  confirmed      boolean not null default true,  -- false = imported "closing" row with no date/method
  notes          text,
  import_ref     text,
  created_by     uuid references auth.users (id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index payments_period_idx on payments (period_month, company_code);

create table credit_notes (
  id                bigint generated always as identity primary key,
  period_month      date not null references periods (month),   -- month it is deducted in
  relates_to_month  date references periods (month),
  company_code      text references companies (code),               -- null = applies to the vendor overall
  vendor_id         bigint not null references vendors (id),
  amount            numeric(14, 2) not null check (amount > 0),  -- positive = reduces balance due
  currency          currency_code not null default 'INR',
  reason            text not null,
  purchase_line_id  bigint references purchase_lines (id) on delete set null,
  import_ref        text,
  created_by        uuid references auth.users (id) default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------- flags & audit

create table flags (
  id               bigint generated always as identity primary key,
  rule             text not null,
  severity         flag_severity not null default 'warning',
  entity_type      text not null,               -- purchase_line, shipment, payment, period
  entity_id        bigint not null,
  period_month     date,
  company_code     text,
  message          text not null,
  details          jsonb not null default '{}',
  status           flag_status not null default 'open',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  resolved_by      uuid references auth.users (id),
  resolved_at      timestamptz,
  resolution_note  text
);
-- one live flag per rule per record (settled-month edits are an event log, so they repeat)
create unique index flags_rule_entity_uq on flags (rule, entity_type, entity_id) where rule <> 'settled_month_edit';
create index flags_status_idx on flags (status, period_month);

create table audit_log (
  id            bigint generated always as identity primary key,
  table_name    text not null,
  row_key       text,                            -- id, or month/key for tables keyed that way
  action        text not null,                   -- INSERT / UPDATE / DELETE
  old_data      jsonb,
  new_data      jsonb,
  period_month  date,
  reason        text,
  changed_by    uuid,
  changed_at    timestamptz not null default now()
);
create index audit_log_row_idx on audit_log (table_name, row_key);
