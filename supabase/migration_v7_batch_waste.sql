-- MIGRATION v7 — Track wasted batches in batch_logs
-- Wasted batches still consume ingredients (they were made, just unusable).
-- is_wasted = true flags them for analytics without skipping deduction.
ALTER TABLE batch_logs ADD COLUMN IF NOT EXISTS is_wasted boolean NOT NULL DEFAULT false;
