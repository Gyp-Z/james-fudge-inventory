import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// DELIVERY PACKAGE SIZES (for reference — quick-add buttons not yet built):
// Walnuts: 25 lb box = 400 oz
// M&Ms: 25 lb box = 400 oz
// Reeses Pieces: 25 lb box = 400 oz
// Oreo Pieces: 25 lb box = 400 oz
// Chocolate Chips: (confirm delivery size with James)
// Marshmallows: 40 pieces per bag (tracked in pieces, not oz)
// Peanuts: 15 lb box
// Cashews: 15 lb box
// Almonds: 25 lb box
// Corn Treats: box of 12 bags (16.5 lbs net per box)
// Oreo Popcorn Kit: 1 box = 4 batches
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY\n' +
    'Run with: node --env-file=.env scripts/seed-recipes.mjs'
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ---------------------------------------------------------------------------
// BASE INGREDIENT SETS (per batch)
// ---------------------------------------------------------------------------

const VANILLA_BASE = [
  { name: 'Sugar',            unit: 'lbs',  qty: 11 },
  { name: 'Invert Sugar',     unit: 'lbs',  qty: 1.02 },
  { name: 'Heavy Cream',      unit: 'oz',   qty: 32 },
  { name: 'Evaporated Milk',  unit: 'cups', qty: 3 },
  { name: 'Butter',           unit: 'lbs',  qty: 2 },
  { name: 'Corn Syrup',       unit: 'cups', qty: 4 },
  { name: 'Fondant',          unit: 'lbs',  qty: 2.23 },
  { name: 'Fondex',           unit: 'lbs',  qty: 0.52 },
  { name: 'Vanilla Extract',  unit: 'cups', qty: 0.167 },
  { name: 'Salt',             unit: 'cups', qty: 0.125 },
]

// Chocolate base = vanilla base but no Vanilla Extract, add Chocolate
const CHOCOLATE_BASE = VANILLA_BASE
  .filter(i => i.name !== 'Vanilla Extract')
  .concat([
    { name: 'Chocolate', unit: 'lbs', qty: 1.90 },
  ])

// Brown sugar base = vanilla base, Sugar reduced to 7.42, add Brown Sugar 3.58
const BROWN_SUGAR_BASE = VANILLA_BASE.map(i =>
  i.name === 'Sugar' ? { ...i, qty: 7.42 } : i
).concat([
  { name: 'Brown Sugar', unit: 'lbs', qty: 3.58 },
])

// Peanut butter base = vanilla base, Butter 2.5 (extra 0.5), add Peanuts
const PEANUT_BUTTER_BASE = VANILLA_BASE.map(i =>
  i.name === 'Butter' ? { ...i, qty: 2.5 } : i
).concat([
  { name: 'Peanuts', unit: 'lbs', qty: 5 },
])

// Caramel base (Trey's recipe) — completely different, 2 trays per batch
const CARAMEL_BASE = [
  { name: 'Sugar',           unit: 'lbs',  qty: 4.50 },
  { name: 'Corn Syrup',      unit: 'cups', qty: 4 },
  { name: 'Evaporated Milk', unit: 'cups', qty: 3.5 },
  { name: 'Vanilla Extract', unit: 'cups', qty: 0.167 },
]

// ---------------------------------------------------------------------------
// HELPER — merge ingredient arrays, summing duplicate names+units
// ---------------------------------------------------------------------------
function mergeIngredients(arrays) {
  const map = new Map()
  for (const arr of arrays) {
    for (const item of arr) {
      const key = `${item.name}||${item.unit}`
      if (map.has(key)) {
        map.set(key, { ...map.get(key), qty: map.get(key).qty + item.qty })
      } else {
        map.set(key, { ...item })
      }
    }
  }
  return [...map.values()]
}

// ---------------------------------------------------------------------------
// BATCH-PHASE RECIPES — deducted when a batch is logged.
// For double-batch flavors (those requiring 2 physical pours), this contains
// BASE INGREDIENTS ONLY. Per-tray toppings are in TRAY_RECIPES below and
// deducted at shift-report-submit time based on completed tray counts.
// ---------------------------------------------------------------------------

