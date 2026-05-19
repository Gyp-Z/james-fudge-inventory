# James' Fudge Inventory — Agent Notes

This file is for Claude / AI agents working on this codebase. Not user-facing.

---

## What This App Is

James' Fudge is a family-owned fudge and popcorn shop in Sea Isle City, NJ. It runs a tight summer operation — small staff, daily production, and a lot of product moving in and out. Before this app, everything was tracked by memory and whiteboard handoff between shifts.

This app gives the owner and staff real-time visibility into stock, production, and ingredients without needing any technical knowledge. It runs on a tablet in the kitchen.

---

## Daily Workflow

**Morning (staff)**
1. Open Dashboard — check what's on the shelf from yesterday (fudge + popcorn), what flavors are low
2. See Caramel tray count to know if SSC can still be made

**During the day (staff)**
- When a batch is made: open Shift Report → Batches tab → log the batch. Base ingredients auto-deduct.
- When barrels of popcorn move to shelf: log barrel movements in the Products tab
- When an order of supplies arrives: Shift Report → Ingredients tab → Order Received

**End of shift (staff)**
- Submit the Products report: trays made, sold, wasted (with reason), in-progress counts
- Per-tray toppings (M&Ms, walnuts, etc.) auto-deduct at Products submit time based on full tray counts
- The report is additive — staff can submit multiple times per day, each submission adds deltas

**Admin (owner only)**
- Analytics tab: review trends — what's selling, what's being wasted, how long stock lasts
- Ingredients tab: adjust quantities after a physical recount, set thresholds, review auto-deduction log
- Admin tab: add/deactivate flavors, set yield and alert thresholds

---

## Jarvis Context

When helping with this codebase, keep this business context in mind:

- **Staff are non-technical.** The UI must be simple and forgiving. Large tap targets, clear labels, minimal steps.
- **The owner wants numbers, not complexity.** Analytics should be readable at a glance — summaries first, charts second.
- **Recipes and ingredient deductions are load-bearing.** A wrong deduction multiplier or unit conversion silently breaks ingredient stock counts. Be careful with recipe math.
- **The season runs ~May–September.** `SEASON_START = '2026-04-22'` is the anchor for all running totals. Pre-season test data exists in the DB but is excluded from charts and caramel calculations.
- **Caramel is not sold directly.** It's a component that feeds Sea Salt Caramel fudge. Its count is computed forward from batch logs, not read from `current_inventory` — because the stored value drifts if SSC deductions ever had wrong yields.
- **Shelf bucket tracking (small/large bucket counts) has been removed from the app.** The `shelf_bucket_logs` table still exists and tracks barrel movements (barrels_added, barrels_used) but the bucket columns (small_buckets_made etc.) are set to 0 and no longer used. Do not rebuild bucket tracking unless explicitly asked.
- **Two-phase deduction is live.** Batch phase fires at batch-log time (base ingredients). Tray phase fires at product-submit time (per-tray toppings). Don't collapse these back into one phase.
- **SSC caramel deduction fires at tray-submit time**, not batch time. `deductCaramelComponent` is called in `handleProductSubmit`, not `handleBatchSubmit`.

---

## Stack

React 19 + Vite + Tailwind CSS v4 + Supabase JS + Recharts. Deployed on Vercel.
No backend — all DB access goes through `src/lib/supabase.js` (anon key, RLS-enforced).

---

## Key Business Logic

### Products
- **Fudge** flavors: tracked in trays. `current_inventory.tray_count`.
- **Popcorn** flavors: tracked in barrels. `current_inventory.barrel_count`.
- **Caramel** (`is_component = true`): a fudge component, NOT sold directly. Each batch = +1 tray. Used to make Sea Salt Caramel fudge.

### Caramel / SSC math
- 1 caramel tray = enough for 18 SSC trays
- Constant: `CARAMEL_TRAYS_PER_SSC_TRAY = 1/18` in `src/utils/autoDeduct.js`
- SSC detection: `flavorName.toLowerCase().includes('sea salt')`
- Caramel count in Dashboard and Analytics is computed **forward from batch logs** (season start Apr 22 2026), NOT from `current_inventory.tray_count`
- Display format: `1 6/18` (whole + numerator/18). Admin page accepts `X Y/18`, `Y/18`, or decimal.

### Two-Phase Ingredient Deduction
Recipes have a `deduction_phase` column: `'batch'` or `'tray'`.

**Batch phase** (fires in `handleBatchSubmit`):
- `autoDeductIngredients(flavorId, batchLogId)` — filters `WHERE deduction_phase = 'batch'`
- Deducts base ingredients (sugar, butter, cream, etc.)
- SSC caramel deduction was moved OUT of this path

