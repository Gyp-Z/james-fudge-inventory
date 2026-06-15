import { supabase } from '../lib/supabase'

/**
 * Auto-deducts ingredients for a batch and logs each deduction.
 *
 * Strategy:
 *   1. Fetch recipe rows (ingredient name + recipe quantity/unit).
 *   2. For each name, find the ACTIVE delivery-unit ingredient row.
 *   3. Convert recipe qty → delivery qty:  delivery = recipe_qty / container_size.
 *   4. Subtract from ingredient.quantity and insert a deduction log row.
 *
 * Ingredients without container_size set are skipped (not yet configured).
 * Ingredients are allowed to go negative — that signals a manual count is needed.
 * Returns { deductions, negatives, skipped }.
 */
export async function autoDeductIngredients(flavorId, batchLogId) {
  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('ingredient_id, quantity_per_batch, unit, ingredients(name)')
    .eq('flavor_id', flavorId)
    .eq('deduction_phase', 'batch')

  if (error) {
    console.error('autoDeductIngredients: failed to fetch recipes', error.message)
    return { deductions: [], negatives: [], skipped: [] }
  }

  if (!recipes || recipes.length === 0) return { deductions: [], negatives: [], skipped: [] }

  // Collect unique ingredient names from recipe rows
  const names = [...new Set(recipes.map(r => r.ingredients?.name).filter(Boolean))]

  if (names.length === 0) return { deductions: [], negatives: [], skipped: [] }

  // Fetch all active ingredient rows for those names
  const { data: activeIngs, error: ingErr } = await supabase
    .from('ingredients')
    .select('id, name, quantity, unit, container_size, container_unit')
    .in('name', names)
    .eq('is_active', true)

  if (ingErr) {
    console.error('autoDeductIngredients: failed to fetch active ingredients', ingErr.message)
    return { deductions: [], negatives: [], skipped: [] }
  }

  // Build name → ingredient map; prefer row with container_size set if duplicates exist
  const activeIngMap = new Map()
  for (const ing of activeIngs ?? []) {
    const existing = activeIngMap.get(ing.name)
    if (!existing || (ing.container_size != null && existing.container_size == null)) {
      activeIngMap.set(ing.name, ing)
    }
  }

  const deductions = []
  const negatives = []
  const skipped = []

  for (const r of recipes) {
    const ingName = r.ingredients?.name
    if (!ingName) continue

    const activeIng = activeIngMap.get(ingName)
    if (!activeIng) {
      console.warn(`autoDeductIngredients: no active ingredient found for "${ingName}" — skipping`)
      skipped.push({ name: ingName, reason: 'no active row' })
      continue
    }

    if (activeIng.container_size == null) {
      console.warn(`autoDeductIngredients: "${ingName}" has no container_size — skipping deduction`)
      skipped.push({ name: ingName, reason: 'container_size not set' })
      continue
    }

    const deliveryQty = r.quantity_per_batch / activeIng.container_size
    const newQty = (activeIng.quantity ?? 0) - deliveryQty

    const [updateResult, insertResult] = await Promise.all([
      supabase
        .from('ingredients')
        .update({ quantity: newQty })
        .eq('id', activeIng.id),
      supabase.from('ingredient_deductions').insert({
        batch_log_id: batchLogId,
        ingredient_id: activeIng.id,
        quantity_deducted: deliveryQty,
        unit: activeIng.unit,
        notes: `${r.quantity_per_batch} ${r.unit} ÷ ${activeIng.container_size} = ${deliveryQty.toFixed(4)} ${activeIng.unit}`,
      }),
    ])

    if (updateResult.error) {
      console.error(`autoDeductIngredients: update failed for "${ingName}"`, updateResult.error.message)
    }
    if (insertResult.error) {
      console.error(`autoDeductIngredients: deduction log insert failed for "${ingName}"`, insertResult.error.message)
    }

    const entry = {
      ingredient_id: activeIng.id,
      name: ingName,
      quantity_deducted: deliveryQty,
      unit: activeIng.unit,
      new_quantity: newQty,
    }
    deductions.push(entry)
    if (newQty < 0) negatives.push(entry)

    // Update local map so if a later recipe references the same ingredient, qty is current
    activeIngMap.set(ingName, { ...activeIng, quantity: newQty })
  }

  return { deductions, negatives, skipped }
}

