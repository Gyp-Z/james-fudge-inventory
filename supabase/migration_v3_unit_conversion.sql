-- =============================================================
-- MIGRATION v3 — Convert base ingredients to recipe measurement units
-- Run the whole thing at once in Supabase SQL Editor.
-- =============================================================

-- =============================================================
-- BLOCK A — Re-activate recipe-unit rows with converted quantities
-- These were created by seed-recipes.mjs and then archived.
-- Quantities are converted from current delivery-unit stock.
--
-- Current stock (as of migration):
--   Sugar 21.6 bags, Brown Sugar 6 bags, Invert Sugar 4.9 barrels,
--   Butter 70 sticks, Heavy Cream 25 cartons, Evaporated Milk 22 cans,
--   Corn Syrup 16.2 barrels, Fondant 12.7 boxes, Fondex 10 barrels,
--   Vanilla Extract 1.4 containers, Chocolate 2.4 boxes
-- =============================================================

UPDATE ingredients SET
  is_active = true,
  quantity = 1080,            -- 21.6 bags × 50 lbs/bag
  low_stock_threshold = 100,  -- 2 bags
  container_unit = 'bag',
  container_size = 50
WHERE name = 'Sugar' AND unit = 'lbs';

UPDATE ingredients SET
  is_active = true,
  quantity = 300,             -- 6 bags × 50 lbs/bag
  low_stock_threshold = 50,   -- 1 bag
  container_unit = 'bag',
  container_size = 50
WHERE name = 'Brown Sugar' AND unit = 'lbs';

UPDATE ingredients SET
  is_active = true,
  quantity = 284.2,           -- 4.9 barrels × 58 lbs/barrel
  low_stock_threshold = 58,   -- 1 barrel
  container_unit = 'barrel',
  container_size = 58
WHERE name = 'Invert Sugar' AND unit = 'lbs';

UPDATE ingredients SET
  is_active = true,
  quantity = 70,              -- 70 sticks × 1 lb/stick
  low_stock_threshold = 10,   -- ~10 sticks
  container_unit = 'stick',
  container_size = 1
WHERE name = 'Butter' AND unit = 'lbs';

UPDATE ingredients SET
  is_active = true,
  quantity = 800,             -- 25 cartons × 32 oz/carton
  low_stock_threshold = 64,   -- 2 cartons
  container_unit = 'carton',
  container_size = 32
WHERE name = 'Heavy Cream' AND unit = 'oz';

UPDATE ingredients SET
  is_active = true,
  quantity = 266.75,          -- 22 cans × 12.125 cups/can
  low_stock_threshold = 48.5, -- 4 cans
  container_unit = 'can',
  container_size = 12.125
WHERE name = 'Evaporated Milk' AND unit = 'cups';

UPDATE ingredients SET
  is_active = true,
  quantity = 1296,            -- 16.2 barrels × 80 cups/barrel
  low_stock_threshold = 80,   -- 1 barrel
  container_unit = 'barrel',
  container_size = 80
WHERE name = 'Corn Syrup' AND unit = 'cups';

UPDATE ingredients SET
  is_active = true,
  quantity = 635,             -- 12.7 boxes × 50 lbs/box
  low_stock_threshold = 50,   -- 1 box
  container_unit = 'box',
  container_size = 50
WHERE name = 'Fondant' AND unit = 'lbs';

UPDATE ingredients SET
  is_active = true,
  quantity = 150,             -- 10 barrels × 15 lbs/barrel
  low_stock_threshold = 15,   -- 1 barrel
  container_unit = 'barrel',
  container_size = 15
WHERE name = 'Fondex' AND unit = 'lbs';

UPDATE ingredients SET
  is_active = true,
  quantity = 22.4,            -- 1.4 containers × 16 cups/container
  low_stock_threshold = 4,    -- 1/4 container
  container_unit = 'container',
  container_size = 16
WHERE name = 'Vanilla Extract' AND unit = 'cups';

UPDATE ingredients SET
  is_active = true,
  quantity = 120,             -- 2.4 boxes × 50 lbs/box
  low_stock_threshold = 50,   -- 1 box
  container_unit = 'box',
  container_size = 50
WHERE name = 'Chocolate' AND unit = 'lbs';

-- Salt stays as containers (manual tracking) — archive the recipe cups row
UPDATE ingredients SET is_active = false
WHERE name = 'Salt' AND unit = 'cups';

-- =============================================================
-- BLOCK B — Archive old delivery-unit rows
-- =============================================================

UPDATE ingredients SET is_active = false WHERE name = 'Sugar'            AND unit = 'bags';
UPDATE ingredients SET is_active = false WHERE name = 'Brown Sugar'      AND unit = 'bags';
UPDATE ingredients SET is_active = false WHERE name = 'Invert Sugar'     AND unit = 'barrels';
UPDATE ingredients SET is_active = false WHERE name = 'Butter'           AND unit = 'units';
UPDATE ingredients SET is_active = false WHERE name = 'Heavy Cream'      AND unit = 'units';
UPDATE ingredients SET is_active = false WHERE name = 'Evaporated Milk (cans)'    AND unit = 'cans';
UPDATE ingredients SET is_active = false WHERE name = 'Evaporated Milk (barrels)' AND unit = 'barrels';
UPDATE ingredients SET is_active = false WHERE name = 'Corn Syrup'       AND unit = 'barrels';
UPDATE ingredients SET is_active = false WHERE name = 'Fondant'          AND unit = 'boxes';
UPDATE ingredients SET is_active = false WHERE name = 'Fondex'           AND unit = 'barrels';
UPDATE ingredients SET is_active = false WHERE name = 'Vanilla Extract'  AND unit = 'containers';
UPDATE ingredients SET is_active = false WHERE name = 'Chocolate'        AND unit = 'boxes';

