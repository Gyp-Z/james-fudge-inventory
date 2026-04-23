import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xitveqxxcpftevxesojk.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpdHZlcXh4Y3BmdGV2eGVzb2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjM0NTIsImV4cCI6MjA4OTMzOTQ1Mn0.mL8sg9NblkgFSYLNt3h1QhoUBhuY_K3QgXHx09Dz81g'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// These three statements expand the report_type check to allow 'snapshot'
// and drop the one-per-day-per-type unique constraint.
const SQL_1 = `ALTER TABLE shift_reports DROP CONSTRAINT IF EXISTS shift_reports_report_type_check;`
const SQL_2 = `ALTER TABLE shift_reports ADD CONSTRAINT shift_reports_report_type_check CHECK (report_type IN ('morning', 'closing', 'snapshot'));`
const SQL_3 = `ALTER TABLE shift_reports DROP CONSTRAINT IF EXISTS shift_reports_report_date_report_type_key;`

async function runSQL(label, sql) {
  for (const fn of ['exec_sql', 'run_sql', 'execute_sql']) {
    const { error } = await supabase.rpc(fn, { query: sql })
    if (!error) {
      console.log(`✓ ${label} — ran via rpc.${fn}`)
      return true
    }
    if (!error.message?.includes('Could not find')) break
  }
  console.warn(`⚠ ${label} — could not run via REST API (anon key lacks DDL permissions)`)
  return false
}

const results = await Promise.all([
  runSQL('drop old report_type check', SQL_1),
  runSQL('add new report_type check (morning/closing/snapshot)', SQL_2),
  runSQL('drop unique constraint report_date+type', SQL_3),
])

if (results.some(r => !r)) {
  console.log('\n--- Run these manually in the Supabase SQL editor ---')
  console.log('https://supabase.com/dashboard/project/xitveqxxcpftevxesojk/sql/new\n')
  console.log(SQL_1)
  console.log(SQL_2)
  console.log(SQL_3)
  console.log('------------------------------------------------------')
  process.exit(1)
}

console.log('\nAll migrations applied.')
