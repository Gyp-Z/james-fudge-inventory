import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Stepper from '../components/Stepper'
import { autoDeductIngredients, autoDeductTrayIngredients, deductCaramelComponent } from '../utils/autoDeduct'

export default function ShiftReport() {
  const { session } = useAuth()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('batches')

  // All flavors (fudge + popcorn) — for Batches tab
  const [allFlavors, setAllFlavors] = useState([])
  // Fudge-only flavors — for Products tab
  const [flavors, setFlavors] = useState([])

  const [loading, setLoading] = useState(true)

  // Products tab state — fudge
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [entries, setEntries] = useState({})
  const [todayTotals, setTodayTotals] = useState({})
  const [currentInventory, setCurrentInventory] = useState({})
  const [currentInProgress, setCurrentInProgress] = useState({})

  // Products tab state — popcorn
  const [popcornEntries, setPopcornEntries] = useState({}) // flavor_id -> { barrels_added, barrels_sold, small/large buckets made/sold }
  const [currentBarrels, setCurrentBarrels] = useState({}) // flavor_id -> barrel_count
  const [currentInProgressBarrels, setCurrentInProgressBarrels] = useState({}) // flavor_id -> in_progress_barrel_count
  const [barrelThresholds, setBarrelThresholds] = useState({}) // flavor_id -> low_tray_threshold
  const [todayBarrelTotals, setTodayBarrelTotals] = useState({}) // flavor_id -> barrels added today (from shelf_bucket_logs)

  // Batches tab state
  const [batchCounts, setBatchCounts] = useState({})
  const [batchWasted, setBatchWasted] = useState({})
  const [batchWasteReason, setBatchWasteReason] = useState({})
  const [batchSubmitting, setBatchSubmitting] = useState(false)
  const [batchResult, setBatchResult] = useState(null)
  const [todayBatchCounts, setTodayBatchCounts] = useState({}) // batches logged before this session
  const [prevDayBatchCounts, setPrevDayBatchCounts] = useState({}) // most-recent prior-day batch count per double-batch flavor

  // Ingredients tab — usage state
  const [ingList, setIngList] = useState([])
  const [ingUsage, setIngUsage] = useState({})
  const [ingSubmitting, setIngSubmitting] = useState(false)
  const [ingSubmitted, setIngSubmitted] = useState(false)

  // Ingredients tab — received/restock state
  const [ingReceived, setIngReceived] = useState({})
  const [recSubmitting, setRecSubmitting] = useState(false)
  const [recSubmitted, setRecSubmitted] = useState(false)

  // Products tab — caramel hand-wrapping (integer quarter-tray units; 1 = ¼ tray)
  const [caramelsHandWrapped, setCaramelsHandWrapped] = useState(0)

  useEffect(() => {
    async function load() {
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

      const [
        { data: allFlavorsData },
        { data: ingredientsData },
        { data: invData },
      ] = await Promise.all([
        supabase.from('flavors').select('*').eq('is_active', true).order('product_type').order('name'),
        supabase.from('ingredients').select('id, name, quantity, unit').eq('is_active', true).order('name'),
        supabase.from('current_inventory').select('flavor_id, tray_count, in_progress_count, barrel_count, in_progress_barrel_count'),
      ])

      const all = allFlavorsData || []
      // Exclude component flavors (e.g. Caramel → used in Sea Salt Caramel, not sold directly)
      const fudgeOnly = all.filter(f => f.product_type !== 'popcorn' && f.is_component !== true)
      const popcornOnly = all.filter(f => f.product_type === 'popcorn')
      const ings = ingredientsData || []

      setAllFlavors(all)
      setFlavors(fudgeOnly)
      setIngList(ings)

      // Init batch counts
      const batchInit = {}
      all.forEach(f => { batchInit[f.id] = 0 })
      setBatchCounts(batchInit)
      setBatchWasted({ ...batchInit })

      // Init fudge product entries
      const initial = {}
      fudgeOnly.forEach((f) => {
        initial[f.id] = { full_trays: 0, in_progress_trays: 0, trays_sold: 0, trays_wasted: 0, waste_reason: '', waste_is_in_progress: false }
      })
      setEntries(initial)

      // Init popcorn product entries
      const popcornInit = {}
      popcornOnly.forEach(f => {
        popcornInit[f.id] = {
          barrels_added: 0,
          barrels_sold: 0,
          in_progress_barrels: 0,
        }
      })
      setPopcornEntries(popcornInit)

      const thresholdInit = {}
      popcornOnly.forEach(f => { thresholdInit[f.id] = f.low_tray_threshold ?? 1 })
      setBarrelThresholds(thresholdInit)

      // Init ingredient forms
      const ingInit = {}
      const recInit = {}
      ings.forEach((i) => { ingInit[i.id] = 0; recInit[i.id] = 0 })
      setIngUsage(ingInit)
      setIngReceived(recInit)

      // Current inventory map
      const invMap = {}
      const inProgMap = {}
      const barrelMap = {}
      const inProgBarrelMap = {}
      ;(invData || []).forEach((row) => {
        invMap[row.flavor_id] = row.tray_count ?? 0
        inProgMap[row.flavor_id] = row.in_progress_count ?? 0
        barrelMap[row.flavor_id] = row.barrel_count ?? 0
        inProgBarrelMap[row.flavor_id] = row.in_progress_barrel_count ?? 0
      })
      setCurrentInventory(invMap)
      setCurrentInProgress(inProgMap)
      setCurrentBarrels(barrelMap)
      setCurrentInProgressBarrels(inProgBarrelMap)

      // Today's totals for products tab
      const { data: todayReports } = await supabase
        .from('shift_reports').select('id').eq('report_date', todayStr)
      if (todayReports && todayReports.length > 0) {
        const ids = todayReports.map((r) => r.id)
        const { data: todayEntries } = await supabase
          .from('shift_report_entries').select('flavor_id, full_trays, trays_sold, trays_wasted, in_progress_trays').in('report_id', ids)
        const totalsMap = {}
        ;(todayEntries || []).forEach((e) => {
          const t = totalsMap[e.flavor_id] || { sold: 0, wasted: 0, made: 0, in_progress: 0 }
          t.sold += e.trays_sold ?? 0
          t.wasted += e.trays_wasted ?? 0
          t.made += e.full_trays ?? 0
          t.in_progress += e.in_progress_trays ?? 0
          totalsMap[e.flavor_id] = t
        })
        setTodayTotals(totalsMap)
      }

      // Load batch counts already logged today (before this session)
      const { data: priorBatches } = await supabase
        .from('batch_logs')
        .select('flavor_id, is_wasted')
        .gte('batch_date', todayStr + 'T00:00:00')
        .lt('batch_date', todayStr + 'T23:59:59')
      const priorCounts = {}
      ;(priorBatches || []).forEach(b => {
        if (!b.is_wasted) priorCounts[b.flavor_id] = (priorCounts[b.flavor_id] ?? 0) + 1
      })
      setTodayBatchCounts(priorCounts)

      // For double-batch flavors: find batch count on the most recent prior day so we can
      // distinguish an incomplete 1-of-2 pour (show reminder) from overflow after a completed double-batch (no reminder)
      const doubleBatchIds = (allFlavorsData || []).filter(f => f.double_batch_reminder).map(f => f.id)
      if (doubleBatchIds.length > 0) {
        const sevenDaysAgoStr = (() => {
          const d = new Date(); d.setDate(d.getDate() - 7)
          return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
        })()
        const { data: recentBatches } = await supabase
          .from('batch_logs')
          .select('flavor_id, batch_date, is_wasted')
          .in('flavor_id', doubleBatchIds)
          .gte('batch_date', sevenDaysAgoStr + 'T00:00:00')
          .lt('batch_date', todayStr + 'T00:00:00')
          .order('batch_date', { ascending: false })
        const prevDayCounts = {}
        ;(recentBatches || []).forEach(b => {
          if (b.is_wasted) return
          const bDate = (b.batch_date ?? '').slice(0, 10)
          const existing = prevDayCounts[b.flavor_id]
          if (!existing) {
            prevDayCounts[b.flavor_id] = { date: bDate, count: 1 }
          } else if (existing.date === bDate) {
            existing.count++
          }
        })
        const finalPrevDay = {}
        Object.entries(prevDayCounts).forEach(([fid, { count }]) => { finalPrevDay[fid] = count })
        setPrevDayBatchCounts(finalPrevDay)
      }

      // Today's barrel totals for popcorn batch estimate
      const { data: todayBarrelLogs } = await supabase
        .from('shelf_bucket_logs')
        .select('flavor_id, barrels_added')
        .gte('created_at', `${todayStr}T00:00:00`)
        .lte('created_at', `${todayStr}T23:59:59`)
      const barrelTotalsMap = {}
      ;(todayBarrelLogs || []).forEach(row => {
        barrelTotalsMap[row.flavor_id] = (barrelTotalsMap[row.flavor_id] ?? 0) + (row.barrels_added ?? 0)
      })
      setTodayBarrelTotals(barrelTotalsMap)

      setLoading(false)
    }
    load()
  }, [])

  async function reloadIngList() {
    const { data } = await supabase.from('ingredients').select('id, name, quantity, unit').eq('is_active', true).order('name')
    setIngList(data || [])
  }

  // ── BATCHES TAB ──────────────────────────────────────────────────────────

  async function handleBatchSubmit() {
    const toLog = allFlavors.filter(f => (batchCounts[f.id] ?? 0) > 0 || (batchWasted[f.id] ?? 0) > 0)
    if (toLog.length === 0) return
    setBatchSubmitting(true)
    setBatchResult(null)

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const allDeductions = []
    const allNegatives = []
    const allSkipped = []

    for (const flavor of toLog) {
      const madeCount = batchCounts[flavor.id] ?? 0
      const wastedCount = batchWasted[flavor.id] ?? 0
      const flavorWasteReason = batchWasteReason[flavor.id]?.trim() || null
      for (let i = 0; i < madeCount + wastedCount; i++) {
        const isWasted = i >= madeCount
        const { data: inserted } = await supabase
          .from('batch_logs')
          .insert({ flavor_id: flavor.id, batch_date: todayStr, is_wasted: isWasted, ...(isWasted && flavorWasteReason ? { waste_reason: flavorWasteReason } : {}) })
          .select('id')
          .single()

        if (!inserted) continue

        if (!isWasted) {
          const { deductions, negatives, skipped } = await autoDeductIngredients(flavor.id, inserted.id)
          allDeductions.push(...deductions)
          allNegatives.push(...negatives)
          allSkipped.push(...skipped)
          // Note: caramel deduction for SSC has moved to handleProductSubmit (per full tray)
        }

        // Component flavors (Caramel): 1 batch = 1 tray — increment inventory
        if (flavor.is_component && !isWasted) {
          const { data: inv } = await supabase.from('current_inventory').select('tray_count').eq('flavor_id', flavor.id).single()
          await supabase.from('current_inventory').upsert(
            { flavor_id: flavor.id, tray_count: (inv?.tray_count ?? 0) + 1 },
            { onConflict: 'flavor_id' }
          )
        }


      }
    }

    setBatchResult({
      flavors: toLog,
      madeMap: { ...batchCounts },
      wastedMap: { ...batchWasted },
      deductions: allDeductions,
      negatives: allNegatives,
      skipped: allSkipped,
    })
    setBatchSubmitting(false)
    setTodayBatchCounts(prev => {
      const updated = { ...prev }
      for (const flavor of toLog) {
        const made = batchCounts[flavor.id] ?? 0
        if (made > 0) updated[flavor.id] = (updated[flavor.id] ?? 0) + made
      }
      return updated
    })
    setBatchCounts(prev => Object.fromEntries(Object.keys(prev).map(k => [k, 0])))
    setBatchWasted(prev => Object.fromEntries(Object.keys(prev).map(k => [k, 0])))
    setBatchWasteReason(prev => Object.fromEntries(Object.keys(prev).map(k => [k, ''])))
  }

  // ── PRODUCTS TAB ─────────────────────────────────────────────────────────

  function setField(flavorId, field, value) {
    setEntries((prev) => ({ ...prev, [flavorId]: { ...prev[flavorId], [field]: value } }))
  }

  function setPopcornField(flavorId, field, value) {
    setPopcornEntries((prev) => ({ ...prev, [flavorId]: { ...prev[flavorId], [field]: value } }))
  }

  async function handleProductSubmit() {
    setSubmitting(true)
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const { data: report, error } = await supabase
      .from('shift_reports')
      .insert({ report_date: todayStr, report_type: 'snapshot', logged_by: session?.user?.id ?? null })
      .select('id').single()
    if (error || !report) { setSubmitting(false); return }

    const entryRows = flavors
      .filter((f) => {
        const e = entries[f.id]
        return (e?.full_trays ?? 0) > 0 || (e?.in_progress_trays ?? 0) > 0 || (e?.trays_sold ?? 0) > 0 || (e?.trays_wasted ?? 0) > 0
      })
      .map((f) => {
        const e = entries[f.id]
        const isInProg = e?.waste_is_in_progress ?? false
        const wastedCount = e?.trays_wasted ?? 0
        return {
          report_id: report.id,
          flavor_id: f.id,
          full_trays: e?.full_trays ?? 0,
          in_progress_trays: e?.in_progress_trays ?? 0,
          in_progress_wasted: isInProg ? wastedCount : 0,
          trays_wasted: isInProg ? 0 : wastedCount,
          trays_sold: e?.trays_sold ?? 0,
          waste_reason: e?.waste_reason?.trim() || null,
        }
      })
    if (entryRows.length > 0) {
      await supabase.from('shift_report_entries').insert(entryRows)
    }

    const { data: freshInv } = await supabase.from('current_inventory').select('flavor_id, tray_count')
    const freshMap = {}
    ;(freshInv || []).forEach((row) => { freshMap[row.flavor_id] = row.tray_count ?? 0 })

    const activeRows = flavors
      .filter((f) => {
        const e = entries[f.id]
        return (e?.full_trays ?? 0) !== 0 || (e?.in_progress_trays ?? 0) !== 0 || (e?.trays_sold ?? 0) !== 0 || (e?.trays_wasted ?? 0) !== 0
      })
      .map((f) => {
        const e = entries[f.id]
        const made = e?.full_trays ?? 0
        const newInProg = e?.in_progress_trays ?? 0
        const sold = e?.trays_sold ?? 0
        const wastedCount = e?.trays_wasted ?? 0
        const isInProg = e?.waste_is_in_progress ?? false
        const fullWasted = isInProg ? 0 : wastedCount
        const inProgWasted = isInProg ? wastedCount : 0
        const existingInProg = currentInProgress[f.id] ?? 0
        const topped = Math.min(made, existingInProg)
        return {
          flavor_id: f.id,
          // Sales only deduct from full-tray stock, not from in-progress
          tray_count: Math.max(0, (freshMap[f.id] ?? 0) + made - sold - fullWasted),
          in_progress_count: Math.max(0, existingInProg + newInProg - topped - inProgWasted),
          updated_at: new Date().toISOString(),
        }
      })

    if (activeRows.length > 0) {
      await supabase.from('current_inventory').upsert(activeRows, { onConflict: 'flavor_id' })
    }

    // Per-tray ingredient deductions for fudge flavors
    for (const f of flavors) {
      const made = entries[f.id]?.full_trays ?? 0
      if (made > 0) {
        await autoDeductTrayIngredients(f.id, made)
        if (f.name.toLowerCase().includes('sea salt')) {
          await deductCaramelComponent(f.name, made)
        }
      }
    }

    // Popcorn: apply barrel adjustments and log bucket sales
    const popcornFlavorsLocal = allFlavors.filter(f => f.product_type === 'popcorn')
    for (const f of popcornFlavorsLocal) {
      const pe = popcornEntries[f.id]
      if (!pe) continue

      const barrelsAdded = pe.barrels_added || 0
      const barrelsSold = pe.barrels_sold || 0
      const newInProgBarrels = pe.in_progress_barrels || 0

      // Update barrel_count: +added −sold; in_progress_barrel_count: +new, topped by added
      const netBarrelChange = barrelsAdded - barrelsSold
      const existingInProgBarrels = currentInProgressBarrels[f.id] ?? 0
      const toppedBarrels = Math.min(barrelsAdded, existingInProgBarrels)
      const newInProgBarrelCount = Math.max(0, existingInProgBarrels + newInProgBarrels - toppedBarrels)
      if (netBarrelChange !== 0 || newInProgBarrels !== 0 || toppedBarrels !== 0) {
        const newBarrels = Math.max(0, (currentBarrels[f.id] ?? 0) + netBarrelChange)
        await supabase.from('current_inventory')
          .upsert({ flavor_id: f.id, barrel_count: newBarrels, in_progress_barrel_count: newInProgBarrelCount }, { onConflict: 'flavor_id' })
      }

      // Log barrel activity
      if (barrelsAdded > 0 || barrelsSold > 0) {
        const logEntry = { flavor_id: f.id }
        if (barrelsAdded > 0) logEntry.barrels_added = barrelsAdded
        if (barrelsSold > 0) logEntry.barrels_used = barrelsSold
        await supabase.from('shelf_bucket_logs').insert(logEntry)
      }
    }

    // Log hand-wrapped caramel usage (in quarter-tray increments → decimal trays)
    if (caramelsHandWrapped > 0) {
      await supabase.from('caramel_handwrap_logs').insert({
        trays_used: caramelsHandWrapped * 0.25,
        report_date: todayStr,
      })
    }

    setSubmitted(true)
    setSubmitting(false)
    setTimeout(() => navigate('/'), 1500)
  }

  // ── INGREDIENTS TAB ───────────────────────────────────────────────────────

  async function handleIngredientSubmit() {
    const used = ingList.filter((i) => (ingUsage[i.id] ?? 0) > 0)
    if (used.length === 0) return
    setIngSubmitting(true)

    await Promise.all(used.map(async (ing) => {
      const amount = ingUsage[ing.id]
      await supabase.from('ingredient_depletions').insert({
        ingredient_id: ing.id,
        amount_used: amount,
        logged_by: session?.user?.id ?? null,
      })
      const newQty = Math.max(0, (ing.quantity ?? 0) - amount)
      await supabase.from('ingredients').update({ quantity: newQty }).eq('id', ing.id)
    }))

    await reloadIngList()
    setIngSubmitted(true)
    setIngSubmitting(false)
    setTimeout(() => {
      setIngSubmitted(false)
      setIngUsage((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, 0])))
    }, 1500)
  }

  async function handleIngredientReceive() {
    const incoming = ingList.filter((i) => (ingReceived[i.id] ?? 0) > 0)
    if (incoming.length === 0) return
    setRecSubmitting(true)

    await Promise.all(incoming.map(async (ing) => {
      const amount = ingReceived[ing.id]
      const newQty = (ing.quantity ?? 0) + amount
      await supabase.from('ingredients').update({ quantity: newQty }).eq('id', ing.id)
    }))

    await reloadIngList()
    setRecSubmitted(true)
    setRecSubmitting(false)
    setTimeout(() => {
      setRecSubmitted(false)
      setIngReceived((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, 0])))
    }, 1500)
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) return <p className="text-store-brown-light text-center py-12">Loading...</p>

  // Formats an integer quarter-tray count as a fraction string: 0→"0", 1→"¼", 2→"½", 3→"¾", 4→"1", 5→"1¼" …
  function formatQuarterTrays(q) {
    if (q === 0) return '0'
    const whole = Math.floor(q / 4)
    const rem = q % 4
    const frac = ['', '¼', '½', '¾'][rem]
    if (whole === 0) return frac
    if (rem === 0) return `${whole}`
    return `${whole}${frac}`
  }

  const todayLabel = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric',
  })

  const componentBatchFlavors = allFlavors.filter(f => f.is_component === true)
  const fudgeFlavors = allFlavors.filter(f => f.product_type !== 'popcorn' && !f.is_component)
  const popcornFlavors = allFlavors.filter(f => f.product_type === 'popcorn')
  const batchesReady = allFlavors.some(f => (batchCounts[f.id] ?? 0) > 0 || (batchWasted[f.id] ?? 0) > 0)

  // Build base group map: group name → [flavor_ids that are plain base triggers]
  // Only Vanilla and Chocolate (is_base_trigger=true) count as cross-flavor triggers.
  // Flavored variants like Chocolate Coconut or Key Lime are committed to their flavor at batch time.
  const baseGroupMap = {}
  allFlavors.forEach(f => {
    if (!f.is_base_trigger) return
    ;(f.base_groups || []).forEach(g => {
      if (!baseGroupMap[g]) baseGroupMap[g] = []
      baseGroupMap[g].push(f.id)
    })
  })

  // For each base group: has the user entered enough tray-equivalents to account for today's batches?
  // Full trays count as 1, in-progress count as 0.5 (they are half-trays).
  // Checks both prior-session submissions (todayTotals) and the current form (entries).
  const groupAccountedFor = {}
  Object.entries(baseGroupMap).forEach(([g, triggerIds]) => {
    const totalBatches = triggerIds.reduce((sum, fid) => sum + (todayBatchCounts[fid] ?? 0), 0)
    if (totalBatches === 0) { groupAccountedFor[g] = true; return }
    const triggerFlavor = allFlavors.find(f => triggerIds.includes(f.id))
    const yieldPerBatch = triggerFlavor?.default_yield ?? 3
    const expectedTrays = totalBatches * yieldPerBatch
    let actualTrays = 0
    allFlavors.forEach(f => {
      if (!(f.base_groups || []).includes(g)) return
      actualTrays += (todayTotals[f.id]?.made ?? 0)
      actualTrays += (todayTotals[f.id]?.in_progress ?? 0) * 0.5
      actualTrays += (entries[f.id]?.full_trays ?? 0)
      actualTrays += (entries[f.id]?.in_progress_trays ?? 0) * 0.5
    })
    groupAccountedFor[g] = actualTrays >= expectedTrays
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          Report
        </h2>
        <p className="text-store-brown-light text-sm mt-1">{todayLabel}</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2">
        {[
          { key: 'batches', label: 'Batches' },
          { key: 'products', label: 'Products' },
          { key: 'ingredients', label: 'Ingredients' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setActiveTab(key); setSubmitted(false); setIngSubmitted(false); setRecSubmitted(false); setBatchResult(null) }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors touch-manipulation ${
              activeTab === key
                ? 'bg-store-brown text-white'
                : 'bg-store-tan text-store-brown hover:bg-store-brown hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── BATCHES TAB ── */}
      {activeTab === 'batches' && (
        <div className="space-y-4">
          <p className="text-store-brown-light text-xs -mt-2">Log what you made today. Ingredients will be auto-deducted.</p>

          {componentBatchFlavors.length > 0 && (
            <div>
              <p className="text-xs font-bold text-store-brown-light uppercase tracking-wide mb-2">Caramel</p>
              <div className="space-y-2">
                {componentBatchFlavors.map(f => {
                  const madeBatches = batchCounts[f.id] ?? 0
                  const totalBatches = (todayBatchCounts[f.id] ?? 0) + madeBatches
                  return (
                    <div key={f.id} className="bg-store-cream rounded-xl border border-store-tan px-4 py-3 shadow-sm space-y-3">
                      <span className="text-sm font-medium text-store-brown">{f.name}</span>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-store-brown-light">Batches made</span>
                        <Stepper value={madeBatches} onChange={v => setBatchCounts(prev => ({ ...prev, [f.id]: v }))} />
                      </div>
                      {totalBatches > 0 && (
                        <p className="text-xs text-store-brown-light">
                          {totalBatches} {totalBatches === 1 ? 'batch' : 'batches'} today
                          <span className="text-store-green font-medium"> · {totalBatches} {totalBatches === 1 ? 'tray' : 'trays'} — 1 batch = 1 tray</span>
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-red-400">Batches wasted</span>
                        <Stepper value={batchWasted[f.id] ?? 0} onChange={v => setBatchWasted(prev => ({ ...prev, [f.id]: v }))} />
                      </div>
                      {(batchWasted[f.id] ?? 0) > 0 && (
                        <input
                          type="text"
                          value={batchWasteReason[f.id] ?? ''}
                          onChange={ev => setBatchWasteReason(prev => ({ ...prev, [f.id]: ev.target.value }))}
                          placeholder="Waste reason"
                          className="w-full border border-store-tan rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {fudgeFlavors.length > 0 && (
            <div>
              <p className="text-xs font-bold text-store-brown-light uppercase tracking-wide mb-2">Fudge</p>
              <div className="space-y-2">
                {fudgeFlavors.map(f => {
                  const totalBatches = (todayBatchCounts[f.id] ?? 0) + (batchCounts[f.id] ?? 0)
                  const prevInProg = currentInProgress[f.id] ?? 0
                  const prevDayCount = prevDayBatchCounts[f.id] ?? 0
                  const effectiveTotal = (prevDayCount === 1 && prevInProg > 0) ? prevDayCount + totalBatches : totalBatches
                  const showAmber = f.double_batch_reminder && effectiveTotal === 1
                  const showGreen = f.double_batch_reminder && effectiveTotal >= 2
                  const yield_ = f.default_yield ?? 3
                  return (
                    <div key={f.id} className={`bg-white rounded-xl border px-4 py-3 shadow-sm space-y-2 ${showGreen ? 'border-store-green' : 'border-store-tan'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-store-brown">{f.name}</span>
                        <Stepper value={batchCounts[f.id] ?? 0} onChange={v => setBatchCounts(prev => ({ ...prev, [f.id]: v }))} />
                      </div>
                      {totalBatches > 0 && !f.double_batch_reminder && (
                        <p className="text-xs text-store-brown-light">
                          {totalBatches} {totalBatches === 1 ? 'batch' : 'batches'} today
                          {f.is_base_trigger
                            ? <span className="text-store-green font-medium"> · ≈ {totalBatches * yield_} full or {totalBatches * yield_ * 2} in-progress trays</span>
                            : <span className="text-store-green font-medium"> · ≈ {totalBatches * yield_} full trays</span>
                          }
                        </p>
                      )}
                      {showAmber && (
                        <p className="text-xs text-amber-600 font-medium">1 of 2 — ≈ {yield_ * 2} in-progress trays</p>
                      )}
                      {showGreen && (
                        <p className="text-xs text-store-green font-medium">Both batches done ✓ — ≈ {yield_ * 2} full trays</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {popcornFlavors.length > 0 && (
            <div>
              <p className="text-xs font-bold text-store-brown-light uppercase tracking-wide mb-2">Popcorn</p>
              <div className="space-y-2">
                {popcornFlavors.map(f => {
                  const madeBatches = batchCounts[f.id] ?? 0
                  const totalBatches = (todayBatchCounts[f.id] ?? 0) + madeBatches
                  const barrelsPerBatch = f.default_yield ?? 1
                  const estimatedBarrels = totalBatches > 0
                    ? Math.round(totalBatches * barrelsPerBatch * 10) / 10
                    : 0
                  return (
                    <div key={f.id} className="bg-amber-50 rounded-xl border border-amber-200 px-4 py-3 shadow-sm space-y-3">
                      <span className="text-sm font-medium text-amber-900">{f.name}</span>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-amber-700">Batches made</span>
                        <Stepper value={madeBatches} onChange={v => setBatchCounts(prev => ({ ...prev, [f.id]: v }))} />
                      </div>
                      {totalBatches > 0 && (
                        <p className="text-xs text-amber-700">
                          {totalBatches} {totalBatches === 1 ? 'batch' : 'batches'} today
                          <span className="text-amber-600 font-medium"> · ≈ {estimatedBarrels} {estimatedBarrels === 1 ? 'barrel' : 'barrels'}</span>
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-red-400">Batches wasted</span>
                        <Stepper value={batchWasted[f.id] ?? 0} onChange={v => setBatchWasted(prev => ({ ...prev, [f.id]: v }))} />
                      </div>
                      {(batchWasted[f.id] ?? 0) > 0 && (
                        <input
                          type="text"
                          value={batchWasteReason[f.id] ?? ''}
                          onChange={ev => setBatchWasteReason(prev => ({ ...prev, [f.id]: ev.target.value }))}
                          placeholder="Waste reason"
                          className="w-full border border-amber-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white text-amber-900"
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <button
            onClick={handleBatchSubmit}
            disabled={batchSubmitting || !batchesReady}
            className="w-full bg-store-green hover:bg-store-green-dark text-white py-4 rounded-xl text-lg font-semibold transition-colors disabled:opacity-50 touch-manipulation"
          >
            {batchSubmitting ? 'Logging…' : 'Log Batches'}
          </button>

          {batchResult && (
            <div className={`rounded-xl border p-4 space-y-2 ${batchResult.negatives.length > 0 ? 'bg-red-50 border-red-200' : 'bg-store-green-light border-store-green'}`}>
              <p className={`font-semibold text-sm ${batchResult.negatives.length > 0 ? 'text-red-700' : 'text-store-green'}`}>
                ✓ Batches logged
              </p>
              <div className="space-y-0.5">
                {batchResult.flavors.map(f => {
                  const made = batchResult.madeMap[f.id] ?? 0
                  const wasted = batchResult.wastedMap[f.id] ?? 0
                  return (
                    <p key={f.id} className="text-xs text-store-brown">
                      {f.name}: {made > 0 ? `${made} made` : ''}{made > 0 && wasted > 0 ? ', ' : ''}{wasted > 0 ? `${wasted} wasted` : ''}
                    </p>
                  )
                })}
              </div>
              {batchResult.negatives.length > 0 && (
                <div className="space-y-1">
                  {batchResult.negatives.map(n => (
                    <p key={n.ingredient_id} className="text-xs text-red-700 font-medium">
                      ⚠ {n.name} is now {n.new_quantity.toFixed(2)} {n.unit} — manual count needed
                    </p>
                  ))}
                </div>
              )}
              {batchResult.skipped.length > 0 && (
                <div className="space-y-1">
                  {batchResult.skipped.map((s, i) => (
                    <p key={i} className="text-xs text-amber-700">
                      ⚠ {s.name} not deducted — {s.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── PRODUCTS TAB ── */}
      {activeTab === 'products' && (
        <>
          {submitted ? (
            <div className="bg-store-green-light border border-store-green rounded-xl px-4 py-4 text-center">
              <p className="text-store-green font-semibold text-lg">Report submitted ✓</p>
              <p className="text-store-green text-sm mt-1">Redirecting to dashboard...</p>
            </div>
          ) : (
            <>
              <p className="text-store-brown-light text-xs -mt-3">Log what's on the shelf — trays made, sold, or wasted this session.</p>

              {/* Caramels hand-wrapped section */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-store-brown-light uppercase tracking-wide">Caramels</p>
                <div className="bg-store-cream rounded-xl border border-store-tan p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-store-brown">Caramels Hand Wrapped</p>
                      {caramelsHandWrapped > 0 && (
                        <p className="text-xs text-store-brown-light mt-0.5">
                          = {formatQuarterTrays(caramelsHandWrapped)} tray{caramelsHandWrapped !== 4 ? 's' : ''} of caramel
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCaramelsHandWrapped(v => Math.max(0, v - 1))}
                        className="w-12 h-12 rounded-xl bg-store-tan text-store-brown text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform select-none touch-manipulation"
                        aria-label="Decrease"
                      >−</button>
                      <span className="w-10 text-center text-2xl font-bold text-store-brown tabular-nums select-none">
                        {formatQuarterTrays(caramelsHandWrapped)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCaramelsHandWrapped(v => v + 1)}
                        className="w-12 h-12 rounded-xl bg-store-tan text-store-brown text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform select-none touch-manipulation"
                        aria-label="Increase"
                      >+</button>
                    </div>
                  </div>
                  <p className="text-xs text-store-brown-light">Each step = ¼ tray of caramel used for hand wrapping.</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold text-store-brown-light uppercase tracking-wide">Fudge</p>
                {flavors.map((f) => {
                  const e = entries[f.id] || { full_trays: 0, in_progress_trays: 0, trays_sold: 0, trays_wasted: 0, waste_reason: '' }
                  const inProgCount = currentInProgress[f.id] ?? 0
                  const inProgWastedLive = (e.waste_is_in_progress && (e.trays_wasted ?? 0) > 0) ? (e.trays_wasted ?? 0) : 0
                  const liveInProg = Math.max(0, inProgCount - (e.full_trays ?? 0) - inProgWastedLive)

                  const totalMadeToday = (todayTotals[f.id]?.made ?? 0) + (e.full_trays ?? 0)
                  const defaultYield = f.default_yield ?? 3
                  const estimatedBatches = totalMadeToday > 0 ? Math.round(totalMadeToday / defaultYield) : 0

                  const baseGroups = f.base_groups || []
                  // A group is "active" if any base trigger in it has batches today
                  const groupHasBatch = baseGroups.some(g => (baseGroupMap[g] || []).some(fid => (todayBatchCounts[fid] ?? 0) > 0))
                  // The group is fully accounted for when every active group's tray total covers its batch yield
                  const groupFullyAccounted = !groupHasBatch || baseGroups.every(g =>
                    !((baseGroupMap[g] || []).some(fid => (todayBatchCounts[fid] ?? 0) > 0)) || groupAccountedFor[g]
                  )
                  // Cross-flavor reminder: base trigger batch was made but this flavor hasn't contributed trays yet
                  const showBaseReminder =
                    (todayBatchCounts[f.id] ?? 0) === 0 &&
                    groupHasBatch &&
                    !groupFullyAccounted
                  // Self reminder: this flavor has its own batch logged; for base triggers use group accounting,
                  // for committed flavors (SSC, Pistachio, etc.) use per-flavor tray check
                  const showSelfReminder =
                    (todayBatchCounts[f.id] ?? 0) > 0 &&
                    !f.double_batch_reminder &&
                    (f.is_base_trigger
                      ? !groupFullyAccounted
                      : !(e.full_trays > 0) && !(todayTotals[f.id]?.made > 0))

                  // Same cross-day logic as Batches tab: if prev day had exactly 1 incomplete batch, count it toward the total
                  const prevDayCount = prevDayBatchCounts[f.id] ?? 0
                  const effectiveBatches = (prevDayCount === 1 && inProgCount > 0) ? prevDayCount + (todayBatchCounts[f.id] ?? 0) : (todayBatchCounts[f.id] ?? 0)

                  return (
                    <div key={f.id} className="bg-white rounded-xl border border-store-tan p-4 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-store-brown text-lg">{f.name}</p>
                        <div className="flex gap-2 text-xs text-store-brown-light flex-wrap items-center">
                          {currentInventory[f.id] !== undefined && (
                            <span>{currentInventory[f.id]} in stock</span>
                          )}
                          {inProgCount > 0 && (
                            <><span>·</span><span className="text-amber-600 font-medium">{liveInProg} in progress</span></>
                          )}
                          {totalMadeToday > 0 && (
                            <><span>·</span><span>{totalMadeToday} made today</span></>
                          )}
                          {estimatedBatches > 0 && (
                            <><span>·</span><span className="text-store-green font-medium">≈ {estimatedBatches} {estimatedBatches === 1 ? 'batch' : 'batches'}</span></>
                          )}
                          {todayTotals[f.id]?.sold > 0 && (
                            <><span>·</span><span>{todayTotals[f.id].sold} sold today</span></>
                          )}
                        </div>
                      </div>
                      {liveInProg > 0 && (
                        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <span className="text-amber-700 font-semibold text-sm">{liveInProg} in progress</span>
                          <span className="text-amber-600 text-xs">— marking trays made will top {liveInProg === 1 ? 'it' : 'them'}</span>
                        </div>
                      )}
                      {showBaseReminder && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <span className="text-amber-700 text-xs">Base batch made today — enter trays to deduct</span>
                        </div>
                      )}
                      {showSelfReminder && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <span className="text-amber-700 text-xs">Batch logged today — enter trays when ready</span>
                        </div>
                      )}
                      {f.double_batch_reminder && effectiveBatches === 1 && !(e.full_trays > 0) && !(e.in_progress_trays > 0) && !(liveInProg > 0) && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <span className="text-amber-700 text-xs">1st batch done — enter in-progress trays; log 2nd batch when you top</span>
                        </div>
                      )}
                      {f.double_batch_reminder && effectiveBatches >= 2 && !(e.full_trays > 0) && liveInProg > 0 && (
                        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                          <span className="text-store-green text-xs font-medium">Both batches done — move in-progress to full trays</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-store-brown-light">Trays made</span>
                        <Stepper value={e.full_trays} onChange={(v) => setField(f.id, 'full_trays', v)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-store-brown-light">In-progress trays</span>
                        <Stepper value={e.in_progress_trays} onChange={(v) => setField(f.id, 'in_progress_trays', v)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-store-brown-light">Trays sold</span>
                        <Stepper value={e.trays_sold} onChange={(v) => setField(f.id, 'trays_sold', v)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-store-brown-light">Trays wasted</span>
                        <Stepper value={e.trays_wasted} onChange={(v) => setField(f.id, 'trays_wasted', v)} />
                      </div>
                      {e.trays_wasted > 0 && (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={e.waste_reason}
                            onChange={(ev) => setField(f.id, 'waste_reason', ev.target.value)}
                            placeholder="Waste reason"
                            className="w-full border border-store-tan rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
                          />
                          <label className="flex items-center gap-2 text-sm text-store-brown-light cursor-pointer">
                            <input
                              type="checkbox"
                              checked={e.waste_is_in_progress ?? false}
                              onChange={(ev) => setField(f.id, 'waste_is_in_progress', ev.target.checked)}
                              className="w-4 h-4 accent-store-green"
                            />
                            In-progress tray? <span className="text-xs opacity-60">(counts as ½)</span>
                          </label>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Popcorn section */}
              {allFlavors.filter(f => f.product_type === 'popcorn').length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-store-brown-light uppercase tracking-wide">Popcorn</p>
                  {allFlavors.filter(f => f.product_type === 'popcorn').map(f => {
                    const pe = popcornEntries[f.id] || { barrels_added: 0, barrels_sold: 0, in_progress_barrels: 0 }
                    const totalBarrelsToday = (todayBarrelTotals[f.id] ?? 0) + (pe.barrels_added || 0)
                    const barrelsPerBatch = f.default_yield ?? 1
                    const estimatedBatches = totalBarrelsToday > 0 ? Math.round(totalBarrelsToday / barrelsPerBatch) : 0
                    return (
                      <div key={f.id} className="bg-amber-50 rounded-xl border border-amber-200 p-4 shadow-sm space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <p className="font-semibold text-amber-900 text-lg">{f.name}</p>
                          <div className="flex items-center gap-2 flex-wrap text-sm">
                            <span className="font-bold text-amber-700">{currentBarrels[f.id] ?? 0} barrels on hand</span>
                            {totalBarrelsToday > 0 && (
                              <>
                                <span className="text-amber-400">·</span>
                                <span className="text-amber-700">{totalBarrelsToday} added today</span>
                                <span className="text-amber-400">·</span>
                                <span className="text-amber-600 font-medium">≈ {estimatedBatches} {estimatedBatches === 1 ? 'batch' : 'batches'}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-sm text-amber-800">Alert threshold</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={barrelThresholds[f.id] ?? 1}
                              onChange={e => setBarrelThresholds(prev => ({ ...prev, [f.id]: Number(e.target.value) }))}
                              onBlur={async e => {
                                const val = Math.max(0, Number(e.target.value))
                                await supabase.from('flavors').update({ low_tray_threshold: val }).eq('id', f.id)
                              }}
                              className="w-16 text-center border border-amber-300 rounded-lg px-2 py-1 text-sm text-amber-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                            />
                            <span className="text-xs text-amber-700">barrels</span>
                          </div>
                        </div>

                        {(() => { const liveInProgBarrels = Math.max(0, (currentInProgressBarrels[f.id] ?? 0) - (pe.barrels_added ?? 0)); return liveInProgBarrels > 0 && (
                          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            <span className="text-amber-700 font-semibold text-sm">{liveInProgBarrels} in progress</span>
                            <span className="text-amber-600 text-xs">— adding barrels will top {liveInProgBarrels === 1 ? 'it' : 'them'}</span>
                          </div>
                        )})()}

                        {(() => {
                          const popcornBatches = todayBatchCounts[f.id] ?? 0
                          if (popcornBatches === 0) return null
                          const yieldPerBatch = f.default_yield ?? 1
                          const expectedBarrels = popcornBatches * yieldPerBatch
                          const totalLogged = (todayBarrelTotals[f.id] ?? 0) + (pe.barrels_added ?? 0) + (pe.in_progress_barrels ?? 0) * 0.5
                          return totalLogged < expectedBarrels && (
                            <div className="bg-amber-100 border border-amber-300 rounded-lg px-3 py-2">
                              <span className="text-amber-800 text-xs">Batch logged today — add barrels when ready</span>
                            </div>
                          )
                        })()}

                        <div className="flex items-center justify-between">
                          <span className="text-sm text-amber-800">Barrels added</span>
                          <Stepper value={pe.barrels_added} onChange={v => setPopcornField(f.id, 'barrels_added', v)} />
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-sm text-amber-800">In-progress barrels</span>
                          <Stepper value={pe.in_progress_barrels} onChange={v => setPopcornField(f.id, 'in_progress_barrels', v)} />
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-sm text-amber-800">Barrels sold</span>
                          <Stepper value={pe.barrels_sold} onChange={v => setPopcornField(f.id, 'barrels_sold', v)} />
                        </div>

                      </div>
                    )
                  })}
                </div>
              )}

              <button
                onClick={handleProductSubmit}
                disabled={submitting}
                className="w-full bg-store-green hover:bg-store-green-dark text-white py-4 rounded-xl text-lg font-semibold transition-colors disabled:opacity-50 touch-manipulation"
              >
                {submitting ? 'Submitting…' : 'Submit Product Report'}
              </button>
            </>
          )}
        </>
      )}

      {/* ── INGREDIENTS TAB ── */}
      {activeTab === 'ingredients' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-store-brown">Order Received</p>
              <p className="text-xs text-store-brown-light mt-0.5">Did a delivery come in? Log what was received.</p>
            </div>
            {recSubmitted ? (
              <div className="bg-store-green-light border border-store-green rounded-xl px-4 py-3 text-center">
                <p className="text-store-green font-semibold">Order logged ✓</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {ingList.map((ing) => (
                    <IngRow
                      key={ing.id}
                      ing={ing}
                      value={ingReceived[ing.id] || ''}
                      onChange={(v) => setIngReceived((prev) => ({ ...prev, [ing.id]: parseFloat(v) || 0 }))}
                    />
                  ))}
                </div>
                <button
                  onClick={handleIngredientReceive}
                  disabled={recSubmitting || !ingList.some((i) => (ingReceived[i.id] ?? 0) > 0)}
                  className="w-full bg-store-brown text-white py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 touch-manipulation hover:opacity-90"
                >
                  {recSubmitting ? 'Logging…' : 'Log Received Order'}
                </button>
              </>
            )}
          </div>

          <hr className="border-store-tan" />

          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-store-brown">Manual Usage</p>
              <p className="text-xs text-store-brown-light mt-0.5">Used something that wasn't part of a batch? Log it here.</p>
            </div>
            {ingSubmitted ? (
              <div className="bg-store-green-light border border-store-green rounded-xl px-4 py-3 text-center">
                <p className="text-store-green font-semibold">Usage logged ✓</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {ingList.map((ing) => (
                    <IngRow
                      key={ing.id}
                      ing={ing}
                      value={ingUsage[ing.id] || ''}
                      onChange={(v) => setIngUsage((prev) => ({ ...prev, [ing.id]: parseFloat(v) || 0 }))}
                    />
                  ))}
                </div>
                <button
                  onClick={handleIngredientSubmit}
                  disabled={ingSubmitting || !ingList.some((i) => (ingUsage[i.id] ?? 0) > 0)}
                  className="w-full bg-store-green hover:bg-store-green-dark text-white py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 touch-manipulation"
                >
                  {ingSubmitting ? 'Logging…' : 'Log Usage'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function IngRow({ ing, value, onChange }) {
  return (
    <div className="bg-white rounded-xl border border-store-tan px-4 py-3 shadow-sm overflow-hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-store-brown truncate">{ing.name}</p>
        <p className="text-xs text-store-brown-light mt-0.5 truncate">{ing.quantity} {ing.unit} in stock</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.5"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="w-20 border border-store-tan rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
        />
        <span className="text-xs text-store-brown-light">{ing.unit}</span>
      </div>
    </div>
  )
}
