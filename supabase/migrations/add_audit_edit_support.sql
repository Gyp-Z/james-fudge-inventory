-- Supports the admin-only Audit & Edit page.
-- Run in the Supabase SQL Editor. All statements are guarded / re-runnable.

-- 1. Link tray-phase ingredient deductions to the shift_report_entry that caused them,
--    so editing/deleting an entry can find and refund its deductions.
--    (Batch-phase deductions already link via batch_log_id.)
ALTER TABLE ingredient_deductions
  ADD COLUMN IF NOT EXISTS shift_report_entry_id uuid
  REFERENCES shift_report_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ingredient_deductions_entry
  ON ingredient_deductions (shift_report_entry_id);

-- 2. Audit trail for manual inventory / ingredient overrides (capabilities #4 and #5).
--    Every direct count/quantity correction writes one row here.
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text        NOT NULL,          -- 'flavor' | 'ingredient'
  target_id   uuid        NOT NULL,
  field       text        NOT NULL,          -- 'tray_count' | 'barrel_count' | 'quantity'
  old_value   real,
  new_value   real,
  reason      text,
  adjusted_by text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_created
  ON inventory_adjustments (created_at);

ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;

-- public read + insert, matching the other tables (guarded so this file re-runs cleanly)
DROP POLICY IF EXISTS "public read inventory_adjustments" ON inventory_adjustments;
CREATE POLICY "public read inventory_adjustments"
  ON inventory_adjustments FOR SELECT USING (true);

DROP POLICY IF EXISTS "public insert inventory_adjustments" ON inventory_adjustments;
CREATE POLICY "public insert inventory_adjustments"
  ON inventory_adjustments FOR INSERT WITH CHECK (true);
