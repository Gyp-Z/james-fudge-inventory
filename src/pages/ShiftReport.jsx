import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Stepper from '../components/Stepper'
import Collapsible from '../components/Collapsible'
import FudgeCard from '../components/report/FudgeCard'
import PopcornCard from '../components/report/PopcornCard'
import SeasonClosedPanel from '../components/report/SeasonClosedPanel'
import {
  logBatchWithEffects, computeTrayInventory, applyTrayDeductions, logFudgePops,
  applyPopcornEntry, reverseShiftEntry, revertBatchLog, revertFudgePopLog,
} from '../utils/inventoryActions'
import { POPS_PER_SESSION, seasonPhase, getSeasonSoldTotals, bySoldDesc } from '../core/ops.js'

// The staff report screen. Three big UX ideas layered on the original form:
//   1. SMART LIST — flavors with activity today ("Today" section) render first and
//      expanded; everything else is a collapsed row that expands on tap. A sticky
//      search + jump bar keeps the whole tab reachable without marathon scrolling.
//   2. UNDO — both submit paths keep an undo bundle (batch log ids / entry ids /
//      barrel logs / pop logs / handwrap row) so a fat-fingered submission reverses
//      through the same core helpers the Audit & Edit page uses.
//   3. JARVIS-AWARE — when the floating Jarvis logs something (from any page), it fires
//      a 'jarvis-applied' window event; this page refreshes its numbers and flashes the
//      affected flavor card, so you can watch the report build itself while you talk.
export default function ShiftReport() {
  const { session } = useAuth()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('batches')
  const [search, setSearch] = useState('')
  const [openCards, setOpenCards] = useState({})     // flavor_id -> manual expand override
  const [flashIds, setFlashIds] = useState({})       // flavor_id -> timestamp (replays flash)
  const [undoneNotice, setUndoneNotice] = useState('')

  // All flavors (fudge + popcorn) — for Batches tab
  const [allFlavors, setAllFlavors] = useState([])
  // Fudge-only flavors — for Products tab (sorted best-seller-first)
  const [flavors, setFlavors] = useState([])
  // Season-to-date trays sold per flavor_id — drives the fudge sort order
  const [soldMap, setSoldMap] = useState({})

  const [loading, setLoading] = useState(true)

  // Products tab state — fudge
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [entries, setEntries] = useState({})
  const [todayTotals, setTodayTotals] = useState({})
  const [currentInventory, setCurrentInventory] = useState({})
  const [currentInProgress, setCurrentInProgress] = useState({})

  // Products tab state — popcorn
  const [popcornEntries, setPopcornEntries] = useState({})
  const [currentBarrels, setCurrentBarrels] = useState({})
  const [currentInProgressBarrels, setCurrentInProgressBarrels] = useState({})
  const [barrelThresholds, setBarrelThresholds] = useState({})
  const [todayBarrelTotals, setTodayBarrelTotals] = useState({})

  // Batches tab state
  const [batchCounts, setBatchCounts] = useState({})
  const [batchWasted, setBatchWasted] = useState({})
  const [batchWasteReason, setBatchWasteReason] = useState({})
  const [batchSubmitting, setBatchSubmitting] = useState(false)
  const [batchResult, setBatchResult] = useState(null)
  const [batchUndoBusy, setBatchUndoBusy] = useState(false)
  const [todayBatchCounts, setTodayBatchCounts] = useState({})
  const [prevDayBatchCounts, setPrevDayBatchCounts] = useState({})

  // Ingredients tab
  const [ingList, setIngList] = useState([])
  const [ingUsage, setIngUsage] = useState({})
  const [ingSubmitting, setIngSubmitting] = useState(false)
  const [ingSubmitted, setIngSubmitted] = useState(false)
  const [ingReceived, setIngReceived] = useState({})
  const [recSubmitting, setRecSubmitting] = useState(false)
  const [recSubmitted, setRecSubmitted] = useState(false)

  // Caramels hand-wrapped + fudge pops
  const [caramelsHandWrapped, setCaramelsHandWrapped] = useState(0)
  const [fudgePops, setFudgePops] = useState({ vanilla: 0, chocolate: 0 })
  const [todayFudgePops, setTodayFudgePops] = useState({ vanilla: 0, chocolate: 0 })
  const [openCaramels, setOpenCaramels] = useState(null) // null = auto (open when value > 0)
  const [openPops, setOpenPops] = useState(null)

  // Product-submit undo bundle + redirect countdown
  const [productUndo, setProductUndo] = useState(null)
  const [undoBusy, setUndoBusy] = useState(false)
  const [redirectIn, setRedirectIn] = useState(null)
  const redirectTimerRef = useRef(null)

  const phase = seasonPhase()
  const seasonClosed = phase === 'closed'

  // ── DATA LOADING ──────────────────────────────────────────────────────────
  // loadLive() is separate from the one-time catalog load so the chat mode (and
  // undo) can refresh today's numbers without clobbering half-typed form state.

  async function loadLive(all) {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

    const [{ data: invData }, { data: todayReports }, { data: priorBatches }, { data: todayBarrelLogs }, { data: popLogs }] = await Promise.all([
      supabase.from('current_inventory').select('flavor_id, tray_count, in_progress_count, barrel_count, in_progress_barrel_count'),
      supabase.from('shift_reports').select('id').eq('report_date', todayStr),
      supabase.from('batch_logs').select('flavor_id, is_wasted')
        .gte('batch_date', todayStr + 'T00:00:00').lt('batch_date', todayStr + 'T23:59:59'),
      supabase.from('shelf_bucket_logs').select('flavor_id, barrels_added')
        .gte('logged_at', `${todayStr}T00:00:00`).lte('logged_at', `${todayStr}T23:59:59`),
      supabase.from('fudge_pop_logs').select('base, pop_count').eq('report_date', todayStr),
    ])

    const invMap = {}, inProgMap = {}, barrelMap = {}, inProgBarrelMap = {}
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
    } else {
      setTodayTotals({})
    }

    const priorCounts = {}
    ;(priorBatches || []).forEach((b) => {
      if (!b.is_wasted) priorCounts[b.flavor_id] = (priorCounts[b.flavor_id] ?? 0) + 1
    })
    setTodayBatchCounts(priorCounts)

    // Double-batch flavors: batch count on the most recent prior day (cross-day carry)
    const doubleBatchIds = all.filter((f) => f.double_batch_reminder).map((f) => f.id)
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
      ;(recentBatches || []).forEach((b) => {
        if (b.is_wasted) return
        const bDate = (b.batch_date ?? '').slice(0, 10)
        const existing = prevDayCounts[b.flavor_id]
        if (!existing) prevDayCounts[b.flavor_id] = { date: bDate, count: 1 }
        else if (existing.date === bDate) existing.count++
      })
      const finalPrevDay = {}
      Object.entries(prevDayCounts).forEach(([fid, { count }]) => { finalPrevDay[fid] = count })
      setPrevDayBatchCounts(finalPrevDay)
    }

    const barrelTotalsMap = {}
    ;(todayBarrelLogs || []).forEach((row) => {
      barrelTotalsMap[row.flavor_id] = (barrelTotalsMap[row.flavor_id] ?? 0) + (row.barrels_added ?? 0)
    })
    setTodayBarrelTotals(barrelTotalsMap)

    const popMap = { vanilla: 0, chocolate: 0 }
    ;(popLogs || []).forEach((p) => { if (popMap[p.base] != null) popMap[p.base] += p.pop_count ?? 0 })
    setTodayFudgePops(popMap)
  }

  useEffect(() => {
    async function load() {
      const [{ data: allFlavorsData }, { data: ingredientsData }, soldTotals] = await Promise.all([
        supabase.from('flavors').select('*').eq('is_active', true).order('product_type').order('name'),
        supabase.from('ingredients').select('id, name, quantity, unit').eq('is_active', true).order('name'),
        getSeasonSoldTotals(supabase).catch(() => ({})),
      ])

      const all = allFlavorsData || []
      // Fudge sorts best-seller-first everywhere (season-to-date trays sold); popcorn
      // and caramel keep name order. Extras (toffee, dot cakes) are batch-only and
      // never in the Products/sold list.
      const fudgeOnly = all
        .filter((f) => f.product_type === 'fudge' && f.is_component !== true)
        .sort(bySoldDesc(soldTotals))
      const popcornOnly = all.filter((f) => f.product_type === 'popcorn')
      const ings = ingredientsData || []

      setSoldMap(soldTotals)
      setAllFlavors(all)
      setFlavors(fudgeOnly)
      setIngList(ings)

      const batchInit = {}
      all.forEach((f) => { batchInit[f.id] = 0 })
      setBatchCounts(batchInit)
      setBatchWasted({ ...batchInit })

      const initial = {}
      fudgeOnly.forEach((f) => {
        initial[f.id] = { full_trays: 0, in_progress_trays: 0, trays_sold: 0, trays_wasted: 0, waste_reason: '', waste_is_in_progress: false }
      })
      setEntries(initial)

      const popcornInit = {}
      popcornOnly.forEach((f) => { popcornInit[f.id] = { barrels_added: 0, barrels_sold: 0, in_progress_barrels: 0 } })
      setPopcornEntries(popcornInit)

      const thresholdInit = {}
      popcornOnly.forEach((f) => { thresholdInit[f.id] = f.low_tray_threshold ?? 1 })
      setBarrelThresholds(thresholdInit)

      const ingInit = {}, recInit = {}
      ings.forEach((i) => { ingInit[i.id] = 0; recInit[i.id] = 0 })
      setIngUsage(ingInit)
      setIngReceived(recInit)

      await loadLive(all)
      setLoading(false)
    }
    load()
    return () => clearInterval(redirectTimerRef.current)
  }, [])

  async function reloadIngList() {
    const { data } = await supabase.from('ingredients').select('id, name, quantity, unit').eq('is_active', true).order('name')
    setIngList(data || [])
  }

  // ── JARVIS WROTE SOMETHING — refresh today's numbers + flash the card ──
  // The floating Jarvis widget dispatches 'jarvis-applied' after every confirmed write.

  async function handleJarvisApplied(toolName, input) {
    await loadLive(allFlavors)
    let name = input?.flavor
    if (toolName === 'log_fudge_pops') name = input?.base // vanilla / chocolate base card
    if (!name) return
    const lower = String(name).toLowerCase()
    const target =
      allFlavors.find((f) => f.name.toLowerCase() === lower) ||
      allFlavors.find((f) => f.name.toLowerCase().includes(lower))
    if (target) setFlashIds((prev) => ({ ...prev, [target.id]: Date.now() }))
  }

  useEffect(() => {
    if (allFlavors.length === 0) return
    const onApplied = (e) => handleJarvisApplied(e.detail?.name, e.detail?.input || {})
    window.addEventListener('jarvis-applied', onApplied)
    return () => window.removeEventListener('jarvis-applied', onApplied)
  }, [allFlavors]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── BATCHES TAB ──────────────────────────────────────────────────────────

  async function handleBatchSubmit() {
    const toLog = allFlavors.filter((f) => (batchCounts[f.id] ?? 0) > 0 || (batchWasted[f.id] ?? 0) > 0)
    if (toLog.length === 0) return
    setBatchSubmitting(true)
    setBatchResult(null)
    setUndoneNotice('')

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const allDeductions = [], allNegatives = [], allSkipped = [], batchLogIds = []

    for (const flavor of toLog) {
      const madeCount = batchCounts[flavor.id] ?? 0
      const wastedCount = batchWasted[flavor.id] ?? 0
      const flavorWasteReason = batchWasteReason[flavor.id]?.trim() || null
      for (let i = 0; i < madeCount + wastedCount; i++) {
        const isWasted = i >= madeCount
        // Shared helper fires the exact same batch-phase effects the Audit page backdates.
        // Caramel SSC deduction stays in handleProductSubmit (per full tray), not here.
        const { batchLogId, deductions, negatives, skipped } = await logBatchWithEffects(
          flavor,
          todayStr,
          { isWasted, wasteReason: flavorWasteReason }
        )
        if (!batchLogId) continue
        batchLogIds.push(batchLogId)
        allDeductions.push(...deductions)
        allNegatives.push(...negatives)
        allSkipped.push(...skipped)
      }
    }

    setBatchResult({
      flavors: toLog,
      madeMap: { ...batchCounts },
      wastedMap: { ...batchWasted },
      wasteReasonMap: { ...batchWasteReason },
      batchLogIds,
      deductions: allDeductions,
      negatives: allNegatives,
      skipped: allSkipped,
    })
    setBatchSubmitting(false)
    setTodayBatchCounts((prev) => {
      const updated = { ...prev }
      for (const flavor of toLog) {
        const made = batchCounts[flavor.id] ?? 0
        if (made > 0) updated[flavor.id] = (updated[flavor.id] ?? 0) + made
      }
      return updated
    })
    setBatchCounts((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, 0])))
    setBatchWasted((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, 0])))
    setBatchWasteReason((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, ''])))
  }

  // Undo the batches this banner just logged: reverse each batch (refunds ingredient
  // deductions; caramel −1 tray per component batch) and put the counts back in the
  // form so a wrong number is a two-tap fix instead of a call to the owner.
  async function handleBatchUndo() {
    if (!batchResult || batchUndoBusy) return
    setBatchUndoBusy(true)
    for (const id of batchResult.batchLogIds) await revertBatchLog(id)
    setBatchCounts((prev) => ({ ...prev, ...batchResult.madeMap }))
    setBatchWasted((prev) => ({ ...prev, ...batchResult.wastedMap }))
    setBatchWasteReason((prev) => ({ ...prev, ...batchResult.wasteReasonMap }))
    await loadLive(allFlavors)
    setBatchResult(null)
    setBatchUndoBusy(false)
    setUndoneNotice('Batches undone — your counts are back in the form.')
  }

  // ── PRODUCTS TAB ─────────────────────────────────────────────────────────

  function setField(flavorId, field, value) {
    setEntries((prev) => ({ ...prev, [flavorId]: { ...prev[flavorId], [field]: value } }))
  }

  function setPopcornField(flavorId, field, value) {
    setPopcornEntries((prev) => ({ ...prev, [flavorId]: { ...prev[flavorId], [field]: value } }))
  }

  const hasAnyProductInput = useMemo(() => {
    const fudgeAny = Object.values(entries).some((e) =>
      (e?.full_trays ?? 0) > 0 || (e?.in_progress_trays ?? 0) > 0 || (e?.trays_sold ?? 0) > 0 || (e?.trays_wasted ?? 0) > 0)
    const popAny = Object.values(popcornEntries).some((pe) =>
      (pe?.barrels_added ?? 0) > 0 || (pe?.barrels_sold ?? 0) > 0 || (pe?.in_progress_barrels ?? 0) > 0)
    return fudgeAny || popAny || caramelsHandWrapped > 0 || fudgePops.vanilla > 0 || fudgePops.chocolate > 0
  }, [entries, popcornEntries, caramelsHandWrapped, fudgePops])

  // One-line preview of everything the submit will write — the "review without
  // scrolling back up" summary.
  const pendingSummary = useMemo(() => {
    const parts = []
    for (const f of flavors) {
      const e = entries[f.id]; if (!e) continue
      const bits = []
      if ((e.full_trays ?? 0) > 0) bits.push(`+${e.full_trays} made`)
      if ((e.in_progress_trays ?? 0) > 0) bits.push(`+${e.in_progress_trays} in-prog`)
      if ((e.trays_sold ?? 0) > 0) bits.push(`${e.trays_sold} sold`)
      if ((e.trays_wasted ?? 0) > 0) bits.push(`${e.trays_wasted} wasted`)
      if (bits.length) parts.push(`${f.name} ${bits.join(', ')}`)
    }
    for (const f of allFlavors.filter((x) => x.product_type === 'popcorn')) {
      const pe = popcornEntries[f.id]; if (!pe) continue
      const bits = []
      if ((pe.barrels_added ?? 0) > 0) bits.push(`+${pe.barrels_added} barrels`)
      if ((pe.in_progress_barrels ?? 0) > 0) bits.push(`+${pe.in_progress_barrels} in-prog`)
      if ((pe.barrels_sold ?? 0) > 0) bits.push(`${pe.barrels_sold} sold`)
      if (bits.length) parts.push(`${f.name} ${bits.join(', ')}`)
    }
    if (caramelsHandWrapped > 0) parts.push(`${caramelsHandWrapped}/18 caramels wrapped`)
    if (fudgePops.vanilla > 0) parts.push(`${fudgePops.vanilla} vanilla pops`)
    if (fudgePops.chocolate > 0) parts.push(`${fudgePops.chocolate} chocolate pops`)
    return parts
  }, [flavors, allFlavors, entries, popcornEntries, caramelsHandWrapped, fudgePops])

  async function handleProductSubmit() {
    if (!hasAnyProductInput || submitting) return
    setSubmitting(true)
    setUndoneNotice('')
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
    // Capture inserted entry ids: they link each tray-phase deduction to its entry
    // (Audit & Edit reversibility) AND power the staff undo below.
    const entryIdByFlavor = {}
    const entryIds = []
    if (entryRows.length > 0) {
      const { data: insertedEntries } = await supabase
        .from('shift_report_entries')
        .insert(entryRows)
        .select('id, flavor_id')
      ;(insertedEntries || []).forEach((row) => { entryIdByFlavor[row.flavor_id] = row.id; entryIds.push(row.id) })
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
        const isInProg = e?.waste_is_in_progress ?? false
        const wastedCount = e?.trays_wasted ?? 0
        // Normalize the UI waste flag into the canonical split columns, then use the shared
        // inventory formula (same one the Audit & Edit page reverses against).
        const values = {
          full_trays: e?.full_trays ?? 0,
          in_progress_trays: e?.in_progress_trays ?? 0,
          trays_sold: e?.trays_sold ?? 0,
          trays_wasted: isInProg ? 0 : wastedCount,
          in_progress_wasted: isInProg ? wastedCount : 0,
        }
        const { tray_count, in_progress_count } = computeTrayInventory(
          values,
          freshMap[f.id] ?? 0,
          currentInProgress[f.id] ?? 0
        )
        return { flavor_id: f.id, tray_count, in_progress_count, updated_at: new Date().toISOString() }
      })

    if (activeRows.length > 0) {
      await supabase.from('current_inventory').upsert(activeRows, { onConflict: 'flavor_id' })
    }

    // Per-tray ingredient deductions (linked to their entry → reversible).
    // Caramel deduction for SSC fires inside.
    for (const f of flavors) {
      const made = entries[f.id]?.full_trays ?? 0
      if (made > 0) await applyTrayDeductions(f, made, entryIdByFlavor[f.id] ?? null)
    }

    // Popcorn barrels — through the shared core helper (same path as Jarvis and the
    // Audit page) so the effect logic can't drift. Pre-submit counts are snapshotted
    // per flavor for an exact undo (in-progress topping isn't otherwise invertible).
    const popcornUndoList = []
    const popcornFlavorsLocal = allFlavors.filter((f) => f.product_type === 'popcorn')
    for (const f of popcornFlavorsLocal) {
      const pe = popcornEntries[f.id]
      if (!pe) continue
      const barrelsAdded = pe.barrels_added || 0
      const barrelsSold = pe.barrels_sold || 0
      const inProg = pe.in_progress_barrels || 0
      if (barrelsAdded === 0 && barrelsSold === 0 && inProg === 0) continue
      const prevBarrels = currentBarrels[f.id] ?? 0
      const prevInProg = currentInProgressBarrels[f.id] ?? 0
      const { logId } = await applyPopcornEntry(f, todayStr, {
        barrels_added: barrelsAdded, barrels_sold: barrelsSold, in_progress_barrels: inProg,
      })
      popcornUndoList.push({ flavorId: f.id, logId, prevBarrels, prevInProg })
    }

    // Hand-wrapped caramels (id captured for undo; caramel display self-corrects
    // because the count is computed forward from logs).
    let handwrapId = null
    if (caramelsHandWrapped > 0) {
      const { data: hw } = await supabase.from('caramel_handwrap_logs')
        .insert({ trays_used: caramelsHandWrapped / 18, report_date: todayStr })
        .select('id').single()
      handwrapId = hw?.id ?? null
    }

    // Fudge pops per base — log rows captured for undo (deductions link back via
    // ingredient_deductions.fudge_pop_log_id).
    const popLogIds = []
    for (const base of ['vanilla', 'chocolate']) {
      const count = fudgePops[base] ?? 0
      if (count > 0) {
        const { logId } = await logFudgePops(base, count, todayStr)
        if (logId) popLogIds.push(logId)
      }
    }

    setProductUndo({ reportId: report.id, entryIds, popcorn: popcornUndoList, popLogIds, handwrapId })
    setSubmitted(true)
    setSubmitting(false)
    await loadLive(allFlavors)

    // Gentle auto-return to the Dashboard — long enough to hit Undo if something's off.
    setRedirectIn(12)
    clearInterval(redirectTimerRef.current)
    redirectTimerRef.current = setInterval(() => {
      setRedirectIn((s) => {
        if (s == null) return null
        if (s <= 1) { clearInterval(redirectTimerRef.current); navigate('/'); return 0 }
        return s - 1
      })
    }, 1000)
  }

  // Reverse everything the submission just wrote, in the safest order. The form
  // still holds the chef's numbers, so undo = fix the wrong stepper and resubmit.
  async function handleProductUndo() {
    if (!productUndo || undoBusy) return
    clearInterval(redirectTimerRef.current)
    setRedirectIn(null)
    setUndoBusy(true)
    const u = productUndo
    for (const id of u.entryIds) await reverseShiftEntry(id)                    // trays + deductions + caramel
    for (const p of u.popcorn) {                                               // barrels: exact snapshot restore
      if (p.logId) await supabase.from('shelf_bucket_logs').delete().eq('id', p.logId)
      await supabase.from('current_inventory').upsert(
        { flavor_id: p.flavorId, barrel_count: p.prevBarrels, in_progress_barrel_count: p.prevInProg, updated_at: new Date().toISOString() },
        { onConflict: 'flavor_id' }
      )
    }
    for (const id of u.popLogIds) await revertFudgePopLog(id)                   // pop toppings refund
    if (u.handwrapId) await supabase.from('caramel_handwrap_logs').delete().eq('id', u.handwrapId)
    if (u.reportId) await supabase.from('shift_reports').delete().eq('id', u.reportId) // our own snapshot report, now empty
    await loadLive(allFlavors)
    setProductUndo(null)
    setSubmitted(false)
    setUndoBusy(false)
    setUndoneNotice('Submission undone — your numbers are still in the form.')
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

  const todayLabel = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric',
  })

  const componentBatchFlavors = allFlavors.filter((f) => f.is_component === true)
  const fudgeFlavors = allFlavors.filter((f) => f.product_type === 'fudge' && !f.is_component).sort(bySoldDesc(soldMap))
  const popcornFlavors = allFlavors.filter((f) => f.product_type === 'popcorn')
  // Extras (Toffee, Dot Cakes): batch-log-only items — you log a batch, ingredients
  // deduct, but they're not sold/tracked (no Dashboard card, no sales, no graph).
  const extraFlavors = allFlavors.filter((f) => f.product_type === 'extra')
  const batchesReady = allFlavors.some((f) => (batchCounts[f.id] ?? 0) > 0 || (batchWasted[f.id] ?? 0) > 0)

  // Build base group map: group name → [flavor_ids that are plain base triggers]
  const baseGroupMap = {}
  allFlavors.forEach((f) => {
    if (!f.is_base_trigger) return
    ;(f.base_groups || []).forEach((g) => {
      if (!baseGroupMap[g]) baseGroupMap[g] = []
      baseGroupMap[g].push(f.id)
    })
  })

  // For each base group with batches today: how many tray-equivalents are accounted for?
  // LIVE — includes the current form + pop steppers, so reminders and the base notice
  // count down (and clear) as the chef types, before anything is submitted.
  const groupStatus = {}
  Object.entries(baseGroupMap).forEach(([g, triggerIds]) => {
    const totalBatches = triggerIds.reduce((sum, fid) => sum + (todayBatchCounts[fid] ?? 0), 0)
    if (totalBatches === 0) { groupStatus[g] = { batches: 0, expected: 0, actual: 0, accounted: true }; return }
    const triggerFlavor = allFlavors.find((f) => triggerIds.includes(f.id))
    const yieldPerBatch = triggerFlavor?.default_yield ?? 3
    const expectedTrays = totalBatches * yieldPerBatch
    let actualTrays = 0
    allFlavors.forEach((f) => {
      if (!(f.base_groups || []).includes(g)) return
      actualTrays += (todayTotals[f.id]?.made ?? 0)
      actualTrays += (todayTotals[f.id]?.in_progress ?? 0) * 0.5
      actualTrays += (entries[f.id]?.full_trays ?? 0)
      actualTrays += (entries[f.id]?.in_progress_trays ?? 0) * 0.5
    })
    // Fudge pops made from this base also consumed batch trays (~20 pops = 1 tray).
    actualTrays += ((todayFudgePops[g] ?? 0) + (fudgePops[g] ?? 0)) / POPS_PER_SESSION
    groupStatus[g] = {
      batches: totalBatches,
      baseName: triggerFlavor?.name ?? g,
      expected: expectedTrays,
      actual: actualTrays,
      accounted: actualTrays >= expectedTrays,
    }
  })
  const groupAccountedFor = Object.fromEntries(Object.entries(groupStatus).map(([g, s]) => [g, s.accounted]))

  // ONE compact notice per base group still owed trays — instead of hoisting every
  // sibling flavor into "Today". It counts down live and disappears when the group
  // is fully accounted for.
  const baseNotices = Object.values(groupStatus).filter((s) => s.batches > 0 && !s.accounted)

  const ZERO_ENTRY = { full_trays: 0, in_progress_trays: 0, trays_sold: 0, trays_wasted: 0, waste_reason: '', waste_is_in_progress: false }

  function deriveFudge(f, e, groupAcc) {
    const inProgCount = currentInProgress[f.id] ?? 0
    const inProgWastedLive = (e.waste_is_in_progress && (e.trays_wasted ?? 0) > 0) ? (e.trays_wasted ?? 0) : 0
    const liveInProg = Math.max(0, inProgCount - (e.full_trays ?? 0) - inProgWastedLive)

    const totalMadeToday = (todayTotals[f.id]?.made ?? 0) + (e.full_trays ?? 0)
    const defaultYield = f.default_yield ?? 3
    const estimatedBatches = totalMadeToday > 0 ? Math.round(totalMadeToday / defaultYield) : 0

    const baseGroups = f.base_groups || []
    const groupHasBatch = baseGroups.some((g) => (baseGroupMap[g] || []).some((fid) => (todayBatchCounts[fid] ?? 0) > 0))
    const groupFullyAccounted = !groupHasBatch || baseGroups.every((g) =>
      !((baseGroupMap[g] || []).some((fid) => (todayBatchCounts[fid] ?? 0) > 0)) || groupAcc[g]
    )
    const showBaseReminder =
      (todayBatchCounts[f.id] ?? 0) === 0 && groupHasBatch && !groupFullyAccounted
    const showSelfReminder =
      (todayBatchCounts[f.id] ?? 0) > 0 &&
      !f.double_batch_reminder &&
      (f.is_base_trigger
        ? !groupFullyAccounted
        : !(e.full_trays > 0) && !(todayTotals[f.id]?.made > 0))

    const prevDayCount = prevDayBatchCounts[f.id] ?? 0
    const effectiveBatches = (prevDayCount === 1 && inProgCount > 0) ? prevDayCount + (todayBatchCounts[f.id] ?? 0) : (todayBatchCounts[f.id] ?? 0)

    const showInProg = liveInProg > 0
    const showDouble1 = f.double_batch_reminder && effectiveBatches === 1 && !(e.full_trays > 0) && !(e.in_progress_trays > 0) && !(liveInProg > 0)
    const showDouble2 = f.double_batch_reminder && effectiveBatches >= 2 && !(e.full_trays > 0) && liveInProg > 0
    const anyReminder = showInProg || showBaseReminder || showSelfReminder || showDouble1 || showDouble2

    return {
      stock: currentInventory[f.id],
      inProgCount, liveInProg, totalMadeToday, estimatedBatches,
      soldToday: todayTotals[f.id]?.sold ?? 0,
      showInProg, showBaseReminder, showSelfReminder, showDouble1, showDouble2, anyReminder,
    }
  }

  const ZERO_POPCORN = { barrels_added: 0, barrels_sold: 0, in_progress_barrels: 0 }

  function derivePopcorn(f, pe) {
    const totalBarrelsToday = (todayBarrelTotals[f.id] ?? 0) + (pe.barrels_added || 0)
    const barrelsPerBatch = f.default_yield ?? 1
    const estimatedBatches = totalBarrelsToday > 0 ? Math.round(totalBarrelsToday / barrelsPerBatch) : 0
    const liveInProgBarrels = Math.max(0, (currentInProgressBarrels[f.id] ?? 0) - (pe.barrels_added ?? 0))
    const popcornBatches = todayBatchCounts[f.id] ?? 0
    const totalLogged = (todayBarrelTotals[f.id] ?? 0) + (pe.barrels_added ?? 0) + (pe.in_progress_barrels ?? 0) * 0.5
    const needsBarrels = popcornBatches > 0 && totalLogged < popcornBatches * barrelsPerBatch
    return {
      barrels: currentBarrels[f.id] ?? 0,
      totalBarrelsToday, estimatedBatches, liveInProgBarrels, needsBarrels,
    }
  }

  // "Today" membership — DIRECT activity only, from submitted data (stable while
  // typing): the flavor's own batch today, its own in-progress trays, or entries in
  // today's reports. Base-group siblings do NOT join just because a base was made —
  // that's the single base notice's job (they still get their gold dot + in-card
  // reminder down in the full list).
  const isFudgeAttention = (f) => {
    const t = todayTotals[f.id]
    return (todayBatchCounts[f.id] ?? 0) > 0 ||
      (currentInProgress[f.id] ?? 0) > 0 ||
      (t && (t.made > 0 || t.sold > 0 || t.wasted > 0 || t.in_progress > 0))
  }
  const isPopcornAttention = (f) =>
    (todayBatchCounts[f.id] ?? 0) > 0 ||
    (currentInProgressBarrels[f.id] ?? 0) > 0 ||
    (todayBarrelTotals[f.id] ?? 0) > 0

  const matchesSearch = (name) => !search.trim() || name.toLowerCase().includes(search.trim().toLowerCase())

  const fudgeAttention = flavors.filter((f) => isFudgeAttention(f) && matchesSearch(f.name))
  const fudgeRest = flavors.filter((f) => !isFudgeAttention(f) && matchesSearch(f.name))
  const popcornAttention = popcornFlavors.filter((f) => isPopcornAttention(f) && matchesSearch(f.name))
  const popcornRest = popcornFlavors.filter((f) => !isPopcornAttention(f) && matchesSearch(f.name))
  const attentionCount = fudgeAttention.length + popcornAttention.length

  // Card open state: manual toggle wins; otherwise "Today" cards start open and
  // everything else starts collapsed. Toggling inverts whatever is shown.
  const isCardOpen = (f, attention) => openCards[f.id] ?? attention
  const handleToggle = (f, attention) => {
    setOpenCards((prev) => ({ ...prev, [f.id]: !isCardOpen(f, attention) }))
  }

  const jumpTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  function switchTab(key) {
    setActiveTab(key)
    setSubmitted(false)
    setIngSubmitted(false)
    setRecSubmitted(false)
    setBatchResult(null)
    setUndoneNotice('')
    setProductUndo(null)
    setRedirectIn(null)
    clearInterval(redirectTimerRef.current)
  }

  // Season's over → the report becomes read-only; point everyone at the recap.
  if (seasonClosed) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>Report</h2>
          <p className="text-store-brown-light text-sm mt-1">{todayLabel}</p>
        </div>
        <SeasonClosedPanel />
      </div>
    )
  }

  const showUtilityBar = activeTab === 'batches' || activeTab === 'products'

  const caramelsOpen = openCaramels ?? (caramelsHandWrapped > 0)
  const popsOpen = openPops ?? (fudgePops.vanilla > 0 || fudgePops.chocolate > 0)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          Report
        </h2>
        <p className="text-store-brown-light text-sm mt-1">{todayLabel}</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 items-center flex-wrap">
        {[
          { key: 'batches', label: 'Batches' },
          { key: 'products', label: 'Products' },
          { key: 'ingredients', label: 'Ingredients' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className={`press px-4 py-2 rounded-full text-sm font-semibold touch-manipulation ${
              activeTab === key
                ? 'bg-store-green text-white shadow-sm'
                : 'bg-white border border-store-tan text-store-brown-light hover:text-store-green hover:border-store-green/40'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {undoneNotice && (
        <div className="bg-store-gold/15 border border-store-gold/40 rounded-xl px-4 py-3 text-sm text-store-brown font-medium animate-pop-in">
          {undoneNotice}
        </div>
      )}

      {/* ── Sticky search + jump bar (batches/products) ── */}
      {showUtilityBar && (
        <div className="sticky top-14 z-30 -mx-4 px-4 py-2 bg-store-cream/95 backdrop-blur-md space-y-2">
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-store-brown-light pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a flavor…"
              className="w-full border border-store-tan rounded-full pl-10 pr-9 py-2.5 text-sm bg-white text-store-brown focus:outline-none focus:ring-2 focus:ring-store-green shadow-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-store-tan text-store-brown flex items-center justify-center press"
                aria-label="Clear search"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {(activeTab === 'products'
              ? [
                  ...(attentionCount > 0 || baseNotices.length > 0
                    ? [{ id: 'sec-today', label: `Today${attentionCount > 0 ? ` · ${attentionCount}` : ''}`, dot: true }]
                    : []),
                  { id: 'sec-caramels', label: 'Caramels' },
                  { id: 'sec-pops', label: 'Pops' },
                  { id: 'sec-fudge', label: 'Fudge' },
                  { id: 'sec-popcorn', label: 'Popcorn' },
                ]
              : [
                  { id: 'bsec-caramel', label: 'Caramel' },
                  ...(extraFlavors.length > 0 ? [{ id: 'bsec-extras', label: 'Toffee & Extras' }] : []),
                  { id: 'bsec-fudge', label: 'Fudge' },
                  { id: 'bsec-popcorn', label: 'Popcorn' },
                ]
            ).map(({ id, label, dot }) => (
              <button
                key={id}
                onClick={() => jumpTo(id)}
                className={`press shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border shadow-sm flex items-center gap-1.5 ${
                  dot
                    ? 'bg-store-gold/15 border-store-gold/50 text-store-brown'
                    : 'bg-white border-store-tan text-store-brown-light hover:text-store-green hover:border-store-green/40'
                }`}
              >
                {dot && <span className="w-1.5 h-1.5 rounded-full bg-store-gold inline-block" />}
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── BATCHES TAB (form) ── */}
      {activeTab === 'batches' && (
        <div className="space-y-4">
          <p className="text-store-brown-light text-xs -mt-2">Log what you made today. Ingredients will be auto-deducted.</p>

          {componentBatchFlavors.filter((f) => matchesSearch(f.name)).length > 0 && (
            <div id="bsec-caramel" className="report-section">
              <p className="text-xs font-bold text-store-brown-light uppercase tracking-wide mb-2">Caramel</p>
              <div className="space-y-2">
                {componentBatchFlavors.filter((f) => matchesSearch(f.name)).map((f) => {
                  const madeBatches = batchCounts[f.id] ?? 0
                  const totalBatches = (todayBatchCounts[f.id] ?? 0) + madeBatches
                  return (
                    <div key={f.id} className="bg-store-cream rounded-xl border border-store-tan px-4 py-3 shadow-sm space-y-3">
                      <span className="text-sm font-medium text-store-brown">{f.name}</span>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-store-brown-light">Batches made</span>
                        <Stepper value={madeBatches} onChange={(v) => setBatchCounts((prev) => ({ ...prev, [f.id]: v }))} />
                      </div>
                      {totalBatches > 0 && (
                        <p className="text-xs text-store-brown-light">
                          {totalBatches} {totalBatches === 1 ? 'batch' : 'batches'} today
                          <span className="text-store-green font-medium"> · {totalBatches} {totalBatches === 1 ? 'tray' : 'trays'} — 1 batch = 1 tray</span>
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-red-400">Batches wasted</span>
                        <Stepper value={batchWasted[f.id] ?? 0} onChange={(v) => setBatchWasted((prev) => ({ ...prev, [f.id]: v }))} />
                      </div>
                      {(batchWasted[f.id] ?? 0) > 0 && (
                        <input
                          type="text"
                          value={batchWasteReason[f.id] ?? ''}
                          onChange={(ev) => setBatchWasteReason((prev) => ({ ...prev, [f.id]: ev.target.value }))}
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

          {extraFlavors.filter((f) => matchesSearch(f.name)).length > 0 && (
            <div id="bsec-extras" className="report-section">
              <p className="text-xs font-bold text-store-brown-light uppercase tracking-wide mb-2">Toffee &amp; Extras</p>
              <div className="space-y-2">
                {extraFlavors.filter((f) => matchesSearch(f.name)).map((f) => {
                  const madeBatches = batchCounts[f.id] ?? 0
                  const totalBatches = (todayBatchCounts[f.id] ?? 0) + madeBatches
                  return (
                    <div key={f.id} className="bg-store-cream rounded-xl border border-store-tan px-4 py-3 shadow-sm space-y-3">
                      <span className="text-sm font-medium text-store-brown">{f.name}</span>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-store-brown-light">Batches made</span>
                        <Stepper value={madeBatches} onChange={(v) => setBatchCounts((prev) => ({ ...prev, [f.id]: v }))} />
                      </div>
                      {totalBatches > 0 && (
                        <p className="text-xs text-store-brown-light">
                          {totalBatches} {totalBatches === 1 ? 'batch' : 'batches'} today
                          <span className="text-store-green font-medium"> · ingredients auto-deduct</span>
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-red-400">Batches wasted</span>
                        <Stepper value={batchWasted[f.id] ?? 0} onChange={(v) => setBatchWasted((prev) => ({ ...prev, [f.id]: v }))} />
                      </div>
                      {(batchWasted[f.id] ?? 0) > 0 && (
                        <input
                          type="text"
                          value={batchWasteReason[f.id] ?? ''}
                          onChange={(ev) => setBatchWasteReason((prev) => ({ ...prev, [f.id]: ev.target.value }))}
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

          {fudgeFlavors.filter((f) => matchesSearch(f.name)).length > 0 && (
            <div id="bsec-fudge" className="report-section">
              <p className="text-xs font-bold text-store-brown-light uppercase tracking-wide mb-2">Fudge</p>
              <div className="space-y-2">
                {fudgeFlavors.filter((f) => matchesSearch(f.name)).map((f) => {
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
                        <Stepper value={batchCounts[f.id] ?? 0} onChange={(v) => setBatchCounts((prev) => ({ ...prev, [f.id]: v }))} />
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

          {popcornFlavors.filter((f) => matchesSearch(f.name)).length > 0 && (
            <div id="bsec-popcorn" className="report-section">
              <p className="text-xs font-bold text-store-brown-light uppercase tracking-wide mb-2">Popcorn</p>
              <div className="space-y-2">
                {popcornFlavors.filter((f) => matchesSearch(f.name)).map((f) => {
                  const madeBatches = batchCounts[f.id] ?? 0
                  const totalBatches = (todayBatchCounts[f.id] ?? 0) + madeBatches
                  const barrelsPerBatch = f.default_yield ?? 1
                  const estimatedBarrels = totalBatches > 0 ? Math.round(totalBatches * barrelsPerBatch * 10) / 10 : 0
                  return (
                    <div key={f.id} className="bg-amber-50 rounded-xl border border-amber-200 px-4 py-3 shadow-sm space-y-3">
                      <span className="text-sm font-medium text-amber-900">{f.name}</span>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-amber-700">Batches made</span>
                        <Stepper value={madeBatches} onChange={(v) => setBatchCounts((prev) => ({ ...prev, [f.id]: v }))} />
                      </div>
                      {totalBatches > 0 && (
                        <p className="text-xs text-amber-700">
                          {totalBatches} {totalBatches === 1 ? 'batch' : 'batches'} today
                          <span className="text-amber-600 font-medium"> · ≈ {estimatedBarrels} {estimatedBarrels === 1 ? 'barrel' : 'barrels'}</span>
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-red-400">Batches wasted</span>
                        <Stepper value={batchWasted[f.id] ?? 0} onChange={(v) => setBatchWasted((prev) => ({ ...prev, [f.id]: v }))} />
                      </div>
                      {(batchWasted[f.id] ?? 0) > 0 && (
                        <input
                          type="text"
                          value={batchWasteReason[f.id] ?? ''}
                          onChange={(ev) => setBatchWasteReason((prev) => ({ ...prev, [f.id]: ev.target.value }))}
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
            className="press w-full bg-store-green hover:bg-store-green-dark text-white py-4 rounded-xl text-lg font-semibold disabled:opacity-50 touch-manipulation shadow-sm"
          >
            {batchSubmitting ? 'Logging…' : 'Log Batches'}
          </button>

          {batchResult && (
            <div className={`rounded-xl border p-4 space-y-2 animate-pop-in ${batchResult.negatives.length > 0 ? 'bg-red-50 border-red-200' : 'bg-store-green-light border-store-green'}`}>
              <p className={`font-semibold text-sm ${batchResult.negatives.length > 0 ? 'text-red-700' : 'text-store-green'}`}>
                ✓ Batches logged
              </p>
              <div className="space-y-0.5">
                {batchResult.flavors.map((f) => {
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
                  {batchResult.negatives.map((n) => (
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
              <button
                onClick={handleBatchUndo}
                disabled={batchUndoBusy}
                className="press w-full mt-1 bg-white border border-store-tan text-store-brown-light py-2.5 rounded-xl text-sm font-semibold touch-manipulation hover:text-store-coral hover:border-store-coral/40 disabled:opacity-50"
              >
                {batchUndoBusy ? 'Undoing…' : 'Undo — wrong entry'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── PRODUCTS TAB (form) ── */}
      {activeTab === 'products' && (
        <>
          {submitted ? (
            <div className="bg-store-green-light border border-store-green rounded-xl px-4 py-5 space-y-3 animate-pop-in">
              <div className="text-center">
                <p className="text-store-green font-semibold text-lg">Report submitted ✓</p>
                {pendingSummary.length > 0 && (
                  <p className="text-xs text-store-brown mt-1.5">{pendingSummary.join(' · ')}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleProductUndo}
                  disabled={undoBusy}
                  className="press flex-1 bg-white border border-store-tan text-store-brown-light py-3 rounded-xl text-sm font-semibold touch-manipulation hover:text-store-coral hover:border-store-coral/40 disabled:opacity-50"
                >
                  {undoBusy ? 'Undoing…' : 'Undo — something\'s wrong'}
                </button>
                <button
                  onClick={() => { clearInterval(redirectTimerRef.current); navigate('/') }}
                  className="press flex-1 bg-store-green hover:bg-store-green-dark text-white py-3 rounded-xl text-sm font-bold touch-manipulation shadow-sm"
                >
                  Done{redirectIn != null ? ` · ${redirectIn}s` : ''}
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-store-brown-light text-xs -mt-3">Log what's on the shelf — trays made, sold, or wasted this session.</p>

              {/* ── TODAY — flavors with direct activity + the live base notices ── */}
              {(attentionCount > 0 || baseNotices.length > 0) && (
                <div id="sec-today" className="report-section space-y-3">
                  <div className="flex items-baseline justify-between">
                    <p className="text-xs font-bold text-store-brown-light uppercase tracking-wide flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-store-gold inline-block" />
                      Today
                    </p>
                    {attentionCount > 0 && (
                      <p className="text-[11px] text-store-brown-light">{attentionCount} {attentionCount === 1 ? 'flavor' : 'flavors'}</p>
                    )}
                  </div>
                  {baseNotices.map((n) => <BaseNotice key={n.baseName} n={n} />)}
                  {fudgeAttention.map((f, i) => (
                    <FudgeCard
                      key={f.id}
                      flavor={f}
                      entry={entries[f.id] || ZERO_ENTRY}
                      derived={deriveFudge(f, entries[f.id] || ZERO_ENTRY, groupAccountedFor)}
                      onField={(field, v) => setField(f.id, field, v)}
                      open={isCardOpen(f, true)}
                      onToggle={() => handleToggle(f, true)}
                      stagger={i}
                      flash={flashIds[f.id] || 0}
                    />
                  ))}
                  {popcornAttention.map((f, i) => (
                    <PopcornCard
                      key={f.id}
                      flavor={f}
                      entry={popcornEntries[f.id] || ZERO_POPCORN}
                      derived={derivePopcorn(f, popcornEntries[f.id] || ZERO_POPCORN)}
                      onField={(field, v) => setPopcornField(f.id, field, v)}
                      threshold={barrelThresholds[f.id]}
                      onThreshold={(v) => setBarrelThresholds((prev) => ({ ...prev, [f.id]: v }))}
                      open={isCardOpen(f, true)}
                      onToggle={() => handleToggle(f, true)}
                      stagger={fudgeAttention.length + i}
                      flash={flashIds[f.id] || 0}
                    />
                  ))}
                </div>
              )}

              {/* Caramels hand-wrapped — compact collapsible */}
              <div id="sec-caramels" className="report-section space-y-3">
                <p className="text-xs font-bold text-store-brown-light uppercase tracking-wide">Caramels</p>
                <div className="bg-store-cream rounded-xl border border-store-tan shadow-sm">
                  <button
                    type="button"
                    onClick={() => setOpenCaramels(!caramelsOpen)}
                    className="w-full text-left px-4 py-3.5 flex items-center justify-between gap-2 touch-manipulation"
                    aria-expanded={caramelsOpen}
                  >
                    <div>
                      <p className="font-semibold text-store-brown">Caramels Hand Wrapped</p>
                      <p className="text-xs text-store-brown-light mt-0.5">
                        {caramelsHandWrapped > 0 ? `${caramelsHandWrapped}/18 of a tray` : 'Wrapped caramels off the caramel tray'}
                      </p>
                    </div>
                    <span className={`text-store-brown-light shrink-0 transition-transform duration-200 ${caramelsOpen ? 'rotate-180' : ''}`}>▾</span>
                  </button>
                  <Collapsible open={caramelsOpen}>
                    <div className="px-4 pb-4 space-y-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setCaramelsHandWrapped((v) => Math.max(0, v - 1))}
                          className="w-12 h-12 rounded-xl bg-store-tan text-store-brown text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform select-none touch-manipulation"
                          aria-label="Decrease"
                        >−</button>
                        <div className="flex items-baseline gap-0.5 w-16 justify-center">
                          <span className="text-2xl font-bold text-store-brown tabular-nums select-none">{caramelsHandWrapped}</span>
                          <span className="text-sm text-store-brown-light select-none">/18</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCaramelsHandWrapped((v) => v + 1)}
                          className="w-12 h-12 rounded-xl bg-store-tan text-store-brown text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform select-none touch-manipulation"
                          aria-label="Increase"
                        >+</button>
                      </div>
                      <p className="text-xs text-store-brown-light">Each step = 1/18 tray. 18 steps = 1 full caramel tray.</p>
                    </div>
                  </Collapsible>
                </div>
              </div>

              {/* Fudge pops — compact collapsible */}
              <div id="sec-pops" className="report-section space-y-3">
                <p className="text-xs font-bold text-store-brown-light uppercase tracking-wide">Fudge Pops</p>
                <div className="bg-store-cream rounded-xl border border-store-tan shadow-sm">
                  <button
                    type="button"
                    onClick={() => setOpenPops(!popsOpen)}
                    className="w-full text-left px-4 py-3.5 flex items-center justify-between gap-2 touch-manipulation"
                    aria-expanded={popsOpen}
                  >
                    <div>
                      <p className="font-semibold text-store-brown">Fudge Pops</p>
                      <p className="text-xs text-store-brown-light mt-0.5">
                        {fudgePops.vanilla + fudgePops.chocolate > 0
                          ? `${fudgePops.vanilla + fudgePops.chocolate} pops this session`
                          : `Log pops so their base batch is accounted for · ~${POPS_PER_SESSION} ≈ 1 tray`}
                      </p>
                    </div>
                    <span className={`text-store-brown-light shrink-0 transition-transform duration-200 ${popsOpen ? 'rotate-180' : ''}`}>▾</span>
                  </button>
                  <Collapsible open={popsOpen}>
                    <div className="px-4 pb-4 space-y-3">
                      {['vanilla', 'chocolate'].map((base) => (
                        <div key={base} className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-store-brown capitalize">{base}</p>
                            {fudgePops[base] > 0 && (
                              <p className="text-xs text-store-brown-light mt-0.5">≈ {(fudgePops[base] / POPS_PER_SESSION).toFixed(2)} tray</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setFudgePops((v) => ({ ...v, [base]: Math.max(0, v[base] - 5) }))}
                              className="w-12 h-12 rounded-xl bg-store-tan text-store-brown text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform select-none touch-manipulation"
                              aria-label="Decrease"
                            >−</button>
                            <div className="flex items-baseline gap-0.5 w-16 justify-center">
                              <span className="text-2xl font-bold text-store-brown tabular-nums select-none">{fudgePops[base]}</span>
                              <span className="text-sm text-store-brown-light select-none">pops</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setFudgePops((v) => ({ ...v, [base]: v[base] + 5 }))}
                              className="w-12 h-12 rounded-xl bg-store-tan text-store-brown text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform select-none touch-manipulation"
                              aria-label="Increase"
                            >+</button>
                          </div>
                        </div>
                      ))}
                      <p className="text-xs text-store-brown-light">Each step = 5 pops (¼ tray). Toppings auto-deduct.</p>
                    </div>
                  </Collapsible>
                </div>
              </div>

              {/* ── FUDGE — everything else, collapsed until tapped ── */}
              {fudgeRest.length > 0 && (
                <div id="sec-fudge" className="report-section space-y-3">
                  <p className="text-xs font-bold text-store-brown-light uppercase tracking-wide">
                    Fudge{attentionCount > 0 ? ' — all flavors' : ''}
                  </p>
                  {fudgeRest.map((f, i) => (
                    <FudgeCard
                      key={f.id}
                      flavor={f}
                      entry={entries[f.id] || ZERO_ENTRY}
                      derived={deriveFudge(f, entries[f.id] || ZERO_ENTRY, groupAccountedFor)}
                      onField={(field, v) => setField(f.id, field, v)}
                      open={isCardOpen(f, false)}
                      onToggle={() => handleToggle(f, false)}
                      stagger={i}
                      flash={flashIds[f.id] || 0}
                    />
                  ))}
                </div>
              )}

              {/* ── POPCORN — everything else ── */}
              {popcornRest.length > 0 && (
                <div id="sec-popcorn" className="report-section space-y-3">
                  <p className="text-xs font-bold text-store-brown-light uppercase tracking-wide">
                    Popcorn{popcornAttention.length > 0 ? ' — all flavors' : ''}
                  </p>
                  {popcornRest.map((f, i) => (
                    <PopcornCard
                      key={f.id}
                      flavor={f}
                      entry={popcornEntries[f.id] || ZERO_POPCORN}
                      derived={derivePopcorn(f, popcornEntries[f.id] || ZERO_POPCORN)}
                      onField={(field, v) => setPopcornField(f.id, field, v)}
                      threshold={barrelThresholds[f.id]}
                      onThreshold={(v) => setBarrelThresholds((prev) => ({ ...prev, [f.id]: v }))}
                      open={isCardOpen(f, false)}
                      onToggle={() => handleToggle(f, false)}
                      stagger={i}
                      flash={flashIds[f.id] || 0}
                    />
                  ))}
                </div>
              )}

              {search.trim() && fudgeAttention.length + fudgeRest.length + popcornAttention.length + popcornRest.length === 0 && (
                <p className="text-sm text-store-brown-light text-center py-4">No flavors match “{search.trim()}”.</p>
              )}

              {/* Pending summary + submit */}
              <div className="space-y-3">
                <Collapsible open={pendingSummary.length > 0}>
                  <div className="bg-white border border-store-green/40 rounded-xl px-4 py-3">
                    <p className="text-[11px] font-bold text-store-green uppercase tracking-wide mb-1">Will submit</p>
                    <p className="text-xs text-store-brown leading-relaxed">{pendingSummary.join(' · ')}</p>
                  </div>
                </Collapsible>
                <button
                  onClick={handleProductSubmit}
                  disabled={submitting || !hasAnyProductInput}
                  className="press w-full bg-store-green hover:bg-store-green-dark text-white py-4 rounded-xl text-lg font-semibold disabled:opacity-50 touch-manipulation shadow-sm"
                >
                  {submitting ? 'Submitting…' : 'Submit Product Report'}
                </button>
              </div>
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
                  className="press w-full bg-store-brown text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 touch-manipulation hover:opacity-90 shadow-sm"
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
                  className="press w-full bg-store-green hover:bg-store-green-dark text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 touch-manipulation shadow-sm"
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

// ONE notice per base group still owed trays today — replaces the old behavior of
// hoisting every sibling flavor into "Today". Counts down live as trays (or pops) are
// entered anywhere in the group and disappears the moment the batch is accounted for.
function BaseNotice({ n }) {
  const remaining = Math.max(0, Math.round((n.expected - n.actual) * 10) / 10)
  return (
    <div className="bg-store-gold/10 border border-store-gold/30 rounded-xl px-4 py-3 animate-fade-in-up">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-store-brown flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-store-gold inline-block animate-pulse" />
          {n.baseName} base — {n.batches} {n.batches === 1 ? 'batch' : 'batches'} today
        </p>
        <span className="text-[11px] font-bold text-store-brown bg-store-gold/20 border border-store-gold/40 rounded-full px-2 py-0.5 shrink-0 tabular-nums">
          {remaining} {remaining === 1 ? 'tray' : 'trays'} to enter
        </span>
      </div>
      <p className="text-xs text-store-brown-light mt-1">
        Enter trays under any {n.baseName.toLowerCase()}-base flavor{n.baseName === 'Vanilla' || n.baseName === 'Chocolate' ? ' (or fudge pops)' : ''} — this clears once the whole batch is accounted for.
      </p>
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