/**
 * Deducts per-tray topping ingredients when a shift report is submitted.
 * Fetches 'tray' phase recipes for the flavor and multiplies each quantity by fullTrays.
 * Follows the same container_size conversion as autoDeductIngredients.
 *
 * Pass shiftReportEntryId to link each deduction row to the entry that caused it, so the
 * deduction can be found and refunded if that entry is later edited or deleted.
 */
export async function autoDeductTrayIngredients(flavorId, fullTrays, shiftReportEntryId = null) {
  if (!fullTrays || fullTrays <= 0) return { deductions: [], negatives: [], skipped: [] }

  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('ingredient_id, quantity_per_batch, unit, ingredients(name)')
    .eq('flavor_id', flavorId)
    .eq('deduction_phase', 'tray')

  if (error) {
    console.error('autoDeductTrayIngredients: failed to fetch recipes', error.message)
    return { deductions: [], negatives: [], skipped: [] }
  }

  if (!recipes || recipes.length === 0) return { deductions: [], negatives: [], skipped: [] }

  const names = [...new Set(recipes.map(r => r.ingredients?.name).filter(Boolean))]
  if (names.length === 0) return { deductions: [], negatives: [], skipped: [] }

  const { data: activeIngs, error: ingErr } = await supabase
    .from('ingredients')
    .select('id, name, quantity, unit, container_size, container_unit')
    .in('name', names)
    .eq('is_active', true)

  if (ingErr) {
    console.error('autoDeductTrayIngredients: failed to fetch active ingredients', ingErr.message)
    return { deductions: [], negatives: [], skipped: [] }
  }

  const activeIngMap = new Map()
  for (const ing of activeIngs ?? []) {
    const existing = activeIngMap.get(ing.name)
    if (!existing || (ing.container_size != null && existing.container_size == null)) {
      activeIngMap.set(ing.name, ing)
    }
  }

  const deductions = []
  const negatives = []
  const skipped = []

  for (const r of recipes) {
    const ingName = r.ingredients?.name
    if (!ingName) continue

    const activeIng = activeIngMap.get(ingName)
    if (!activeIng) {
      skipped.push({ name: ingName, reason: 'no active row' })
      continue
    }

    if (activeIng.container_size == null) {
      skipped.push({ name: ingName, reason: 'container_size not set' })
      continue
    }

    const totalRecipeQty = r.quantity_per_batch * fullTrays
    const deliveryQty = totalRecipeQty / activeIng.container_size
    const newQty = (activeIng.quantity ?? 0) - deliveryQty

    const [updateResult, insertResult] = await Promise.all([
      supabase.from('ingredients').update({ quantity: newQty }).eq('id', activeIng.id),
      supabase.from('ingredient_deductions').insert({
        shift_report_entry_id: shiftReportEntryId,
        ingredient_id: activeIng.id,
        quantity_deducted: deliveryQty,
        unit: activeIng.unit,
        notes: `${totalRecipeQty} ${r.unit} (${fullTrays} trays × ${r.quantity_per_batch}) ÷ ${activeIng.container_size} = ${deliveryQty.toFixed(4)} ${activeIng.unit}`,
      }),
    ])

    if (updateResult.error) console.error(`autoDeductTrayIngredients: update failed for "${ingName}"`, updateResult.error.message)
    if (insertResult.error) console.error(`autoDeductTrayIngredients: log insert failed for "${ingName}"`, insertResult.error.message)

    const entry = { ingredient_id: activeIng.id, name: ingName, quantity_deducted: deliveryQty, unit: activeIng.unit, new_quantity: newQty }
    deductions.push(entry)
    if (newQty < 0) negatives.push(entry)
    activeIngMap.set(ingName, { ...activeIng, quantity: newQty })
  }

  return { deductions, negatives, skipped }
}

// Sea Salt Caramel flavors use 1 Caramel tray per 18 trays produced.
// Call this at shift-report-submit time (not batch-log time) for SSC flavors.
const CARAMEL_TRAYS_PER_SSC_TRAY = 1 / 18

export async function deductCaramelComponent(flavorName, batchYield) {
  if (!flavorName.toLowerCase().includes('sea salt')) return

  const caramelUsed = batchYield * CARAMEL_TRAYS_PER_SSC_TRAY

  // Find the Caramel component flavor
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

  const newCount = Math.max(0, (inv?.tray_count ?? 0) - caramelUsed)

  await supabase
    .from('current_inventory')
    .upsert({ flavor_id: caramelFlavor.id, tray_count: newCount }, { onConflict: 'flavor_id' })
}

