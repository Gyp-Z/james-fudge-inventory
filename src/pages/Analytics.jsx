import { useState, useEffect, useMemo, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { getSeasonOutlook } from '../core/ops'

const FUDGE_COLORS = [
  '#7C4B2A', '#2D5A1B', '#C4843A', '#5B3A7E', '#2E86AB',
  '#E84855', '#3BB273', '#F6AE2D', '#8B5E3C', '#4A7B35',
]
const POPCORN_COLORS = ['#D97706', '#92400E', '#F59E0B', '#78350F', '#FBBF24']

const SEASON_START = '2026-04-22'

// Extras yield conversions (for the "Extras made this period" recap only — production,
// never stock). Confirmed with owner July 2026:
// - Toffee yields TRAYS per batch, and the ratio changed: the first good batch (June 25)
//   was 1 tray/batch; from the next batch on it's thicker, 2 trays/batch. So batches on or
//   after TOFFEE_2X_FROM count as 2 trays, earlier good batches as 1 tray.
// - One Dot Cake Frosting batch decorates ~8 cakes.
// - Each 1/18-tray caramel slice hand-wraps into ~8 individual caramels.
const TOFFEE_2X_FROM = '2026-07-09'
const TOFFEE_TRAYS = (batchDate) => (batchDate >= TOFFEE_2X_FROM ? 2 : 1)
const DOT_CAKES_PER_BATCH = 8
const CARAMELS_PER_SLICE = 8

const RANGE_OPTIONS = [
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
  { label: 'All Time', days: null },
]

function getDateStr(date) { return date.toLocaleDateString('en-CA') }
function formatDate(str) {
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function formatWeekLabel(mondayStr) {
  const start = new Date(mondayStr + 'T12:00:00')
  const end = new Date(mondayStr + 'T12:00:00')
  end.setDate(end.getDate() + 6)
  const opts = { month: 'short', day: 'numeric' }
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`
}

// Dismisses Recharts tooltip when the user taps outside the chart on touch devices
function ChartWrapper({ children }) {
  const ref = useRef(null)
  useEffect(() => {
    function onTouchStart(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        const svg = ref.current.querySelector('svg')
        if (svg) svg.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
      }
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    return () => document.removeEventListener('touchstart', onTouchStart)
  }, [])
  return <div ref={ref}>{children}</div>
}

// End-of-season sell-down outlook. Threshold-free — pulls the SAME computation Jarvis uses
// (getSeasonOutlook in core) so the waste forecast here matches the chat. Fudge sells down
// to ~zero by close; popcorn is made fresh to demand and is shown separately, not in the math.
const PHASE_LABEL = {
  preseason: { text: 'Pre-season', cls: 'bg-store-tan text-store-brown' },
  peak: { text: 'Peak season', cls: 'bg-store-green text-white' },
  winddown: { text: 'Wind-down — selling fudge down to close', cls: 'bg-amber-500 text-white' },
  closed: { text: 'Season closed', cls: 'bg-store-brown text-white' },
}
const VERDICT = {
  stop: { text: 'Stop · sell down', cls: 'bg-red-100 text-red-700' },
  coast: { text: 'Coast', cls: 'bg-store-tan text-store-brown' },
  make_small: { text: 'Top seller · make a little', cls: 'bg-amber-100 text-amber-800' },
}

function SeasonOutlookPanel() {
  const [outlook, setOutlook] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    getSeasonOutlook(supabase, {}).then(d => { if (alive) setOutlook(d) }).catch(() => {})
    return () => { alive = false }
  }, [])

  if (!outlook) return null
  const phase = PHASE_LABEL[outlook.phase] || PHASE_LABEL.peak
  const leftover = outlook.total_projected_leftover_trays
  const leftoverCls = leftover > 0 ? 'text-red-600' : 'text-store-green'

  return (
    <div className="bg-white border border-store-tan rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-lg font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>Season Outlook</h3>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${phase.cls}`}>{phase.text}</span>
          <span className="text-xs text-store-brown-light">{outlook.days_until_close} days to close ({formatDate(outlook.season_end)})</span>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-bold ${leftoverCls}`}>{leftover}</p>
          <p className="text-xs text-store-brown-light">projected leftover fudge trays at close</p>
        </div>
      </div>

      <button onClick={() => setOpen(o => !o)} className="w-full text-left px-4 py-2 text-xs font-semibold text-store-green hover:bg-store-cream border-t border-store-tan transition-colors">
        {open ? '▲ Hide per-flavor sell-down' : '▼ Show per-flavor sell-down'}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-store-tan bg-store-cream/40">
          <p className="text-xs text-store-brown-light pt-2">
            Based on the last {outlook.window_days} days of real sales — not the low-stock thresholds. The goal is to end the season near zero leftover fudge, so flavors marked <span className="font-semibold text-red-700">Stop</span> already have enough to last; sell them down rather than making more. Slow flavors running dry a little early is fine.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-store-brown-light border-b border-store-tan">
                  <th className="py-2 pr-3">Fudge flavor</th>
                  <th className="py-2 pr-3 text-right">On hand</th>
                  <th className="py-2 pr-3 text-right">Sold/day</th>
                  <th className="py-2 pr-3 text-right">Runs out</th>
                  <th className="py-2 pr-3 text-right">Left at close</th>
                  <th className="py-2 pr-0 text-right">Plan</th>
                </tr>
              </thead>
              <tbody>
                {/* Ordered by sales rate (best sellers first), matching the rest of the app.
                    The "left at close" waste number is still per-row for each flavor. */}
                {[...outlook.fudge].sort((a, b) => (b.per_day_sold ?? 0) - (a.per_day_sold ?? 0) || a.flavor.localeCompare(b.flavor)).map(r => (
                  <tr key={r.flavor} className="border-b border-store-tan/60">
                    <td className="py-2 pr-3 font-medium text-store-brown">{r.flavor}</td>
                    <td className="py-2 pr-3 text-right text-store-brown">{r.trays}</td>
                    <td className="py-2 pr-3 text-right text-store-brown-light">{r.per_day_sold || '—'}</td>
                    <td className="py-2 pr-3 text-right text-store-brown-light">{r.projected_sellout_date ? formatDate(r.projected_sellout_date) : 'no recent sales'}</td>
                    <td className={`py-2 pr-3 text-right font-semibold ${r.projected_leftover_at_close > 0 ? 'text-red-600' : 'text-store-green'}`}>{r.projected_leftover_at_close}</td>
                    <td className="py-2 pr-0 text-right">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${(VERDICT[r.verdict] || VERDICT.coast).cls}`}>{(VERDICT[r.verdict] || VERDICT.coast).text}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            🍿 Popcorn isn’t part of the sell-down — keep making it fresh to demand right through close (short shelf life). On hand: {outlook.popcorn.items.map(p => `${p.flavor} ${p.barrels}`).join(' · ') || 'none'}.
          </p>
        </div>
      )}
    </div>
  )
}

