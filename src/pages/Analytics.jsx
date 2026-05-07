import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts'
import { supabase } from '../lib/supabase'

const FUDGE_COLORS = [
  '#7C4B2A', '#2D5A1B', '#C4843A', '#5B3A7E', '#2E86AB',
  '#E84855', '#3BB273', '#F6AE2D', '#8B5E3C', '#4A7B35',
]
const POPCORN_COLORS = ['#D97706', '#92400E', '#F59E0B', '#78350F', '#FBBF24']

const RANGE_OPTIONS = [
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
  { label: 'All Time', days: null },
]

function getDateStr(date) { return date.toLocaleDateString('en-CA') }
function formatDate(str) {
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Analytics() {
  const [reports, setReports] = useState([])
  const [flavors, setFlavors] = useState([])
  const [batchLogs, setBatchLogs] = useState([])
  const [bucketLogs, setBucketLogs] = useState([])
  const [currentInventory, setCurrentInventory] = useState([])
  const [range, setRange] = useState(7)
  // 'fudge' | 'popcorn'
  const [groupFilter, setGroupFilter] = useState('fudge')
  // Set of flavor ids | null (null = all in group)
  const [selectedFlavors, setSelectedFlavors] = useState(null)
  // Popcorn-only: narrow to shelf flavors (Caramel Corn, Nut Caramel Corn)
  const [shelvesOnly, setShelvesOnly] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [
        { data: reportData },
        { data: flavorData },
        { data: batchData },
        { data: bucketData },
        { data: invData },
      ] = await Promise.all([
        supabase
          .from('shift_reports')
          .select(`id, report_date, created_at, shift_report_entries(
            flavor_id, full_trays, trays_sold, trays_wasted, waste_reason, flavors(name)
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
          .select('flavor_id, barrels_used, small_buckets_made, large_buckets_made, small_buckets_sold, large_buckets_sold, logged_at')
          .order('logged_at'),
        supabase.from('current_inventory').select('flavor_id, tray_count, barrel_count'),
      ])
      setReports(reportData || [])
      setFlavors(flavorData || [])
      setBatchLogs(batchData || [])
      setBucketLogs(bucketData || [])
      setCurrentInventory(invData || [])
      setLoading(false)
    }
    load()
  }, [])

  // ── Flavor lists ──────────────────────────────────────────────────────────
  const fudgeFlavors = useMemo(
    () => flavors.filter(f => f.product_type !== 'popcorn' && !f.is_component),
    [flavors]
  )
  const popcornFlavors = useMemo(
    () => flavors.filter(f => f.product_type === 'popcorn'),
    [flavors]
  )
  const componentFlavors = useMemo(
    () => flavors.filter(f => f.is_component === true),
    [flavors]
  )
  const shelfFlavors = useMemo(
    () => popcornFlavors.filter(f => f.tracks_shelf_buckets),
    [popcornFlavors]
  )

  // Flavors shown in pills for the active group
  const groupFlavors = useMemo(() => {
    if (groupFilter === 'popcorn') return shelvesOnly ? shelfFlavors : popcornFlavors
    if (groupFilter === 'caramel') return componentFlavors
    return fudgeFlavors
  }, [groupFilter, fudgeFlavors, componentFlavors, popcornFlavors, shelfFlavors, shelvesOnly])

  // Flavors used by charts / summaries
  const visibleFlavors = useMemo(
    () => selectedFlavors === null ? groupFlavors : groupFlavors.filter(f => selectedFlavors.has(f.id)),
    [groupFlavors, selectedFlavors]
  )
  const visibleFudgeFlavors = useMemo(
    () => visibleFlavors.filter(f => f.product_type !== 'popcorn'),
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
    setShelvesOnly(false)
  }

  function toggleFlavor(id) {
    setShelvesOnly(false)
    setSelectedFlavors(prev => {
      if (prev === null) return new Set([id])
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); return next.size === 0 ? null : next }
      next.add(id)
      return next.size === groupFlavors.length ? null : next
    })
  }

  // ── Inventory snapshot ────────────────────────────────────────────────────
  const invMap = useMemo(() => {
    const m = {}
    currentInventory.forEach(r => { m[r.flavor_id] = r })
    return m
  }, [currentInventory])

  const stockSnapshot = useMemo(() => ({
    fudgeTrays: fudgeFlavors.reduce((s, f) => s + (invMap[f.id]?.tray_count ?? 0), 0),
    popcornBarrels: popcornFlavors.reduce((s, f) => s + (invMap[f.id]?.barrel_count ?? 0), 0),
    caramelTrays: componentFlavors.reduce((s, f) => s + (invMap[f.id]?.tray_count ?? 0), 0),
  }), [invMap, fudgeFlavors, popcornFlavors, componentFlavors])

  // In Stock for the mode-specific summary card
  const inStockValue = useMemo(() => {
    if (groupFilter === 'fudge') {
      return fudgeFlavors
        .filter(f => selectedFlavors === null || selectedFlavors.has(f.id))
        .reduce((s, f) => s + (invMap[f.id]?.tray_count ?? 0), 0)
    }
    if (groupFilter === 'caramel') {
      return componentFlavors
        .filter(f => selectedFlavors === null || selectedFlavors.has(f.id))
        .reduce((s, f) => s + (invMap[f.id]?.tray_count ?? 0), 0)
    }
    if (groupFilter === 'popcorn') {
      const base = shelvesOnly ? shelfFlavors : popcornFlavors
      return base
        .filter(f => selectedFlavors === null || selectedFlavors.has(f.id))
        .reduce((s, f) => s + (invMap[f.id]?.barrel_count ?? 0), 0)
    }
    return null
  }, [groupFilter, selectedFlavors, fudgeFlavors, componentFlavors, popcornFlavors, shelfFlavors, shelvesOnly, invMap])

  // ── Date filtering ────────────────────────────────────────────────────────
  const cutoffStr = useMemo(() => {
    if (!range) return null
    const c = new Date(); c.setDate(c.getDate() - range)
    return getDateStr(c)
  }, [range])

  const filteredReports = useMemo(
    () => cutoffStr ? reports.filter(r => r.report_date >= cutoffStr) : reports,
    [reports, cutoffStr]
  )
  const filteredBatchLogs = useMemo(
    () => cutoffStr ? batchLogs.filter(b => b.batch_date >= cutoffStr) : batchLogs,
    [batchLogs, cutoffStr]
  )
  const filteredBucketLogs = useMemo(() => {
    if (!cutoffStr) return bucketLogs
    return bucketLogs.filter(b => {
      const d = new Date(b.logged_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      return d >= cutoffStr
    })
  }, [bucketLogs, cutoffStr])

  // ── Fudge charts ──────────────────────────────────────────────────────────
  const chartSalesData = useMemo(() => {
    const byDate = {}
    filteredReports.filter(r => r.shift_report_entries?.length).forEach(r => { byDate[r.report_date] = r })
    return Object.entries(byDate).sort().map(([, r]) => {
      const row = { date: formatDate(r.report_date) }
      visibleFudgeFlavors.forEach(f => {
        row[f.name] = r.shift_report_entries?.find(e => e.flavor_id === f.id)?.trays_sold ?? 0
      })
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
        if ((e.trays_wasted ?? 0) > 0) {
          const name = e.flavors?.name || e.flavor_id
          if (!names.has(name)) return
          totals[name] = (totals[name] ?? 0) + e.trays_wasted
          table.push({ date: formatDate(r.report_date), flavor: name, amount: e.trays_wasted, reason: e.waste_reason || '—' })
        }
      })
    })
    return {
      chartWasteData: Object.entries(totals).filter(([, v]) => v > 0).map(([name, trays]) => ({ name, trays })).sort((a, b) => b.trays - a.trays),
      wasteTable: table,
    }
  }, [filteredReports, visibleFudgeFlavors])

  const chartStockData = useMemo(() => {
    if (!reports.length) return []
    const SEASON_START = '2026-04-22'
    const snapshots = {}
    const running = {}
    ;[...reports].filter(r => r.report_date >= SEASON_START).sort((a, b) => a.report_date.localeCompare(b.report_date)).forEach(r => {
      r.shift_report_entries?.forEach(e => {
        const d = (e.full_trays ?? 0) - (e.trays_sold ?? 0) - (e.trays_wasted ?? 0)
        running[e.flavor_id] = Math.max(0, (running[e.flavor_id] ?? 0) + d)
      })
      snapshots[r.report_date] = { ...running }
    })
    if (!Object.keys(snapshots).length) return []
    const todayStr = getDateStr(new Date())
    const startStr = cutoffStr && cutoffStr > SEASON_START ? cutoffStr : SEASON_START
    let last = {}
    for (const d of Object.keys(snapshots).sort()) { if (d <= startStr) last = snapshots[d]; else break }
    const rows = []
    const cursor = new Date(startStr + 'T12:00:00')
    while (cursor <= new Date(todayStr + 'T12:00:00')) {
      const ds = getDateStr(cursor)
      if (snapshots[ds]) last = snapshots[ds]
      if (Object.keys(last).length) {
        const row = { date: formatDate(ds) }
        visibleFudgeFlavors.forEach(f => { row[f.name] = last[f.id] ?? null })
        rows.push(row)
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    return rows
  }, [reports, visibleFudgeFlavors, cutoffStr])

  const fudgeTotals = useMemo(() => {
    let sold = 0, wasted = 0, made = 0
    filteredReports.forEach(r => {
      r.shift_report_entries?.forEach(e => {
        sold += e.trays_sold ?? 0
        wasted += e.trays_wasted ?? 0
        made += e.full_trays ?? 0
      })
    })
    return { sold, wasted, made }
  }, [filteredReports])

  // ── Popcorn charts ────────────────────────────────────────────────────────
  const barrelsMadeData = useMemo(() => {
    const byDate = {}
    filteredBatchLogs.filter(b => viewPopcornIds.has(b.flavor_id) && !b.is_wasted).forEach(b => {
      const f = popcornFlavors.find(f => f.id === b.flavor_id)
      if (!f) return
      if (!byDate[b.batch_date]) byDate[b.batch_date] = {}
      byDate[b.batch_date][f.name] = (byDate[b.batch_date][f.name] ?? 0) + (f.default_yield ?? 1)
    })
    return Object.entries(byDate).sort().map(([d, v]) => ({ date: formatDate(d), ...v }))
  }, [filteredBatchLogs, viewPopcornIds, popcornFlavors])

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

  const bucketSalesData = useMemo(() => {
    const shelfIds = new Set(shelfFlavors.map(f => f.id))
    const byDate = {}
    filteredBucketLogs.filter(b => shelfIds.has(b.flavor_id) && viewPopcornIds.has(b.flavor_id)).forEach(b => {
      const d = new Date(b.logged_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      if (!byDate[d]) byDate[d] = { Small: 0, Large: 0 }
      byDate[d].Small += b.small_buckets_sold ?? 0
      byDate[d].Large += b.large_buckets_sold ?? 0
    })
    return Object.entries(byDate).sort().map(([d, v]) => ({ date: formatDate(d), ...v })).filter(r => r.Small > 0 || r.Large > 0)
  }, [filteredBucketLogs, shelfFlavors, viewPopcornIds])

  const bucketsMadeData = useMemo(() => {
    const shelfIds = new Set(shelfFlavors.map(f => f.id))
    const byDate = {}
    filteredBucketLogs.filter(b => shelfIds.has(b.flavor_id) && viewPopcornIds.has(b.flavor_id)).forEach(b => {
      const d = new Date(b.logged_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      if (!byDate[d]) byDate[d] = { Small: 0, Large: 0 }
      byDate[d].Small += b.small_buckets_made ?? 0
      byDate[d].Large += b.large_buckets_made ?? 0
    })
    return Object.entries(byDate).sort().map(([d, v]) => ({ date: formatDate(d), ...v })).filter(r => r.Small > 0 || r.Large > 0)
  }, [filteredBucketLogs, shelfFlavors, viewPopcornIds])

  const componentFlavorIds = useMemo(
    () => new Set(componentFlavors.map(f => f.id)),
    [componentFlavors]
  )

  const caramelBatchData = useMemo(() => {
    const byDate = {}
    filteredBatchLogs.filter(b => componentFlavorIds.has(b.flavor_id) && !b.is_wasted).forEach(b => {
      byDate[b.batch_date] = (byDate[b.batch_date] ?? 0) + 1
    })
    return Object.entries(byDate).sort().map(([d, count]) => ({ date: formatDate(d), Batches: count }))
  }, [filteredBatchLogs, componentFlavorIds])

  const batchesWastedData = useMemo(() => {
    const byDate = {}
    filteredBatchLogs.filter(b => viewPopcornIds.has(b.flavor_id) && b.is_wasted).forEach(b => {
      const f = popcornFlavors.find(f => f.id === b.flavor_id)
      if (!f) return
      if (!byDate[b.batch_date]) byDate[b.batch_date] = {}
      byDate[b.batch_date][f.name] = (byDate[b.batch_date][f.name] ?? 0) + 1
    })
    return Object.entries(byDate).sort().map(([d, v]) => ({ date: formatDate(d), ...v }))
  }, [filteredBatchLogs, viewPopcornIds, popcornFlavors])

  const popcornTotals = useMemo(() => ({
    batchesMade: filteredBatchLogs.filter(b => viewPopcornIds.has(b.flavor_id) && !b.is_wasted).length,
    batchesWasted: filteredBatchLogs.filter(b => viewPopcornIds.has(b.flavor_id) && b.is_wasted).length,
    barrelsSold: filteredBucketLogs.filter(b => viewPopcornIds.has(b.flavor_id)).reduce((s, b) => s + (b.barrels_used ?? 0), 0),
    bucketsSold: filteredBucketLogs.filter(b => viewPopcornIds.has(b.flavor_id)).reduce((s, b) => s + (b.small_buckets_sold ?? 0) + (b.large_buckets_sold ?? 0), 0),
  }), [filteredBatchLogs, filteredBucketLogs, viewPopcornIds])

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <p className="text-store-brown-light text-center py-12">Loading analytics...</p>

  const tooltipStyle = { borderRadius: 8, borderColor: '#F5EDD8', fontSize: 12 }
  const wrapperStyle = { zIndex: 50 }
  const xProps = { tick: { fontSize: 11, fill: '#8B5E3C' } }
  const yProps = { tick: { fontSize: 11, fill: '#8B5E3C' } }
  const empty = msg => <p className="text-store-brown-light text-sm text-center py-8">{msg}</p>

  const showFudge = groupFilter === 'fudge'
  const showPopcorn = groupFilter === 'popcorn'
  const showCaramel = groupFilter === 'caramel'

  return (
    <div className="space-y-8">

      {/* Header + date range */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>Analytics</h2>
        <div className="flex gap-2">
          {RANGE_OPTIONS.map(opt => (
            <button key={opt.label} onClick={() => setRange(opt.days)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors touch-manipulation ${range === opt.days ? 'bg-store-brown text-white' : 'bg-store-tan text-store-brown hover:bg-store-brown hover:text-white'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Current stock — always visible, always separate */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-store-tan rounded-xl p-3 shadow-sm text-center">
          <p className="text-2xl font-bold text-store-brown">{stockSnapshot.fudgeTrays}</p>
          <p className="text-xs text-store-brown-light mt-0.5">Fudge trays</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 shadow-sm text-center">
          <p className="text-2xl font-bold text-amber-700">{stockSnapshot.popcornBarrels}</p>
          <p className="text-xs text-amber-800 mt-0.5">Popcorn barrels</p>
        </div>
        <div className="bg-store-cream border border-store-tan rounded-xl p-3 shadow-sm text-center">
          <p className="text-2xl font-bold text-store-brown">{stockSnapshot.caramelTrays}</p>
          <p className="text-xs text-store-brown-light mt-0.5">Caramel trays</p>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {/* Group buttons */}
        {[
          { key: 'fudge',   label: 'All Fudge',   activeClass: 'bg-store-brown text-white border-store-brown',     inactiveClass: 'bg-white text-store-brown border-store-tan hover:border-store-brown' },
          { key: 'caramel', label: 'Caramel',      activeClass: 'bg-store-brown text-white border-store-brown',     inactiveClass: 'bg-white text-store-brown border-store-tan hover:border-store-brown' },
          { key: 'popcorn', label: 'All Popcorn', activeClass: 'bg-amber-700 text-white border-amber-700',         inactiveClass: 'bg-white text-amber-900 border-amber-200 hover:border-amber-500' },
        ].map(({ key, label, activeClass, inactiveClass }) => (
          <button key={key} onClick={() => handleGroupChange(key)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors touch-manipulation border ${groupFilter === key && selectedFlavors === null && !shelvesOnly ? activeClass : inactiveClass}`}>
            {label}
          </button>
        ))}

        {/* Shelves pill — popcorn only */}
        {groupFilter === 'popcorn' && shelfFlavors.length > 0 && (
          <button onClick={() => { setShelvesOnly(s => !s); setSelectedFlavors(null) }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors touch-manipulation border ${shelvesOnly ? 'bg-amber-700 text-white border-amber-700' : 'bg-white text-amber-900 border-amber-200 hover:border-amber-500'}`}>
            Shelves
          </button>
        )}

        {/* Individual flavor pills — hidden for Caramel (group button is the only selector needed) */}
        {groupFilter !== 'caramel' && groupFlavors.map((f, i) => {
          const isPopcorn = f.product_type === 'popcorn'
          const active = selectedFlavors !== null && selectedFlavors.has(f.id)
          const color = isPopcorn ? POPCORN_COLORS[i % POPCORN_COLORS.length] : FUDGE_COLORS[i % FUDGE_COLORS.length]
          return (
            <button key={f.id} onClick={() => toggleFlavor(f.id)}
              className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors touch-manipulation border"
              style={active
                ? { backgroundColor: color, color: 'white', borderColor: color }
                : { backgroundColor: 'white', color: '#4A2C17', borderColor: '#E8D5B0' }}>
              {f.name}
            </button>
          )
        })}
      </div>

      {/* Fudge summary cards */}
      {groupFilter === 'fudge' && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-store-tan rounded-xl p-3 shadow-sm text-center">
            <p className="text-2xl font-bold text-store-green">{fudgeTotals.sold}</p>
            <p className="text-xs text-store-brown-light mt-0.5">Sold (trays)</p>
          </div>
          <div className="bg-white border border-store-tan rounded-xl p-3 shadow-sm text-center">
            <p className="text-2xl font-bold text-amber-600">{fudgeTotals.wasted}</p>
            <p className="text-xs text-store-brown-light mt-0.5">Wasted (trays)</p>
          </div>
          <div className="bg-white border border-store-tan rounded-xl p-3 shadow-sm text-center">
            <p className="text-2xl font-bold text-store-brown">{inStockValue}</p>
            <p className="text-xs text-store-brown-light mt-0.5">In Stock (trays)</p>
          </div>
        </div>
      )}

      {/* Caramel summary cards */}
      {showCaramel && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-store-cream border border-store-tan rounded-xl p-3 shadow-sm text-center">
            <p className="text-2xl font-bold text-store-brown">{inStockValue}</p>
            <p className="text-xs text-store-brown-light mt-0.5">In Stock (trays)</p>
          </div>
          <div className="bg-store-cream border border-store-tan rounded-xl p-3 shadow-sm text-center">
            <p className="text-2xl font-bold text-store-brown">
              {filteredBatchLogs.filter(b => componentFlavorIds.has(b.flavor_id) && !b.is_wasted).length}
            </p>
            <p className="text-xs text-store-brown-light mt-0.5">Batches Made</p>
          </div>
        </div>
      )}

      {/* Popcorn summary cards */}
      {groupFilter === 'popcorn' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 shadow-sm text-center">
            <p className="text-2xl font-bold text-amber-700">{popcornTotals.batchesMade}</p>
            <p className="text-xs text-amber-800 mt-0.5">Batches Made</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 shadow-sm text-center">
            <p className="text-2xl font-bold text-red-600">{popcornTotals.batchesWasted}</p>
            <p className="text-xs text-red-700 mt-0.5">Batches Wasted</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 shadow-sm text-center">
            <p className="text-2xl font-bold text-amber-600">{popcornTotals.barrelsSold}</p>
            <p className="text-xs text-amber-800 mt-0.5">Barrels Sold</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 shadow-sm text-center">
            <p className="text-2xl font-bold text-store-brown">{inStockValue}</p>
            <p className="text-xs text-amber-800 mt-0.5">In Stock (barrels)</p>
          </div>
        </div>
      )}

      {/* ── Fudge charts ── */}
      {showFudge && (
        <>
          <div>
            <h3 className="font-semibold text-store-brown mb-1">Sales</h3>
            <p className="text-xs text-store-brown-light mb-3">Trays sold per day, grouped by flavor</p>
            {chartSalesData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartSalesData} margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F5EDD8" />
                  <XAxis dataKey="date" {...xProps} />
                  <YAxis {...yProps} />
                  <Tooltip contentStyle={tooltipStyle} wrapperStyle={wrapperStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {visibleFudgeFlavors.map((f, i) => (
                    <Bar key={f.id} dataKey={f.name} fill={FUDGE_COLORS[i % FUDGE_COLORS.length]} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : empty('No sales logged in this range yet.')}
          </div>

          <div>
            <h3 className="font-semibold text-store-brown mb-1">Waste</h3>
            <p className="text-xs text-store-brown-light mb-3">Total trays wasted per flavor</p>
            {chartWasteData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartWasteData} layout="vertical" margin={{ left: 16, right: 16 }}>
                    <XAxis type="number" {...xProps} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12, fill: '#4A2C17' }} />
                    <Tooltip contentStyle={tooltipStyle} wrapperStyle={wrapperStyle} />
                    <Bar dataKey="trays" fill="#C4843A" radius={[0, 4, 4, 0]} name="Trays wasted" />
                  </BarChart>
                </ResponsiveContainer>
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
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartStockData} margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F5EDD8" />
                  <XAxis dataKey="date" {...xProps} />
                  <YAxis {...yProps} />
                  <Tooltip contentStyle={tooltipStyle} wrapperStyle={wrapperStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {visibleFudgeFlavors.map((f, i) => (
                    <Line key={f.id} type="monotone" dataKey={f.name} stroke={FUDGE_COLORS[i % FUDGE_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : empty('No stock data in this range yet.')}
          </div>
        </>
      )}

      {/* ── Caramel chart ── */}
      {showCaramel && (
        <div>
          <h3 className="font-semibold text-store-brown mb-1">Batch History</h3>
          <p className="text-xs text-store-brown-light mb-3">Caramel batches made per day</p>
          {caramelBatchData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={caramelBatchData} margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F5EDD8" />
                <XAxis dataKey="date" {...xProps} />
                <YAxis {...yProps} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} wrapperStyle={wrapperStyle} />
                <Line type="monotone" dataKey="Batches" stroke="#C4843A" strokeWidth={2} dot={{ r: 5, fill: '#C4843A' }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : empty('No Caramel batches logged in this range.')}
        </div>
      )}

      {/* ── Popcorn charts ── */}
      {showPopcorn && (
        <>
          {!shelvesOnly && (
            <>
              <div>
                <h3 className="font-semibold text-amber-900 mb-1">Barrels Made</h3>
                <p className="text-xs text-amber-700 mb-3">Barrels produced from batch logs</p>
                {barrelsMadeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={barrelsMadeData} margin={{ left: 0, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#FDE68A" />
                      <XAxis dataKey="date" {...xProps} />
                      <YAxis {...yProps} />
                      <Tooltip contentStyle={tooltipStyle} wrapperStyle={wrapperStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {viewPopcornFlavors.map((f, i) => (
                        <Bar key={f.id} dataKey={f.name} fill={POPCORN_COLORS[i % POPCORN_COLORS.length]} radius={[4, 4, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                ) : empty('No batches logged yet. Use the Batches tab in Report to log production.')}
              </div>

              <div>
                <h3 className="font-semibold text-amber-900 mb-1">Barrels Sold</h3>
                <p className="text-xs text-amber-700 mb-3">Barrels moved from storage to display per day</p>
                {barrelsSoldData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={barrelsSoldData} margin={{ left: 0, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#FDE68A" />
                      <XAxis dataKey="date" {...xProps} />
                      <YAxis {...yProps} />
                      <Tooltip contentStyle={tooltipStyle} wrapperStyle={wrapperStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {viewPopcornFlavors.map((f, i) => (
                        <Bar key={f.id} dataKey={f.name} fill={POPCORN_COLORS[i % POPCORN_COLORS.length]} radius={[4, 4, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                ) : empty('No barrels sold logged yet. Use the Products tab in Report.')}
              </div>

              <div>
                <h3 className="font-semibold text-amber-900 mb-1">Batches Wasted</h3>
                <p className="text-xs text-amber-700 mb-3">Wasted batches per day (crystallized / unusable)</p>
                {batchesWastedData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={batchesWastedData} margin={{ left: 0, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#FDE68A" />
                      <XAxis dataKey="date" {...xProps} />
                      <YAxis {...yProps} allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle} wrapperStyle={wrapperStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {viewPopcornFlavors.map((f, i) => (
                        <Bar key={f.id} dataKey={f.name} fill={POPCORN_COLORS[i % POPCORN_COLORS.length]} radius={[4, 4, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                ) : empty('No wasted batches logged yet.')}
              </div>
            </>
          )}

          {(shelvesOnly || viewPopcornFlavors.some(f => f.tracks_shelf_buckets)) && (
            <>
              <div>
                <h3 className="font-semibold text-amber-900 mb-1">Buckets Made</h3>
                <p className="text-xs text-amber-700 mb-3">Small and large caramel corn buckets made per day</p>
                {bucketsMadeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={bucketsMadeData} margin={{ left: 0, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#FDE68A" />
                      <XAxis dataKey="date" {...xProps} />
                      <YAxis {...yProps} />
                      <Tooltip contentStyle={tooltipStyle} wrapperStyle={wrapperStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Small" fill="#D97706" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Large" fill="#92400E" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : empty('No buckets made logged yet. Use the Products tab in Report.')}
              </div>

              <div>
                <h3 className="font-semibold text-amber-900 mb-1">Bucket Sales</h3>
                <p className="text-xs text-amber-700 mb-3">Small and large caramel corn buckets sold per day</p>
                {bucketSalesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={bucketSalesData} margin={{ left: 0, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#FDE68A" />
                      <XAxis dataKey="date" {...xProps} />
                      <YAxis {...yProps} />
                      <Tooltip contentStyle={tooltipStyle} wrapperStyle={wrapperStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Small" fill="#D97706" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Large" fill="#92400E" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : empty('No bucket sales logged yet. Use the Products tab in Report.')}
              </div>
            </>
          )}
        </>
      )}

    </div>
  )
}
