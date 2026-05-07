// Migration: add missing columns to shift_report_entries
// Also cleans up the orphaned report from the failed seed attempt
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xitveqxxcpftevxesojk.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpdHZlcXh4Y3BmdGV2eGVzb2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjM0NTIsImV4cCI6MjA4OTMzOTQ1Mn0.mL8sg9NblkgFSYLNt3h1QhoUBhuY_K3QgXHx09Dz81g'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Clean up the orphaned shift_report from failed seed
const ORPHAN_ID = '854db6ad-ecf0-46b9-b614-dfd3045ee9fb'
const { error: delErr } = await supabase
  .from('shift_reports')
  .delete()
  .eq('id', ORPHAN_ID)
if (delErr) {
  console.warn('Could not delete orphan (may need delete policy):', delErr.message)
} else {
  console.log('✓ Cleaned up orphaned report')
}

// Check what columns shift_report_entries actually has
const { data: sample, error: sampleErr } = await supabase
  .from('shift_report_entries')
  .select('*')
  .limit(1)

if (sampleErr) {
  console.log('shift_report_entries error:', sampleErr.message)
} else {
  const cols = sample?.length > 0 ? Object.keys(sample[0]) : '(no rows yet — checking structure)'
  console.log('Current columns:', cols)
}

console.log('\nThe table exists but is missing trays_sold (and possibly other columns).')
console.log('Run this SQL in the Supabase SQL editor:\n')
console.log('https://supabase.com/dashboard/project/xitveqxxcpftevxesojk/sql/new\n')
console.log(`-- Add missing columns to shift_report_entries
alter table shift_report_entries add column if not exists trays_sold integer not null default 0;
alter table shift_report_entries add column if not exists trays_wasted integer not null default 0;
alter table shift_report_entries add column if not exists waste_reason text;
alter table shift_report_entries add column if not exists in_progress_trays integer not null default 0;

-- Also allow delete for cleanup (optional)
create policy if not exists "Anyone can delete shift_reports" on shift_reports
  for delete to anon, authenticated using (true);
`)
