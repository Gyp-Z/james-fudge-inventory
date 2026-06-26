// Client-agnostic core tool logic for James' Fudge.
//
// Every DB-touching function takes a Supabase client (`sb`) as its first argument, so the
// SAME logic runs in three places: the browser app (anon client, RLS), the in-app Jarvis
// chat, and the local MCP server (Node, service-role client). This is the single source of
// truth for all reads and writes — no rounding in any deduction path, two-phase deduction
// kept separate, caramel computed forward, SSC caramel only at tray time.
//
// The browser keeps using src/utils/inventoryActions.js and src/utils/autoDeduct.js, which
// are thin wrappers that bind the browser client to these functions (signatures unchanged).

import { todayEastern } from '../utils/dates.js'
import { PRODUCTION_MANUAL } from './productionManual.js'

// ─────────────────────────────────────────────────────────────────────────────
// SEASON MODEL — year-agnostic so the app transitions itself season after season
// with NO code edits. Boundaries are MONTH/DAY: they apply to whatever year a date
// falls in. The ONLY per-year value is `anchorYear` (excludes that year's pre-season
// test data). NOTHING here ever writes a threshold — seasonPhase only chooses which
// logic path runs; stored low_tray_threshold values are read-only and simply stop
// being consulted for fudge once wind-down begins.
// ─────────────────────────────────────────────────────────────────────────────
export const SEASON_CONFIG = {
  openMonthDay: '04-22',          // season opens (~late April)
  fudgeWinddownMonthDay: '08-14', // fudge sell-down begins (sharp taper; top sellers only after)
  closeMonthDay: '10-13',         // store closes; target ~zero leftover fudge
  anchorYear: 2026,               // ONLY per-year knob — the running-total / test-data anchor
}

// Back-compat: existing callers import/use this string. Derived from the config.
const SEASON_START = `${SEASON_CONFIG.anchorYear}-${SEASON_CONFIG.openMonthDay}`
const CARAMEL_TRAYS_PER_SSC_TRAY = 1 / 18
const isSSC = (name) => (name ?? '').toLowerCase().includes('sea salt')

// Phase from a date's month/day (default: today Eastern). Year-agnostic.
//   preseason → before the season opens (e.g. winter / early spring)
//   peak      → open through the day before fudge wind-down
//   winddown  → fudge sell-down window (mid-Aug through close day)
//   closed    → after the store closes for the year
export function seasonPhase(dateStr = todayEastern()) {
  const md = (dateStr ?? '').slice(5, 10) // 'MM-DD'
  if (!md) return 'peak'
  if (md < SEASON_CONFIG.openMonthDay) return 'preseason'
  if (md < SEASON_CONFIG.fudgeWinddownMonthDay) return 'peak'
  if (md <= SEASON_CONFIG.closeMonthDay) return 'winddown'
  return 'closed'
}

