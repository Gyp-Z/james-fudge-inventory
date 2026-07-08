// One-off: confirm Kettle Mix config so Kettle Corn batches deduct it (July 2026).
// Staff confirmed: 1 lb of mix per batch; a carton holds 3.25 lbs.
//   → ingredient: container_size = 3.25, container_unit = 'lbs'
//   → recipe: 1 lb per batch → 1 / 3.25 ≈ 0.3077 cartons deducted per batch
// (The 0.5 that briefly went in was the POUR container, not the delivery carton.)
// Run: node --env-file=.env scripts/fix-kettle-mix.mjs
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data: rows, error } = await supabase
  .from('ingredients')
  .select('id, name, unit, quantity, container_size, container_unit, is_active')
  .ilike('name', '%kettle%')

if (error) { console.error(error.message); process.exit(1) }
console.log('Kettle rows before:', JSON.stringify(rows, null, 2))

const mix = (rows || []).find((r) => r.name.toLowerCase() === 'kettle mix' && r.is_active)
if (!mix) { console.error('No active "Kettle Mix" ingredient row found'); process.exit(1) }

const { error: upErr } = await supabase
  .from('ingredients')
  .update({ container_size: 3.25, container_unit: 'lbs' })
  .eq('id', mix.id)

if (upErr) { console.error(upErr.message); process.exit(1) }
console.log(`✓ Kettle Mix (${mix.id}) → container_size 3.25, container_unit 'lbs'`)
