-- =============================================================
-- MIGRATION v6 — Pending schema updates
-- Run the whole file at once in Supabase SQL Editor.
-- =============================================================

-- =============================================================
-- BLOCK A — Add is_component flag to flavors
-- Marks flavors that are kitchen ingredients, not shelf products.
-- e.g. Caramel (used for Sea Salt Caramel fudge, not sold directly)
-- =============================================================
ALTER TABLE flavors ADD COLUMN IF NOT EXISTS is_component boolean NOT NULL DEFAULT false;

-- Mark Caramel as a component flavor
UPDATE flavors SET is_component = true WHERE name = 'Caramel' AND product_type != 'popcorn';

-- =============================================================
-- BLOCK B — Expand shelf_bucket_logs to track made vs sold
-- Replaces the original small_buckets / large_buckets columns
-- (those tracked "on shelf" as a snapshot; new columns track activity)
-- =============================================================
ALTER TABLE shelf_bucket_logs ADD COLUMN IF NOT EXISTS small_buckets_made  integer NOT NULL DEFAULT 0;
ALTER TABLE shelf_bucket_logs ADD COLUMN IF NOT EXISTS large_buckets_made  integer NOT NULL DEFAULT 0;
ALTER TABLE shelf_bucket_logs ADD COLUMN IF NOT EXISTS small_buckets_sold  integer NOT NULL DEFAULT 0;
ALTER TABLE shelf_bucket_logs ADD COLUMN IF NOT EXISTS large_buckets_sold  integer NOT NULL DEFAULT 0;
