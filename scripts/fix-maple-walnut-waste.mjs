/**
 * Fixes the 2026-05-28 Maple Walnut entry where an in-progress tray was
 * logged as a full tray wasted (trays_wasted: 1) because the in_progress_wasted
 * column didn't exist yet.
 *
 * Run AFTER the SQL migration adds the in_progress_wasted column.
 *
 * Entry id: 073f7bc8-bce3-408c-a24a-4f726e76bbe7
 * Change: trays_wasted 1 → 0, in_progress_wasted 0 → 1
 * current_inventory is already correct (the +1/-1 netted to zero), no change needed there.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !key) { console.error('Missing env vars'); process.exit(1) }

const supabase = createClient(supabaseUrl, key, { auth: { autoRefreshToken: false, persistSession: false } })

const ENTRY_ID = '073f7bc8-bce3-408c-a24a-4f726e76bbe7'

// Verify the column exists first
const { error: colCheck } = await supabase
  .from('shift_report_entries')
  .select('in_progress_wasted')
  .eq('id', ENTRY_ID)
  .single()

if (colCheck) {
  console.error('ERROR: in_progress_wasted column not found. Run the SQL migration first.')
  console.error('SQL to run in Supabase dashboard:')
  console.error('  ALTER TABLE shift_report_entries ADD COLUMN IF NOT EXISTS in_progress_wasted INTEGER NOT NULL DEFAULT 0;')
  process.exit(1)
}

const { error } = await supabase
  .from('shift_report_entries')
  .update({ trays_wasted: 0, in_progress_wasted: 1 })
  .eq('id', ENTRY_ID)

if (error) { console.error('FAIL:', error.message); process.exit(1) }

console.log('OK: Maple Walnut entry updated — trays_wasted: 0, in_progress_wasted: 1')
console.log('Analytics will now show 0.5 trays wasted for Maple Walnut on May 28.')
