-- =============================================================
-- MIGRATION v4 — Delivery units for base ingredients
-- Sugar stays as bags, Fondant stays as boxes, etc.
-- auto-deduction converts recipe units → delivery units via container_size.
-- Run the whole file at once in Supabase SQL Editor.
-- =============================================================

-- =============================================================
-- BLOCK A — Add container columns (needed for conversion math)
-- =============================================================
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS container_unit text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS container_size real;

-- =============================================================
-- BLOCK B — Fix Evaporated Milk naming
-- =============================================================
UPDATE ingredients SET name = 'Evaporated Milk' WHERE name = 'Evaporated Milk (cans)';
UPDATE ingredients SET is_active = false WHERE name = 'Evaporated Milk (barrels)';

-- =============================================================
-- BLOCK C — Re-activate delivery-unit rows
-- (Some may have been archived by the failed v3 migration)
-- =============================================================
UPDATE ingredients SET is_active = true WHERE name = 'Sugar'            AND unit = 'bags';
UPDATE ingredients SET is_active = true WHERE name = 'Brown Sugar'      AND unit = 'bags';
UPDATE ingredients SET is_active = true WHERE name = 'Invert Sugar'     AND unit = 'barrels';
UPDATE ingredients SET is_active = true WHERE name = 'Butter'           AND unit = 'units';
UPDATE ingredients SET is_active = true WHERE name = 'Heavy Cream'      AND unit = 'units';
UPDATE ingredients SET is_active = true WHERE name = 'Evaporated Milk'  AND unit = 'cans';
UPDATE ingredients SET is_active = true WHERE name = 'Corn Syrup'       AND unit = 'barrels';
UPDATE ingredients SET is_active = true WHERE name = 'Fondant'          AND unit = 'boxes';
UPDATE ingredients SET is_active = true WHERE name = 'Fondex'           AND unit = 'barrels';
UPDATE ingredients SET is_active = true WHERE name = 'Vanilla Extract'  AND unit = 'containers';
UPDATE ingredients SET is_active = true WHERE name = 'Chocolate'        AND unit = 'boxes';
UPDATE ingredients SET is_active = true WHERE name = 'Salt'             AND unit = 'containers';

-- =============================================================
-- BLOCK D — Archive recipe-unit duplicate rows
-- These were created by seed-recipes.mjs — no longer needed.
-- auto-deduction will find active rows by ingredient name.
-- =============================================================
UPDATE ingredients SET is_active = false WHERE name = 'Sugar'           AND unit = 'lbs';
UPDATE ingredients SET is_active = false WHERE name = 'Brown Sugar'     AND unit = 'lbs';
UPDATE ingredients SET is_active = false WHERE name = 'Invert Sugar'    AND unit = 'lbs';
UPDATE ingredients SET is_active = false WHERE name = 'Butter'          AND unit = 'lbs';
UPDATE ingredients SET is_active = false WHERE name = 'Heavy Cream'     AND unit = 'oz';
UPDATE ingredients SET is_active = false WHERE name = 'Evaporated Milk' AND unit = 'cups';
UPDATE ingredients SET is_active = false WHERE name = 'Corn Syrup'      AND unit = 'cups';
UPDATE ingredients SET is_active = false WHERE name = 'Fondant'         AND unit = 'lbs';
UPDATE ingredients SET is_active = false WHERE name = 'Fondex'          AND unit = 'lbs';
UPDATE ingredients SET is_active = false WHERE name = 'Vanilla Extract' AND unit = 'cups';
UPDATE ingredients SET is_active = false WHERE name = 'Chocolate'       AND unit = 'lbs';
UPDATE ingredients SET is_active = false WHERE name = 'Salt'            AND unit = 'cups';

-- =============================================================
-- BLOCK E — Set container_size on delivery-unit rows
-- container_size = how many recipe units fit in 1 delivery unit
-- e.g. Sugar: 1 bag = 50 lbs  → auto-deduct divides 11 lbs / 50 = 0.22 bags per batch
-- =============================================================
UPDATE ingredients SET container_size = 50,     container_unit = 'bag'       WHERE name = 'Sugar'           AND unit = 'bags';
UPDATE ingredients SET container_size = 50,     container_unit = 'bag'       WHERE name = 'Brown Sugar'     AND unit = 'bags';
UPDATE ingredients SET container_size = 58,     container_unit = 'barrel'    WHERE name = 'Invert Sugar'    AND unit = 'barrels';
UPDATE ingredients SET container_size = 1,      container_unit = 'stick'     WHERE name = 'Butter'          AND unit = 'units';
UPDATE ingredients SET container_size = 32,     container_unit = 'carton'    WHERE name = 'Heavy Cream'     AND unit = 'units';
UPDATE ingredients SET container_size = 12.125, container_unit = 'can'       WHERE name = 'Evaporated Milk' AND unit = 'cans';
UPDATE ingredients SET container_size = 80,     container_unit = 'barrel'    WHERE name = 'Corn Syrup'      AND unit = 'barrels';
UPDATE ingredients SET container_size = 50,     container_unit = 'box'       WHERE name = 'Fondant'         AND unit = 'boxes';
UPDATE ingredients SET container_size = 15,     container_unit = 'barrel'    WHERE name = 'Fondex'          AND unit = 'barrels';
UPDATE ingredients SET container_size = 16,     container_unit = 'container' WHERE name = 'Vanilla Extract' AND unit = 'containers';
UPDATE ingredients SET container_size = 50,     container_unit = 'box'       WHERE name = 'Chocolate'       AND unit = 'boxes';

-- Container info for add-in and popcorn ingredients (for display only — no conversion needed)
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
