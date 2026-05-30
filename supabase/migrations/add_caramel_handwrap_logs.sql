-- Tracks caramel trays consumed by hand-wrapping caramels (not SSC fudge).
-- trays_used is a decimal in quarter-tray increments (0.25, 0.5, 0.75, 1.0, ...).
-- report_date is the date the session was logged, used for Analytics per-day grouping.

CREATE TABLE IF NOT EXISTS caramel_handwrap_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trays_used  NUMERIC     NOT NULL CHECK (trays_used > 0),
  report_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  logged_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE caramel_handwrap_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read caramel_handwrap_logs"
  ON caramel_handwrap_logs FOR SELECT USING (true);

CREATE POLICY "public insert caramel_handwrap_logs"
  ON caramel_handwrap_logs FOR INSERT WITH CHECK (true);
