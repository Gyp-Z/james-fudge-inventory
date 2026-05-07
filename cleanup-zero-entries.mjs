// Cleanup: delete zero-entry rows from April 29-30 caused by submitting with all fields at 0
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xitveqxxcpftevxesojk.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpdHZlcXh4Y3BmdGV2eGVzb2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjM0NTIsImV4cCI6MjA4OTMzOTQ1Mn0.mL8sg9NblkgFSYLNt3h1QhoUBhuY_K3QgXHx09Dz81g'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Find all report IDs from April 29-30
const { data: reports, error: rErr } = await supabase
  .from('shift_reports')
  .select('id, report_date')
  .in('report_date', ['2026-04-29', '2026-04-30'])

if (rErr) { console.error('Failed to fetch reports:', rErr.message); process.exit(1) }
console.log(`Found ${reports.length} report(s) on Apr 29-30:`, reports.map(r => r.report_date))

const reportIds = reports.map(r => r.id)
if (reportIds.length === 0) { console.log('Nothing to clean up.'); process.exit(0) }

// Preview what will be deleted
const { data: zeroRows, error: previewErr } = await supabase
  .from('shift_report_entries')
  .select('id, flavor_id, full_trays, in_progress_trays, trays_sold, trays_wasted')
  .in('report_id', reportIds)
  .eq('full_trays', 0)
  .eq('in_progress_trays', 0)
  .eq('trays_sold', 0)
  .eq('trays_wasted', 0)

if (previewErr) { console.error('Failed to preview:', previewErr.message); process.exit(1) }
console.log(`\nZero-entry rows to delete: ${zeroRows.length}`)

if (zeroRows.length === 0) { console.log('Nothing to clean up.'); process.exit(0) }

// Delete them
const zeroIds = zeroRows.map(r => r.id)
const { error: delErr } = await supabase
  .from('shift_report_entries')
  .delete()
  .in('id', zeroIds)

if (delErr) {
  console.error('Delete failed:', delErr.message)
} else {
  console.log(`✓ Deleted ${zeroIds.length} zero-entry rows`)
}

// Confirm what's left
const { data: remaining } = await supabase
  .from('shift_report_entries')
  .select('id, full_trays, trays_sold, trays_wasted')
  .in('report_id', reportIds)

console.log(`\nRemaining entries for Apr 29-30: ${remaining?.length ?? 0}`)
