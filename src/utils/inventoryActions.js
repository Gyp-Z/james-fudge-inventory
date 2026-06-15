import { supabase } from '../lib/supabase'
import {
  autoDeductIngredients,
  autoDeductTrayIngredients,
  deductCaramelComponent,
} from './autoDeduct'

// Shared side-effect helpers used by BOTH the live Shift Report and the Audit & Edit page.
// Single source of truth so backdated / reversed actions fire the exact same DB effects
// the live form does. No rounding in any calculation path — deliveryQty math lives inside
// the autoDeduct* functions and is reused as-is.

const CARAMEL_TRAYS_PER_SSC_TRAY = 1 / 18

const isSSC = (flavorName) => (flavorName ?? '').toLowerCase().includes('sea salt')

/**
 * Logs one batch and fires the batch-phase side effects, mirroring the per-batch body of
 * ShiftReport.handleBatchSubmit:
 *   - insert batch_logs { flavor_id, batch_date, is_wasted, waste_reason? }
 *   - if not wasted → autoDeductIngredients (batch-phase ingredient deduction)
 *   - if component (Caramel) and not wasted → +1 current_inventory.tray_count
 * Popcorn batches do NOT touch barrels — barrels move only via the Products tab.
 *
 * dateStr is a 'YYYY-MM-DD' string (the picked date), so this works for live or backdated.
 * Returns { batchLogId, deductions, negatives, skipped, error }.
 */
export async function logBatchWithEffects(flavor, dateStr, { isWasted = false, wasteReason = null } = {}) {
  const { data: inserted, error } = await supabase
    .from('batch_logs')
    .insert({
      flavor_id: flavor.id,
      batch_date: dateStr,
      is_wasted: isWasted,
      ...(isWasted && wasteReason ? { waste_reason: wasteReason } : {}),
    })
    .select('id')
    .single()

  if (error || !inserted) {
    return { batchLogId: null, deductions: [], negatives: [], skipped: [], error: error?.message }
  }

  let result = { deductions: [], negatives: [], skipped: [] }
  if (!isWasted) {
    result = await autoDeductIngredients(flavor.id, inserted.id)
  }

  // Component flavors (Caramel): 1 batch = 1 tray
  if (flavor.is_component && !isWasted) {
    const { data: inv } = await supabase
      .from('current_inventory')
      .select('tray_count')
      .eq('flavor_id', flavor.id)
      .single()
    await supabase
      .from('current_inventory')
      .upsert({ flavor_id: flavor.id, tray_count: (inv?.tray_count ?? 0) + 1 }, { onConflict: 'flavor_id' })
  }

  return { batchLogId: inserted.id, ...result }
}

/**
 * Pure fudge inventory formula, extracted verbatim from ShiftReport.handleProductSubmit.
 * `values` carries the canonical split columns (full_trays, in_progress_trays, trays_sold,
 * trays_wasted = full-tray waste, in_progress_wasted = in-progress waste).
 * Sales only deduct from full-tray stock; `topped` moves in-progress trays into full.
 */
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

/**
 * Fires the tray-phase side effects for a fudge flavor, mirroring the live deduction loop:
 *   - autoDeductTrayIngredients(flavor.id, fullTrays, entryId)  [links to the entry]
 *   - deductCaramelComponent(flavor.name, fullTrays) for SSC flavors
 */
export async function applyTrayDeductions(flavor, fullTrays, entryId = null) {
  if (!fullTrays || fullTrays <= 0) return { deductions: [], negatives: [], skipped: [] }
  const result = await autoDeductTrayIngredients(flavor.id, fullTrays, entryId)
  if (isSSC(flavor.name)) {
    await deductCaramelComponent(flavor.name, fullTrays)
  }
  return result
}

/**
 * Exact inverse of deductCaramelComponent: adds trays/18 of Caramel back to current_inventory.
 * No-op for non-SSC flavors.
 */
