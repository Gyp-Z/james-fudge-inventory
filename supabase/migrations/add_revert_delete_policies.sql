-- Revert/undo delete + update policies for the anon (RLS) client.
--
-- Why: the in-app Jarvis chat and the ShiftReport "undo" buttons run against the anon key
-- (the service-role key must never ship to the browser). RLS previously allowed the anon
-- role to SELECT / INSERT / UPDATE ingredients + current_inventory, but it did NOT allow
-- DELETE (or UPDATE on the log tables) anywhere. Postgres does not error on an RLS-filtered
-- write — it just affects 0 rows — so every revert path (remove_batches, move_batches, the
-- ShiftReport undo buttons, popcorn/fudge-pop reverts) silently did nothing while the code
-- reported success and, worse, refunded ingredients for a batch that was still on the books.
--
-- This grants the anon (and authenticated) role DELETE on the log/entry tables and UPDATE on
-- batch_logs (needed by move_batches). It matches the app's existing public read/insert/update
-- posture — real mutation is gated in the UI by the isAdmin check and, for Jarvis, by the
-- write-confirmation dialog. The code in src/core/ops.js now also verifies rows-affected and
-- returns a visible error if any of these ever come back missing, so a phantom success can't
-- recur.
--
-- Idempotent: drop-then-create so it is safe to re-run.

-- batch_logs: DELETE (remove_batches / revertBatchLog) + UPDATE (move_batches / moveBatchDate)
drop policy if exists "Public delete batch_logs" on batch_logs;
create policy "Public delete batch_logs" on batch_logs
  for delete to anon, authenticated using (true);

drop policy if exists "Public update batch_logs" on batch_logs;
create policy "Public update batch_logs" on batch_logs
  for update to anon, authenticated using (true) with check (true);

-- ingredient_deductions: DELETE (every revert deletes the audit rows it refunds)
drop policy if exists "Public delete ingredient_deductions" on ingredient_deductions;
create policy "Public delete ingredient_deductions" on ingredient_deductions
  for delete to anon, authenticated using (true);

-- shift_report_entries: DELETE (ShiftReport undo / reverseShiftEntry)
drop policy if exists "Public delete shift_report_entries" on shift_report_entries;
create policy "Public delete shift_report_entries" on shift_report_entries
  for delete to anon, authenticated using (true);

-- shelf_bucket_logs: DELETE (popcorn barrel undo / reversePopcornEntry)
drop policy if exists "Public delete shelf_bucket_logs" on shelf_bucket_logs;
create policy "Public delete shelf_bucket_logs" on shelf_bucket_logs
  for delete to anon, authenticated using (true);

-- fudge_pop_logs: DELETE (fudge-pop undo / revertFudgePopLog)
drop policy if exists "Public delete fudge_pop_logs" on fudge_pop_logs;
create policy "Public delete fudge_pop_logs" on fudge_pop_logs
  for delete to anon, authenticated using (true);