/**
 * Increments barrel_count in current_inventory for a popcorn flavor.
 * Reads the current value then writes back current + amount.
 */
export async function incrementBarrelCount(flavorId, amount) {
  const { data, error } = await supabase
    .from('current_inventory')
    .select('barrel_count')
    .eq('flavor_id', flavorId)
    .single()

  if (error) {
    console.error('incrementBarrelCount: failed to read current barrel_count', error.message)
    return
  }

  const newCount = (data?.barrel_count ?? 0) + amount

  await supabase
    .from('current_inventory')
    .upsert({ flavor_id: flavorId, barrel_count: newCount }, { onConflict: 'flavor_id' })
}

/**
 * Reverts a batch log:
 *   1. Fetches the batch log to get the flavor and wasted status.
 *   2. Fetches the ingredient deductions for this batch.
 *   3. For each deduction, adds the quantity back to the active ingredient.
 *   4. If flavor is popcorn:
 *      - Decrements barrel_count in current_inventory by the batch yield.
 *      - Deletes the corresponding shelf_bucket_logs entry.
 *   5. If flavor is component (Caramel) and not wasted:
 *      - Decrements tray_count in current_inventory by 1.
 *   6. Deletes the ingredient deductions.
 *   7. Deletes the batch log.
 */
export async function revertBatchLog(batchLogId) {
  // 1. Fetch batch log
  const { data: batch, error: bErr } = await supabase
    .from('batch_logs')
    .select('flavor_id, is_wasted, created_at, tray_count, batch_quantity, flavors(name, product_type, is_component, default_yield)')
    .eq('id', batchLogId)
    .single()

  if (bErr || !batch) {
    console.error('revertBatchLog: failed to fetch batch log', bErr?.message)
    return { success: false, error: bErr?.message || 'Batch not found' }
  }

  const flavor = batch.flavors
  const flavorId = batch.flavor_id
  const isComponent = flavor?.is_component
  const isWasted = batch.is_wasted

  // 2. Fetch deductions
  const { data: deductions, error: dErr } = await supabase
    .from('ingredient_deductions')
    .select('*')
    .eq('batch_log_id', batchLogId)

  if (dErr) {
    console.error('revertBatchLog: failed to fetch deductions', dErr.message)
    return { success: false, error: dErr.message }
  }

  // 3. Refund ingredients
  if (deductions && deductions.length > 0) {
    // Get all active ingredients matching deduction ingredient_ids
    const ingIds = deductions.map(d => d.ingredient_id)
    const { data: activeIngs, error: ingErr } = await supabase
      .from('ingredients')
      .select('id, name, quantity')
      .in('id', ingIds)
      .eq('is_active', true)

    if (!ingErr && activeIngs) {
      for (const d of deductions) {
        const activeIng = activeIngs.find(i => i.id === d.ingredient_id)
        if (activeIng) {
          const newQty = Math.round(((activeIng.quantity ?? 0) + d.quantity_deducted) * 10000) / 10000
          await supabase
            .from('ingredients')
            .update({ quantity: newQty })
            .eq('id', activeIng.id)
        }
      }
    }
  }

  // 4. Popcorn batches do NOT change barrels. Barrels are added/removed only via the
  //    Products tab (barrels_added/barrels_used), so batch logging never touched them and
  //    reverting must not either. No barrel/shelf_bucket_log work here — intentional.

  // 5. If component (Caramel), decrement tray count
  if (isComponent && !isWasted) {
    const { data: inv } = await supabase
      .from('current_inventory')
      .select('tray_count')
      .eq('flavor_id', flavorId)
      .single()

    if (inv) {
      const newCount = Math.max(0, (inv.tray_count ?? 0) - 1)
      await supabase
        .from('current_inventory')
        .update({ tray_count: newCount })
        .eq('flavor_id', flavorId)
    }
  }

  // 6. Delete ingredient deductions
  await supabase
    .from('ingredient_deductions')
    .delete()
    .eq('batch_log_id', batchLogId)

  // 7. Delete batch log
  const { error: delErr } = await supabase
    .from('batch_logs')
    .delete()
    .eq('id', batchLogId)

  if (delErr) {
    console.error('revertBatchLog: failed to delete batch log', delErr.message)
    return { success: false, error: delErr.message }
  }

  return { success: true }
}