export async function creditCaramelComponent(flavorName, trays) {
  if (!isSSC(flavorName) || !trays || trays <= 0) return
  const caramelUsed = trays * CARAMEL_TRAYS_PER_SSC_TRAY

  const { data: caramelFlavor } = await supabase
    .from('flavors')
    .select('id')
    .eq('name', 'Caramel')
    .eq('is_component', true)
    .single()
  if (!caramelFlavor) return

  const { data: inv } = await supabase
    .from('current_inventory')
    .select('tray_count')
    .eq('flavor_id', caramelFlavor.id)
    .single()

  const newCount = (inv?.tray_count ?? 0) + caramelUsed
  await supabase
    .from('current_inventory')
    .upsert({ flavor_id: caramelFlavor.id, tray_count: newCount }, { onConflict: 'flavor_id' })
}

/**
 * Creates one shift_report_entry for a chosen date and fires the same tray-phase effects
 * the live Products submit does (inventory update + linked tray deductions + SSC caramel).
 * Used by the Audit & Edit page to add/backdate a product entry. `values` carries the
 * canonical split columns. Entries are grouped under a per-date manual report.
 * Returns { entryId, error }.
 */
export async function applyShiftEntry(flavor, dateStr, values, { reportType = 'manual_adjustment', loggedBy = null } = {}) {
  // Find or create the manual report for this date so audit entries group together.
  let reportId
  const { data: reports } = await supabase
    .from('shift_reports')
    .select('id')
    .eq('report_date', dateStr)
    .eq('report_type', reportType)
    .limit(1)
  reportId = reports?.[0]?.id
  if (!reportId) {
    const { data: rpt, error: rptErr } = await supabase
      .from('shift_reports')
      .insert({ report_date: dateStr, report_type: reportType, logged_by: loggedBy })
      .select('id')
      .single()
    if (rptErr || !rpt) return { entryId: null, error: rptErr?.message || 'Could not create report' }
    reportId = rpt.id
  }

  const { data: entry, error: entryErr } = await supabase
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

  // Inventory update via the shared formula
  const { data: inv } = await supabase
    .from('current_inventory')
    .select('tray_count, in_progress_count')
    .eq('flavor_id', flavor.id)
    .single()
  const next = computeTrayInventory(values, inv?.tray_count ?? 0, inv?.in_progress_count ?? 0)
  await supabase
    .from('current_inventory')
    .upsert(
      { flavor_id: flavor.id, tray_count: next.tray_count, in_progress_count: next.in_progress_count, updated_at: new Date().toISOString() },
      { onConflict: 'flavor_id' }
    )

  // Tray-phase ingredient deductions linked to the entry (+ SSC caramel)
  await applyTrayDeductions(flavor, values.full_trays ?? 0, entry.id)

  return { entryId: entry.id }
}

/**
 * Best-effort recompute + refund of tray-phase ingredient deductions for a legacy entry
 * (one logged before shift_report_entry_id existed, so its deductions can't be found).
 * Mirrors autoDeductTrayIngredients but ADDS quantity back; does not write deduction rows.
 */
async function refundTrayDeductionsFromRecipe(flavorId, fullTrays) {
  if (!fullTrays || fullTrays <= 0) return
  const { data: recipes } = await supabase
    .from('recipes')
    .select('quantity_per_batch, ingredients(name)')
    .eq('flavor_id', flavorId)
    .eq('deduction_phase', 'tray')
  if (!recipes || recipes.length === 0) return

  const names = [...new Set(recipes.map((r) => r.ingredients?.name).filter(Boolean))]
  if (names.length === 0) return

  const { data: activeIngs } = await supabase
    .from('ingredients')
    .select('id, name, quantity, container_size')
    .in('name', names)
    .eq('is_active', true)

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
    await supabase.from('ingredients').update({ quantity: newQty }).eq('id', ing.id)
    map.set(ing.name, { ...ing, quantity: newQty })
  }
}

