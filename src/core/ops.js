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

const SEASON_START = '2026-04-22'
const CARAMEL_TRAYS_PER_SSC_TRAY = 1 / 18
const isSSC = (name) => (name ?? '').toLowerCase().includes('sea salt')

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
    if (!(below || (daysLeft != null && daysLeft <= horizon))) continue
    recs.push({
      flavor: f.name,
      type: f.product_type,
      count,
      unit: isPop ? 'barrels' : 'trays',
      per_day_sold: pd,
      days_left: daysLeft,
      restock_threshold: threshold,
      below_threshold: below,
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

  // Day + a realistic batch budget so the plan isn't "make everything that's low."
  const todayStr = todayEastern()
  const [yy, mm, dd] = todayStr.split('-').map(Number)
  const dow = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay() // 0 = Sun ... 6 = Sat
  const isWeekend = dow === 0 || dow === 6
  const isSlowDay = dow === 1 || dow === 2 // Mon/Tue are the slow days

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
    recommendations: recs,
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
  const { data } = await sb
    .from('shift_report_entries')
    .select('trays_sold, flavors!inner(name, product_type), shift_reports!inner(report_date)')
    .gte('shift_reports.report_date', start)
  const totals = {}
  for (const e of data || []) {
    const name = e.flavors?.name
    if (!name) continue
    totals[name] = (totals[name] ?? 0) + (e.trays_sold ?? 0)
  }
  const velocity = Object.entries(totals)
    .map(([flavor, sold]) => ({ flavor, total_sold: sold, per_day: Number((sold / days).toFixed(2)) }))
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

export const WRITE_TOOLS = new Set(['log_batch', 'add_product_entry', 'set_inventory_count', 'set_ingredient_quantity', 'log_fudge_pops'])

// One-line human summary of a write action, for the in-app confirmation dialog.
export function summarizeToolCall(name, input = {}) {
  const date = input.date || 'today'
  switch (name) {
    case 'log_batch':
      return { title: 'Log batch?', message: `${input.count ?? 1} batch(es) of ${input.flavor}${input.is_wasted ? ' (wasted)' : ''} on ${date}. Base ingredients auto-deduct.` }
    case 'add_product_entry':
      return { title: 'Add product entry?', message: `${input.flavor} on ${date}: made ${input.full_trays ?? 0}, sold ${input.trays_sold ?? 0}, wasted ${input.trays_wasted ?? 0}, in-progress ${input.in_progress_trays ?? 0}. Per-tray ingredients auto-deduct.` }
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
