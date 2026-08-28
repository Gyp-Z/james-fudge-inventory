// Stand up the Pumpkin Spice fall flavor + recipe, then log Aidan's 3 batches (8/28/2026).
// Pumpkin Spice = full Vanilla base + 1/6 cup Pumpkin Spice Flavoring, made as its own batch
// (like Key Lime). Idempotent: safe to re-run. Run: node --env-file=.env scripts/add-pumpkin-spice-2026.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env'), 'utf8').split('\n').filter((l) => l.trim() && l.includes('=')).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
  })
)
const sb = createClient(env['VITE_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], { auth: { persistSession: false } })
const { logBatchWithEffects } = await import('../src/core/ops.js')

const FLAVORING_CUPS_PER_BATCH = 0.167 // 1/6 cup

// 1) Pumpkin Spice Flavoring ingredient. container_size = null → auto-deduct SKIPS it for now
//    (we don't know the delivery-bottle size yet; setting a wrong one silently skews stock).
let { data: flavIng } = await sb.from('ingredients').select('id').eq('name', 'Pumpkin Spice Flavoring').maybeSingle()
if (!flavIng) {
  const { data, error } = await sb.from('ingredients').insert({
    name: 'Pumpkin Spice Flavoring', unit: 'bottles', container_unit: 'cups', container_size: null,
    quantity: 0, low_stock_threshold: 0, is_active: true,
  }).select('id').single()
  if (error) throw new Error('ingredient insert: ' + error.message)
  flavIng = data
  console.log('Created ingredient Pumpkin Spice Flavoring', flavIng.id)
} else {
  console.log('Ingredient Pumpkin Spice Flavoring already exists', flavIng.id)
}

// 2) Pumpkin Spice flavor (mirror Key Lime: own-batch, vanilla base group), active now.
let { data: ps } = await sb.from('flavors').select('id').eq('name', 'Pumpkin Spice').maybeSingle()
if (!ps) {
  const { data, error } = await sb.from('flavors').insert({
    name: 'Pumpkin Spice', product_type: 'fudge', is_active: true, is_component: false,
    default_yield: 3, trays_per_batch: 3, stock_unit: 'tray', low_tray_threshold: 2,
    reorder_threshold: 'low', double_batch_reminder: false, base_groups: ['vanilla'], is_base_trigger: false,
  }).select('id').single()
  if (error) throw new Error('flavor insert: ' + error.message)
  ps = data
  console.log('Created flavor Pumpkin Spice', ps.id)
} else {
  console.log('Flavor Pumpkin Spice already exists', ps.id)
}

// 3) current_inventory row (0 on shelf; batches deduct ingredients, trays are added separately)
await sb.from('current_inventory').upsert({ flavor_id: ps.id, tray_count: 0, in_progress_count: 0 }, { onConflict: 'flavor_id' })

// 4) Recipe = copy Vanilla's batch-phase base rows onto Pumpkin Spice + add the flavoring.
const { data: van } = await sb.from('flavors').select('id').eq('name', 'Vanilla').single()
const { data: vanRecipe } = await sb.from('recipes').select('ingredient_id, quantity_per_batch, unit, deduction_phase, pour_label').eq('flavor_id', van.id)
await sb.from('recipes').delete().eq('flavor_id', ps.id) // idempotent re-seed
const rows = vanRecipe.map((r) => ({ flavor_id: ps.id, ...r }))
rows.push({ flavor_id: ps.id, ingredient_id: flavIng.id, quantity_per_batch: FLAVORING_CUPS_PER_BATCH, unit: 'cups', deduction_phase: 'batch', pour_label: '' })
const { error: recErr } = await sb.from('recipes').insert(rows)
if (recErr) throw new Error('recipe insert: ' + recErr.message)
console.log('Seeded recipe:', rows.length, 'rows (vanilla base + pumpkin spice flavoring)')

// 5) Log Aidan's 3 batches on 8/28/2026 (deducts the vanilla base ×3; flavoring skipped for now).
const { data: existing } = await sb.from('batch_logs').select('id').eq('flavor_id', ps.id).gte('batch_date', '2026-08-28').lt('batch_date', '2026-08-29')
if ((existing || []).length > 0) {
  console.log('Pumpkin Spice batches already logged for 8/28:', existing.length, '— skipping to avoid dupes.')
} else {
  const psFlavor = { id: ps.id, name: 'Pumpkin Spice', is_component: false, product_type: 'fudge', default_yield: 3 }
  for (let i = 0; i < 3; i++) {
    const r = await logBatchWithEffects(sb, psFlavor, '2026-08-28', {})
    console.log(`  batch ${i + 1}: ${r.batchLogId?.slice(0, 8)} deductions=${r.deductions?.length ?? 0}`)
  }
}
console.log('DONE.')
