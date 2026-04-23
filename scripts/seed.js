import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — add both to .env and run with: node --env-file=.env scripts/seed.js')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// 1. Insert flavors if they don't already exist (check by name)
const flavorList = [
  'Vanilla',
  'Chocolate',
  'Peanut Butter',
  'Maple Walnut',
  'Sea Salt Caramel',
  'Chocolate Peanut Butter',
]

const { data: existing, error: fetchErr } = await supabase.from('flavors').select('name')
if (fetchErr) { console.error('Error fetching flavors:', fetchErr.message); process.exit(1) }

const existingNames = new Set((existing || []).map((f) => f.name))
const toInsert = flavorList
  .filter((name) => !existingNames.has(name))
  .map((name) => ({ name, low_tray_threshold: 2, active: true }))

if (toInsert.length > 0) {
  const { error: insertErr } = await supabase.from('flavors').insert(toInsert)
  if (insertErr) { console.error('Error inserting flavors:', insertErr.message); process.exit(1) }
  console.log(`Inserted ${toInsert.length} flavor(s):`, toInsert.map((f) => f.name).join(', '))
} else {
  console.log('All flavors already exist — skipping insert')
}

// 2. Get Vanilla's UUID
const { data: vanilla, error: vanillaErr } = await supabase
  .from('flavors')
  .select('id')
  .eq('name', 'Vanilla')
  .single()

if (vanillaErr || !vanilla) {
  console.error('Could not find Vanilla flavor:', vanillaErr?.message)
  process.exit(1)
}

const vanillaId = vanilla.id
console.log('Vanilla ID:', vanillaId)

// 3. Insert 5 vanilla batch logs
const batchLogs = [
  { flavor_id: vanillaId, tray_count: 3, notes: 'First day of season', batch_date: '2026-04-22T12:00:00-04:00' },
  { flavor_id: vanillaId, tray_count: 3, notes: 'First day of season', batch_date: '2026-04-22T13:30:00-04:00' },
  { flavor_id: vanillaId, tray_count: 3, notes: 'First day of season', batch_date: '2026-04-22T15:00:00-04:00' },
  { flavor_id: vanillaId, tray_count: 3, notes: 'First day of season', batch_date: '2026-04-22T16:30:00-04:00' },
  { flavor_id: vanillaId, tray_count: 3, notes: 'First day of season', batch_date: '2026-04-22T18:00:00-04:00' },
]

const { error: batchErr } = await supabase.from('batch_logs').insert(batchLogs)
if (batchErr) { console.error('Error inserting batch logs:', batchErr.message); process.exit(1) }
console.log('Inserted 5 vanilla batch logs')

// 4. Upsert current_inventory for Vanilla: 15 trays
const { error: invErr } = await supabase.from('current_inventory').upsert(
  { flavor_id: vanillaId, tray_count: 15, updated_at: new Date().toISOString() },
  { onConflict: 'flavor_id' }
)
if (invErr) { console.error('Error upserting inventory:', invErr.message); process.exit(1) }
console.log('Upserted Vanilla inventory: 15 trays')

console.log('\nSeed complete!')
