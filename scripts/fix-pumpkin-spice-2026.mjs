// Corrections to Pumpkin Spice per owner (8/28/2026):
//  1) DROP Vanilla Extract from the recipe (like Key Lime / Pistachio).
//  2) Pumpkin Spice Flavoring = same bottle as the others: container_size 1 cup/bottle, deducts.
//  3) Aidan made 3 TRAYS, not 3 batches → reset the 3 mistaken batches, log 1 batch (=3 trays)
//     and put 3 trays on the shelf via a product entry.
// Idempotent-ish; run once. node --env-file=.env scripts/fix-pumpkin-spice-2026.mjs
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
const core = await import('../src/core/ops.js')

const { data: ps } = await sb.from('flavors').select('id, name, is_component, product_type, default_yield').eq('name', 'Pumpkin Spice').single()

// 1) Reset the 3 mistaken batches (refunds their base deductions).
const removed = await core.removeBatchLogs(sb, ps, '2026-08-28', null)
console.log('Removed prior 8/28 batches:', JSON.stringify(removed))

// 2) Flavoring becomes a real tracked bottle, same as Key Lime / Pistachio.
const { data: flav } = await sb.from('ingredients').select('id').eq('name', 'Pumpkin Spice Flavoring').single()
await sb.from('ingredients').update({ container_unit: 'cups', container_size: 1, low_stock_threshold: 0.5 }).eq('id', flav.id)
console.log('Flavoring set to 1 cup/bottle, threshold 0.5')

// 3) Recipe = Vanilla base MINUS Vanilla Extract + Pumpkin Spice Flavoring (1/6 cup), batch phase.
const { data: van } = await sb.from('flavors').select('id').eq('name', 'Vanilla').single()
const { data: vanRecipe } = await sb.from('recipes')
  .select('ingredient_id, quantity_per_batch, unit, deduction_phase, pour_label, ingredients(name)')
  .eq('flavor_id', van.id)
const baseRows = vanRecipe
  .filter((r) => r.ingredients.name !== 'Vanilla Extract')
  .map((r) => ({ flavor_id: ps.id, ingredient_id: r.ingredient_id, quantity_per_batch: r.quantity_per_batch, unit: r.unit, deduction_phase: r.deduction_phase, pour_label: r.pour_label }))
baseRows.push({ flavor_id: ps.id, ingredient_id: flav.id, quantity_per_batch: 0.167, unit: 'cups', deduction_phase: 'batch', pour_label: '' })
await sb.from('recipes').delete().eq('flavor_id', ps.id)
const { error: recErr } = await sb.from('recipes').insert(baseRows)
if (recErr) throw new Error('recipe insert: ' + recErr.message)
console.log('Recipe rebuilt:', baseRows.length, 'rows (vanilla base − vanilla extract + flavoring)')

// 4) Log 1 batch (=3 trays worth of base) on 8/28.
const r = await core.logBatchWithEffects(sb, { id: ps.id, name: 'Pumpkin Spice', is_component: false, product_type: 'fudge', default_yield: 3 }, '2026-08-28', {})
console.log('Logged 1 batch:', r.batchLogId?.slice(0, 8), 'deductions=', r.deductions?.length)

// 5) Put the 3 finished trays on the shelf (no toppings for Pumpkin Spice).
const pe = await core.runTool(sb, 'add_product_entry', { flavor: 'Pumpkin Spice', date: '2026-08-28', full_trays: 3 })
console.log('Product entry (3 trays):', JSON.stringify(pe))

// verify
const { data: inv } = await sb.from('current_inventory').select('tray_count').eq('flavor_id', ps.id).single()
const { data: flav2 } = await sb.from('ingredients').select('quantity, container_size').eq('id', flav.id).single()
console.log('\nRESULT → shelf trays:', inv.tray_count, '| flavoring qty:', flav2.quantity, 'bottles (container_size', flav2.container_size + ')')
