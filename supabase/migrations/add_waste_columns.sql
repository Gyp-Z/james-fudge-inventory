-- Track in-progress tray waste separately from full-tray waste (fudge)
ALTER TABLE shift_report_entries
  ADD COLUMN IF NOT EXISTS in_progress_wasted INTEGER NOT NULL DEFAULT 0;

-- Store waste reason on batch-level waste (caramel and popcorn logged in Batches tab)
ALTER TABLE batch_logs
  ADD COLUMN IF NOT EXISTS waste_reason TEXT;
