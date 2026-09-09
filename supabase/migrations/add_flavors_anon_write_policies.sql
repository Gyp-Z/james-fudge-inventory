-- flavors was missing anon INSERT/UPDATE policies entirely — the original schema only ever
-- granted those to the `authenticated` role, and a later migration only added anon SELECT
-- ("Public read flavors"). Every other table in this app was long ago moved to the
-- "RLS is permissive, mutations are gated in the UI by isAdmin" model (see jarvis_conversations,
-- staff_feedback for the same pattern) — flavors was simply missed.
--
-- Discovered Sept 2026 while building the wind-down threshold sync: Admin.jsx's saveThreshold,
-- toggleActive, and handleAdd all run on the anon client and were silently no-op'ing (UPDATE
-- returns 0 rows with NO error under RLS — see the Common Pitfalls note on this exact failure
-- mode elsewhere in this app; INSERT does at least return a real 42501 error). This means Admin
-- flavor edits (thresholds, activate/deactivate, add flavor) have likely never actually saved
-- in production. Idempotent: safe to re-run.

drop policy if exists "Public insert flavors" on flavors;
create policy "Public insert flavors" on flavors
  for insert to anon, authenticated with check (true);

drop policy if exists "Public update flavors" on flavors;
create policy "Public update flavors" on flavors
  for update to anon, authenticated using (true) with check (true);
