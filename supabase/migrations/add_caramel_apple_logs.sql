-- Caramel Apples — similar to hand-wrapped caramels, but a whole different unit: one
-- LOGGED BATCH always draws a FULL caramel tray (not a fraction like handwrap), and one
-- batch yields ~10 apples (apple_count is recorded for the crew's own record-keeping,
-- not used in the deduction math — the deduction is a flat 1 tray per log row).
-- report_date is the date the batch was made, used for Analytics per-day grouping and
-- the caramel-forward computation (src/core/ops.js computeCaramelTrays).

CREATE TABLE IF NOT EXISTS caramel_apple_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  apple_count INTEGER     NOT NULL DEFAULT 10 CHECK (apple_count > 0),
  report_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE caramel_apple_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "public read caramel_apple_logs" ON caramel_apple_logs FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "public insert caramel_apple_logs" ON caramel_apple_logs FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "public delete caramel_apple_logs" ON caramel_apple_logs FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