// Close date resolved in the SAME year as the given date, and whole days until it.
export function seasonCloseDate(dateStr = todayEastern()) {
  const year = (dateStr ?? '').slice(0, 4) || String(SEASON_CONFIG.anchorYear)
  return `${year}-${SEASON_CONFIG.closeMonthDay}`
}
export function daysUntilClose(dateStr = todayEastern()) {
  const close = seasonCloseDate(dateStr)
  const ms = new Date(`${close}T00:00:00`) - new Date(`${dateStr}T00:00:00`)
  return Math.round(ms / 86400000)
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCH-PHASE DEDUCTION
// ─────────────────────────────────────────────────────────────────────────────

export async function autoDeductIngredients(sb, flavorId, batchLogId) {
  const { data: recipes, error } = await sb
    .from('recipes')
    .select('ingredient_id, quantity_per_batch, unit, ingredients(name)')
    .eq('flavor_id', flavorId)
    .eq('deduction_phase', 'batch')
  if (error || !recipes || recipes.length === 0) return { deductions: [], negatives: [], skipped: [] }

  const names = [...new Set(recipes.map((r) => r.ingredients?.name).filter(Boolean))]
  if (names.length === 0) return { deductions: [], negatives: [], skipped: [] }

  const { data: activeIngs } = await sb
    .from('ingredients')
    .select('id, name, quantity, unit, container_size, container_unit')
    .in('name', names)
    .eq('is_active', true)

  const activeIngMap = new Map()
  for (const ing of activeIngs ?? []) {
    const existing = activeIngMap.get(ing.name)
    if (!existing || (ing.container_size != null && existing.container_size == null)) activeIngMap.set(ing.name, ing)
  }

  const deductions = [], negatives = [], skipped = []
  for (const r of recipes) {
    const ingName = r.ingredients?.name
    if (!ingName) continue
    const activeIng = activeIngMap.get(ingName)
    if (!activeIng) { skipped.push({ name: ingName, reason: 'no active row' }); continue }
    if (activeIng.container_size == null) { skipped.push({ name: ingName, reason: 'container_size not set' }); continue }

    const deliveryQty = r.quantity_per_batch / activeIng.container_size
    const newQty = (activeIng.quantity ?? 0) - deliveryQty
    await Promise.all([
      sb.from('ingredients').update({ quantity: newQty }).eq('id', activeIng.id),
      sb.from('ingredient_deductions').insert({
        batch_log_id: batchLogId,
        ingredient_id: activeIng.id,
        quantity_deducted: deliveryQty,
        unit: activeIng.unit,
        notes: `${r.quantity_per_batch} ${r.unit} ÷ ${activeIng.container_size} = ${deliveryQty.toFixed(4)} ${activeIng.unit}`,
      }),
    ])
    const entry = { ingredient_id: activeIng.id, name: ingName, quantity_deducted: deliveryQty, unit: activeIng.unit, new_quantity: newQty }
    deductions.push(entry)
    if (newQty < 0) negatives.push(entry)
    activeIngMap.set(ingName, { ...activeIng, quantity: newQty })
  }
  return { deductions, negatives, skipped }
}

// ─────────────────────────────────────────────────────────────────────────────
// TRAY-PHASE DEDUCTION
// ─────────────────────────────────────────────────────────────────────────────

export async function autoDeductTrayIngredients(sb, flavorId, fullTrays, shiftReportEntryId = null) {
  if (!fullTrays || fullTrays <= 0) return { deductions: [], negatives: [], skipped: [] }

  const { data: recipes, error } = await sb
    .from('recipes')
    .select('ingredient_id, quantity_per_batch, unit, ingredients(name)')
    .eq('flavor_id', flavorId)
    .eq('deduction_phase', 'tray')
  if (error || !recipes || recipes.length === 0) return { deductions: [], negatives: [], skipped: [] }

  const names = [...new Set(recipes.map((r) => r.ingredients?.name).filter(Boolean))]
  if (names.length === 0) return { deductions: [], negatives: [], skipped: [] }

  const { data: activeIngs } = await sb
    .from('ingredients')
    .select('id, name, quantity, unit, container_size, container_unit')
    .in('name', names)
    .eq('is_active', true)

  const activeIngMap = new Map()
  for (const ing of activeIngs ?? []) {
    const existing = activeIngMap.get(ing.name)
    if (!existing || (ing.container_size != null && existing.container_size == null)) activeIngMap.set(ing.name, ing)
  }

  const deductions = [], negatives = [], skipped = []
  for (const r of recipes) {
    const ingName = r.ingredients?.name
    if (!ingName) continue
    const activeIng = activeIngMap.get(ingName)
    if (!activeIng) { skipped.push({ name: ingName, reason: 'no active row' }); continue }
    if (activeIng.container_size == null) { skipped.push({ name: ingName, reason: 'container_size not set' }); continue }

    const totalRecipeQty = r.quantity_per_batch * fullTrays
    const deliveryQty = totalRecipeQty / activeIng.container_size
    const newQty = (activeIng.quantity ?? 0) - deliveryQty
    await Promise.all([
      sb.from('ingredients').update({ quantity: newQty }).eq('id', activeIng.id),
      sb.from('ingredient_deductions').insert({
        shift_report_entry_id: shiftReportEntryId,
        ingredient_id: activeIng.id,
        quantity_deducted: deliveryQty,
        unit: activeIng.unit,
        notes: `${totalRecipeQty} ${r.unit} (${fullTrays} trays × ${r.quantity_per_batch}) ÷ ${activeIng.container_size} = ${deliveryQty.toFixed(4)} ${activeIng.unit}`,
      }),
    ])
    const entry = { ingredient_id: activeIng.id, name: ingName, quantity_deducted: deliveryQty, unit: activeIng.unit, new_quantity: newQty }
    deductions.push(entry)
    if (newQty < 0) negatives.push(entry)
    activeIngMap.set(ingName, { ...activeIng, quantity: newQty })
  }
  return { deductions, negatives, skipped }
}

// ─────────────────────────────────────────────────────────────────────────────
// CARAMEL (SSC) — deduct at tray time only; credit is the exact inverse
// ─────────────────────────────────────────────────────────────────────────────

export async function deductCaramelComponent(sb, flavorName, batchYield) {
  if (!isSSC(flavorName)) return
  const caramelUsed = batchYield * CARAMEL_TRAYS_PER_SSC_TRAY
  const { data: caramelFlavor } = await sb.from('flavors').select('id').eq('name', 'Caramel').eq('is_component', true).single()
  if (!caramelFlavor) return
  const { data: inv } = await sb.from('current_inventory').select('tray_count').eq('flavor_id', caramelFlavor.id).single()
  const newCount = Math.max(0, (inv?.tray_count ?? 0) - caramelUsed)
  await sb.from('current_inventory').upsert({ flavor_id: caramelFlavor.id, tray_count: newCount }, { onConflict: 'flavor_id' })
}

export async function creditCaramelComponent(sb, flavorName, trays) {
  if (!isSSC(flavorName) || !trays || trays <= 0) return
  const caramelUsed = trays * CARAMEL_TRAYS_PER_SSC_TRAY
  const { data: caramelFlavor } = await sb.from('flavors').select('id').eq('name', 'Caramel').eq('is_component', true).single()
  if (!caramelFlavor) return
  const { data: inv } = await sb.from('current_inventory').select('tray_count').eq('flavor_id', caramelFlavor.id).single()
  const newCount = (inv?.tray_count ?? 0) + caramelUsed
  await sb.from('current_inventory').upsert({ flavor_id: caramelFlavor.id, tray_count: newCount }, { onConflict: 'flavor_id' })
}

// ─────────────────────────────────────────────────────────────────────────────
// FUDGE POPS — small pops made from a Vanilla or Chocolate base. Not sold
// individually; logging them records that part of a base batch went to pops. The
// Products-tab reminder math credits the base trays (~20 pops = 1 tray); here we only
// deduct the per-pop TOPPINGS. No base-ingredient deduction — the base batch already did
// that. Each topping = half its per-tray rate across a full POPS_PER_SESSION run, scaled
// linearly by actual pop count. No rounding in the math (toFixed is display-only).
// ─────────────────────────────────────────────────────────────────────────────

export const POPS_PER_SESSION = 20

// perSession = oz per full ~20-pop run = half the topping's normal per-tray amount.
// Names must match active ingredient rows; unconfigured/missing ones are skipped, same
// as the other deduction phases (e.g. Sprinkles before its migration is applied).
export const FUDGE_POP_TOPPINGS = {
  vanilla: [
    { name: 'M&Ms',            unit: 'oz', perSession: 5.6 },
    { name: 'Chocolate Chips', unit: 'oz', perSession: 3.2 },
    { name: 'Oreo Pieces',     unit: 'oz', perSession: 3.2 },
    { name: 'Sprinkles',       unit: 'oz', perSession: 3.2 },
  ],
  chocolate: [
    { name: 'Oreo Pieces',     unit: 'oz', perSession: 3.2 },
    { name: 'M&Ms',            unit: 'oz', perSession: 5.6 },
    { name: 'Reeses Pieces',   unit: 'oz', perSession: 5.6 },
    { name: 'Sprinkles',       unit: 'oz', perSession: 3.2 },
  ],
}

// Insert a fudge_pop_logs row and deduct its toppings. Returns the log id + deduction
// summary. Used by the Products tab; client-agnostic so Jarvis/MCP can call it too.
export async function logFudgePops(sb, base, popCount, dateStr = todayEastern()) {
  const key = (base ?? '').toLowerCase()
  if (!FUDGE_POP_TOPPINGS[key] || !popCount || popCount <= 0) {
    return { logId: null, deductions: [], negatives: [], skipped: [] }
  }
  const { data: log, error } = await sb
    .from('fudge_pop_logs')
    .insert({ base: key, pop_count: popCount, report_date: dateStr })
    .select('id')
    .single()
  if (error || !log) return { logId: null, deductions: [], negatives: [], skipped: [], error }
  const result = await deductFudgePopToppings(sb, key, popCount, log.id)
  return { logId: log.id, ...result }
}

export async function deductFudgePopToppings(sb, base, popCount, fudgePopLogId = null) {
  const key = (base ?? '').toLowerCase()
  const toppings = FUDGE_POP_TOPPINGS[key]
  if (!toppings || !popCount || popCount <= 0) return { deductions: [], negatives: [], skipped: [] }

  const sessionFraction = popCount / POPS_PER_SESSION
  const names = [...new Set(toppings.map((t) => t.name))]

  const { data: activeIngs } = await sb
    .from('ingredients')
    .select('id, name, quantity, unit, container_size, container_unit')
    .in('name', names)
    .eq('is_active', true)

  const activeIngMap = new Map()
  for (const ing of activeIngs ?? []) {
    const existing = activeIngMap.get(ing.name)
    if (!existing || (ing.container_size != null && existing.container_size == null)) activeIngMap.set(ing.name, ing)
  }

  const deductions = [], negatives = [], skipped = []
  for (const t of toppings) {
    const activeIng = activeIngMap.get(t.name)
    if (!activeIng) { skipped.push({ name: t.name, reason: 'no active row' }); continue }
    if (activeIng.container_size == null) { skipped.push({ name: t.name, reason: 'container_size not set' }); continue }

    const totalRecipeQty = t.perSession * sessionFraction
    const deliveryQty = totalRecipeQty / activeIng.container_size
    const newQty = (activeIng.quantity ?? 0) - deliveryQty
    await Promise.all([
      sb.from('ingredients').update({ quantity: newQty }).eq('id', activeIng.id),
      sb.from('ingredient_deductions').insert({
        fudge_pop_log_id: fudgePopLogId,
        ingredient_id: activeIng.id,
        quantity_deducted: deliveryQty,
        unit: activeIng.unit,
        notes: `${key} fudge pops: ${totalRecipeQty} ${t.unit} (${popCount} pops × ${t.perSession / POPS_PER_SESSION}/pop) ÷ ${activeIng.container_size} = ${deliveryQty.toFixed(4)} ${activeIng.unit}`,
      }),
    ])
    const entry = { ingredient_id: activeIng.id, name: t.name, quantity_deducted: deliveryQty, unit: activeIng.unit, new_quantity: newQty }
    deductions.push(entry)
    if (newQty < 0) negatives.push(entry)
    activeIngMap.set(t.name, { ...activeIng, quantity: newQty })
  }
  return { deductions, negatives, skipped }
}

export async function incrementBarrelCount(sb, flavorId, amount) {
  const { data } = await sb.from('current_inventory').select('barrel_count').eq('flavor_id', flavorId).single()
  const newCount = (data?.barrel_count ?? 0) + amount
  await sb.from('current_inventory').upsert({ flavor_id: flavorId, barrel_count: newCount }, { onConflict: 'flavor_id' })
}

// ─────────────────────────────────────────────────────────────────────────────
// POPCORN BARREL ENTRIES — the popcorn equivalent of applyShiftEntry. Barrels move
// only here, never at batch time (popcorn batches deduct ingredients only). Mirrors the
// ShiftReport Products-tab popcorn submit: barrels_added top up the shelf (and "top" any
// in-progress barrels), barrels_sold (= bucketing popcorn off the shelf, e.g. bucketing
// Caramel Corn, which is a SALE) draw it down, in_progress_barrels stage half-made barrels.
// Movement is logged to shelf_bucket_logs so it shows in Analytics + sales velocity.
// ─────────────────────────────────────────────────────────────────────────────

export async function applyPopcornEntry(sb, flavor, dateStr, values) {
  const barrelsAdded = values.barrels_added ?? 0
  const barrelsSold = values.barrels_sold ?? 0
  const newInProgBarrels = values.in_progress_barrels ?? 0

  const { data: inv } = await sb
    .from('current_inventory')
    .select('barrel_count, in_progress_barrel_count')
    .eq('flavor_id', flavor.id)
    .single()
  const existingInProg = inv?.in_progress_barrel_count ?? 0
  const topped = Math.min(barrelsAdded, existingInProg)
  const netChange = barrelsAdded - barrelsSold
  const newBarrels = Math.max(0, (inv?.barrel_count ?? 0) + netChange)
  const newInProg = Math.max(0, existingInProg + newInProgBarrels - topped)

  if (netChange !== 0 || newInProgBarrels !== 0 || topped !== 0) {
    await sb.from('current_inventory').upsert(
      { flavor_id: flavor.id, barrel_count: newBarrels, in_progress_barrel_count: newInProg, updated_at: new Date().toISOString() },
      { onConflict: 'flavor_id' }
    )
  }

  // Log barrel movement. shelf_bucket_logs is dated by logged_at only (no report_date),
  // so backdate the timestamp when fixing a past day.
  let logId = null
  if (barrelsAdded > 0 || barrelsSold > 0) {
    const logEntry = { flavor_id: flavor.id }
    if (barrelsAdded > 0) logEntry.barrels_added = barrelsAdded
    if (barrelsSold > 0) logEntry.barrels_used = barrelsSold
    if (dateStr && dateStr !== todayEastern()) logEntry.logged_at = `${dateStr}T12:00:00`
    const { data: log } = await sb.from('shelf_bucket_logs').insert(logEntry).select('id').single()
    logId = log?.id ?? null
  }
  return { logId, newBarrels, newInProg, topped }
}

// Reverse a single shelf_bucket_logs movement: undo its net barrel change and delete the
// row. The in-progress "topping" at log time isn't stored, so that term can't be perfectly
// inverted — the Direct Inventory Correction tool is the safety net for in-progress drift.
export async function reversePopcornEntry(sb, logId) {
  const { data: log } = await sb
    .from('shelf_bucket_logs')
    .select('flavor_id, barrels_added, barrels_used')
    .eq('id', logId)
    .single()
  if (!log) return { success: false, error: 'Barrel movement not found' }
  const net = (log.barrels_added ?? 0) - (log.barrels_used ?? 0)
  if (net !== 0) {
    const { data: inv } = await sb.from('current_inventory').select('barrel_count').eq('flavor_id', log.flavor_id).single()
    if (inv) await sb.from('current_inventory').update({ barrel_count: Math.max(0, (inv.barrel_count ?? 0) - net) }).eq('flavor_id', log.flavor_id)
  }
  const { error: delErr } = await sb.from('shelf_bucket_logs').delete().eq('id', logId)
  if (delErr) return { success: false, error: delErr.message }
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCH LOGGING + REVERT
// ─────────────────────────────────────────────────────────────────────────────

export async function logBatchWithEffects(sb, flavor, dateStr, { isWasted = false, wasteReason = null } = {}) {
  const { data: inserted, error } = await sb
    .from('batch_logs')
    .insert({ flavor_id: flavor.id, batch_date: dateStr, is_wasted: isWasted, ...(isWasted && wasteReason ? { waste_reason: wasteReason } : {}) })
    .select('id')
    .single()
  if (error || !inserted) return { batchLogId: null, deductions: [], negatives: [], skipped: [], error: error?.message }

  let result = { deductions: [], negatives: [], skipped: [] }
  if (!isWasted) result = await autoDeductIngredients(sb, flavor.id, inserted.id)

  // Component flavors (Caramel): 1 batch = 1 tray. Popcorn batches do NOT touch barrels.
  if (flavor.is_component && !isWasted) {
    const { data: inv } = await sb.from('current_inventory').select('tray_count').eq('flavor_id', flavor.id).single()
    await sb.from('current_inventory').upsert({ flavor_id: flavor.id, tray_count: (inv?.tray_count ?? 0) + 1 }, { onConflict: 'flavor_id' })
  }
  return { batchLogId: inserted.id, ...result }
}

export async function revertBatchLog(sb, batchLogId) {
  const { data: batch, error: bErr } = await sb
    .from('batch_logs')
    .select('flavor_id, is_wasted, created_at, tray_count, batch_quantity, flavors(name, product_type, is_component, default_yield)')
    .eq('id', batchLogId)
    .single()
  if (bErr || !batch) return { success: false, error: bErr?.message || 'Batch not found' }

  const flavor = batch.flavors
  const flavorId = batch.flavor_id
  const isComponent = flavor?.is_component
  const isWasted = batch.is_wasted

  const { data: deductions, error: dErr } = await sb.from('ingredient_deductions').select('*').eq('batch_log_id', batchLogId)
  if (dErr) return { success: false, error: dErr.message }

  if (deductions && deductions.length > 0) {
    const ingIds = deductions.map((d) => d.ingredient_id)
    const { data: activeIngs } = await sb.from('ingredients').select('id, name, quantity').in('id', ingIds).eq('is_active', true)
    if (activeIngs) {
      for (const d of deductions) {
        const activeIng = activeIngs.find((i) => i.id === d.ingredient_id)
        if (activeIng) {
          const newQty = Math.round(((activeIng.quantity ?? 0) + d.quantity_deducted) * 10000) / 10000
          await sb.from('ingredients').update({ quantity: newQty }).eq('id', activeIng.id)
        }
      }
    }
  }

  // Popcorn batches never added barrels, so revert must not touch them. (intentional)

  if (isComponent && !isWasted) {
    const { data: inv } = await sb.from('current_inventory').select('tray_count').eq('flavor_id', flavorId).single()
    if (inv) {
      const newCount = Math.max(0, (inv.tray_count ?? 0) - 1)
      await sb.from('current_inventory').update({ tray_count: newCount }).eq('flavor_id', flavorId)
    }
  }

  await sb.from('ingredient_deductions').delete().eq('batch_log_id', batchLogId)
  const { error: delErr } = await sb.from('batch_logs').delete().eq('id', batchLogId)
  if (delErr) return { success: false, error: delErr.message }
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// SHIFT (PRODUCT) ENTRIES
// ─────────────────────────────────────────────────────────────────────────────

export function computeTrayInventory(values, currentTrayCount, currentInProgress) {
  const made = values.full_trays ?? 0
  const newInProg = values.in_progress_trays ?? 0
  const sold = values.trays_sold ?? 0
  const fullWasted = values.trays_wasted ?? 0
  const inProgWasted = values.in_progress_wasted ?? 0
  const existingInProg = currentInProgress ?? 0
  const topped = Math.min(made, existingInProg)
  return {
    tray_count: Math.max(0, (currentTrayCount ?? 0) + made - sold - fullWasted),
    in_progress_count: Math.max(0, existingInProg + newInProg - topped - inProgWasted),
  }
}

export async function applyTrayDeductions(sb, flavor, fullTrays, entryId = null) {
  if (!fullTrays || fullTrays <= 0) return { deductions: [], negatives: [], skipped: [] }
  const result = await autoDeductTrayIngredients(sb, flavor.id, fullTrays, entryId)
  if (isSSC(flavor.name)) await deductCaramelComponent(sb, flavor.name, fullTrays)
  return result
}

export async function applyShiftEntry(sb, flavor, dateStr, values, { reportType = 'manual_adjustment', loggedBy = null } = {}) {
  let reportId
  const { data: reports } = await sb.from('shift_reports').select('id').eq('report_date', dateStr).eq('report_type', reportType).limit(1)
  reportId = reports?.[0]?.id
  if (!reportId) {
    const { data: rpt, error: rptErr } = await sb.from('shift_reports').insert({ report_date: dateStr, report_type: reportType, logged_by: loggedBy }).select('id').single()
    if (rptErr || !rpt) return { entryId: null, error: rptErr?.message || 'Could not create report' }
    reportId = rpt.id
  }

  const { data: entry, error: entryErr } = await sb
    .from('shift_report_entries')
    .insert({
      report_id: reportId,
      flavor_id: flavor.id,
      full_trays: values.full_trays ?? 0,
      in_progress_trays: values.in_progress_trays ?? 0,
      trays_sold: values.trays_sold ?? 0,
      trays_wasted: values.trays_wasted ?? 0,
      in_progress_wasted: values.in_progress_wasted ?? 0,
      waste_reason: values.waste_reason?.trim() || null,
    })
    .select('id')
    .single()
  if (entryErr || !entry) return { entryId: null, error: entryErr?.message || 'Could not create entry' }

  const { data: inv } = await sb.from('current_inventory').select('tray_count, in_progress_count').eq('flavor_id', flavor.id).single()
  const next = computeTrayInventory(values, inv?.tray_count ?? 0, inv?.in_progress_count ?? 0)
  await sb.from('current_inventory').upsert(
    { flavor_id: flavor.id, tray_count: next.tray_count, in_progress_count: next.in_progress_count, updated_at: new Date().toISOString() },
    { onConflict: 'flavor_id' }
  )

  await applyTrayDeductions(sb, flavor, values.full_trays ?? 0, entry.id)
  return { entryId: entry.id }
}

async function refundTrayDeductionsFromRecipe(sb, flavorId, fullTrays) {
  if (!fullTrays || fullTrays <= 0) return
  const { data: recipes } = await sb
    .from('recipes')
    .select('quantity_per_batch, ingredients(name)')
    .eq('flavor_id', flavorId)
    .eq('deduction_phase', 'tray')
  if (!recipes || recipes.length === 0) return
  const names = [...new Set(recipes.map((r) => r.ingredients?.name).filter(Boolean))]
  if (names.length === 0) return
  const { data: activeIngs } = await sb.from('ingredients').select('id, name, quantity, container_size').in('name', names).eq('is_active', true)
  const map = new Map()
  for (const ing of activeIngs ?? []) {
    const existing = map.get(ing.name)
    if (!existing || (ing.container_size != null && existing.container_size == null)) map.set(ing.name, ing)
  }
  for (const r of recipes) {
    const ing = map.get(r.ingredients?.name)
    if (!ing || ing.container_size == null) continue
    const deliveryQty = (r.quantity_per_batch * fullTrays) / ing.container_size
    const newQty = (ing.quantity ?? 0) + deliveryQty
    await sb.from('ingredients').update({ quantity: newQty }).eq('id', ing.id)
    map.set(ing.name, { ...ing, quantity: newQty })
  }
}

export async function reverseShiftEntry(sb, entryId) {
  const { data: entry, error } = await sb
    .from('shift_report_entries')
    .select('id, flavor_id, full_trays, in_progress_trays, trays_sold, trays_wasted, in_progress_wasted, flavors(name, is_component, product_type)')
    .eq('id', entryId)
    .single()
  if (error || !entry) return { success: false, error: error?.message || 'Entry not found' }
  const flavor = entry.flavors

  const { data: deductions } = await sb.from('ingredient_deductions').select('*').eq('shift_report_entry_id', entryId)
  let legacy = false
  if (deductions && deductions.length > 0) {
    const ingIds = deductions.map((d) => d.ingredient_id)
    const { data: activeIngs } = await sb.from('ingredients').select('id, quantity').in('id', ingIds).eq('is_active', true)
    if (activeIngs) {
      for (const d of deductions) {
        const ing = activeIngs.find((i) => i.id === d.ingredient_id)
        if (ing) await sb.from('ingredients').update({ quantity: (ing.quantity ?? 0) + d.quantity_deducted }).eq('id', ing.id)
      }
    }
    await sb.from('ingredient_deductions').delete().eq('shift_report_entry_id', entryId)
  } else if ((entry.full_trays ?? 0) > 0) {
    legacy = true
    await refundTrayDeductionsFromRecipe(sb, entry.flavor_id, entry.full_trays)
  }

  if (flavor?.name) await creditCaramelComponent(sb, flavor.name, entry.full_trays ?? 0)

  const made = entry.full_trays ?? 0
  const sold = entry.trays_sold ?? 0
  const fullWasted = entry.trays_wasted ?? 0
  const newInProg = entry.in_progress_trays ?? 0
  const inProgWasted = entry.in_progress_wasted ?? 0
  const trayDelta = made - sold - fullWasted
  const inProgDelta = newInProg - inProgWasted

  const { data: inv } = await sb.from('current_inventory').select('tray_count, in_progress_count').eq('flavor_id', entry.flavor_id).single()
  if (inv) {
    await sb.from('current_inventory').update({
      tray_count: Math.max(0, (inv.tray_count ?? 0) - trayDelta),
      in_progress_count: Math.max(0, (inv.in_progress_count ?? 0) - inProgDelta),
      updated_at: new Date().toISOString(),
    }).eq('flavor_id', entry.flavor_id)
  }

  const { error: delErr } = await sb.from('shift_report_entries').delete().eq('id', entryId)
  if (delErr) return { success: false, error: delErr.message }
  return { success: true, legacy }
}

export async function logInventoryAdjustment(sb, { target_type, target_id, field, old_value, new_value, reason, adjusted_by = null }) {
  const { error } = await sb.from('inventory_adjustments').insert({
    target_type, target_id, field,
    old_value: old_value ?? null,
    new_value: new_value ?? null,
    reason: reason?.trim() || null,
    adjusted_by,
  })
  return { error: error?.message }
}

// ─────────────────────────────────────────────────────────────────────────────
// READ / ANALYTICS (for Jarvis)
// ─────────────────────────────────────────────────────────────────────────────

function daysAgoEastern(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

async function computeCaramelTrays(sb) {
  const { data: caramel } = await sb.from('flavors').select('id').eq('name', 'Caramel').eq('is_component', true).single()
  if (!caramel) return 0
  const { data: batches } = await sb
    .from('batch_logs')
    .select('id, is_wasted, batch_date')
    .eq('flavor_id', caramel.id)
    .gte('batch_date', SEASON_START)
  const made = (batches || []).filter((b) => !b.is_wasted).length
  const { data: sscEntries } = await sb
    .from('shift_report_entries')
    .select('full_trays, flavors!inner(name), shift_reports!inner(report_date)')
    .gte('shift_reports.report_date', SEASON_START)
  let sscTrays = 0
  for (const e of sscEntries || []) if (isSSC(e.flavors?.name)) sscTrays += e.full_trays ?? 0
  // Hand-wrapped caramels also draw down caramel trays (matches Dashboard/Analytics).
  const { data: handwrap } = await sb.from('caramel_handwrap_logs').select('trays_used').gte('report_date', SEASON_START)
  let handwrapTrays = 0
  for (const h of handwrap || []) handwrapTrays += Number(h.trays_used) || 0
  return Math.max(0, made - sscTrays / 18 - handwrapTrays)
}

// Classifies every active flavor by how it's produced, so recommendations and logging are
// correct. The tell for "can be finished from a base batch" is having a tray-phase topping
// recipe AND a base group that maps to one of the base-trigger flavors (Vanilla / Chocolate
// / Peanut Butter). Flavors without toppings (Choc Coconut, Key Lime, Pistachio, Choc
// Raspberry…) must be made as their own batch.
async function classifyFlavors(sb) {
  const [{ data: flavors }, { data: trayRecipes }] = await Promise.all([
    sb.from('flavors').select('id, name, product_type, is_component, is_base_trigger, base_groups, default_yield, low_tray_threshold, double_batch_reminder').eq('is_active', true).order('name'),
    sb.from('recipes').select('flavor_id, ingredients(name)').eq('deduction_phase', 'tray'),
  ])
  const trayTops = {}
  for (const r of trayRecipes || []) (trayTops[r.flavor_id] ||= []).push(r.ingredients?.name)

  // group name -> base-trigger flavor name (e.g. 'chocolate' -> 'Chocolate'). brown_sugar has none.
  const groupBase = {}
  for (const f of flavors || []) if (f.is_base_trigger) for (const g of f.base_groups || []) groupBase[g] = f.name

  const byId = {}
  for (const f of flavors || []) {
    const toppings = (trayTops[f.id] || []).filter(Boolean)
    const baseFromGroups = (f.base_groups || []).map((g) => groupBase[g]).find(Boolean) || null
    let role, base = null
    if (f.is_component) role = 'component'
    else if (f.product_type === 'popcorn') role = 'popcorn'
    else if (f.is_base_trigger) role = 'base'
    else if (isSSC(f.name)) { role = 'ssc'; base = baseFromGroups }
    else if (toppings.length > 0 && baseFromGroups) { role = 'finish_from_base'; base = baseFromGroups }
    else role = 'own_batch'
    byId[f.id] = { ...f, toppings, role, base }
  }
  return { flavors: flavors || [], byId, groupBase }
}

export async function getFlavors(sb) {
  const { flavors, byId } = await classifyFlavors(sb)
  return {
    flavors: flavors.map((f) => {
      const c = byId[f.id]
      return {
        name: f.name,
        product_type: f.product_type,
        is_component: f.is_component,
        yield_per_batch: f.default_yield,
        // SSC excluded — its half-trays are made the night before, not a same-day double batch.
        double_batch: !!f.double_batch_reminder && c.role !== 'ssc',
        in_progress_first_round: (!!f.default_yield && c.role !== 'ssc' && f.double_batch_reminder) ? f.default_yield * 2 : 0,
        role: c.role, // base | finish_from_base | own_batch | ssc | popcorn | component
        // The BASE batch to LOG (deducts base ingredients): the base for finish-from-base / SSC,
        // else the flavor itself. Trays/toppings are still recorded under the variant flavor.
        batch_flavor: c.role === 'finish_from_base' || c.role === 'ssc' ? c.base : f.name,
        is_ssc: c.role === 'ssc',
        toppings: c.toppings,
      }
    }),
  }
}

// Ranked "what should I make next" — uses each flavor's own restock threshold (owner-tuned)
// plus sell-rate, so a slow seller with only 1-2 left still ranks at the top.
export async function getMakeRecommendations(sb, { days = 14, horizon = 2 } = {}) {
  const { flavors, byId } = await classifyFlavors(sb)
  const [{ data: inv }, vel, caramel] = await Promise.all([
    sb.from('current_inventory').select('flavor_id, tray_count, barrel_count, in_progress_count'),
    getSalesVelocity(sb, days),
    computeCaramelTrays(sb),
  ])
  const invMap = {}
  ;(inv || []).forEach((r) => { invMap[r.flavor_id] = r })
  const perDay = {}
  for (const v of vel.velocity) perDay[v.flavor] = v.per_day

  // Day + a realistic batch budget so the plan isn't "make everything that's low."
  const todayStr = todayEastern()
  const [yy, mm, dd] = todayStr.split('-').map(Number)
  const dow = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay() // 0 = Sun ... 6 = Sat
  const isWeekend = dow === 0 || dow === 6
  const isSlowDay = dow === 1 || dow === 2 // Mon/Tue are the slow days
  // Popcorn has a short shelf life and sells best on weekends, so shelves get filled into
  // the rush. On weekends AND the Thu/Fri lead-in, surface every popcorn flavor for a
  // refill — even ones not under threshold — so they make it into the day's plan.
  const fillPopcornDay = isWeekend || dow === 4 || dow === 5

  // Season phase decides whether thresholds drive fudge (peak) or we sell down to ~zero
  // by close (wind-down). In wind-down thresholds are NOT consulted for fudge — we only
  // surface fudge that will actually run dry before close. Popcorn is unaffected (made
  // fresh to demand all season).
  const phase = seasonPhase(todayStr)
  const sellDown = phase === 'winddown' || phase === 'closed'
  const daysToClose = Math.max(0, daysUntilClose(todayStr))

  const recs = []
  for (const f of flavors) {
    if (f.is_component) continue
    const c = byId[f.id]
    const row = invMap[f.id] || {}
    const isPop = f.product_type === 'popcorn'
    const count = isPop ? (row.barrel_count ?? 0) : (row.tray_count ?? 0)
    const pd = perDay[f.name] ?? 0
    const daysLeft = pd > 0 ? Number((count / pd).toFixed(1)) : null
    const threshold = f.low_tray_threshold ?? 0
    const below = count <= threshold
    const popcornFill = isPop && fillPopcornDay // busy-day popcorn refill, even if not low
    const sellsOutBeforeClose = pd > 0 ? count / pd <= daysToClose : false
    let include
    if (sellDown && !isPop) {
      // Wind-down fudge: ignore threshold; only flavors that genuinely run dry before close.
      include = sellsOutBeforeClose
    } else {
      include = below || (daysLeft != null && daysLeft <= horizon) || popcornFill
    }
    if (!include) continue
    recs.push({
      winddown: sellDown && !isPop,
      sells_out_before_close: sellsOutBeforeClose,
      flavor: f.name,
      type: f.product_type,
      count,
      unit: isPop ? 'barrels' : 'trays',
      per_day_sold: pd,
      days_left: daysLeft,
      restock_threshold: threshold,
      below_threshold: below,
      // Flagged when included only because it's a busy popcorn-fill day (not actually low):
      // keep popcorn shelves topped off heading into the weekend.
      weekend_popcorn_fill: popcornFill && !below,
      makes_per_batch: f.default_yield, // one batch yields this many trays of THIS flavor
      // SSC is NOT a double batch: its half-trays are made the night before (so the bottoms
      // firm up enough to mold the caramel), then topped with caramel the next day.
      double_batch: !!f.double_batch_reminder && c.role !== 'ssc',
      role: c.role,
      batch_flavor: c.role === 'finish_from_base' || c.role === 'ssc' ? c.base : f.name,
      toppings: c.toppings,
      is_ssc: c.role === 'ssc',
    })
  }
  recs.sort((a, b) =>
    (b.below_threshold - a.below_threshold) ||
    ((a.days_left ?? 1e9) - (b.days_left ?? 1e9)) ||
    (a.count - b.count)
  )

  const baseLevels = {}
  for (const f of flavors) if (byId[f.id].role === 'base') baseLevels[f.name] = invMap[f.id]?.tray_count ?? 0
  const anySSC = recs.some((r) => r.is_ssc)

  return {
    today: todayStr,
    day_of_week: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow],
    pace: isWeekend ? 'busy' : isSlowDay ? 'slow' : 'steady',
    suggested_total_batches: isWeekend
      ? 'shoot for around 6 batches today (busy — roughly 3+ per shift)'
      : 'shoot for around 3–6 batches total today (steady day); fewer if a flavor is a pain to clean up after',
    window_days: days,
    horizon_days: horizon,
    caramel_trays: Number(caramel.toFixed(4)),
    base_levels: baseLevels, // current base stock (Vanilla/Chocolate/Peanut Butter) for finishing variants
    needs_caramel_attention: anySSC && caramel < 1,
    // True on weekends + the Thu/Fri lead-in: fill popcorn shelves for the rush (short shelf
    // life — keep barrels topped off, don't let them sit empty).
    fill_popcorn_today: fillPopcornDay,
    season_phase: phase, // preseason | peak | winddown | closed
    season_end: seasonCloseDate(todayStr),
    days_until_close: daysToClose,
    // 'restock' = peak (thresholds drive fudge). 'selldown' = wind-down: fudge thresholds
    // are off, sell existing stock to ~zero by close; only top sellers worth occasional makes.
    mode: sellDown ? 'selldown' : 'restock',
    ...(sellDown ? { winddown_note: 'Wind-down: thresholds no longer drive fudge. Use get_season_outlook for the sell-down plan (projected leftovers at close). Fudge listed here will actually run dry before close. Keep making popcorn fresh to demand.' } : {}),
    recommendations: recs,
  }
}

// Add whole days to a 'YYYY-MM-DD' string (UTC-safe, no tz drift).
function addDays(dateStr, n) {
  const [y, m, d] = (dateStr ?? '').split('-').map(Number)
  if (!y) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

// ─────────────────────────────────────────────────────────────────────────────
// SEASON OUTLOOK — the wind-down brain. THRESHOLD-FREE: projects, from real sales +
// production data, how long current fudge stock lasts and what's likely left over at
// close (the "waste forecast" the owner wants near zero). Fudge sells down to ~zero;
// popcorn is NOT part of the sell-down (short shelf life → made fresh to demand all the
// way to close). Shared by the get_season_outlook tool and the Analytics panel.
// ─────────────────────────────────────────────────────────────────────────────
export async function getSeasonOutlook(sb, { window = 14, asOf } = {}) {
  const asOfDate = asOf || todayEastern()
  const phase = seasonPhase(asOfDate)
  const closeDate = seasonCloseDate(asOfDate)
  const daysLeft = Math.max(0, daysUntilClose(asOfDate))

  const { flavors } = await classifyFlavors(sb)
  const [{ data: inv }, vel] = await Promise.all([
    sb.from('current_inventory').select('flavor_id, tray_count, barrel_count, in_progress_count'),
    getSalesVelocity(sb, window),
  ])
  const invMap = {}
  ;(inv || []).forEach((r) => { invMap[r.flavor_id] = r })
  const perDay = {}
  for (const v of vel.velocity) perDay[v.flavor] = v.per_day

  const isPumpkin = (name) => (name ?? '').toLowerCase().includes('pumpkin')
  const fudge = flavors.filter((f) => f.product_type === 'fudge' && !f.is_component && !isPumpkin(f.name))

  // Top tier = the ~top 30% of fudge by recent sell-rate — the only flavors still worth
  // producing in wind-down. Everything below coasts/sells down.
  const rates = fudge.map((f) => perDay[f.name] ?? 0).filter((x) => x > 0).sort((a, b) => b - a)
  const topCutoff = rates.length ? rates[Math.max(0, Math.ceil(rates.length * 0.3) - 1)] : Infinity

  const fudgeItems = []
  let totalLeftover = 0
  for (const f of fudge) {
    const row = invMap[f.id] || {}
    const trays = (row.tray_count ?? 0) + (row.in_progress_count ?? 0)
    const pd = perDay[f.name] ?? 0
    const daysOfStock = pd > 0 ? Number((trays / pd).toFixed(1)) : null
    const selloutDate = pd > 0 ? addDays(asOfDate, Math.ceil(trays / pd)) : null
    const projectedLeftover = pd > 0 ? Math.max(0, Number((trays - pd * daysLeft).toFixed(1))) : trays
    const sellsOutBeforeClose = pd > 0 ? trays / pd <= daysLeft : false
    const isTop = pd > 0 && pd >= topCutoff
    // Verdict: stop = will be left over (waste risk) → don't make, push to sell.
    // make_small = a TOP seller that'll run dry well before close (≥7 days early) → OK to
    // make occasionally. coast = everything else (let it ride; running dry early is fine).
    let verdict
    if (projectedLeftover > 1) verdict = 'stop'
    else if (isTop && daysOfStock != null && daysLeft - daysOfStock >= 7) verdict = 'make_small'
    else verdict = 'coast'
    totalLeftover += projectedLeftover
    fudgeItems.push({
      flavor: f.name,
      trays,
      per_day_sold: pd,
      days_of_stock_left: daysOfStock,
      projected_sellout_date: selloutDate,
      projected_leftover_at_close: projectedLeftover,
      sells_out_before_close: sellsOutBeforeClose,
      is_top_seller: isTop,
      verdict,
    })
  }
  fudgeItems.sort((a, b) => b.projected_leftover_at_close - a.projected_leftover_at_close)

  const popcorn = flavors
    .filter((f) => f.product_type === 'popcorn' && !f.is_component)
    .map((f) => ({ flavor: f.name, barrels: invMap[f.id]?.barrel_count ?? 0, per_day_sold: perDay[f.name] ?? 0 }))

  return {
    as_of: asOfDate,
    phase, // preseason | peak | winddown | closed
    season_end: closeDate,
    days_until_close: daysLeft,
    window_days: window,
    // The number to drive toward zero: total fudge trays projected unsold at close.
    total_projected_leftover_trays: Number(totalLeftover.toFixed(1)),
    fudge: fudgeItems,
    // Popcorn is made fresh to demand right up to close — never part of the sell-down.
    popcorn: { make_fresh_to_demand: true, items: popcorn },
  }
}

export async function getIngredients(sb) {
  const { data } = await sb.from('ingredients').select('name, unit, quantity, low_stock_threshold').eq('is_active', true).order('name')
  return { ingredients: data || [] }
}

export async function getInventory(sb) {
  const [{ data: flavors }, { data: inv }] = await Promise.all([
    sb.from('flavors').select('id, name, product_type, is_active, is_component').eq('is_active', true).order('name'),
    sb.from('current_inventory').select('flavor_id, tray_count, barrel_count, in_progress_count'),
  ])
  const invMap = {}
  ;(inv || []).forEach((r) => { invMap[r.flavor_id] = r })
  const items = (flavors || [])
    .filter((f) => !f.is_component)
    .map((f) => {
      const row = invMap[f.id] || {}
      return f.product_type === 'popcorn'
        ? { flavor: f.name, type: 'popcorn', barrels: row.barrel_count ?? 0 }
        : { flavor: f.name, type: 'fudge', trays: row.tray_count ?? 0, in_progress_trays: row.in_progress_count ?? 0 }
    })
  const caramel_trays = await computeCaramelTrays(sb)
  return { season_start: SEASON_START, caramel_trays: Number(caramel_trays.toFixed(4)), items }
}

export async function getLowStock(sb) {
  const [{ data: flavors }, { data: inv }, { data: ings }] = await Promise.all([
    sb.from('flavors').select('id, name, product_type, low_tray_threshold').eq('is_active', true).eq('is_component', false),
    sb.from('current_inventory').select('flavor_id, tray_count, barrel_count'),
    sb.from('ingredients').select('name, unit, quantity, low_stock_threshold').eq('is_active', true),
  ])
  const invMap = {}
  ;(inv || []).forEach((r) => { invMap[r.flavor_id] = r })
  const lowFlavors = []
  for (const f of flavors || []) {
    const row = invMap[f.id] || {}
    const count = f.product_type === 'popcorn' ? (row.barrel_count ?? 0) : (row.tray_count ?? 0)
    const threshold = f.low_tray_threshold ?? 2
    if (count <= threshold) lowFlavors.push({ flavor: f.name, count, threshold, unit: f.product_type === 'popcorn' ? 'barrels' : 'trays' })
  }
  const lowIngredients = (ings || [])
    .filter((i) => (i.quantity ?? 0) <= (i.low_stock_threshold ?? 0))
    .map((i) => ({ ingredient: i.name, quantity: i.quantity ?? 0, threshold: i.low_stock_threshold ?? 0, unit: i.unit }))
  return { low_flavors: lowFlavors, low_ingredients: lowIngredients }
}

export async function getSalesVelocity(sb, days = 7) {
  const start = daysAgoEastern(days)
  // Fudge sells in trays (shift_report_entries); popcorn sells in barrels — a popcorn
  // "sale" is a barrel bucketed off the shelf, logged in shelf_bucket_logs.barrels_used.
  // Fold both so popcorn isn't invisible to velocity / make recommendations.
  const [{ data: entries }, { data: bucketLogs }, { data: popFlavors }] = await Promise.all([
    sb.from('shift_report_entries').select('trays_sold, flavors!inner(name, product_type), shift_reports!inner(report_date)').gte('shift_reports.report_date', start),
    sb.from('shelf_bucket_logs').select('flavor_id, barrels_used, logged_at').gte('logged_at', `${start}T00:00:00`),
    sb.from('flavors').select('id, name, product_type').eq('product_type', 'popcorn'),
  ])
  const totals = {}
  const unitByFlavor = {}
  for (const e of entries || []) {
    const name = e.flavors?.name
    if (!name) continue
    totals[name] = (totals[name] ?? 0) + (e.trays_sold ?? 0)
    unitByFlavor[name] = e.flavors?.product_type === 'popcorn' ? 'barrels' : 'trays'
  }
  const popById = {}
  for (const f of popFlavors || []) popById[f.id] = f.name
  for (const b of bucketLogs || []) {
    const name = popById[b.flavor_id]
    if (!name) continue
    totals[name] = (totals[name] ?? 0) + (b.barrels_used ?? 0)
    unitByFlavor[name] = 'barrels'
  }
  const velocity = Object.entries(totals)
    .map(([flavor, sold]) => ({ flavor, total_sold: sold, per_day: Number((sold / days).toFixed(2)), unit: unitByFlavor[flavor] ?? 'trays' }))
    .sort((a, b) => b.total_sold - a.total_sold)
  return { window_days: days, since: start, velocity }
}

export async function getIngredientStock(sb, days = 14) {
  const start = daysAgoEastern(days)
  const startTs = start + 'T00:00:00'
  const [{ data: ings }, { data: deds }] = await Promise.all([
    sb.from('ingredients').select('id, name, unit, quantity, low_stock_threshold').eq('is_active', true).order('name'),
    sb.from('ingredient_deductions').select('ingredient_id, quantity_deducted, deducted_at').gte('deducted_at', startTs),
  ])
  const burn = {}
  for (const d of deds || []) burn[d.ingredient_id] = (burn[d.ingredient_id] ?? 0) + (d.quantity_deducted ?? 0)
  const items = (ings || []).map((i) => {
    const used = burn[i.id] ?? 0
    const perDay = used / days
    const projected_days_left = perDay > 0 ? Number(((i.quantity ?? 0) / perDay).toFixed(1)) : null
    return {
      ingredient: i.name,
      quantity: Number((i.quantity ?? 0).toFixed(2)),
      unit: i.unit,
      low_stock_threshold: i.low_stock_threshold ?? 0,
      used_per_day: Number(perDay.toFixed(3)),
      projected_days_left,
    }
  })
  return { window_days: days, items }
}

export async function getRecentActivity(sb, days = 7, flavorName) {
  const start = daysAgoEastern(days)
  const endExcl = todayEastern() // batch_date is timestamptz; use < tomorrow not needed for past window
  let batchQ = sb
    .from('batch_logs')
    .select('batch_date, is_wasted, flavors!inner(name)')
    .gte('batch_date', start)
    .order('batch_date', { ascending: false })
  let entryQ = sb
    .from('shift_report_entries')
    .select('full_trays, trays_sold, trays_wasted, in_progress_trays, flavors!inner(name), shift_reports!inner(report_date)')
    .gte('shift_reports.report_date', start)
  if (flavorName) {
    batchQ = batchQ.ilike('flavors.name', `%${flavorName}%`)
    entryQ = entryQ.ilike('flavors.name', `%${flavorName}%`)
  }
  const [{ data: batches }, { data: entries }] = await Promise.all([batchQ, entryQ])
  return {
    since: start,
    batches: (batches || []).map((b) => ({ date: b.batch_date?.slice(0, 10), flavor: b.flavors?.name, wasted: b.is_wasted })),
    entries: (entries || []).map((e) => ({
      date: e.shift_reports?.report_date,
      flavor: e.flavors?.name,
      made: e.full_trays ?? 0,
      sold: e.trays_sold ?? 0,
      wasted: e.trays_wasted ?? 0,
      in_progress: e.in_progress_trays ?? 0,
    })),
    _endExcl: endExcl,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NAME RESOLUTION + TOOL DISPATCH (shared by chat + MCP)
// ─────────────────────────────────────────────────────────────────────────────

async function resolveFlavor(sb, name) {
  if (!name) return null
  const { data } = await sb.from('flavors').select('id, name, product_type, is_component').ilike('name', name).limit(1)
  if (data && data[0]) return data[0]
  const { data: fuzzy } = await sb.from('flavors').select('id, name, product_type, is_component').ilike('name', `%${name}%`).limit(2)
  return fuzzy && fuzzy.length === 1 ? fuzzy[0] : null
}

async function resolveIngredient(sb, name) {
  if (!name) return null
  const { data } = await sb.from('ingredients').select('id, name, unit, quantity').eq('is_active', true).ilike('name', name).limit(1)
  if (data && data[0]) return data[0]
  const { data: fuzzy } = await sb.from('ingredients').select('id, name, unit, quantity').eq('is_active', true).ilike('name', `%${name}%`).limit(2)
  return fuzzy && fuzzy.length === 1 ? fuzzy[0] : null
}

export const WRITE_TOOLS = new Set(['log_batch', 'add_product_entry', 'add_popcorn_entry', 'set_inventory_count', 'set_ingredient_quantity', 'log_fudge_pops'])

// One-line human summary of a write action, for the in-app confirmation dialog.
export function summarizeToolCall(name, input = {}) {
  const date = input.date || 'today'
  switch (name) {
    case 'log_batch':
      return { title: 'Log batch?', message: `${input.count ?? 1} batch(es) of ${input.flavor}${input.is_wasted ? ' (wasted)' : ''} on ${date}. Base ingredients auto-deduct.` }
    case 'add_product_entry':
      return { title: 'Add product entry?', message: `${input.flavor} on ${date}: made ${input.full_trays ?? 0}, sold ${input.trays_sold ?? 0}, wasted ${input.trays_wasted ?? 0}, in-progress ${input.in_progress_trays ?? 0}. Per-tray ingredients auto-deduct.` }
    case 'add_popcorn_entry':
      return { title: 'Record popcorn barrels?', message: `${input.flavor} on ${date}: added ${input.barrels_added ?? 0}, sold ${input.barrels_sold ?? 0}, in-progress ${input.in_progress_barrels ?? 0} barrels.` }
    case 'set_inventory_count':
      return { title: 'Overwrite count?', message: `Set ${input.flavor} to ${input.value}${input.reason ? ` — ${input.reason}` : ''}.` }
    case 'set_ingredient_quantity':
      return { title: 'Overwrite quantity?', message: `Set ${input.ingredient} to ${input.value}${input.reason ? ` — ${input.reason}` : ''}.` }
    case 'log_fudge_pops':
      return { title: 'Log fudge pops?', message: `${input.pops ?? 0} ${input.base} fudge pops on ${date} (≈${((input.pops ?? 0) / POPS_PER_SESSION).toFixed(2)} tray). Toppings auto-deduct.` }
    default:
      return { title: 'Confirm action?', message: name }
  }
}

// Execute a tool by name. Reads return data; writes perform the action and return a result
// string. Throws on resolution failure so the caller can surface a clear error to Claude.
export async function runTool(sb, name, input = {}) {
  switch (name) {
    case 'get_inventory': return await getInventory(sb)
    case 'get_low_stock': return await getLowStock(sb)
    case 'get_make_recommendations': return await getMakeRecommendations(sb, { days: input.days ?? 14, horizon: input.horizon ?? 2 })
    case 'get_season_outlook': return await getSeasonOutlook(sb, { window: input.window ?? 14, asOf: input.as_of })
    case 'get_sales_velocity': return await getSalesVelocity(sb, input.days ?? 7)
    case 'get_ingredient_stock': return await getIngredientStock(sb, input.days ?? 14)
    case 'get_recent_activity': return await getRecentActivity(sb, input.days ?? 7, input.flavor)
    case 'get_flavors': return await getFlavors(sb)
    case 'get_ingredients': return await getIngredients(sb)
    case 'get_production_manual': return { manual: PRODUCTION_MANUAL }

    case 'log_batch': {
      const flavor = await resolveFlavor(sb, input.flavor)
      if (!flavor) return { error: `No single flavor matches "${input.flavor}". Call get_flavors for exact names.` }
      const date = input.date || todayEastern()
      const count = Math.max(1, Math.floor(input.count ?? 1))
      let logged = 0
      for (let i = 0; i < count; i++) {
        const r = await logBatchWithEffects(sb, flavor, date, { isWasted: !!input.is_wasted, wasteReason: input.waste_reason })
        if (r.batchLogId) logged++
      }
      return { ok: true, message: `Logged ${logged} batch(es) of ${flavor.name} on ${date}${input.is_wasted ? ' (wasted)' : ''}.` }
    }

    case 'add_product_entry': {
      const flavor = await resolveFlavor(sb, input.flavor)
      if (!flavor) return { error: `No single flavor matches "${input.flavor}". Call get_flavors for exact names.` }
      if (flavor.product_type !== 'fudge' || flavor.is_component) return { error: `${flavor.name} is not a fudge flavor; product entries are for fudge.` }
      const date = input.date || todayEastern()
      const values = {
        full_trays: input.full_trays ?? 0,
        in_progress_trays: input.in_progress_trays ?? 0,
        trays_sold: input.trays_sold ?? 0,
        trays_wasted: input.trays_wasted ?? 0,
        in_progress_wasted: input.in_progress_wasted ?? 0,
        waste_reason: input.waste_reason,
      }
      const r = await applyShiftEntry(sb, flavor, date, values)
      if (r.error) return { error: r.error }
      return { ok: true, message: `Added entry for ${flavor.name} on ${date} (made ${values.full_trays}, sold ${values.trays_sold}, wasted ${values.trays_wasted}).` }
    }

    case 'add_popcorn_entry': {
      const flavor = await resolveFlavor(sb, input.flavor)
      if (!flavor) return { error: `No single flavor matches "${input.flavor}". Call get_flavors for exact names.` }
      if (flavor.product_type !== 'popcorn') return { error: `${flavor.name} is not a popcorn flavor; use add_product_entry for fudge.` }
      const date = input.date || todayEastern()
      const values = {
        barrels_added: Math.max(0, Math.floor(input.barrels_added ?? 0)),
        barrels_sold: Math.max(0, Math.floor(input.barrels_sold ?? 0)),
        in_progress_barrels: Math.max(0, Math.floor(input.in_progress_barrels ?? 0)),
      }
      if (values.barrels_added === 0 && values.barrels_sold === 0 && values.in_progress_barrels === 0) {
        return { error: 'Nothing to record — set at least one of barrels_added, barrels_sold, or in_progress_barrels.' }
      }
      const res = await applyPopcornEntry(sb, flavor, date, values)
      return { ok: true, message: `Recorded ${flavor.name} barrels on ${date} (added ${values.barrels_added}, sold ${values.barrels_sold}, in-progress ${values.in_progress_barrels}). Now ${res.newBarrels} on the shelf.` }
    }

    case 'set_inventory_count': {
      const flavor = await resolveFlavor(sb, input.flavor)
      if (!flavor) return { error: `No single flavor matches "${input.flavor}". Call get_flavors for exact names.` }
      const field = flavor.product_type === 'popcorn' ? 'barrel_count' : 'tray_count'
      const newVal = Number(input.value)
      if (Number.isNaN(newVal)) return { error: 'value must be a number' }
      const { data: inv } = await sb.from('current_inventory').select(field).eq('flavor_id', flavor.id).single()
      const oldVal = inv?.[field] ?? 0
      await sb.from('current_inventory').upsert({ flavor_id: flavor.id, [field]: newVal, updated_at: new Date().toISOString() }, { onConflict: 'flavor_id' })
      await logInventoryAdjustment(sb, { target_type: 'flavor', target_id: flavor.id, field, old_value: oldVal, new_value: newVal, reason: input.reason, adjusted_by: 'jarvis' })
      return { ok: true, message: `${flavor.name} ${field === 'barrel_count' ? 'barrels' : 'trays'} set to ${newVal} (was ${oldVal}).` }
    }

    case 'set_ingredient_quantity': {
      const ing = await resolveIngredient(sb, input.ingredient)
      if (!ing) return { error: `No single ingredient matches "${input.ingredient}". Call get_ingredients for exact names.` }
      const newVal = Number(input.value)
      if (Number.isNaN(newVal)) return { error: 'value must be a number' }
      const oldVal = ing.quantity ?? 0
      await sb.from('ingredients').update({ quantity: newVal }).eq('id', ing.id)
      await logInventoryAdjustment(sb, { target_type: 'ingredient', target_id: ing.id, field: 'quantity', old_value: oldVal, new_value: newVal, reason: input.reason, adjusted_by: 'jarvis' })
      return { ok: true, message: `${ing.name} set to ${newVal} ${ing.unit} (was ${oldVal}).` }
    }

    case 'log_fudge_pops': {
      const base = (input.base ?? '').toLowerCase()
      if (!FUDGE_POP_TOPPINGS[base]) return { error: 'base must be "vanilla" or "chocolate".' }
      const pops = Math.floor(Number(input.pops))
      if (!Number.isFinite(pops) || pops <= 0) return { error: 'pops must be a positive number.' }
      const date = input.date || todayEastern()
      const r = await logFudgePops(sb, base, pops, date)
      if (r.error || !r.logId) return { error: r.error?.message || 'Failed to log fudge pops (is the fudge_pop_logs migration applied?).' }
      const deducted = (r.deductions ?? []).map(d => d.name).join(', ') || 'none configured'
      return { ok: true, message: `Logged ${pops} ${base} fudge pops on ${date} (≈${(pops / POPS_PER_SESSION).toFixed(2)} tray). Toppings deducted: ${deducted}.` }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}
