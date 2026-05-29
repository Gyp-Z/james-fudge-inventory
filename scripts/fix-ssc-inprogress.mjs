/**
 * Corrects 2026-05-29 entries where 6 Vanilla and 6 Chocolate half-trays
 * were logged instead of Vanilla Sea Salt Caramel and Chocolate Sea Salt Caramel.
 *
 * Changes:
 *   shift_report_entries:
 *     - Vanilla entry b106996d: in_progress_trays 6 → 0
 *     - Chocolate entry 4bbd87f9: in_progress_trays 6 → 0
 *     - Insert VSSC entry (report 8a643770): in_progress_trays = 6
 *     - Insert CSSC entry (report 63b28b7b): in_progress_trays = 6
 *   current_inventory:
 *     - Vanilla in_progress_count: 6 → 0
 *     - Chocolate in_progress_count: 7 → 1 (only the 6 from today removed)
 *     - VSSC in_progress_count: 0 → 6
 *     - CSSC in_progress_count: 0 → 6
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !key) { console.error('Missing env vars'); process.exit(1) }

const supabase = createClient(supabaseUrl, key, { auth: { autoRefreshToken: false, persistSession: false } })

// Flavor IDs
const VANILLA_ID    = 'd5b899cd-5b16-450b-a123-b7b5fce692e2'
const CHOCOLATE_ID  = '9aaa88ff-bd92-4b15-bee6-1dd0b02c7e20'
const VSSC_ID       = 'dbcb110d-a311-4caf-9b74-606b7af7d123'
const CSSC_ID       = 'fd8c2a5e-2a7d-4064-954d-ee2e46ba6beb'

// Entry IDs logged today
const VANILLA_ENTRY_ID   = 'b106996d-a790-4ab1-b7c6-c6fbe049f22f'
const CHOCOLATE_ENTRY_ID = '4bbd87f9-d8c2-4b8e-9e28-5ee9b4bf0d70'

// Report IDs to attach corrected SSC entries to
const VANILLA_REPORT_ID   = '8a643770-7894-41db-bb43-c99a38a06778'
const CHOCOLATE_REPORT_ID = '63b28b7b-a31d-4bd4-8354-9220362052d4'

async function run() {
  console.log('--- Step 1: Zero out Vanilla in_progress_trays ---')
  const { error: e1 } = await supabase
    .from('shift_report_entries')
    .update({ in_progress_trays: 0 })
    .eq('id', VANILLA_ENTRY_ID)
  if (e1) { console.error('FAIL:', e1.message); process.exit(1) }
  console.log('OK: Vanilla entry in_progress_trays → 0')

  console.log('\n--- Step 2: Zero out Chocolate in_progress_trays ---')
  const { error: e2 } = await supabase
    .from('shift_report_entries')
    .update({ in_progress_trays: 0 })
    .eq('id', CHOCOLATE_ENTRY_ID)
  if (e2) { console.error('FAIL:', e2.message); process.exit(1) }
  console.log('OK: Chocolate entry in_progress_trays → 0')

  console.log('\n--- Step 3: Insert VSSC entry (in_progress = 6) ---')
  const { error: e3 } = await supabase
    .from('shift_report_entries')
    .insert({ report_id: VANILLA_REPORT_ID, flavor_id: VSSC_ID, full_trays: 0, in_progress_trays: 6, trays_sold: 0, trays_wasted: 0 })
  if (e3) { console.error('FAIL:', e3.message); process.exit(1) }
  console.log('OK: VSSC entry inserted (in_progress_trays = 6)')

  console.log('\n--- Step 4: Insert CSSC entry (in_progress = 6) ---')
  const { error: e4 } = await supabase
    .from('shift_report_entries')
    .insert({ report_id: CHOCOLATE_REPORT_ID, flavor_id: CSSC_ID, full_trays: 0, in_progress_trays: 6, trays_sold: 0, trays_wasted: 0 })
  if (e4) { console.error('FAIL:', e4.message); process.exit(1) }
  console.log('OK: CSSC entry inserted (in_progress_trays = 6)')

  console.log('\n--- Step 5: Fix current_inventory.in_progress_count ---')

  const { error: e5 } = await supabase
    .from('current_inventory')
    .update({ in_progress_count: 0 })
    .eq('flavor_id', VANILLA_ID)
  if (e5) { console.error('FAIL Vanilla CI:', e5.message); process.exit(1) }
  console.log('OK: Vanilla in_progress_count → 0')

  const { error: e6 } = await supabase
    .from('current_inventory')
    .update({ in_progress_count: 1 })
    .eq('flavor_id', CHOCOLATE_ID)
  if (e6) { console.error('FAIL Chocolate CI:', e6.message); process.exit(1) }
  console.log('OK: Chocolate in_progress_count → 1 (kept prior 1, removed 6 from today)')

  const { error: e7 } = await supabase
    .from('current_inventory')
    .update({ in_progress_count: 6 })
    .eq('flavor_id', VSSC_ID)
  if (e7) { console.error('FAIL VSSC CI:', e7.message); process.exit(1) }
  console.log('OK: VSSC in_progress_count → 6')

  const { error: e8 } = await supabase
    .from('current_inventory')
    .update({ in_progress_count: 6 })
    .eq('flavor_id', CSSC_ID)
  if (e8) { console.error('FAIL CSSC CI:', e8.message); process.exit(1) }
  console.log('OK: CSSC in_progress_count → 6')

  console.log('\n--- Verification ---')
  const { data: entries } = await supabase
    .from('shift_report_entries')
    .select('flavor_id, full_trays, in_progress_trays, flavors(name)')
    .in('flavor_id', [VANILLA_ID, CHOCOLATE_ID, VSSC_ID, CSSC_ID])
    .in('report_id', [VANILLA_REPORT_ID, CHOCOLATE_REPORT_ID])

  console.log('Entries:')
  for (const e of entries ?? []) {
    console.log(`  ${e.flavors?.name}: full=${e.full_trays}, in_progress=${e.in_progress_trays}`)
  }

  const { data: inv } = await supabase
    .from('current_inventory')
    .select('flavor_id, tray_count, in_progress_count, flavors(name)')
    .in('flavor_id', [VANILLA_ID, CHOCOLATE_ID, VSSC_ID, CSSC_ID])

  console.log('Inventory:')
  for (const r of inv ?? []) {
    console.log(`  ${r.flavors?.name}: tray_count=${r.tray_count}, in_progress_count=${r.in_progress_count}`)
  }
}

run()
