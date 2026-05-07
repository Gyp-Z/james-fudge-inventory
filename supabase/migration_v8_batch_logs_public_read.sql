-- MIGRATION v8 — Allow public (anon) read access to batch_logs
-- batch_logs only had authenticated read/insert policies.
-- Analytics uses the anon key so it was getting 0 rows silently.
CREATE POLICY "Public read batch_logs" ON batch_logs FOR SELECT TO anon USING (true);
