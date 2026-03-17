-- James' Fudge Inventory -- Supabase Schema
-- Run this in the Supabase SQL Editor to set up your database

-- Flavors (the fudge menu)
create table if not exists flavors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  reorder_threshold text default 'low',
  created_at timestamptz not null default now()
);

-- Shift Reports (one per shift)
create table if not exists shift_reports (
  id uuid primary key default gen_random_uuid(),
  shift_date date not null,
  notes text,
  logged_by text,
  created_at timestamptz not null default now()
);

-- Shift Report Items (one row per flavor per shift report)
create table if not exists shift_report_items (
  id uuid primary key default gen_random_uuid(),
  shift_report_id uuid not null references shift_reports(id) on delete cascade,
  flavor_id uuid not null references flavors(id) on delete cascade,
  stock_level text not null default 'full', -- 'full' | 'medium' | 'low'
  sold_out boolean not null default false,
  needs_to_be_made boolean not null default false
);

-- Batch Logs (production records)
create table if not exists batch_logs (
  id uuid primary key default gen_random_uuid(),
  flavor_id uuid not null references flavors(id) on delete cascade,
  weight_lbs numeric not null,
  batch_date timestamptz not null default now(),
  notes text,
  logged_by text,
  created_at timestamptz not null default now()
);

-- Row Level Security (RLS)
-- Enable RLS on all tables
alter table flavors enable row level security;
alter table shift_reports enable row level security;
alter table shift_report_items enable row level security;
alter table batch_logs enable row level security;

-- Allow authenticated users full access to all tables
create policy "Authenticated users can read flavors" on flavors for select to authenticated using (true);
create policy "Authenticated users can insert flavors" on flavors for insert to authenticated with check (true);
create policy "Authenticated users can update flavors" on flavors for update to authenticated using (true);

create policy "Authenticated users can read shift_reports" on shift_reports for select to authenticated using (true);
create policy "Authenticated users can insert shift_reports" on shift_reports for insert to authenticated with check (true);

create policy "Authenticated users can read shift_report_items" on shift_report_items for select to authenticated using (true);
create policy "Authenticated users can insert shift_report_items" on shift_report_items for insert to authenticated with check (true);

create policy "Authenticated users can read batch_logs" on batch_logs for select to authenticated using (true);
create policy "Authenticated users can insert batch_logs" on batch_logs for insert to authenticated with check (true);

-- ============================================================
-- MIGRATION v2 -- Run this if you already set up v1
-- ============================================================

-- Replace stock_level (text) with tray_count (integer)
alter table shift_report_items add column if not exists tray_count integer not null default 0;
alter table shift_report_items drop column if exists stock_level;

-- Ingredients checklist table
create table if not exists ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  needs_reorder boolean not null default false,
  last_checked timestamptz,
  created_at timestamptz not null default now()
);

alter table ingredients enable row level security;
create policy "Authenticated full access to ingredients" on ingredients
  for all to authenticated using (true) with check (true);

-- Seed common fudge ingredients
insert into ingredients (name) values
  ('Butter'), ('Granulated Sugar'), ('Heavy Cream'), ('Cocoa Powder'),
  ('Vanilla Extract'), ('Chocolate Chips'), ('Peanut Butter'),
  ('Walnuts'), ('Marshmallows'), ('Brown Sugar'), ('Corn Syrup'), ('Salt');

-- ============================================================

-- Seed some example flavors to get started
insert into flavors (name) values
  ('Chocolate'),
  ('Vanilla'),
  ('Peanut Butter'),
  ('Chocolate Peanut Butter'),
  ('Cookies & Cream'),
  ('Maple Walnut'),
  ('Strawberry'),
  ('Rocky Road');
