// One-off: record the toffee + dot cake batches already made, as HISTORY ONLY.
// No ingredient deductions and no inventory changes — these predate the feature and we
// don't want them retroactively pulling down current butter/sugar/etc. counts. Going
// forward, logging a batch in the app deducts normally.
//
// Toffee (Aidan makes it Thursdays): Jun 11 wasted, Jun 18 wasted, Jun 25 made (good).
// Dot cakes: 5 frosting batches — Jul 7, Jul 5, Jul 3, Jul 2, Jun 29 (all made).
// Run: node --env-file=.env scripts/log-toffee-dotcake-history.mjs
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const TOFFEE = 'f2615b1f-8fee-43e5-898d-8b13c96eae2d'
const DOT_CAKES = '4745e248-1492-4df8-bbc3-ad0406e0efaf'

const rows = [
  { flavor_id: TOFFEE,    batch_date: '2026-06-11', is_wasted: true,  waste_reason: 'R&D — early toffee attempt' },
  { flavor_id: TOFFEE,    batch_date: '2026-06-18', is_wasted: true,  waste_reason: 'R&D — early toffee attempt' },
  { flavor_id: TOFFEE,    batch_date: '2026-06-25', is_wasted: false },
  { flavor_id: DOT_CAKES, batch_date: '2026-06-29', is_wasted: false },
  { flavor_id: DOT_CAKES, batch_date: '2026-07-02', is_wasted: false },
  { flavor_id: DOT_CAKES, batch_date: '2026-07-03', is_wasted: false },
  { flavor_id: DOT_CAKES, batch_date: '2026-07-05', is_wasted: false },
  { flavor_id: DOT_CAKES, batch_date: '2026-07-07', is_wasted: false },
]

// Guard against double-runs: skip any (flavor, date) that already has a batch log.
const { data: existing } = await sb.from('batch_logs')
  .select('flavor_id, batch_date')
  .in('flavor_id', [TOFFEE, DOT_CAKES])
const seen = new Set((existing || []).map((b) => `${b.flavor_id}|${(b.batch_date ?? '').slice(0, 10)}`))

const toInsert = rows.filter((r) => !seen.has(`${r.flavor_id}|${r.batch_date}`))
if (toInsert.length === 0) {
  console.log('Nothing to insert — all history rows already present.')
} else {
  const { data, error } = await sb.from('batch_logs').insert(toInsert).select('id, batch_date, is_wasted, flavors(name)')
  if (error) { console.error(error.message); process.exit(1) }
  for (const b of data) console.log(`+ ${b.batch_date.slice(0, 10)}  ${b.flavors.name}${b.is_wasted ? ' (wasted)' : ''}`)
}
console.log(`\nSkipped ${rows.length - toInsert.length} already-present row(s).`)