-- =============================================================
-- BLOCK C — Popcorn Sugar/Brown Sugar → use regular Sugar + Brown Sugar
-- Caramel corn recipes used Popcorn Sugar (2L ≈ 3.5 lbs) and
-- Popcorn Brown Sugar (2L ≈ 3.2 lbs). Replace with the real ingredients.
-- =============================================================

-- Remove Popcorn Sugar and Popcorn Brown Sugar from caramel corn recipes
DELETE FROM recipes
WHERE ingredient_id IN (
  SELECT id FROM ingredients WHERE name IN ('Popcorn Sugar', 'Popcorn Brown Sugar')
)
AND flavor_id IN (
  SELECT id FROM flavors WHERE name IN ('Caramel Corn', 'Nut Caramel Corn')
);

-- Insert Sugar and Brown Sugar rows for Caramel Corn and Nut Caramel Corn
INSERT INTO recipes (flavor_id, ingredient_id, quantity_per_batch, unit)
SELECT f.id, i.id,
  CASE i.name WHEN 'Sugar' THEN 3.5 ELSE 3.2 END,
  'lbs'
FROM flavors f
CROSS JOIN ingredients i
WHERE f.name IN ('Caramel Corn', 'Nut Caramel Corn')
  AND i.name IN ('Sugar', 'Brown Sugar')
  AND i.unit = 'lbs'
ON CONFLICT (flavor_id, ingredient_id)
DO UPDATE SET quantity_per_batch = EXCLUDED.quantity_per_batch, unit = EXCLUDED.unit;

-- Archive Popcorn Sugar and Popcorn Brown Sugar (no longer used as separate ingredients)
UPDATE ingredients SET is_active = false WHERE name IN ('Popcorn Sugar', 'Popcorn Brown Sugar');

-- =============================================================
-- BLOCK D — Container info for add-in / popcorn ingredients
-- =============================================================

UPDATE ingredients SET container_unit = 'box',       container_size = 400   WHERE name = 'Walnuts'               AND unit = 'oz';
UPDATE ingredients SET container_unit = 'box',       container_size = 400   WHERE name = 'M&Ms'                  AND unit = 'oz';
UPDATE ingredients SET container_unit = 'box',       container_size = 400   WHERE name = 'Reeses Pieces'         AND unit = 'oz';
UPDATE ingredients SET container_unit = 'box',       container_size = 400   WHERE name = 'Oreo Pieces'           AND unit = 'oz';
UPDATE ingredients SET container_unit = 'bag',       container_size = 12    WHERE name = 'Marshmallows'          AND unit = 'oz';
UPDATE ingredients SET container_unit = 'box',       container_size = 10    WHERE name = 'Peanuts (Fudge)'       AND unit = 'quarts';
UPDATE ingredients SET container_unit = 'box',       container_size = 15    WHERE name = 'Peanuts (Popcorn)'     AND unit = 'lbs';
UPDATE ingredients SET container_unit = 'box',       container_size = 25    WHERE name = 'Almonds'               AND unit = 'lbs';
UPDATE ingredients SET container_unit = 'box',       container_size = 15    WHERE name = 'Cashews'               AND unit = 'lbs';
UPDATE ingredients SET container_unit = 'bag',       container_size = 800   WHERE name = 'Caramel Kernels'       AND unit = 'oz';
UPDATE ingredients SET container_unit = 'bag',       container_size = 800   WHERE name = 'Cheddar Kernels'       AND unit = 'oz';
UPDATE ingredients SET container_unit = 'container', container_size = 4     WHERE name = 'Popcorn Salt'          AND unit = 'cups';
UPDATE ingredients SET container_unit = 'box',       container_size = 12    WHERE name = 'Corn Treats'           AND unit = 'bags';
UPDATE ingredients SET container_unit = 'barrel',    container_size = 13.6  WHERE name = 'Orange Cheddar Mix'    AND unit = 'L';
UPDATE ingredients SET container_unit = 'barrel',    container_size = 13.6  WHERE name = 'White Cheddar Mix'     AND unit = 'L';
UPDATE ingredients SET container_unit = 'bottle',    container_size = 1     WHERE name = 'Mint Flavoring'        AND unit = 'cups';
UPDATE ingredients SET container_unit = 'bottle',    container_size = 1     WHERE name = 'Key Lime Flavoring'    AND unit = 'cups';
UPDATE ingredients SET container_unit = 'bottle',    container_size = 1     WHERE name = 'Pistachio Flavoring'   AND unit = 'cups';
UPDATE ingredients SET container_unit = 'bottle',    container_size = 1     WHERE name = 'Coconut Flavoring'     AND unit = 'cups';
UPDATE ingredients SET container_unit = 'bottle',    container_size = 1     WHERE name = 'Raspberry Flavoring'   AND unit = 'cups';
UPDATE ingredients SET container_unit = 'box',       container_size = 25    WHERE name = 'Coconut (Shredded)'    AND unit = 'lbs';
