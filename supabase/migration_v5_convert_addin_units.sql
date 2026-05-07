-- =============================================================
-- MIGRATION v5 — Convert add-in & popcorn ingredients to container units
-- All these already have container_unit + container_size set from v4.
-- This migration changes the displayed unit from recipe units (oz, lbs, cups, etc.)
-- to delivery/container units (boxes, bags, barrels, bottles, containers).
-- quantity is also converted: new_qty = old_qty / container_size
-- (All these ingredients currently have qty = 0, so the math is a no-op.)
-- =============================================================

UPDATE ingredients
SET
  quantity      = CASE WHEN container_size > 0 THEN quantity / container_size ELSE 0 END,
  unit          = CASE container_unit
                    WHEN 'box'       THEN 'boxes'
                    WHEN 'bag'       THEN 'bags'
                    WHEN 'barrel'    THEN 'barrels'
                    WHEN 'bottle'    THEN 'bottles'
                    WHEN 'container' THEN 'containers'
                    ELSE container_unit
                  END,
  low_stock_threshold = 1
WHERE is_active = true
  AND container_unit IS NOT NULL
  AND name IN (
    'Almonds',
    'Caramel Kernels',
    'Cashews',
    'Cheddar Kernels',
    'Coconut (Shredded)',
    'Coconut Flavoring',
    'Corn Treats',
    'Key Lime Flavoring',
    'M&Ms',
    'Marshmallows',
    'Mint Flavoring',
    'Orange Cheddar Mix',
    'Oreo Pieces',
    'Peanuts (Fudge)',
    'Peanuts (Popcorn)',
    'Pistachio Flavoring',
    'Popcorn Salt',
    'Raspberry Flavoring',
    'Reeses Pieces',
    'Walnuts',
    'White Cheddar Mix'
  );

-- Cinnamon and Raspberry Food Coloring are NOT converted here
-- because their container_unit / container_size have not been set yet.
-- Ask James about what they come in, then update manually.