const FLAVOR_RECIPES = [
  // ── VANILLA BASE FLAVORS ──────────────────────────────────────────────────
  { flavorName: 'Vanilla',             ingredients: VANILLA_BASE },
  { flavorName: 'Vanilla Chocolate Chip', ingredients: VANILLA_BASE }, // toppings → TRAY_RECIPES
  { flavorName: 'Cookies & Cream',     ingredients: VANILLA_BASE },    // toppings → TRAY_RECIPES
  { flavorName: 'Vanilla M&M',         ingredients: VANILLA_BASE },    // toppings → TRAY_RECIPES
  { flavorName: 'Vanilla Marshmallow', ingredients: VANILLA_BASE },    // toppings → TRAY_RECIPES
  { flavorName: 'Vanilla Walnut',      ingredients: VANILLA_BASE },    // toppings → TRAY_RECIPES
  {
    flavorName: 'Vanilla Sea Salt Caramel',
    // 1× vanilla base per batch (was 2× — now staff log 2 batches per complete make)
    // Caramel deduction handled by deductCaramelComponent at tray-report time
    ingredients: VANILLA_BASE,
  },
  {
    flavorName: 'Key Lime',
    ingredients: [
      ...VANILLA_BASE.filter(i => i.name !== 'Vanilla Extract'),
      { name: 'Key Lime Flavoring', unit: 'cups', qty: 0.333 },
    ],
  },
  {
    flavorName: 'Pistachio',
    ingredients: [
      ...VANILLA_BASE.filter(i => i.name !== 'Vanilla Extract'),
      { name: 'Pistachio Flavoring', unit: 'cups', qty: 0.333 },
    ],
  },
  {
    flavorName: 'Snickerdoodle',
    ingredients: [
      ...VANILLA_BASE.map(i => i.name === 'Sugar' ? { ...i, qty: 12 } : i),
      { name: 'Cinnamon', unit: 'lbs', qty: 0.5 },
    ],
  },

  // ── CHOCOLATE BASE FLAVORS ────────────────────────────────────────────────
  { flavorName: 'Chocolate',           ingredients: CHOCOLATE_BASE },
  { flavorName: 'Chocolate Walnut',    ingredients: CHOCOLATE_BASE }, // toppings → TRAY_RECIPES
  { flavorName: 'Chocolate M&M',       ingredients: CHOCOLATE_BASE }, // toppings → TRAY_RECIPES
  { flavorName: 'Chocolate Marshmallow', ingredients: CHOCOLATE_BASE }, // toppings → TRAY_RECIPES
  { flavorName: "Chocolate Reese's",   ingredients: CHOCOLATE_BASE }, // toppings → TRAY_RECIPES
  { flavorName: 'Dirt',                ingredients: CHOCOLATE_BASE }, // toppings → TRAY_RECIPES
  { flavorName: 'Chocolate Rocky Road', ingredients: CHOCOLATE_BASE }, // toppings → TRAY_RECIPES
  {
    flavorName: 'Chocolate Sea Salt Caramel',
    // 1× chocolate base per batch (was 2× — now staff log 2 batches per complete make)
    ingredients: CHOCOLATE_BASE,
  },
  {
    flavorName: 'Chocolate Mint',
    ingredients: [
      ...CHOCOLATE_BASE,
      { name: 'Mint Flavoring', unit: 'cups', qty: 0.333 },
    ],
  },
  {
    flavorName: 'Chocolate Coconut',
    ingredients: [
      ...CHOCOLATE_BASE,
      { name: 'Coconut (Shredded)', unit: 'lbs', qty: 1.29 },
      { name: 'Coconut Flavoring',  unit: 'cups', qty: 0.167 },
    ],
  },

  // ── BROWN SUGAR BASE ──────────────────────────────────────────────────────
  { flavorName: 'Maple Walnut', ingredients: BROWN_SUGAR_BASE }, // toppings → TRAY_RECIPES

  // ── PEANUT BUTTER BASE ────────────────────────────────────────────────────
  { flavorName: 'Peanut Butter', ingredients: PEANUT_BUTTER_BASE },

  // ── MULTI-BASE SPECIALS (combined bases stay in batch recipe — no per-tray toppings) ──
  {
    flavorName: 'Chocolate Peanut Butter',
    // Pour 1: PB base, Pour 2: chocolate base — both deducted together per complete make
    ingredients: mergeIngredients([PEANUT_BUTTER_BASE, CHOCOLATE_BASE]),
  },
  {
    flavorName: 'Chocolate Raspberry',
    // Pour 1: raspberry base (vanilla + flavorings), Pour 2: chocolate base
    ingredients: mergeIngredients([
      [
        ...VANILLA_BASE.filter(i => i.name !== 'Vanilla Extract'),
        { name: 'Raspberry Flavoring',    unit: 'cups', qty: 0.167 },
        { name: 'Raspberry Food Coloring', unit: 'cups', qty: 0.167 },
      ],
      CHOCOLATE_BASE,
    ]),
  },

  // ── CARAMEL (TREY) ────────────────────────────────────────────────────────
  { flavorName: 'Caramel', ingredients: CARAMEL_BASE },

  // ── POPCORN FLAVORS ───────────────────────────────────────────────────────
  {
    flavorName: 'Caramel Corn',
    // Popcorn Sugar (2L) ≈ 3.5 lbs regular Sugar
    // Popcorn Brown Sugar (2L) ≈ 3.2 lbs regular Brown Sugar
    ingredients: [
      { name: 'Caramel Kernels', unit: 'oz',   qty: 64 },
      { name: 'Popcorn Salt',    unit: 'cups', qty: 0.25 },
      { name: 'Sugar',           unit: 'lbs',  qty: 3.5 },
      { name: 'Brown Sugar',     unit: 'lbs',  qty: 3.2 },
      { name: 'Butter',          unit: 'lbs',  qty: 1 },
      { name: 'Corn Treats',     unit: 'bags', qty: 3 },
    ],
  },
  {
    flavorName: 'Nut Caramel Corn',
    ingredients: [
      { name: 'Caramel Kernels',   unit: 'oz',   qty: 64 },
      { name: 'Popcorn Salt',      unit: 'cups', qty: 0.25 },
      { name: 'Sugar',             unit: 'lbs',  qty: 3.5 },
      { name: 'Brown Sugar',       unit: 'lbs',  qty: 3.2 },
      { name: 'Butter',            unit: 'lbs',  qty: 1 },
      { name: 'Corn Treats',       unit: 'bags', qty: 3 },
      { name: 'Peanuts',           unit: 'lbs',  qty: 0.75 },
      { name: 'Almonds',           unit: 'lbs',  qty: 0.375 },
      { name: 'Cashews',           unit: 'lbs',  qty: 0.375 },
    ],
  },
  {
    flavorName: 'Cheddar Corn',
    ingredients: [
      { name: 'Cheddar Kernels',    unit: 'oz',  qty: 32 },
      { name: 'Popcorn Salt',       unit: 'cups',qty: 0.125 },
      { name: 'Orange Cheddar Mix', unit: 'L',   qty: 1.87 },
    ],
  },
  {
    flavorName: 'White Cheddar Corn',
    ingredients: [
      { name: 'Cheddar Kernels',   unit: 'oz',  qty: 32 },
      { name: 'Popcorn Salt',      unit: 'cups',qty: 0.125 },
      { name: 'White Cheddar Mix', unit: 'L',   qty: 1.87 },
    ],
  },
  {
    flavorName: 'Oreo Popcorn',
    ingredients: [
      { name: 'Oreo Popcorn Kit', unit: 'boxes', qty: 0.25 },
    ],
  },
]

