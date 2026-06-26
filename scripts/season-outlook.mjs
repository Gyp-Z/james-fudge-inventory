// Print the season sell-down outlook — the SAME getSeasonOutlook() Jarvis and the
// Analytics panel use, so what you see here is exactly what the app sees.
//
// Usage:
//   node scripts/season-outlook.mjs                  # as of today
//   node scripts/season-outlook.mjs 2026-09-01       # look ahead to a wind-down date
//   node scripts/season-outlook.mjs 2026-09-01 21    # ...with a 21-day sales window
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getSeasonOutlook } from '../src/core/ops.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const supabase = createClient(
  env['VITE_SUPABASE_URL'],
  env['SUPABASE_SERVICE_ROLE_KEY'] || env['VITE_SUPABASE_ANON_KEY'],
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const asOf = process.argv[2] || undefined
const window = process.argv[3] ? Number(process.argv[3]) : 14

const o = await getSeasonOutlook(supabase, { asOf, window })

console.log('\n=== SEASON OUTLOOK ===')
console.log(`as of ${o.as_of}  ·  phase: ${o.phase}  ·  close: ${o.season_end}  ·  ${o.days_until_close} days to close  ·  ${o.window_days}-day sales window`)
console.log(`\n>>> Projected leftover fudge at close: ${o.total_projected_leftover_trays} trays  (the number to drive toward zero)\n`)

const pad = (s, n) => String(s).padEnd(n)
const padL = (s, n) => String(s).padStart(n)
console.log(pad('FUDGE FLAVOR', 26), padL('on hand', 8), padL('sold/day', 9), padL('runs out', 12), padL('left@close', 11), '  verdict')
console.log('-'.repeat(90))
for (const r of o.fudge) {
  console.log(
    pad(r.flavor, 26),
    padL(r.trays, 8),
    padL(r.per_day_sold, 9),
    padL(r.projected_sellout_date || '(no sales)', 12),
    padL(r.projected_leftover_at_close, 11),
    '  ' + r.verdict + (r.is_top_seller ? ' [top]' : '')
  )
}

console.log('\nPOPCORN (made fresh to demand — NOT part of the sell-down):')
for (const p of o.popcorn.items) console.log('  ', pad(p.flavor, 24), padL(p.barrels + ' barrels', 12), ' sold/day', p.per_day_sold)
console.log('')
