// One-time seed: insert April 22nd report — Vanilla 9 trays, 6 wasted
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xitveqxxcpftevxesojk.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpdHZlcXh4Y3BmdGV2eGVzb2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjM0NTIsImV4cCI6MjA4OTMzOTQ1Mn0.mL8sg9NblkgFSYLNt3h1QhoUBhuY_K3QgXHx09Dz81g'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// 1. Look up Vanilla flavor ID
const { data: flavors, error: flavorErr } = await supabase
  .from('flavors')
  .select('id, name')
  .eq('name', 'Vanilla')
  .single()

if (flavorErr || !flavors) {
  console.error('Could not find Vanilla flavor:', flavorErr?.message)
  process.exit(1)
}
const vanillaId = flavors.id
console.log('Vanilla ID:', vanillaId)

// 2. Insert shift report for Apr 22
const { data: report, error: reportErr } = await supabase
  .from('shift_reports')
  .insert({ report_date: '2026-04-22', report_type: 'snapshot', logged_by: 'seed' })
  .select('id')
  .single()

if (reportErr || !report) {
  console.error('Failed to insert shift_report:', reportErr?.message)
  console.log('\nThe shift_reports table may be missing report_date/report_type columns.')
  console.log('Run this SQL in https://supabase.com/dashboard/project/xitveqxxcpftevxesojk/sql/new\n')
  console.log(`alter table shift_reports add column if not exists report_date date;`)
  console.log(`alter table shift_reports add column if not exists report_type text;`)
  process.exit(1)
}
console.log('Report created:', report.id)

// 3. Insert the entry for Vanilla
const { error: entryErr } = await supabase
  .from('shift_report_entries')
  .insert({
    report_id: report.id,
    flavor_id: vanillaId,
    full_trays: 9,
    in_progress_trays: 0,
    trays_sold: 0,
    trays_wasted: 6,
    waste_reason: 'thrown out',
  })

if (entryErr) {
  console.error('Failed to insert entry:', entryErr?.message)
  console.log('\nThe shift_report_entries table may not exist yet.')
  console.log('Run this SQL in https://supabase.com/dashboard/project/xitveqxxcpftevxesojk/sql/new\n')
  console.log(`
create table if not exists shift_report_entries (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references shift_reports(id) on delete cascade,
  flavor_id uuid not null references flavors(id) on delete cascade,
  full_trays integer not null default 0,
  in_progress_trays integer not null default 0,
  trays_sold integer not null default 0,
  trays_wasted integer not null default 0,
  waste_reason text,
  created_at timestamptz not null default now()
);
alter table shift_report_entries enable row level security;
create policy "Anyone can insert shift_report_entries" on shift_report_entries for insert to anon, authenticated with check (true);
create policy "Anyone can read shift_report_entries" on shift_report_entries for select to anon, authenticated using (true);
  `)
  process.exit(1)
}

// 4. Upsert current_inventory
await supabase
  .from('current_inventory')
  .upsert({ flavor_id: vanillaId, tray_count: 9, updated_at: new Date().toISOString() }, { onConflict: 'flavor_id' })

console.log('✓ Done — Apr 22 report seeded: Vanilla 9 trays, 6 wasted')
