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
const svc = createClient(env['VITE_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], { auth: { persistSession: false } })
const { revertBatchLog } = await import('../src/core/ops.js')

// Targets (most-recent duplicate of each)
const VANILLA_DUP = 'e5546c21-70ee-4114-9eec-23f4746c4f33'          // already refunded by earlier test → delete only
const FULL_REVERT = {                                              // refund + delete via service role
  'Chocolate': 'abff279b-1b5c-4ec4-8a69-0e2553b7baee',            // 19:37:46 dup
  'White Cheddar Corn': '6d17acfc',                                // resolved below (need full id)
  'Caramel Corn': 'f5b6c041',                                      // resolved below
}
// resolve short ids to full
const today = '2026-07-18'
const { data: all } = await svc.from('batch_logs').select('id, flavor_id, created_at, flavors(name)').gte('batch_date', today + 'T00:00:00').lt('batch_date', today + 'T23:59:59')
const wc = all.find((b) => b.id.startsWith('6d17acfc'))
const cc = all.find((b) => b.id.startsWith('f5b6c041'))
FULL_REVERT['White Cheddar Corn'] = wc.id
FULL_REVERT['Caramel Corn'] = cc.id

// 1) Vanilla dup: delete batch + its deductions, NO refund (test already refunded)
console.log('=== Vanilla dup (delete only, no refund) ===')
const delDed = await svc.from('ingredient_deductions').delete().eq('batch_log_id', VANILLA_DUP).select()
console.log('  deleted ingredient_deductions:', delDed.data?.length, delDed.error?.message || '')
const delBatch = await svc.from('batch_logs').delete().eq('id', VANILLA_DUP).select()
console.log('  deleted batch_logs:', delBatch.data?.length, delBatch.error?.message || '')

// 2) Full revert (refund + delete) for the others
for (const [name, id] of Object.entries(FULL_REVERT)) {
  console.log(`=== ${name} dup (full revert) id=${id.slice(0, 8)} ===`)
  const r = await revertBatchLog(svc, id)
  console.log('  ', JSON.stringify(r))
}

// 3) Verify final counts
console.log('\n=== FINAL COUNTS TODAY ===')
const { data: after } = await svc.from('batch_logs').select('flavors(name)').gte('batch_date', today + 'T00:00:00').lt('batch_date', today + 'T23:59:59')
const counts = {}
after.forEach((b) => { counts[b.flavors.name] = (counts[b.flavors.name] || 0) + 1 })
Object.keys(counts).sort().forEach((n) => console.log(`  ${n}: ${counts[n]}`))