// ---------------------------------------------------------------------------
// TRAY-PHASE RECIPES — deducted per completed full tray at shift-report time.
// Quantities are per 1 full tray. Key: flavor name → ingredient list.
// ---------------------------------------------------------------------------

const TRAY_RECIPES = {
  'Vanilla M&M':           [{ name: 'M&Ms',           unit: 'oz',     qty: 11.2 }],
  'Chocolate M&M':         [{ name: 'M&Ms',           unit: 'oz',     qty: 11.2 }],
  'Vanilla Walnut':        [{ name: 'Walnuts',         unit: 'oz',     qty: 8    }],
  'Chocolate Walnut':      [{ name: 'Walnuts',         unit: 'oz',     qty: 8    }],
  'Maple Walnut':          [{ name: 'Walnuts',         unit: 'oz',     qty: 8    }],
  'Cookies & Cream':       [{ name: 'Oreo Pieces',     unit: 'oz',     qty: 6.4  }],
  'Dirt':                  [{ name: 'Oreo Pieces',     unit: 'oz',     qty: 6.4  }],
  'Vanilla Chocolate Chip':[{ name: 'Chocolate Chips', unit: 'oz',     qty: 6.4  }],
  "Chocolate Reese's":     [{ name: 'Reeses Pieces',   unit: 'oz',     qty: 11.2 }],
  'Vanilla Marshmallow':   [{ name: 'Marshmallows',    unit: 'pieces', qty: 17   }],
  'Chocolate Marshmallow': [{ name: 'Marshmallows',    unit: 'pieces', qty: 17   }],
  'Chocolate Rocky Road':  [
    { name: 'Walnuts',     unit: 'oz',     qty: 8  },
    { name: 'Marshmallows', unit: 'pieces', qty: 17 },
  ],
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
  console.log('Fetching all flavors and ingredients from DB...')

  const [{ data: flavors, error: fErr }, { data: ings, error: iErr }] = await Promise.all([
    supabase.from('flavors').select('id, name'),
    supabase.from('ingredients').select('id, name, unit'),
  ])

  if (fErr || iErr) {
    console.error('Error fetching data:', fErr?.message ?? iErr?.message)
    process.exit(1)
  }

  const flavorMap = new Map(flavors.map(f => [f.name, f.id]))

  // Index ingredients by "name||unit" for exact match
  const ingMap = new Map(ings.map(i => [`${i.name}||${i.unit}`, i.id]))

  // Helper: get ingredient ID by name+unit, inserting if missing.
  // If another row with the same name already exists (delivery row), the new
  // row is a recipe-reference helper and should be hidden from the UI.
  async function getOrCreateIngredient(name, unit) {
    const key = `${name}||${unit}`
    if (ingMap.has(key)) return ingMap.get(key)

    const hasSameName = [...ingMap.keys()].some(k => k.startsWith(`${name}||`) && k !== key)
    console.log(`  → Creating new ingredient: ${name} (${unit})${hasSameName ? ' [hidden — delivery row exists]' : ''}`)
    const { data, error } = await supabase
      .from('ingredients')
      .insert({ name, unit, quantity: 0, low_stock_threshold: 0, is_active: !hasSameName })
      .select('id')
      .single()

    if (error || !data) {
      console.error(`  ✗ Failed to create ingredient ${name} (${unit}):`, error?.message)
      return null
    }
    ingMap.set(key, data.id)
    return data.id
  }

  let totalUpserted = 0
  let totalWarnings = 0

  for (const { flavorName, ingredients } of FLAVOR_RECIPES) {
    const flavorId = flavorMap.get(flavorName)
    if (!flavorId) {
      console.warn(`⚠ Flavor not found in DB, skipping: "${flavorName}"`)
      totalWarnings++
      continue
    }

    const trayIngs = TRAY_RECIPES[flavorName] || []
    console.log(`\nProcessing: ${flavorName} (${ingredients.length} batch + ${trayIngs.length} tray ingredients)`)

    const batchRows = []
    for (const ing of ingredients) {
      const ingredientId = await getOrCreateIngredient(ing.name, ing.unit)
      if (!ingredientId) { totalWarnings++; continue }
      batchRows.push({
        flavor_id: flavorId,
        ingredient_id: ingredientId,
        quantity_per_batch: ing.qty,
        unit: ing.unit,
        deduction_phase: 'batch',
      })
    }

    const trayRows = []
    for (const ing of trayIngs) {
      const ingredientId = await getOrCreateIngredient(ing.name, ing.unit)
      if (!ingredientId) { totalWarnings++; continue }
      trayRows.push({
        flavor_id: flavorId,
        ingredient_id: ingredientId,
        quantity_per_batch: ing.qty,
        unit: ing.unit,
        deduction_phase: 'tray',
      })
    }

    const allRows = [...batchRows, ...trayRows]
    if (allRows.length === 0) continue

    // Delete existing rows first so re-running always produces a clean state
    await supabase.from('recipes').delete().eq('flavor_id', flavorId)

    const { error } = await supabase.from('recipes').insert(allRows)

    if (error) {
      console.error(`  ✗ Insert failed for ${flavorName}:`, error.message)
      totalWarnings++
    } else {
      console.log(`  ✓ Inserted ${batchRows.length} batch + ${trayRows.length} tray recipe rows`)
      totalUpserted += allRows.length
    }
  }

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`Done. ${totalUpserted} recipe rows upserted.`)
  if (totalWarnings > 0) {
    console.log(`${totalWarnings} warning(s) — check output above.`)
  }
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
