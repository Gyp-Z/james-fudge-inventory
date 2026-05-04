-- James' Fudge Inventory -- Supabase Schema
-- Run this in the Supabase SQL Editor to set up your database

-- Flavors (the fudge menu)
create table if not exists flavors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  reorder_threshold text default 'low',
  low_tray_threshold integer not null default 2,
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
-- MIGRATION v3 -- Role system + persistent tray counts
-- ============================================================

create table if not exists current_inventory (
  flavor_id uuid primary key references flavors(id) on delete cascade,
  tray_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table current_inventory enable row level security;

create policy "Anyone can read current_inventory" on current_inventory
  for select to anon, authenticated using (true);
create policy "Anyone can insert current_inventory" on current_inventory
  for insert to anon, authenticated with check (true);
create policy "Anyone can update current_inventory" on current_inventory
  for update to anon, authenticated using (true);

-- Allow anon (staff) to submit shift reports without logging in
create policy "Anyone can insert shift_reports" on shift_reports
  for insert to anon with check (true);
create policy "Anyone can read shift_reports" on shift_reports
  for select to anon using (true);
create policy "Anyone can insert shift_report_items" on shift_report_items
  for insert to anon with check (true);
create policy "Anyone can read shift_report_items" on shift_report_items
  for select to anon using (true);

-- ============================================================
-- MIGRATION v2 -- Run this if you already set up v1
-- ============================================================

-- Replace stock_level (text) with tray_count (integer)
alter table shift_report_items add column if not exists tray_count integer not null default 0;
alter table shift_report_items drop column if exists stock_level;

-- Ingredients supply tracking table
create table if not exists ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null default 'units',
  quantity real not null default 0,
  low_stock_threshold real not null default 0,
  is_active boolean not null default true,
  needs_reorder boolean not null default false,
  last_checked timestamptz,
  created_at timestamptz not null default now()
);

alter table ingredients enable row level security;
create policy "Authenticated full access to ingredients" on ingredients
  for all to authenticated using (true) with check (true);

-- Real starting inventory (deep clean 2026-04-06)
insert into ingredients (name, unit, quantity, low_stock_threshold) values
  ('Sugar',                     'bags',       13,   5),
  ('Fondant',                   'boxes',      13,   3),
  ('Fondex',                    'barrels',    15,   3),
  ('Evaporated Milk (cans)',    'cans',       31,   10),
  ('Evaporated Milk (barrels)', 'barrels',    5,    2),
  ('Vanilla Extract',           'containers', 1.5,  1),
  ('Chocolate',                 'boxes',      0,    5),
  ('Butter',                    'units',      0,    3),
  ('Heavy Cream',               'units',      0,    3),
  ('Corn Syrup',                'barrels',    0,    2),
  ('Popcorn',                   'bags',       0,    5),
  ('Brown Sugar',               'bags',       0,    3),

  ('Salt',                      'containers', 0,    1);

-- ============================================================
-- MIGRATION v4 -- Add quantity tracking to existing ingredients table
-- Run this if you already ran v1/v2/v3 above
-- ============================================================
alter table ingredients add column if not exists unit text not null default 'units';
alter table ingredients add column if not exists quantity real not null default 0;
alter table ingredients add column if not exists low_stock_threshold real not null default 0;

-- ============================================================
-- MIGRATION v5 -- Restock log + Invert Sugar
-- ============================================================

-- Add Invert Sugar
insert into ingredients (name, unit, quantity, low_stock_threshold)
values ('Invert Sugar', 'barrels', 0, 3);

-- Restock log: tracks every time an ingredient is restocked
create table if not exists ingredient_restocks (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  quantity_added real not null,
  notes text,
  restocked_at timestamptz not null default now()
);

alter table ingredient_restocks enable row level security;
create policy "Authenticated full access to ingredient_restocks" on ingredient_restocks
  for all to authenticated using (true) with check (true);

-- ============================================================

-- ============================================================
-- MIGRATION v6 -- Public read access + archive for ingredients
-- Run these in Supabase SQL Editor
-- ============================================================

-- Allow anon (public/chef) to read flavors and current_inventory
-- (current_inventory anon SELECT already exists from v3; flavors was missing it)
create policy if not exists "Public read flavors" on flavors
  for select to anon using (true);

-- Archive column for ingredients
alter table ingredients add column if not exists archived boolean not null default false;

-- ============================================================

-- ============================================================
-- MIGRATION v8 -- Track in-progress tray count in current_inventory
-- Run in Supabase SQL Editor
-- ============================================================
alter table current_inventory add column if not exists in_progress_count integer not null default 0;

-- ============================================================

-- Seed some example flavors to get started
insert into flavors (name) values
  ('Vanilla'),
  ('Peanut Butter'),
  ('Chocolate Peanut Butter'),
  ('Cookies & Cream'),
  ('Maple Walnut'),

  ('Rocky Road');
