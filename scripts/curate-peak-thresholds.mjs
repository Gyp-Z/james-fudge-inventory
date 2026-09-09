// Curates flavors.peak_low_tray_threshold (and, since we're in wind-down right now, the live
// low_tray_threshold too) for every active fudge flavor from REAL peak-season sales data —
// not the wind-down-slowed recent velocity. Run once, requested by the owner after a prior
// test script accidentally overwrote Vanilla/Chocolate/Peanut Butter's real peak numbers with
// a placeholder (5) and their true values weren't recorded anywhere to restore from.
//
// Method: for each active, non-component fudge flavor, sum trays_sold from shift_report_entries
// within the PEAK window (SEASON_START through the day before wind-down starts) and divide by
// the number of calendar days in that window -> peak daily sell rate. Rather than one linear
// formula (which flattened several real top sellers down to the generic floor — see the tiering
// comment further down), thresholds are assigned by explicit tier: bases get round(rate*3)
// floored at 3; non-base "strong sellers" (peak rate >= 0.5/day) get 3; everything else with
// real peak sales gets 2 (the app's existing universal default); zero peak-window sales (e.g.
// Pumpkin Spice, added after peak started) gets 0. Capped at 20 to match Admin.jsx's input max.
//
// After computing peak_low_tray_threshold, applies the SAME wind-down write rule
// syncWindDownThresholds uses (bases keep their peak number; everything else follows today's
// real get_season_outlook verdict) so low_tray_threshold is correct for RIGHT NOW too.

import { createClient } from '@supabase/supabase-js'
import { getSeasonOutlook, SEASON_CONFIG } from '../src/core/ops.js'

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

const anchorYear = SEASON_CONFIG.anchorYear
const peakStart = `${anchorYear}-${SEASON_CONFIG.openMonthDay}`
const peakEndExclusive = `${anchorYear}-${SEASON_CONFIG.fudgeWinddownMonthDay}` // wind-down start = first non-peak day
const peakDays = Math.round((new Date(peakEndExclusive + 'T00:00:00') - new Date(peakStart + 'T00:00:00')) / 86400000)

console.log(`Peak window: ${peakStart} .. ${peakEndExclusive} (${peakDays} days)`)

async function fetchAllRows(makeQuery) {
  const out = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await makeQuery().range(from, from + page - 1)
    if (error || !data || data.length === 0) break
    out.push(...data)
    if (data.length < page) break
  }
  return out
}

const [{ data: flavors }, entries] = await Promise.all([
  sb.from('flavors').select('id, name, product_type, is_component, is_base_trigger, low_tray_threshold, peak_low_tray_threshold').eq('is_active', true),
  fetchAllRows(() => sb
    .from('shift_report_entries')
    .select('flavor_id, trays_sold, shift_reports!inner(report_date)')
    .gte('shift_reports.report_date', peakStart)
    .lt('shift_reports.report_date', peakEndExclusive)
    .order('id', { ascending: true })),
])

const soldByFlavor = {}
for (const e of entries) soldByFlavor[e.flavor_id] = (soldByFlavor[e.flavor_id] ?? 0) + (e.trays_sold ?? 0)

const fudgeFlavors = flavors.filter((f) => f.product_type === 'fudge' && !f.is_component)

// A pure rate*bufferDays+round formula was too coarse: it's not just Chocolate Peanut Butter
// (105 trays/114 days peak = 0.92/day) that got flattened to the same "2" as flavors selling
// 5-10x slower — Vanilla Sea Salt Caramel (0.64/day), Chocolate Sea Salt Caramel (0.57/day),
// and Cookies & Cream (0.53/day) are ALSO clearly above the rest of the pack (next-highest
// non-base is Chocolate Walnut at 0.40) but round(rate*3) still lands all of them on 2, same
// as Chocolate Mint at 0.11/day. Switched to explicit tiers instead of one linear formula, so
// real breaks in the demand curve actually show up as different numbers:
//   bases (is_base_trigger)   -> round(rate*3), floored at 3        (Vanilla/Chocolate -> 4, Peanut Butter -> 3)
//   strong non-base sellers   -> 3   (peak rate >= 0.5/day: Choc PB, both SSCs, Cookies & Cream)
//   everyone else with sales  -> 2   (the app's existing universal default)
//   no peak-window sales      -> 0   (e.g. Pumpkin Spice, added after peak started)
const STRONG_SELLER_RATE = 0.5 // trays/day during peak
const curated = fudgeFlavors.map((f) => {
  const totalSold = soldByFlavor[f.id] ?? 0
  const peakRate = totalSold / peakDays
  let threshold
  if (totalSold === 0) threshold = 0
  else if (f.is_base_trigger) threshold = Math.min(20, Math.max(3, Math.round(peakRate * 3)))
  else if (peakRate >= STRONG_SELLER_RATE) threshold = 3
  else threshold = 2
  return { id: f.id, name: f.name, is_base_trigger: f.is_base_trigger, totalSold, peakRate: Number(peakRate.toFixed(2)), threshold, currentLow: f.low_tray_threshold, currentPeakSnapshot: f.peak_low_tray_threshold }
})

curated.sort((a, b) => b.peakRate - a.peakRate)
console.log('\n%-26s %10s %10s %10s', 'flavor', 'sold(peak)', 'rate/day', 'threshold')
for (const c of curated) {
  console.log(
    `${c.name.padEnd(26)} ${String(c.totalSold).padStart(10)} ${String(c.peakRate).padStart(10)} ${String(c.threshold).padStart(10)}${c.is_base_trigger ? '  (base)' : ''}`
  )
}

console.log('\nWriting peak_low_tray_threshold for all fudge flavors...')
for (const c of curated) {
  const { error } = await sb.from('flavors').update({ peak_low_tray_threshold: c.threshold }).eq('id', c.id)
  if (error) console.error(`  FAILED ${c.name}:`, error.message)
}
console.log('Done writing peak snapshots.')

// Now apply today's live low_tray_threshold using the same rule syncWindDownThresholds uses,
// now that peak_low_tray_threshold holds the curated (correct) numbers.
console.log('\nApplying live wind-down thresholds from the curated peak snapshots...')
const outlook = await getSeasonOutlook(sb, {})
const verdictByName = {}
const traysByName = {}
for (const item of outlook.fudge) { verdictByName[item.flavor] = item.verdict; traysByName[item.flavor] = item.trays }

for (const c of curated) {
  const verdict = verdictByName[c.name]
  if (!verdict) continue // e.g. Pumpkin Spice, excluded from the outlook
  const newLow = verdict === 'make_small' ? Math.max(traysByName[c.name] ?? 0, 0) : (c.is_base_trigger ? c.threshold : 0)
  const { error } = await sb.from('flavors').update({ low_tray_threshold: newLow }).eq('id', c.id)
  if (error) console.error(`  FAILED live update ${c.name}:`, error.message)
  else console.log(`  ${c.name}: low_tray_threshold -> ${newLow} (peak snapshot ${c.threshold}, verdict ${verdict})`)
}
console.log('\nDone.')