**Tray phase** (fires in `handleProductSubmit`):
- `autoDeductTrayIngredients(flavorId, fullTrays)` — filters `WHERE deduction_phase = 'tray'`
- Deducts per-tray toppings multiplied by full_trays entered
- `deductCaramelComponent(flavorName, fullTrays)` also fires here for SSC flavors

### Per-Tray Topping Quantities (oz per full tray)
| Flavor(s) | Topping | Qty |
|-----------|---------|-----|
| Vanilla M&M, Chocolate M&M | M&Ms | 11.2 oz |
| Chocolate Reese's | Reese's Pieces | 11.2 oz |
| Vanilla Walnut, Chocolate Walnut, Maple Walnut, Chocolate Rocky Road | Walnuts | 8 oz |
| Cookies & Cream, Dirt | Oreo Pieces | 6.4 oz |
| Vanilla Chocolate Chip | Chocolate Chips | 6.4 oz |
| Vanilla Marshmallow, Chocolate Marshmallow, Chocolate Rocky Road | Marshmallows | 17 pieces |

### Double-Batch Reminder System
`flavors.double_batch_reminder = true` on 16 flavors that require 2 physical pours per complete make.

In **Batches tab**: after 1 batch logged today, shows amber "1 of 2 — log 2nd batch to top" badge. After 2, shows green "Both batches done ✓". Badge disappears once trays are entered in Products.

`todayBatchCounts` state in ShiftReport tracks batches logged before the current session (loaded at mount) + batches logged during the session (updated after each submit).

### Base-Group Reminder System
`flavors.base_groups` is a `text[]` column. When ANY flavor in a base group has batches logged today, ALL other flavors in that group show a "Base batch made today — enter trays to deduct" reminder in the Products tab (disappears once `full_trays > 0`).

Groups: `vanilla`, `chocolate`, `brown_sugar`, `peanut_butter`. Multi-base flavors: Chocolate PB `['chocolate','peanut_butter']`, Chocolate Raspberry `['chocolate']` only (raspberry base is its own flavor, not vanilla).

### Pour Labels (Multi-Base Flavors)
`recipes.pour_label` is a `text NOT NULL DEFAULT ''` column. Single-base flavors have `pour_label = ''`. Multi-pour flavors (Choc PB, Choc Raspberry) have ingredient rows labeled per pour (e.g. `'Peanut Butter base'`, `'Chocolate base'`). These show as separate sections in the collapsible Recipe display on Products tab cards.

Unique constraint: `UNIQUE (flavor_id, ingredient_id, deduction_phase, pour_label)`.

### Recipes
- Seeded by `scripts/seed-recipes.mjs`
- Supports `{ flavorName, ingredients }` (single-base) and `{ flavorName, pours: [{label, ingredients}] }` (multi-base)
- SSC flavors = 1× base per batch (NOT 2×). Staff log 2 SSC batches per complete make.
- Seed does delete-then-insert per flavor — safe to re-run

### Ingredient Container Schema
- `ingredients.unit` = **delivery unit** (boxes, bags, sticks) — what stock is counted in
- `ingredients.container_unit` = **content unit** (lbs, oz, cups, pieces) — what's inside one delivery unit
- `ingredients.container_size` = how many content units per delivery unit
- Display format: `{container_size} {container_unit} per {singularize(unit)}` e.g. "25 lbs per box"
- Deduction formula: `deliveryQty = recipe_qty / container_size`

### Shelf Bucket Logs
`shelf_bucket_logs` now only used for barrel tracking. Columns `barrels_added` and `barrels_used` are active. Bucket columns (small_buckets_made, etc.) are set to 0 — do not write to them.

---

## Database

