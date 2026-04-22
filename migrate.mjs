import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xitveqxxcpftevxesojk.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpdHZlcXh4Y3BmdGV2eGVzb2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjM0NTIsImV4cCI6MjA4OTMzOTQ1Mn0.mL8sg9NblkgFSYLNt3h1QhoUBhuY_K3QgXHx09Dz81g'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const SQL_1 = `ALTER TABLE batch_logs ADD COLUMN IF NOT EXISTS tray_count integer NOT NULL DEFAULT 3;`

const SQL_2 = `
CREATE TABLE IF NOT EXISTS waste_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('ingredient', 'flavor')),
  reference_id uuid NOT NULL,
  reference_name text NOT NULL,
  quantity numeric NOT NULL,
  unit text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);`

async function runSQL(label, sql) {
  // Try common RPC wrappers — works if the project has an exec_sql function
  for (const fn of ['exec_sql', 'run_sql', 'execute_sql']) {
    const { error } = await supabase.rpc(fn, { query: sql })
    if (!error) {
      console.log(`✓ ${label} — ran via rpc.${fn}`)
      return true
    }
    if (!error.message?.includes('Could not find')) break
  }

  // Verify column/table exists as a fallback check
  if (label.includes('tray_count')) {
    const { error: checkErr } = await supabase
      .from('batch_logs')
      .select('tray_count')
      .limit(1)
    if (!checkErr) {
      console.log(`✓ ${label} — column already exists`)
      return true
    }
  }

  if (label.includes('waste_log')) {
    const { error: checkErr } = await supabase
      .from('waste_log')
      .select('id')
      .limit(1)
    if (!checkErr) {
      console.log(`✓ ${label} — table already exists`)
      return true
    }
  }

  console.warn(`⚠ ${label} — could not run via REST API (anon key lacks DDL permissions)`)
  return false
}

const ok1 = await runSQL('tray_count column', SQL_1)
const ok2 = await runSQL('waste_log table', SQL_2)

if (!ok1 || !ok2) {
  console.log('\n--- Run this SQL manually in the Supabase dashboard SQL editor ---')
  console.log('https://supabase.com/dashboard/project/xitveqxxcpftevxesojk/sql/new\n')
  if (!ok1) console.log(SQL_1 + '\n')
  if (!ok2) console.log(SQL_2 + '\n')
  console.log('-------------------------------------------------------------------')
  process.exit(1)
}

console.log('\nAll migrations applied.')