/**
 * Reverses a shift_report_entry — the tray-phase analogue of revertBatchLog:
 *   1. refund linked tray-phase ingredient deductions (or recompute for legacy entries)
 *   2. re-credit Caramel for SSC flavors
 *   3. subtract the entry's inventory delta from current_inventory
 *   4. delete the entry row
 *
 * Note on inventory: the `topped` term (in-progress trays consumed when full trays were
 * made over pre-existing in-progress) depends on point-in-time state that isn't stored, so
 * it is not inverted here. Net tray/in-progress deltas reverse exactly for the common
 * cases; the Direct Inventory Correction tool is the safety net for any residual.
 *
 * Returns { success, legacy, error }. `legacy: true` means deductions were recomputed from
 * the recipe rather than found by link — the caller should warn the owner.
 */
export async function reverseShiftEntry(entryId) {
  const { data: entry, error } = await supabase
    .from('shift_report_entries')
    .select('id, flavor_id, full_trays, in_progress_trays, trays_sold, trays_wasted, in_progress_wasted, flavors(name, is_component, product_type)')
    .eq('id', entryId)
    .single()

  if (error || !entry) return { success: false, error: error?.message || 'Entry not found' }
  const flavor = entry.flavors

  // 1. Refund tray-phase ingredient deductions
  const { data: deductions } = await supabase
    .from('ingredient_deductions')
    .select('*')
    .eq('shift_report_entry_id', entryId)

  let legacy = false
  if (deductions && deductions.length > 0) {
    const ingIds = deductions.map((d) => d.ingredient_id)
    const { data: activeIngs } = await supabase
      .from('ingredients')
      .select('id, quantity')
      .in('id', ingIds)
      .eq('is_active', true)
    if (activeIngs) {
      for (const d of deductions) {
        const ing = activeIngs.find((i) => i.id === d.ingredient_id)
        if (ing) {
          const newQty = (ing.quantity ?? 0) + d.quantity_deducted
          await supabase.from('ingredients').update({ quantity: newQty }).eq('id', ing.id)
        }
      }
    }
    await supabase.from('ingredient_deductions').delete().eq('shift_report_entry_id', entryId)
  } else if ((entry.full_trays ?? 0) > 0) {
    legacy = true
    await refundTrayDeductionsFromRecipe(entry.flavor_id, entry.full_trays)
  }

  // 2. Re-credit Caramel for SSC flavors
  if (flavor?.name) {
    await creditCaramelComponent(flavor.name, entry.full_trays ?? 0)
  }

  // 3. Reverse inventory delta
  const made = entry.full_trays ?? 0
  const newInProg = entry.in_progress_trays ?? 0
  const sold = entry.trays_sold ?? 0
  const fullWasted = entry.trays_wasted ?? 0
  const inProgWasted = entry.in_progress_wasted ?? 0
  const trayDelta = made - sold - fullWasted
  const inProgDelta = newInProg - inProgWasted

  const { data: inv } = await supabase
    .from('current_inventory')
    .select('tray_count, in_progress_count')
    .eq('flavor_id', entry.flavor_id)
    .single()
  if (inv) {
    await supabase
      .from('current_inventory')
      .update({
        tray_count: Math.max(0, (inv.tray_count ?? 0) - trayDelta),
        in_progress_count: Math.max(0, (inv.in_progress_count ?? 0) - inProgDelta),
        updated_at: new Date().toISOString(),
      })
      .eq('flavor_id', entry.flavor_id)
  }

  // 4. Delete the entry
  const { error: delErr } = await supabase.from('shift_report_entries').delete().eq('id', entryId)
  if (delErr) return { success: false, error: delErr.message }

  return { success: true, legacy }
}

/**
 * Writes one row to the inventory_adjustments audit trail for a manual override
 * (capabilities #4 and #5 on the Audit & Edit page).
 */
export async function logInventoryAdjustment({ target_type, target_id, field, old_value, new_value, reason, adjusted_by = null }) {
  const { error } = await supabase.from('inventory_adjustments').insert({
    target_type,
    target_id,
    field,
    old_value: old_value ?? null,
    new_value: new_value ?? null,
    reason: reason?.trim() || null,
    adjusted_by,
  })
  if (error) console.error('logInventoryAdjustment: insert failed', error.message)
  return { error: error?.message }
}