### Real schema vs schema.sql
`supabase/schema.sql` is a historical reference and is **out of date**. The real DB has evolved via migrations. Always use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` guards.

### Important column names (common gotchas)
- `ingredients.low_stock_threshold` (NOT `alert_threshold`)
- `ingredients.is_active` (NOT `active`)
- `flavors.low_tray_threshold` (NOT `alert_threshold`)
- `batch_logs.batch_date` is `timestamptz` — returned as `"2026-05-03T00:00:00+00:00"` by Supabase. Always `.slice(0, 10)` before using as a date string.

### Key tables
| Table | Purpose |
|---|---|
| `flavors` | Flavor catalog. `product_type`, `is_component`, `default_yield`, `double_batch_reminder`, `base_groups`. |
| `current_inventory` | Source of truth for tray/barrel counts. `tray_count` + `barrel_count`. |
| `batch_logs` | One row per batch logged. `flavor_id`, `batch_date`, `is_wasted`. |
| `shift_reports` | One per reporting session. `report_date`. |
| `shift_report_entries` | Per-flavor deltas within a report. `full_trays`, `trays_sold`, `trays_wasted`, `in_progress_trays`. |
| `ingredients` | Raw ingredient stock. `quantity`, `unit`, `container_size`, `container_unit`, `low_stock_threshold`, `is_active`. |
| `recipes` | Per-batch/tray ingredient quantities. `quantity_per_batch`, `unit`, `deduction_phase`, `pour_label`. |
| `ingredient_deductions` | Audit log of auto-deductions. Inserted by `autoDeductIngredients` and `autoDeductTrayIngredients`. |
| `shelf_bucket_logs` | Barrel movement log. `barrels_added`, `barrels_used` only — bucket columns inactive. |

---

## Key Files

| File | Role |
|---|---|
| `src/pages/Dashboard.jsx` | Main stock view. Loads inventory + batch logs + all flavors for caramel computation. Yesterday's shelf includes both fudge and popcorn. |
| `src/pages/ShiftReport.jsx` | Staff report form. Batches tab logs batches + deducts batch-phase ingredients. Products tab deducts tray-phase ingredients + caramel on submit. |
| `src/pages/Analytics.jsx` | Charts. Bucket charts removed. `caramelComputedTotal` + `caramelStockData` computed from batch logs forward. |
| `src/pages/Admin.jsx` | Flavor management + inline count editing. |
| `src/pages/Ingredients.jsx` | Ingredient management + deduction log. Archive button is in the name row (not the data row). |
| `src/utils/autoDeduct.js` | `autoDeductIngredients` (batch phase), `autoDeductTrayIngredients` (tray phase), `deductCaramelComponent` (SSC tray time), `incrementBarrelCount`. |
| `src/hooks/useFlavors.js` | Loads active flavors (`is_active = true`). Does NOT include inactive flavors. |
| `scripts/seed-recipes.mjs` | Recipe seeder. Needs `SUPABASE_SERVICE_ROLE_KEY`. Run with `node --env-file=.env scripts/seed-recipes.mjs`. |

---

## Season

Season start: **2026-04-22** (`SEASON_START` constant used in Analytics and autoDeduct).
Pre-season test data is excluded from all charts and caramel calculations.

---

## Auth

- Unauthenticated users: Dashboard + Shift Report only
- Authenticated (admin): all tabs
- RLS policies on all tables allow public read + insert; mutations guarded in UI by `isAdmin` check

---

## Common Pitfalls

- `useFlavors` filters `is_active = true` — if you need ALL flavors, query `flavors` directly.
- `batch_date` is `timestamptz` — slice to 10 chars before comparing to date strings.
- SSC recipes are 1× base (NOT 2×). Staff log 2 batches for a complete SSC make.
- `deductCaramelComponent` fires in `handleProductSubmit`, NOT `handleBatchSubmit`. Don't move it back.
- `autoDeductIngredients` filters `deduction_phase = 'batch'`. Don't remove that filter.
- Multi-pour flavors (Choc PB, Choc Raspberry) have the same ingredient appearing in two recipe rows with different `pour_label`. This is intentional — both deduct correctly because `activeIngMap` updates between rows.
- Seed script uses `pours` key for multi-base flavors and `ingredients` key for single-base. Main loop checks for both.
- `container_unit` = content unit (lbs, oz) NOT the container name. `unit` = delivery container (boxes, bags).

---

## Next Season Roadmap (post-season features)

Ideas the owner wants to explore once a full season of data is collected:

1. **Predictive analytics** — forecast when to make each flavor based on historical daily sales velocity. Flag flavors that consistently undersell vs. oversell.
2. **Ingredient cost tracking** — attach cost per delivery unit to ingredients; auto-calculate cost-per-tray per flavor and total spend by ingredient.
3. **Reorder forecasting** — given current stock + average burn rate from deductions, surface "you'll run out of X in ~Y days."
4. **Flavor rationalization** — identify flavors with low sales or high waste ratios that could be dropped or made less frequently.
5. **Audit log UI** — admin page showing a timeline of all stock changes (batch logs, ingredient deductions, manual adjustments) so discrepancies can be traced.
6. **AI assistant** — a chat interface that can answer questions like "what should I make today?", "what do I need to order this week?", and "which flavors are most profitable?" using the season's accumulated data. This would require a backend function (Supabase Edge Function or similar) to query the DB and pass context to a language model API.
