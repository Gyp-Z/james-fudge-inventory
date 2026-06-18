-- Fudge Pops — small fudge pops made from a Vanilla or Chocolate base.
-- Pops are NOT sold individually (too small to track sales). Logging them tells the
-- system that part of a base batch went to pops, which does two things:
--   (1) counts toward clearing that base's "made today" reminder in the Products tab
--       (~20 pops = 1 tray of base), and
--   (2) deducts per-pop toppings (handled in src/core/ops.js — half each topping's
--       per-tray rate across a full ~20-pop session, scaled by actual pop count).
-- No base-ingredient deduction here: the base BATCH already deducted those when logged.

CREATE TABLE IF NOT EXISTS fudge_pop_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  base        TEXT        NOT NULL CHECK (base IN ('vanilla', 'chocolate')),
  pop_count   INTEGER     NOT NULL CHECK (pop_count > 0),
  report_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  logged_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE fudge_pop_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "public read fudge_pop_logs" ON fudge_pop_logs FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "public insert fudge_pop_logs" ON fudge_pop_logs FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Link each fudge-pop topping deduction back to its log row (audit + future revert).
ALTER TABLE ingredient_deductions
  ADD COLUMN IF NOT EXISTS fudge_pop_log_id UUID REFERENCES fudge_pop_logs(id);

-- Sprinkles topping ingredient: 4 cartons in stock, 6 lb (96 oz) net per carton.
-- Stored in oz (container_size = 96) like the other toppings so the deduction formula
-- (recipe_qty_oz / container_size) needs no unit conversion.
INSERT INTO ingredients (name, unit, quantity, container_size, container_unit, low_stock_threshold, is_active)
SELECT 'Sprinkles', 'cartons', 4, 96, 'oz', 1, true
WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE name = 'Sprinkles' AND is_active = true);
