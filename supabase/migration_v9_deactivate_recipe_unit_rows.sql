-- MIGRATION v9 — Deactivate recipe-unit rows for add-in / popcorn ingredients
-- The seed script created oz/lbs/cups rows so recipe.ingredient_id has something
-- to reference. The actual stock is tracked by the delivery-unit rows (boxes/bags/
-- barrels/etc.) that already existed. Hide the recipe-unit rows from the UI by
-- setting is_active = false wherever:
--   1. The row has no container_size (never configured as a delivery row), AND
--   2. Another active row with the same name exists (the delivery row).
UPDATE ingredients
SET is_active = false
WHERE container_size IS NULL
  AND container_unit IS NULL
  AND EXISTS (
    SELECT 1 FROM ingredients i2
    WHERE i2.name  = ingredients.name
      AND i2.id   != ingredients.id
      AND i2.is_active = true
  );

-- Also convert Peanuts from lbs to boxes (15 lb box).
UPDATE ingredients
SET unit = 'boxes', container_size = 15, container_unit = 'box', low_stock_threshold = 1
WHERE name = 'Peanuts' AND unit = 'lbs';
