-- =============================================================
-- MIGRATION v2 (app) — Popcorn Products + Recipes + Auto-Deduction
-- Run each block separately in Supabase SQL Editor.
-- Confirm success before running the next block.
-- =============================================================

-- =============================================================
-- BLOCK 1A — Extend flavors table
-- =============================================================
ALTER TABLE flavors ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'fudge';
ALTER TABLE flavors ADD COLUMN IF NOT EXISTS stock_unit text NOT NULL DEFAULT 'tray';
ALTER TABLE flavors ADD COLUMN IF NOT EXISTS tracks_shelf_buckets boolean NOT NULL DEFAULT false;
ALTER TABLE flavors ADD COLUMN IF NOT EXISTS default_yield real;

-- =============================================================
-- BLOCK 1B — Extend current_inventory table
-- =============================================================
ALTER TABLE current_inventory ADD COLUMN IF NOT EXISTS barrel_count real NOT NULL DEFAULT 0;

-- =============================================================
-- BLOCK 1C — Create recipes table
-- =============================================================
CREATE TABLE IF NOT EXISTS recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flavor_id uuid NOT NULL REFERENCES flavors(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity_per_batch real NOT NULL,
  unit text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(flavor_id, ingredient_id)
);
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth full access recipes" ON recipes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public read recipes" ON recipes FOR SELECT TO anon USING (true);

-- =============================================================
-- BLOCK 1D — Create ingredient_deductions table
-- =============================================================
CREATE TABLE IF NOT EXISTS ingredient_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_log_id uuid REFERENCES batch_logs(id) ON DELETE SET NULL,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity_deducted real NOT NULL,
  unit text NOT NULL,
  deducted_at timestamptz NOT NULL DEFAULT now(),
  notes text
);
ALTER TABLE ingredient_deductions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth full access deductions" ON ingredient_deductions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public insert deductions" ON ingredient_deductions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Public read deductions" ON ingredient_deductions FOR SELECT TO anon USING (true);

-- =============================================================
-- BLOCK 1E — Create shelf_bucket_logs table
-- =============================================================
CREATE TABLE IF NOT EXISTS shelf_bucket_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flavor_id uuid NOT NULL REFERENCES flavors(id) ON DELETE CASCADE,
  small_buckets integer NOT NULL DEFAULT 0,
  large_buckets integer NOT NULL DEFAULT 0,
  barrels_used real,
  notes text,
  logged_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE shelf_bucket_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth full access shelf_buckets" ON shelf_bucket_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public insert shelf_buckets" ON shelf_bucket_logs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Public read shelf_buckets" ON shelf_bucket_logs FOR SELECT TO anon USING (true);

-- =============================================================
-- BLOCK 1F — Insert new popcorn-specific ingredients
-- Skips any ingredient that already exists with the same name+unit.
-- Fudge base ingredients (Sugar/lbs etc.) are created by seed-recipes.mjs.
-- =============================================================
INSERT INTO ingredients (name, unit, quantity, low_stock_threshold)
SELECT v.name, v.unit, 0, v.threshold
FROM (VALUES
  ('Caramel Kernels',       'oz',     0, 96),
  ('Cheddar Kernels',       'oz',     0, 64),
  ('Popcorn Salt',          'cups',   0, 2),
  ('Corn Treats',           'bags',   0, 6),
  ('Peanuts (Popcorn)',     'lbs',    0, 3),
  ('Almonds',               'lbs',    0, 5),
  ('Cashews',               'lbs',    0, 3),
  ('Orange Cheddar Mix',    'L',      0, 2),
  ('White Cheddar Mix',     'L',      0, 2),
  ('Oreo Popcorn Kit',      'boxes',  0, 1),
  ('Popcorn Sugar',         'L',      0, 4),
  ('Popcorn Brown Sugar',   'L',      0, 4),
  ('Mint Flavoring',        'cups',   0, 1),
  ('Key Lime Flavoring',    'cups',   0, 1),
  ('Coconut Flavoring',     'cups',   0, 1),
  ('Coconut (Shredded)',    'lbs',    0, 3),
  ('Raspberry Flavoring',   'cups',   0, 1),
  ('Raspberry Food Coloring','cups',  0, 1),
  ('Pistachio Flavoring',   'cups',   0, 1),
  ('Oreo Pieces',           'oz',     0, 200),
  ('M&Ms',                  'oz',     0, 150),
  ('Reeses Pieces',         'oz',     0, 150),
  ('Walnuts',               'oz',     0, 200),
  ('Marshmallows',          'oz',     0, 60),
  ('Peanuts (Fudge)',       'quarts', 0, 6),
  ('Cinnamon',              'lbs',    0, 1)
) AS v(name, unit, qty, threshold)
WHERE NOT EXISTS (
  SELECT 1 FROM ingredients WHERE name = v.name AND unit = v.unit
);

-- =============================================================
-- BLOCK 1G — Insert popcorn flavors
-- Uses correct column names: is_active, low_tray_threshold
-- =============================================================
INSERT INTO flavors (name, product_type, stock_unit, low_tray_threshold, tracks_shelf_buckets, is_active, default_yield)
SELECT v.name, 'popcorn', 'barrel', 1, v.shelf, true, v.yield
FROM (VALUES
  ('Caramel Corn',       true,  2.5),
  ('Nut Caramel Corn',   true,  2.5),
  ('Cheddar Corn',       false, 1.0),
  ('White Cheddar Corn', false, 1.0),
  ('Oreo Popcorn',       false, 1.0)
) AS v(name, shelf, yield)
WHERE NOT EXISTS (SELECT 1 FROM flavors WHERE name = v.name);

-- =============================================================
-- BLOCK 1G-extra — Set default_yield on existing fudge flavors
-- Regular fudge = 3 trays per batch; Caramel (Trey) = 2 trays.
-- =============================================================
UPDATE flavors SET default_yield = 3
WHERE product_type = 'fudge' AND default_yield IS NULL;

UPDATE flavors SET default_yield = 2
WHERE name = 'Caramel' AND product_type = 'fudge';

-- =============================================================
-- BLOCK 1H — Insert current_inventory rows for new popcorn flavors
-- =============================================================
INSERT INTO current_inventory (flavor_id, tray_count, barrel_count)
SELECT f.id, 0, 0
FROM flavors f
WHERE f.product_type = 'popcorn'
  AND NOT EXISTS (
    SELECT 1 FROM current_inventory ci WHERE ci.flavor_id = f.id
  );
