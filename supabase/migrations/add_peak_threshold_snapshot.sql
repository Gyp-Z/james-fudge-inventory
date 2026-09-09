-- Peak-threshold snapshot for the wind-down auto-alert system.
--
-- Why: low_tray_threshold used to be a pure peak-season constant the app never touched
-- automatically. The owner asked for something stronger this wind-down: have the SAME
-- pace-aware "genuinely urgent" model that drives Analytics/Jarvis (getSeasonOutlook's
-- make_small verdict) actually WRITE low_tray_threshold, so every consumer of that column
-- (Dashboard, Admin, ShiftReport, get_low_stock, MCP) agrees without each needing its own
-- wind-down special-casing. The one thing that must survive that: the owner's real,
-- deliberately-tuned peak-season numbers, which took a season of trial and error to get
-- right and must come back untouched next year.
--
-- peak_low_tray_threshold holds that snapshot: NULL during peak (nothing to restore), set
-- once when wind-down first adjusts a flavor's threshold, and cleared when the next peak
-- season restores low_tray_threshold from it. See syncWindDownThresholds in src/core/ops.js.
-- Idempotent: safe to re-run.

alter table flavors add column if not exists peak_low_tray_threshold numeric;