export default function Analytics() {
  const [reports, setReports] = useState([])
  const [flavors, setFlavors] = useState([])
  const [allFlavorsList, setAllFlavorsList] = useState([])
  const [batchLogs, setBatchLogs] = useState([])
  const [bucketLogs, setBucketLogs] = useState([])
  const [currentInventory, setCurrentInventory] = useState([])
  const [handwrapLogs, setHandwrapLogs] = useState([])
  const [fudgePopLogs, setFudgePopLogs] = useState([])
  const [range, setRange] = useState(7)
  const [specificWeek, setSpecificWeek] = useState(null)
  const [specificDay, setSpecificDay] = useState(null)
  const [groupFilter, setGroupFilter] = useState('fudge')
  const [selectedFlavors, setSelectedFlavors] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [
        { data: reportData },
        { data: flavorData },
        { data: batchData },
        { data: bucketData },
        { data: invData },
        { data: handwrapData },
        { data: fudgePopData },
      ] = await Promise.all([
        supabase
          .from('shift_reports')
          .select(`id, report_date, created_at, shift_report_entries(
            flavor_id, full_trays, trays_sold, trays_wasted, in_progress_wasted, waste_reason, flavors(name)
          )`)
          .order('created_at'),
        supabase
          .from('flavors')
          .select('id, name, product_type, tracks_shelf_buckets, is_component, default_yield')
          .eq('is_active', true)
          .order('name'),
        supabase.from('batch_logs').select('*').order('batch_date'),
        supabase
          .from('shelf_bucket_logs')
          .select('flavor_id, barrels_added, barrels_used, logged_at')
          .order('logged_at'),
        supabase.from('current_inventory').select('flavor_id, tray_count, barrel_count'),
        supabase.from('caramel_handwrap_logs').select('trays_used, report_date').order('report_date'),
        supabase.from('fudge_pop_logs').select('base, pop_count, report_date').order('report_date'),
      ])
      const { data: allFlavorsData } = await supabase
        .from('flavors')
        .select('id, name, default_yield, is_component')
      setAllFlavorsList(allFlavorsData || [])
      setReports(reportData || [])
      setFlavors(flavorData || [])
      setBatchLogs(batchData || [])
      setBucketLogs(bucketData || [])
      setCurrentInventory(invData || [])
      setHandwrapLogs(handwrapData || [])
      setFudgePopLogs(fudgePopData || [])
      setLoading(false)
    }
    load()
  }, [])

  // ── Flavor lists ──────────────────────────────────────────────────────────
  // Season-to-date units sold per flavor_id (trays for fudge, barrels for popcorn) — used
  // to order the flavor filter buttons best-seller-first instead of alphabetically, matching
  // the Dashboard and Shift Report. Computed from already-loaded reports + bucket logs.
  const soldMap = useMemo(() => {
    const m = {}
    reports.forEach(r => {
      if ((r.report_date ?? '') < SEASON_START) return
      r.shift_report_entries?.forEach(e => { m[e.flavor_id] = (m[e.flavor_id] ?? 0) + (e.trays_sold ?? 0) })
    })
    bucketLogs.forEach(b => {
      const d = new Date(b.logged_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      if (d < SEASON_START) return
      m[b.flavor_id] = (m[b.flavor_id] ?? 0) + (b.barrels_used ?? 0)
    })
    return m
  }, [reports, bucketLogs])
  const bySold = useMemo(() => (a, b) => (soldMap[b.id] ?? 0) - (soldMap[a.id] ?? 0) || a.name.localeCompare(b.name), [soldMap])

  const fudgeFlavors = useMemo(
    () => flavors.filter(f => f.product_type === 'fudge' && !f.is_component).sort(bySold),
    [flavors, bySold]
  )
  const popcornFlavors = useMemo(
    () => flavors.filter(f => f.product_type === 'popcorn').sort(bySold),
    [flavors, bySold]
  )
  const componentFlavors = useMemo(
    () => flavors.filter(f => f.is_component === true),
    [flavors]
  )
  const groupFlavors = useMemo(() => {
    if (groupFilter === 'popcorn') return popcornFlavors
    if (groupFilter === 'caramel') return componentFlavors
    return fudgeFlavors
  }, [groupFilter, fudgeFlavors, componentFlavors, popcornFlavors])

  const visibleFlavors = useMemo(
    () => selectedFlavors === null ? groupFlavors : groupFlavors.filter(f => selectedFlavors.has(f.id)),
    [groupFlavors, selectedFlavors]
  )
  const visibleFudgeFlavors = useMemo(
    () => visibleFlavors.filter(f => f.product_type === 'fudge'),
    [visibleFlavors]
  )
  const viewPopcornFlavors = useMemo(
    () => visibleFlavors.filter(f => f.product_type === 'popcorn'),
    [visibleFlavors]
  )
  const viewPopcornIds = useMemo(
    () => new Set(viewPopcornFlavors.map(f => f.id)),
    [viewPopcornFlavors]
  )

  function handleGroupChange(g) {
    setGroupFilter(g)
    setSelectedFlavors(null)
  }

  function toggleFlavor(id) {
    setSelectedFlavors(prev => {
      if (prev === null) return new Set([id])
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); return next.size === 0 ? null : next }
      next.add(id)
      return next.size === groupFlavors.length ? null : next
    })
  }

  // ── Inventory map (live) ──────────────────────────────────────────────────
  const invMap = useMemo(() => {
    const m = {}
    currentInventory.forEach(r => { m[r.flavor_id] = r })
    return m
  }, [currentInventory])

  // ── Date filtering ────────────────────────────────────────────────────────
  const { cutoffStr, cutoffEndStr } = useMemo(() => {
    if (specificDay) return { cutoffStr: specificDay, cutoffEndStr: specificDay }
    if (specificWeek) {
      const end = new Date(specificWeek + 'T12:00:00')
      end.setDate(end.getDate() + 6)
      return { cutoffStr: specificWeek, cutoffEndStr: getDateStr(end) }
    }
    if (!range) return { cutoffStr: null, cutoffEndStr: null }
    const c = new Date(); c.setDate(c.getDate() - range)
    return { cutoffStr: getDateStr(c), cutoffEndStr: null }
  }, [range, specificWeek, specificDay])

  const filteredReports = useMemo(() => {
    let r = cutoffStr ? reports.filter(rep => rep.report_date >= cutoffStr) : reports
    if (cutoffEndStr) r = r.filter(rep => rep.report_date <= cutoffEndStr)
    return r
  }, [reports, cutoffStr, cutoffEndStr])

  const filteredBatchLogs = useMemo(() => {
    let b = cutoffStr ? batchLogs.filter(b => b.batch_date >= cutoffStr) : batchLogs
    if (cutoffEndStr) b = b.filter(b => (b.batch_date ?? '').slice(0, 10) <= cutoffEndStr)
    return b
  }, [batchLogs, cutoffStr, cutoffEndStr])

  const filteredBucketLogs = useMemo(() => {
    let logs = bucketLogs
    if (cutoffStr || cutoffEndStr) {
      logs = logs.filter(b => {
        const d = new Date(b.logged_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
        if (cutoffStr && d < cutoffStr) return false
        if (cutoffEndStr && d > cutoffEndStr) return false
        return true
      })
    }
    return logs
  }, [bucketLogs, cutoffStr, cutoffEndStr])

  // Extras made in the selected period (Toffee, Dot Cake Frosting, Fudge Pops, Wrapped
  // Caramels). These are batch-log/production-only — never on the stock graphs — so we just
  // report how much got MADE in the window at the bottom of the page.
  const inPeriod = (dateStr) => (!cutoffStr || dateStr >= cutoffStr) && (!cutoffEndStr || dateStr <= cutoffEndStr)
  const extrasProduced = useMemo(() => {
    const extraNames = new Map(flavors.filter(f => f.product_type === 'extra').map(f => [f.id, f.name]))
    // Toffee tracked in TRAYS (date-based yield); Dot Cake Frosting in batches→cakes; any
    // other extra falls back to a plain batch count.
    let toffeeTrays = 0, toffeeWasted = 0
    const dotCakeBatches = { made: 0, wasted: 0 }
    const otherBatches = {} // name -> { made, wasted }
    filteredBatchLogs.forEach(b => {
      const name = extraNames.get(b.flavor_id)
      if (!name) return
      const date = (b.batch_date ?? '').slice(0, 10)
      if (name === 'Toffee') {
        if (b.is_wasted) toffeeWasted += 1; else toffeeTrays += TOFFEE_TRAYS(date)
      } else if (name === 'Dot Cake Frosting') {
        if (b.is_wasted) dotCakeBatches.wasted += 1; else dotCakeBatches.made += 1
      } else {
        const rec = (otherBatches[name] ||= { made: 0, wasted: 0 })
        if (b.is_wasted) rec.wasted += 1; else rec.made += 1
      }
    })
    const pops = fudgePopLogs.reduce((s, p) => s + (inPeriod(p.report_date ?? '') ? (p.pop_count ?? 0) : 0), 0)
    const handwrapTrays = handwrapLogs.reduce((s, h) => s + (inPeriod(h.report_date ?? '') ? (Number(h.trays_used) || 0) : 0), 0)
    const caramels = Math.round(handwrapTrays * 18 * CARAMELS_PER_SLICE) // slices × ~8 wrapped each

    const rows = []
    // Toffee — trays, with wasted noted (specific-day views show the wasted R&D attempts).
    const toffeeBits = []
    if (toffeeTrays > 0) toffeeBits.push(`${toffeeTrays} ${toffeeTrays === 1 ? 'tray' : 'trays'}`)
    if (toffeeWasted > 0) toffeeBits.push(`${toffeeWasted} wasted`)
    rows.push({ label: 'Toffee', value: toffeeBits.join(' · '), empty: toffeeBits.length === 0 })
    // Dot Cake Frosting — batches → approx cakes decorated.
    const dcCakes = dotCakeBatches.made * DOT_CAKES_PER_BATCH
    const dcBits = []
    if (dotCakeBatches.made > 0) dcBits.push(`${dotCakeBatches.made} ${dotCakeBatches.made === 1 ? 'batch' : 'batches'} (≈ ${dcCakes} cakes)`)
    if (dotCakeBatches.wasted > 0) dcBits.push(`${dotCakeBatches.wasted} wasted`)
    rows.push({ label: 'Dot Cake Frosting', value: dcBits.join(' · '), empty: dcBits.length === 0 })
    // Any future extras
    Object.keys(otherBatches).sort().forEach(name => rows.push({
      label: name,
      value: `${otherBatches[name].made} ${otherBatches[name].made === 1 ? 'batch' : 'batches'}${otherBatches[name].wasted ? ` · ${otherBatches[name].wasted} wasted` : ''}`,
      empty: otherBatches[name].made === 0 && otherBatches[name].wasted === 0,
    }))
    rows.push({ label: 'Fudge Pops', value: `${pops} ${pops === 1 ? 'pop' : 'pops'}`, empty: pops === 0 })
    rows.push({ label: 'Wrapped Caramels', value: `${caramels} caramels`, empty: caramels === 0 })
    return rows
  }, [flavors, filteredBatchLogs, fudgePopLogs, handwrapLogs, cutoffStr, cutoffEndStr]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Week / Day dropdown options ───────────────────────────────────────────
  const availableWeeks = useMemo(() => {
    const dates = reports.map(r => r.report_date).filter(d => d && d >= SEASON_START)
    const weeks = new Set()
    dates.forEach(d => {
      const date = new Date(d + 'T12:00:00')
      const day = date.getDay()
      const diff = day === 0 ? -6 : 1 - day
      date.setDate(date.getDate() + diff)
      weeks.add(getDateStr(date))
    })
    return [...weeks].sort().reverse()
  }, [reports])

  const availableDays = useMemo(() => {
    const dates = [...new Set(reports.map(r => r.report_date).filter(d => d && d >= SEASON_START))]
    return dates.sort().reverse()
  }, [reports])

  // ── Stock history, reconstructed BACKWARD from current_inventory ───────────
  // current_inventory is the app's source of truth (the owner recounts to fix drift), so we
  // anchor TODAY to it and walk backward, undoing each day's reported activity:
  //   end_of(day-1) = end_of(day) − (that day's made − sold − wasted)
  // This guarantees every flavor's line ends at its real shelf count AND reflects every
  // reported batch/sale — no forward drift, and immune to recount ordering (the old approach
  // let a same-day recount clobber production, which hid Pistachio's 3 trays made 7/11).
  // Returns { flavor_id: { 'YYYY-MM-DD': trays } } for every day since season start.
  const todayStr = getDateStr(new Date())
  const seasonDays = useMemo(() => {
    const days = []
    const cursor = new Date(SEASON_START + 'T12:00:00')
    const end = new Date(todayStr + 'T12:00:00')
    while (cursor <= end) { days.push(getDateStr(cursor)); cursor.setDate(cursor.getDate() + 1) }
    return days
  }, [todayStr])

  const fudgeStockByDate = useMemo(() => {
    const delta = {} // flavor_id → date → net tray change
    reports.forEach(r => {
      const d = r.report_date
      if (!d || d < SEASON_START) return
      r.shift_report_entries?.forEach(e => {
        const net = (e.full_trays ?? 0) - (e.trays_sold ?? 0) - (e.trays_wasted ?? 0)
        ;((delta[e.flavor_id] ||= {})[d] = (delta[e.flavor_id][d] ?? 0) + net)
      })
    })
    const out = {}
    fudgeFlavors.forEach(f => {
      let value = invMap[f.id]?.tray_count ?? 0
      const series = {}
      for (let i = seasonDays.length - 1; i >= 0; i--) {
        const d = seasonDays[i]
        series[d] = Math.max(0, Math.round(value * 100) / 100)
        value -= (delta[f.id]?.[d] ?? 0)
      }
      out[f.id] = series
    })
    return out
  }, [reports, fudgeFlavors, invMap, seasonDays])

  const popcornStockByDate = useMemo(() => {
    const delta = {} // flavor_id → date → net barrel change
    bucketLogs.forEach(b => {
      const d = new Date(b.logged_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      if (d < SEASON_START) return
      ;((delta[b.flavor_id] ||= {})[d] = (delta[b.flavor_id][d] ?? 0) + (b.barrels_added ?? 0) - (b.barrels_used ?? 0))
    })
    const out = {}
    popcornFlavors.forEach(f => {
      let value = invMap[f.id]?.barrel_count ?? 0
      const series = {}
      for (let i = seasonDays.length - 1; i >= 0; i--) {
        const d = seasonDays[i]
        series[d] = Math.max(0, Math.round(value * 100) / 100)
        value -= (delta[f.id]?.[d] ?? 0)
      }
      out[f.id] = series
    })
    return out
  }, [bucketLogs, popcornFlavors, invMap, seasonDays])

  // Historical stock for the specific week/day views = the reconstructed value on that date.
  const historicalFudgeStock = useMemo(() => {
    if (!specificWeek && !specificDay) return null
    const running = {}
    fudgeFlavors.forEach(f => { running[f.id] = fudgeStockByDate[f.id]?.[cutoffEndStr] ?? 0 })
    return running
  }, [fudgeFlavors, fudgeStockByDate, specificWeek, specificDay, cutoffEndStr])

  const historicalPopcornStock = useMemo(() => {
    if (!specificWeek && !specificDay) return null
    const running = {}
    popcornFlavors.forEach(f => { running[f.id] = popcornStockByDate[f.id]?.[cutoffEndStr] ?? 0 })
    return running
  }, [popcornFlavors, popcornStockByDate, specificWeek, specificDay, cutoffEndStr])

  // ── Caramel totals ────────────────────────────────────────────────────────
  // Full-season computed total (always current)
  const caramelComputedTotal = useMemo(() => {
    if (!componentFlavors.length) return 0
    const caramelFlavor = componentFlavors[0]
    let total = 0
    batchLogs.forEach(b => {
      if (b.is_wasted) return
      const bDate = (b.batch_date ?? '').slice(0, 10)
      if (bDate < SEASON_START) return
      if (b.flavor_id === caramelFlavor.id) total += 1
    })
    reports.forEach(r => {
      if ((r.report_date ?? '') < SEASON_START) return
      r.shift_report_entries?.forEach(e => {
        if (e.flavors?.name?.toLowerCase().includes('sea salt')) {
          total -= (e.full_trays ?? 0) / 18
        }
      })
    })
    handwrapLogs.forEach(h => {
      if ((h.report_date ?? '') < SEASON_START) return
      total -= h.trays_used ?? 0
    })
    return Math.max(0, Math.round(total * 1000) / 1000)
  }, [batchLogs, reports, componentFlavors, handwrapLogs])

  // Historical caramel total at end of a specific week/day
  const historicalCaramelTotal = useMemo(() => {
    if (!specificWeek && !specificDay) return null
    if (!componentFlavors.length) return 0
    const caramelFlavor = componentFlavors[0]
    const endDate = cutoffEndStr
    let total = 0
    batchLogs.forEach(b => {
      if (b.is_wasted) return
      const bDate = (b.batch_date ?? '').slice(0, 10)
      if (bDate < SEASON_START || bDate > endDate) return
      if (b.flavor_id === caramelFlavor.id) total += 1
    })
    reports.forEach(r => {
      const d = r.report_date ?? ''
      if (d < SEASON_START || d > endDate) return
      r.shift_report_entries?.forEach(e => {
        if (e.flavors?.name?.toLowerCase().includes('sea salt')) {
          total -= (e.full_trays ?? 0) / 18
        }
      })
    })
    handwrapLogs.forEach(h => {
      const d = h.report_date ?? ''
      if (d < SEASON_START || d > endDate) return
      total -= h.trays_used ?? 0
    })
    return Math.max(0, Math.round(total * 1000) / 1000)
  }, [batchLogs, reports, componentFlavors, handwrapLogs, specificWeek, specificDay, cutoffEndStr])

  // Displayed caramel total — historical for week/day, live otherwise
  const displayCaramelTotal = historicalCaramelTotal ?? caramelComputedTotal

  // ── Off-graph "what was also made" for the selected day ───────────────────
  // Fudge pops and hand-wrapped caramels aren't on any chart, but a day's detail
  // should still record them so the breakdown reflects everything produced.
  const dayFudgePops = useMemo(() => {
    if (!specificDay) return null
    const m = { vanilla: 0, chocolate: 0 }
    fudgePopLogs.forEach(p => {
      if (p.report_date !== specificDay) return
      if (m[p.base] != null) m[p.base] += p.pop_count ?? 0
    })
    return m
  }, [fudgePopLogs, specificDay])

  const dayHandwrapTrays = useMemo(() => {
    if (!specificDay) return 0
    return handwrapLogs.reduce((s, h) => h.report_date === specificDay ? s + (h.trays_used ?? 0) : s, 0)
  }, [handwrapLogs, specificDay])

  // ── Summary card stock values ─────────────────────────────────────────────
  // Use historical end-of-period stock for week/day, live inventory for rolling ranges
  const stockSnapshot = useMemo(() => ({
    fudgeTrays: historicalFudgeStock
      ? fudgeFlavors.reduce((s, f) => s + (historicalFudgeStock[f.id] ?? 0), 0)
      : fudgeFlavors.reduce((s, f) => s + (invMap[f.id]?.tray_count ?? 0), 0),
    popcornBarrels: historicalPopcornStock
      ? popcornFlavors.reduce((s, f) => s + (historicalPopcornStock[f.id] ?? 0), 0)
      : popcornFlavors.reduce((s, f) => s + (invMap[f.id]?.barrel_count ?? 0), 0),
  }), [invMap, fudgeFlavors, popcornFlavors, historicalFudgeStock, historicalPopcornStock])

  // ── Fudge totals (period) ─────────────────────────────────────────────────
  const fudgeTotals = useMemo(() => {
    let sold = 0, wasted = 0, made = 0
    filteredReports.forEach(r => {
      r.shift_report_entries?.forEach(e => {
        sold += e.trays_sold ?? 0
        wasted += (e.trays_wasted ?? 0) + (e.in_progress_wasted ?? 0) * 0.5
        made += e.full_trays ?? 0
      })
    })
    return { sold, wasted, made }
  }, [filteredReports])

  const caramelWasted = useMemo(() => {
    const componentIds = new Set(componentFlavors.map(f => f.id))
    return filteredBatchLogs.filter(b => componentIds.has(b.flavor_id) && b.is_wasted).length
  }, [filteredBatchLogs, componentFlavors])

  // Per-flavor fudge totals — stock uses historical for week/day, live otherwise
  const fudgeFlavorTotals = useMemo(() => {
    const map = {}
    visibleFudgeFlavors.forEach(f => {
      const stock = historicalFudgeStock
        ? (historicalFudgeStock[f.id] ?? 0)
        : (invMap[f.id]?.tray_count ?? 0)
      map[f.id] = { name: f.name, sold: 0, made: 0, wasted: 0, stock }
    })
    filteredReports.forEach(r => {
      r.shift_report_entries?.forEach(e => {
        if (!map[e.flavor_id]) return
        map[e.flavor_id].sold += e.trays_sold ?? 0
        map[e.flavor_id].made += e.full_trays ?? 0
        map[e.flavor_id].wasted += (e.trays_wasted ?? 0) + (e.in_progress_wasted ?? 0) * 0.5
      })
    })
    return Object.values(map)
  }, [filteredReports, visibleFudgeFlavors, invMap, historicalFudgeStock])

  // ── Fudge charts ──────────────────────────────────────────────────────────
  const chartSalesData = useMemo(() => {
    const byDate = {}
    filteredReports.filter(r => r.shift_report_entries?.length).forEach(r => {
      if (!byDate[r.report_date]) byDate[r.report_date] = {}
      r.shift_report_entries.forEach(e => {
        byDate[r.report_date][e.flavor_id] = (byDate[r.report_date][e.flavor_id] ?? 0) + (e.trays_sold ?? 0)
      })
    })
    return Object.entries(byDate).sort().map(([date, salesById]) => {
      const row = { date: formatDate(date) }
      visibleFudgeFlavors.forEach(f => { row[f.name] = salesById[f.id] ?? 0 })
      return row
    }).filter(row => visibleFudgeFlavors.some(f => row[f.name] > 0))
  }, [filteredReports, visibleFudgeFlavors])

  const { chartWasteData, wasteTable } = useMemo(() => {
    const totals = {}
    const table = []
    const names = new Set(visibleFudgeFlavors.map(f => f.name))
    visibleFudgeFlavors.forEach(f => { totals[f.name] = 0 })
    filteredReports.forEach(r => {
      r.shift_report_entries?.forEach(e => {
        const fullWasted = e.trays_wasted ?? 0
        const inProgWasted = e.in_progress_wasted ?? 0
        const totalWasted = fullWasted + inProgWasted * 0.5
        if (totalWasted <= 0) return
        const name = e.flavors?.name || e.flavor_id
        if (!names.has(name)) return
        totals[name] = (totals[name] ?? 0) + totalWasted
        table.push({ date: formatDate(r.report_date), flavor: name, amount: totalWasted, reason: e.waste_reason || '—' })
      })
    })
    return {
      chartWasteData: Object.entries(totals).filter(([, v]) => v > 0).map(([name, trays]) => ({ name, trays })).sort((a, b) => b.trays - a.trays),
      wasteTable: table,
    }
  }, [filteredReports, visibleFudgeFlavors])

  const chartStockData = useMemo(() => {
    if (!reports.length) return []
    // Read the backward-reconstructed daily stock (fudgeStockByDate) across the selected
    // window. Every point is anchored to real current_inventory, so the line ends at the
    // true shelf count and correctly shows each day's made/sold.
    const startStr = cutoffStr && cutoffStr > SEASON_START ? cutoffStr : SEASON_START
    const endStr = cutoffEndStr || todayStr
    const rows = []
    const cursor = new Date(startStr + 'T12:00:00')
    while (cursor <= new Date(endStr + 'T12:00:00')) {
      const ds = getDateStr(cursor)
      const row = { date: formatDate(ds) }
      let any = false
      visibleFudgeFlavors.forEach(f => {
        const v = fudgeStockByDate[f.id]?.[ds]
        row[f.name] = v ?? null
        if (v != null) any = true
      })
      if (any) rows.push(row)
      cursor.setDate(cursor.getDate() + 1)
    }
    return rows
  }, [reports, visibleFudgeFlavors, cutoffStr, cutoffEndStr, fudgeStockByDate, todayStr])

  // ── Popcorn charts ────────────────────────────────────────────────────────
  // Barrels-on-shelf over time = the backward-reconstructed barrel stock (anchored to real
  // current_inventory), so like fudge the line ends at the true count and reflects activity.
  const barrelsMadeData = useMemo(() => {
    const startStr = cutoffStr && cutoffStr > SEASON_START ? cutoffStr : SEASON_START
    const endStr = cutoffEndStr || todayStr
    const view = popcornFlavors.filter(f => viewPopcornIds.has(f.id))
    const rows = []
    const cursor = new Date(startStr + 'T12:00:00')
    while (cursor <= new Date(endStr + 'T12:00:00')) {
      const ds = getDateStr(cursor)
      const row = { date: formatDate(ds) }
      let any = false
      view.forEach(f => {
        const v = popcornStockByDate[f.id]?.[ds]
        row[f.name] = v ?? null
        if (v != null) any = true
      })
      if (any) rows.push(row)
      cursor.setDate(cursor.getDate() + 1)
    }
    return rows
  }, [popcornFlavors, viewPopcornIds, popcornStockByDate, cutoffStr, cutoffEndStr, todayStr])

  const barrelsSoldData = useMemo(() => {
    const byDate = {}
    filteredBucketLogs.filter(b => viewPopcornIds.has(b.flavor_id) && (b.barrels_used ?? 0) > 0).forEach(b => {
      const d = new Date(b.logged_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      const f = popcornFlavors.find(f => f.id === b.flavor_id)
      if (!f) return
      if (!byDate[d]) byDate[d] = {}
      byDate[d][f.name] = (byDate[d][f.name] ?? 0) + (b.barrels_used ?? 0)
    })
    return Object.entries(byDate).sort().map(([d, v]) => ({ date: formatDate(d), ...v }))
  }, [filteredBucketLogs, viewPopcornIds, popcornFlavors])

  // Per-flavor popcorn totals — stock uses historical for week/day, live otherwise
  const popcornFlavorTotals = useMemo(() => {
    const map = {}
    viewPopcornFlavors.forEach(f => {
      const stock = historicalPopcornStock
        ? (historicalPopcornStock[f.id] ?? 0)
        : (invMap[f.id]?.barrel_count ?? 0)
      map[f.id] = { name: f.name, sold: 0, stock }
    })
    filteredBucketLogs.filter(b => viewPopcornIds.has(b.flavor_id)).forEach(b => {
      if (!map[b.flavor_id]) return
      map[b.flavor_id].sold += b.barrels_used ?? 0
    })
    return Object.values(map)
  }, [filteredBucketLogs, viewPopcornFlavors, viewPopcornIds, invMap, historicalPopcornStock])

  const { popcornWasteTotals, popcornWasteTable } = useMemo(() => {
    const totals = {}
    const table = []
    filteredBatchLogs.filter(b => viewPopcornIds.has(b.flavor_id) && b.is_wasted).forEach(b => {
      const f = popcornFlavors.find(f => f.id === b.flavor_id)
      if (!f) return
      totals[f.name] = (totals[f.name] ?? 0) + 1
      table.push({ date: formatDate((b.batch_date ?? '').slice(0, 10)), flavor: f.name, reason: b.waste_reason || '—' })
    })
    return {
      popcornWasteTotals: Object.entries(totals).map(([name, batches]) => ({ name, batches })).sort((a, b) => b.batches - a.batches),
      popcornWasteTable: table.sort((a, b) => a.date.localeCompare(b.date)),
    }
  }, [filteredBatchLogs, viewPopcornIds, popcornFlavors])

  const allPopcornIds = useMemo(() => new Set(popcornFlavors.map(f => f.id)), [popcornFlavors])
  const allPopcornTotals = useMemo(() => ({
    barrelsSold: filteredBucketLogs.filter(b => allPopcornIds.has(b.flavor_id)).reduce((s, b) => s + (b.barrels_used ?? 0), 0),
    batchesWasted: filteredBatchLogs.filter(b => allPopcornIds.has(b.flavor_id) && b.is_wasted).length,
  }), [filteredBatchLogs, filteredBucketLogs, allPopcornIds])

  const caramelStockData = useMemo(() => {
    if (!componentFlavors.length) return []
    const caramelFlavor = componentFlavors[0]
    const caramelBatches = batchLogs.filter(b => {
      if (b.is_wasted) return false
      const bDate = (b.batch_date ?? '').slice(0, 10)
      return bDate >= SEASON_START && b.flavor_id === caramelFlavor.id
    })
    if (!caramelBatches.length) return []
    const caramelByDate = {}
    caramelBatches.forEach(b => {
      const bDate = (b.batch_date ?? '').slice(0, 10)
      caramelByDate[bDate] = (caramelByDate[bDate] ?? 0) + 1
    })
    const sscByDate = {}
    reports.forEach(r => {
      const key = r.report_date ?? ''
      if (!key || key < SEASON_START) return
      r.shift_report_entries?.forEach(e => {
        if (e.flavors?.name?.toLowerCase().includes('sea salt')) {
          sscByDate[key] = (sscByDate[key] ?? 0) - (e.full_trays ?? 0) / 18
        }
      })
    })
    handwrapLogs.forEach(h => {
      const key = h.report_date ?? ''
      if (!key || key < SEASON_START) return
      sscByDate[key] = (sscByDate[key] ?? 0) - (h.trays_used ?? 0)
    })
    const firstCaramelDate = Object.keys(caramelByDate).sort()[0]
    const todayStr = getDateStr(new Date())
    const effectiveStart = cutoffStr && cutoffStr > firstCaramelDate ? cutoffStr : firstCaramelDate
    const endStr = cutoffEndStr || todayStr
    let runningAtStart = 0
    for (const [d, v] of Object.entries(caramelByDate)) { if (d < effectiveStart) runningAtStart += v }
    for (const [d, v] of Object.entries(sscByDate)) { if (d < effectiveStart) runningAtStart += v }
    const rows = []
    const cursor = new Date(effectiveStart + 'T12:00:00')
    let running = runningAtStart
    while (cursor <= new Date(endStr + 'T12:00:00')) {
      const ds = getDateStr(cursor)
      if (caramelByDate[ds]) running += caramelByDate[ds]
      if (sscByDate[ds]) running += sscByDate[ds]
      rows.push({ date: formatDate(ds), [caramelFlavor.name]: Math.max(0, Math.round(running * 1000) / 1000) })
      cursor.setDate(cursor.getDate() + 1)
    }
    return rows
  }, [batchLogs, reports, componentFlavors, cutoffStr, cutoffEndStr, handwrapLogs])

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <p className="text-store-brown-light text-center py-12">Loading analytics...</p>

  const tooltipStyle = { borderRadius: 12, borderColor: '#E4D5BC', fontSize: 12, boxShadow: '0 8px 24px rgba(42,26,16,0.12)' }
  const wrapperStyle = { zIndex: 50 }
  const xProps = { tick: { fontSize: 11, fill: '#6B7A6E' } }
  const yProps = { tick: { fontSize: 11, fill: '#6B7A6E' } }
  const empty = msg => <p className="text-store-brown-light text-sm text-center py-8">{msg}</p>

  const showFudge = groupFilter === 'fudge'
  const showPopcorn = groupFilter === 'popcorn'
  const showCaramel = groupFilter === 'caramel'
  const isRolling = !specificWeek && !specificDay
  const isSpecificPeriod = specificWeek || specificDay
  const rangeNoun = specificDay ? 'day' : specificWeek ? 'week' : range ? `${range} days` : 'season'

  function setRollingRange(days) {
    setRange(days)
    setSpecificWeek(null)
    setSpecificDay(null)
  }

  function fmtCaramel(n) {
    const w = Math.floor(n), num = Math.round((n - w) * 18)
    return num === 0 ? String(w) : w === 0 ? `${num}/18` : `${w} ${num}/18`
  }

  // Compact totals table used below charts and in day-view
  function TotalsTable({ rows, cols, borderColor = 'store-tan' }) {
    const borderClass = borderColor === 'amber' ? 'border-amber-200' : 'border-store-tan'
    const subBorderClass = borderColor === 'amber' ? 'border-amber-100' : 'border-store-tan'
    const headClass = borderColor === 'amber' ? 'text-amber-700' : 'text-store-brown-light'
    const nameClass = borderColor === 'amber' ? 'text-amber-900' : 'text-store-brown'
    return (
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={`border-b ${borderClass}`}>
              <th className={`text-left py-2 pr-4 font-medium ${headClass}`}>Flavor</th>
              {cols.map(c => (
                <th key={c.label} className={`text-right py-2 pr-4 last:pr-0 font-medium ${headClass}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.name} className={`border-b ${subBorderClass} last:border-0`}>
                <td className={`py-2 pr-4 font-medium ${nameClass}`}>{row.name}</td>
                {cols.map(c => (
                  <td key={c.label} className={`py-2 pr-4 last:pr-0 text-right font-semibold ${c.color ? c.color(row[c.key]) : nameClass}`}>
                    {row[c.key]}{c.unit ? ` ${c.unit}` : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const stockLabel = isSpecificPeriod ? 'End of period' : 'In stock now'

  return (
    <div className="space-y-8">

      {/* Header + date range */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>Analytics</h2>
        <div className="flex flex-wrap gap-2 items-center">
          {RANGE_OPTIONS.map(opt => (
            <button key={opt.label} onClick={() => setRollingRange(opt.days)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors touch-manipulation ${isRolling && range === opt.days ? 'bg-store-brown text-white' : 'bg-store-tan text-store-brown hover:bg-store-brown hover:text-white'}`}>
              {opt.label}
            </button>
          ))}
          {availableWeeks.length > 0 && (
            <select
              value={specificWeek || ''}
              onChange={e => e.target.value ? (setSpecificWeek(e.target.value), setSpecificDay(null)) : setRollingRange(7)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer touch-manipulation transition-colors ${specificWeek ? 'bg-store-brown text-white' : 'bg-store-tan text-store-brown'}`}
            >
              <option value="">By Week</option>
              {availableWeeks.map(w => <option key={w} value={w}>{formatWeekLabel(w)}</option>)}
            </select>
          )}
          {availableDays.length > 0 && (
            <select
              value={specificDay || ''}
              onChange={e => e.target.value ? (setSpecificDay(e.target.value), setSpecificWeek(null)) : setRollingRange(7)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer touch-manipulation transition-colors ${specificDay ? 'bg-store-brown text-white' : 'bg-store-tan text-store-brown'}`}
            >
              <option value="">By Day</option>
              {availableDays.map(d => <option key={d} value={d}>{formatDate(d)}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-store-tan rounded-xl p-3 shadow-sm text-center">
          <p className="text-2xl font-bold text-store-brown">{stockSnapshot.fudgeTrays}</p>
          <p className="text-xs text-store-brown-light mt-0.5">Fudge trays{isSpecificPeriod ? ' (end of period)' : ''}</p>
          <p className="text-base font-semibold text-store-green mt-1">{fudgeTotals.sold}</p>
          <p className="text-xs text-store-brown-light">Trays sold</p>
          <p className="text-base font-semibold text-amber-600 mt-1">{fudgeTotals.wasted}</p>
          <p className="text-xs text-store-brown-light">Trays wasted</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 shadow-sm text-center">
          <p className="text-2xl font-bold text-amber-700">{stockSnapshot.popcornBarrels}</p>
          <p className="text-xs text-amber-800 mt-0.5">Popcorn barrels{isSpecificPeriod ? ' (end of period)' : ''}</p>
          <p className="text-base font-semibold text-amber-600 mt-1">{allPopcornTotals.barrelsSold}</p>
          <p className="text-xs text-amber-700">Barrels sold</p>
          <p className="text-base font-semibold text-amber-600 mt-1">{allPopcornTotals.batchesWasted}</p>
          <p className="text-xs text-amber-700">Batches wasted</p>
        </div>
        <div className="bg-store-cream border border-store-tan rounded-xl p-3 shadow-sm text-center">
          <p className="text-2xl font-bold text-store-brown">{fmtCaramel(displayCaramelTotal)}</p>
          <p className="text-xs text-store-brown-light mt-0.5">Caramel trays{isSpecificPeriod ? ' (end of period)' : ''}</p>
          <p className="text-base font-semibold text-amber-600 mt-1">{caramelWasted}</p>
          <p className="text-xs text-store-brown-light">Batches wasted</p>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'fudge',   label: 'All Fudge',   activeClass: 'bg-store-brown text-white border-store-brown',   inactiveClass: 'bg-white text-store-brown border-store-tan hover:border-store-brown' },
          { key: 'popcorn', label: 'All Popcorn',  activeClass: 'bg-amber-700 text-white border-amber-700',       inactiveClass: 'bg-white text-amber-900 border-amber-200 hover:border-amber-500' },
          { key: 'caramel', label: 'Caramel',      activeClass: 'bg-store-brown text-white border-store-brown',   inactiveClass: 'bg-white text-store-brown border-store-tan hover:border-store-brown' },
        ].map(({ key, label, activeClass, inactiveClass }) => (
          <button key={key} onClick={() => handleGroupChange(key)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors touch-manipulation border ${groupFilter === key && selectedFlavors === null ? activeClass : inactiveClass}`}>
            {label}
          </button>
        ))}
        {groupFilter !== 'caramel' && groupFlavors.map((f, i) => {
          const isPopcorn = f.product_type === 'popcorn'
          const active = selectedFlavors !== null && selectedFlavors.has(f.id)
          const color = isPopcorn ? POPCORN_COLORS[i % POPCORN_COLORS.length] : FUDGE_COLORS[i % FUDGE_COLORS.length]
          return (
            <button key={f.id} onClick={() => toggleFlavor(f.id)}
              className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors touch-manipulation border"
              style={active
                ? { backgroundColor: color, color: 'white', borderColor: color }
                : { backgroundColor: 'white', color: '#6B7A6E', borderColor: '#E4D5BC' }}>
              {f.name}
            </button>
          )
        })}
      </div>

      {/* ── Fudge section ── */}
      {showFudge && (
        specificDay ? (
          // Day view: no charts, one combined table
          <div>
            <h3 className="font-semibold text-store-brown mb-1">Summary for {formatDate(specificDay)}</h3>
            {fudgeFlavorTotals.some(t => t.sold > 0 || t.made > 0 || t.stock > 0) ? (
              <TotalsTable
                rows={fudgeFlavorTotals.slice().sort((a, b) => b.sold - a.sold || b.stock - a.stock)}
                cols={[
                  { label: 'In Stock', key: 'stock', unit: 'trays', color: v => v > 0 ? 'text-store-brown' : 'text-red-400' },
                  { label: 'Sold', key: 'sold', unit: 'trays', color: () => 'text-store-green' },
                  { label: 'Made', key: 'made', unit: 'trays' },
                ]}
              />
            ) : empty('No fudge data for this day.')}
            {dayFudgePops && (dayFudgePops.vanilla > 0 || dayFudgePops.chocolate > 0) && (
              <p className="text-sm text-store-brown-light mt-3">
                Fudge pops made:{' '}
                <span className="font-semibold text-store-brown">
                  {[
                    dayFudgePops.vanilla > 0 && `${dayFudgePops.vanilla} vanilla`,
                    dayFudgePops.chocolate > 0 && `${dayFudgePops.chocolate} chocolate`,
                  ].filter(Boolean).join(', ')}
                </span>{' '}
                <span className="text-xs">(not counted in trays made)</span>
              </p>
            )}
          </div>
        ) : (
          // Week / rolling view: full charts + totals
          <>
            <div>
              <h3 className="font-semibold text-store-brown mb-1">Sales</h3>
              <p className="text-xs text-store-brown-light mb-3">Trays sold per day, grouped by flavor</p>
              {chartSalesData.length > 0 ? (
                <>
                  <ChartWrapper>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={chartSalesData} margin={{ left: 0, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E4D5BC" />
                        <XAxis dataKey="date" {...xProps} />
                        <YAxis {...yProps} />
                        <Tooltip contentStyle={tooltipStyle} wrapperStyle={wrapperStyle} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {visibleFudgeFlavors.map((f, i) => (
                          <Bar key={f.id} dataKey={f.name} fill={FUDGE_COLORS[i % FUDGE_COLORS.length]} radius={[4, 4, 0, 0]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartWrapper>
                  {fudgeFlavorTotals.some(t => t.sold > 0) && (
                    <TotalsTable
                      rows={fudgeFlavorTotals.filter(t => t.sold > 0).slice().sort((a, b) => b.sold - a.sold)}
                      cols={[
                        { label: 'Sold', key: 'sold', unit: 'trays', color: () => 'text-store-green' },
                        { label: 'Made', key: 'made', unit: 'trays' },
                      ]}
                    />
                  )}
                </>
              ) : empty('No sales logged in this range yet.')}
            </div>

            <div>
              <h3 className="font-semibold text-store-brown mb-1">Waste</h3>
              <p className="text-xs text-store-brown-light mb-3">Total trays wasted per flavor</p>
              {chartWasteData.length > 0 ? (
                <>
                  <ChartWrapper>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={chartWasteData} layout="vertical" margin={{ left: 16, right: 16 }}>
                        <XAxis type="number" {...xProps} />
                        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12, fill: '#6B7A6E' }} />
                        <Tooltip contentStyle={tooltipStyle} wrapperStyle={wrapperStyle} />
                        <Bar dataKey="trays" fill="#C4843A" radius={[0, 4, 4, 0]} name="Trays wasted" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartWrapper>
                  {wasteTable.length > 0 && (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-store-tan">
                            <th className="text-left py-2 pr-4 text-store-brown-light font-medium">Date</th>
                            <th className="text-left py-2 pr-4 text-store-brown-light font-medium">Flavor</th>
                            <th className="text-left py-2 pr-4 text-store-brown-light font-medium">Trays</th>
                            <th className="text-left py-2 text-store-brown-light font-medium">Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {wasteTable.map((row, i) => (
                            <tr key={i} className="border-b border-store-tan last:border-0">
                              <td className="py-2 pr-4 text-store-brown-light">{row.date}</td>
                              <td className="py-2 pr-4 text-store-brown font-medium">{row.flavor}</td>
                              <td className="py-2 pr-4 text-store-brown">{row.amount}</td>
                              <td className="py-2 text-store-brown-light">{row.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : empty('No waste logged in this range.')}
            </div>

            <div>
              <h3 className="font-semibold text-store-brown mb-1">Stock Trend</h3>
              <p className="text-xs text-store-brown-light mb-3">Inventory level at end of each reporting day</p>
              {chartStockData.length > 0 ? (
                <>
                  <ChartWrapper>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={chartStockData} margin={{ left: 0, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E4D5BC" />
                        <XAxis dataKey="date" {...xProps} />
                        <YAxis {...yProps} domain={[0, dataMax => Math.ceil(dataMax * 1.2) || 2]} />
                        <Tooltip contentStyle={tooltipStyle} wrapperStyle={wrapperStyle} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {visibleFudgeFlavors.map((f, i) => (
                          <Line key={f.id} type="monotone" dataKey={f.name} stroke={FUDGE_COLORS[i % FUDGE_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartWrapper>
                  {fudgeFlavorTotals.length > 0 && (
                    <TotalsTable
                      rows={fudgeFlavorTotals.slice().sort((a, b) => b.stock - a.stock)}
                      cols={[
                        { label: stockLabel, key: 'stock', unit: 'trays', color: v => v > 0 ? 'text-store-brown' : 'text-red-400' },
                      ]}
                    />
                  )}
                </>
              ) : empty('No stock data in this range yet.')}
            </div>
          </>
        )
      )}

      {/* ── Caramel section ── */}
      {showCaramel && (
        specificDay ? (
          <div>
            <h3 className="font-semibold text-store-brown mb-1">Summary for {formatDate(specificDay)}</h3>
            <p className="text-sm text-store-brown-light">Caramel stock at end of day: <span className="font-semibold text-store-brown">{fmtCaramel(displayCaramelTotal)} trays</span></p>
            {dayHandwrapTrays > 0 && (
              <p className="text-sm text-store-brown-light mt-1">
                Caramels hand-wrapped: used <span className="font-semibold text-store-brown">{fmtCaramel(dayHandwrapTrays)}</span> of a caramel tray
              </p>
            )}
          </div>
        ) : (
          <div>
            <h3 className="font-semibold text-store-brown mb-1">Stock Trend</h3>
            <p className="text-xs text-store-brown-light mb-3">Caramel tray count over time (based on batches made vs. used in SSC)</p>
            {caramelStockData.length > 0 ? (
              <ChartWrapper>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={caramelStockData} margin={{ left: 16, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E4D5BC" />
                    <XAxis dataKey="date" {...xProps} />
                    <YAxis {...yProps}
                      domain={[0, dataMax => Math.ceil(dataMax * 1.2) || 2]}
                      tickFormatter={v => fmtCaramel(v)}
                    />
                    <Tooltip contentStyle={tooltipStyle} wrapperStyle={wrapperStyle} formatter={v => [fmtCaramel(v), 'trays']} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {componentFlavors.map((f, i) => (
                      <Line key={f.id} type="monotone" dataKey={f.name} stroke={FUDGE_COLORS[i % FUDGE_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </ChartWrapper>
            ) : empty('No caramel or SSC batches logged yet.')}
          </div>
        )
      )}

      {/* ── Popcorn section ── */}
      {showPopcorn && (
        specificDay ? (
          // Day view: no charts, one combined table
          <div>
            <h3 className="font-semibold text-amber-900 mb-1">Summary for {formatDate(specificDay)}</h3>
            {popcornFlavorTotals.some(t => t.sold > 0 || t.stock > 0) ? (
              <TotalsTable
                borderColor="amber"
                rows={popcornFlavorTotals.slice().sort((a, b) => b.sold - a.sold || b.stock - a.stock)}
                cols={[
                  { label: 'In Stock', key: 'stock', unit: 'barrels', color: v => v > 0 ? 'text-amber-900' : 'text-red-400' },
                  { label: 'Sold', key: 'sold', unit: 'barrels', color: () => 'text-amber-700' },
                ]}
              />
            ) : empty('No popcorn data for this day.')}
          </div>
        ) : (
          // Week / rolling view: full charts + totals
          <>
            <div>
              <h3 className="font-semibold text-amber-900 mb-1">Barrels in Stock</h3>
              <p className="text-xs text-amber-700 mb-3">Stock trend (barrels added minus sold)</p>
              {barrelsMadeData.length > 0 ? (
                <>
                  <ChartWrapper>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={barrelsMadeData} margin={{ left: 0, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E4D5BC" />
                        <XAxis dataKey="date" {...xProps} />
                        <YAxis {...yProps} domain={[0, dataMax => Math.ceil(dataMax * 1.2) || 2]} />
                        <Tooltip contentStyle={tooltipStyle} wrapperStyle={wrapperStyle} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {viewPopcornFlavors.filter(f => barrelsMadeData.some(row => (row[f.name] ?? 0) > 0)).map((f, i) => (
                          <Line key={f.id} type="monotone" dataKey={f.name} stroke={POPCORN_COLORS[i % POPCORN_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartWrapper>
                  {popcornFlavorTotals.length > 0 && (
                    <TotalsTable
                      borderColor="amber"
                      rows={popcornFlavorTotals.slice().sort((a, b) => b.stock - a.stock)}
                      cols={[
                        { label: stockLabel, key: 'stock', unit: 'barrels', color: v => v > 0 ? 'text-amber-900' : 'text-red-400' },
                      ]}
                    />
                  )}
                </>
              ) : empty('No popcorn batches logged yet.')}
            </div>

            <div>
              <h3 className="font-semibold text-amber-900 mb-1">Barrels Sold</h3>
              <p className="text-xs text-amber-700 mb-3">Barrels sold per day</p>
              {barrelsSoldData.length > 0 ? (
                <>
                  <ChartWrapper>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={barrelsSoldData} margin={{ left: 0, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E4D5BC" />
                        <XAxis dataKey="date" {...xProps} />
                        <YAxis {...yProps} />
                        <Tooltip contentStyle={tooltipStyle} wrapperStyle={wrapperStyle} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {viewPopcornFlavors.map((f, i) => (
                          <Bar key={f.id} dataKey={f.name} fill={POPCORN_COLORS[i % POPCORN_COLORS.length]} radius={[4, 4, 0, 0]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartWrapper>
                  {popcornFlavorTotals.some(t => t.sold > 0) && (
                    <TotalsTable
                      borderColor="amber"
                      rows={popcornFlavorTotals.filter(t => t.sold > 0).slice().sort((a, b) => b.sold - a.sold)}
                      cols={[
                        { label: 'Barrels Sold', key: 'sold' },
                      ]}
                    />
                  )}
                </>
              ) : empty('No barrels sold logged yet. Use the Products tab in Report.')}
            </div>

            <div>
              <h3 className="font-semibold text-amber-900 mb-1">Batches Wasted</h3>
              <p className="text-xs text-amber-700 mb-3">Total wasted batches per flavor</p>
              {popcornWasteTotals.length > 0 ? (
                <>
                  <ChartWrapper>
                    <ResponsiveContainer width="100%" height={Math.max(120, popcornWasteTotals.length * 52)}>
                      <BarChart data={popcornWasteTotals} layout="vertical" margin={{ left: 16, right: 16 }}>
                        <XAxis type="number" {...xProps} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12, fill: '#6B7A6E' }} />
                        <Tooltip contentStyle={tooltipStyle} wrapperStyle={wrapperStyle} />
                        <Bar dataKey="batches" fill="#D97706" radius={[0, 4, 4, 0]} name="Batches wasted" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartWrapper>
                  {popcornWasteTable.length > 0 && (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-amber-200">
                            <th className="text-left py-2 pr-4 text-amber-700 font-medium">Date</th>
                            <th className="text-left py-2 pr-4 text-amber-700 font-medium">Flavor</th>
                            <th className="text-left py-2 pr-4 text-amber-700 font-medium">Batches</th>
                            <th className="text-left py-2 text-amber-700 font-medium">Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {popcornWasteTable.map((row, i) => (
                            <tr key={i} className="border-b border-amber-100 last:border-0">
                              <td className="py-2 pr-4 text-amber-700">{row.date}</td>
                              <td className="py-2 pr-4 text-amber-900 font-medium">{row.flavor}</td>
                              <td className="py-2 pr-4 text-amber-900">1</td>
                              <td className="py-2 text-amber-700">{row.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : empty('No wasted batches logged yet.')}
            </div>
          </>
        )
      )}

      {/* Extras made this period — Toffee, Dot Cake Frosting, Fudge Pops, Wrapped Caramels.
          Production-only items (no stock graph), so we just show what got made in the window. */}
      <div className="bg-white rounded-2xl border border-store-tan shadow-sm p-4 sm:p-5">
        <h3 className="text-sm font-bold text-store-brown mb-0.5" style={{ fontFamily: 'var(--font-display)' }}>Extras made this {rangeNoun}</h3>
        <p className="text-xs text-store-brown-light mb-3">Toffee, dot cake frosting, fudge pops &amp; wrapped caramels aren’t sold by tray — this is just how much got made.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {extrasProduced.map(r => (
            <div key={r.label} className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 ${r.empty ? 'border-store-tan/60 bg-store-cream/40' : 'border-store-tan bg-store-cream'}`}>
              <span className="text-sm font-medium text-store-brown">{r.label}</span>
              <span className={`text-sm tabular-nums ${r.empty ? 'text-store-brown-light' : 'text-store-green font-semibold'}`}>{r.empty ? 'none' : r.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* End-of-season sell-down outlook (zero-waste planning) — at the bottom; mainly for late season */}
      <SeasonOutlookPanel />

    </div>
  )
}
