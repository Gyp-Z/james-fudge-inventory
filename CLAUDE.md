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
- **Caramel is not sold directly.** It's a component that feeds Sea Salt Caramel fudge. Its count is computed forward from batch logs day-by-day, not read from `current_inventory` — because the stored value drifts if SSC deductions ever had wrong yields.
- **Shelf bucket tracking (small/large bucket counts) has been removed from the app.** The `shelf_bucket_logs` table still exists and tracks barrel movements (barrels_added, barrels_used) but the bucket columns (small_buckets_made etc.) are set to 0 and no longer used. Do not rebuild bucket tracking unless explicitly asked.
- **Two-phase deduction is live.** Batch phase fires at batch-log time (base ingredients). Tray phase fires at product-submit time (per-tray toppings). Don't collapse these back into one phase.
- **SSC caramel deduction fires at tray-submit time**, not batch time. `deductCaramelComponent` is called in `handleProductSubmit`, not `handleBatchSubmit`.
- **No rounding in deduction math.** `deliveryQty = recipe_qty / container_size` — full float, no rounding. Rounding is visual only (display). A prior bug using `Math.round(x * 10) / 10` caused small fractions to round to 0, silently skipping deductions all season. Fixed May 2026 via `scripts/fix-zero-deductions.mjs`. Do not re-introduce any rounding to calculation paths.
- **`is_base_trigger = true`** on Vanilla, Chocolate, and Peanut Butter. These are plain bases that can produce a mix of full and in-progress trays (e.g. PB half-trays feed Choc PB). Used for two things: (1) cross-flavor "base batch made today" reminders in Products tab, and (2) showing the "≈ X full or Y in-progress trays" range estimate in Batches tab instead of a single full-tray count.
- **Topping an in-progress (half) tray into a full tray counts as 0.5, not 1**, everywhere production is estimated — its first half came from an earlier batch. Applied in ShiftReport `deriveFudge` (`estimatedBatches`) AND `computeGroupAccounting` (base-batch reminder), so `toppedFromPrior = min(full_trays, currentInProgress)` is discounted to half. Without this the base-batch reminder cleared too early and the batch estimate double-counted.
- **Paused flavors (Lisa's call, July 2026): Key Lime, Vanilla Chocolate Chip, Chocolate Rocky Road.** Too much hassle to make alongside everything else — let them run dry. `PAUSED_FLAVORS`/`isPaused` in `src/core/ops.js` excludes them from `getMakeRecommendations`; the Jarvis system prompt has a "PAUSED FLAVORS" rule (never recommend making them; only make if one hits zero AND Zach cleared it with Lisa). Not a schema flag — just the name set + prompt.
- **"Logged" = "reported."** The crew uses them interchangeably. If asked "what was logged," answer with reported activity (`get_recent_activity`). The system prompt says so; don't build a distinction.

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
- Caramel count in Dashboard and Analytics is computed **forward from batch logs day-by-day** (season start Apr 22 2026), NOT from `current_inventory.tray_count`
- Caramel Analytics graph: walks day-by-day adding +1 per caramel batch and subtracting full_trays/18 per SSC report entry. Does NOT back-fill from the total peak — new batches show as upward steps on the actual batch date.
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

**SSC is NEVER a same-day double batch** even though both Sea Salt Caramel flavors carry `double_batch_reminder = true` in the DB (its half-tray bottoms are poured the night before, then topped next day). ShiftReport guards this with `isDoubleBatch(f) = double_batch_reminder && !isSSC(f.name)` — the double-batch amber/green/"1 of 2" UI must never fire for SSC. This matches `getFlavors` (which already excludes SSC from `double_batch`). Symptom if the guard is removed: Choc SSC shows "1 of 2 — ≈ 12 in-progress trays" whenever a Choc SSC batch exists.

In **Batches tab**:
- After 1st batch (amber): "1 of 2 — ≈ {yield×2} in-progress trays" — first pour fills double the tray count as half-trays
- After 2nd batch (green): "Both batches done ✓ — ≈ {yield×2} full trays" — half-trays topped = same count as full trays
- Badge disappears once trays are entered in Products tab

`todayBatchCounts` state in ShiftReport tracks batches logged before the current session (loaded at mount) + batches logged during the session (updated after each submit).

**Cross-day double-batch**: if a flavor had exactly 1 batch on the prior day AND still has in-progress trays (`currentInProgress > 0`), that prior batch counts toward the effectiveTotal. The `|| totalBatches > 0` guard was a bug (caused SSC to show green after 1 click) and has been removed — cross-day carry only applies when in-progress trays actually exist.

### Batch Estimate Hints (Batches tab)
Non-double-batch flavors show an estimate below the stepper when batches are logged:
- **`is_base_trigger = true`** (Vanilla, Chocolate, Peanut Butter): "≈ X full or Y in-progress trays" where Y = X×2, because one batch can fill double the tray count as half-trays
- **All other single-batch flavors** (Pistachio, Key Lime, Snickerdoodle, etc.): "≈ X full trays"
- **Caramel**: "N batches today · N trays — 1 batch = 1 tray"
- **Popcorn**: "≈ X barrels" based on `default_yield` (Caramel Corn/Nut Caramel Corn = 2.5 barrels/batch; Cheddar, White Cheddar, Oreo, Kettle Corn = 1 barrel/batch)

### Base-Group Reminder System
`flavors.base_groups` is a `text[]` column. When ANY flavor in a base group has batches logged today, ALL other flavors in that group show a "Base batch made today — enter trays to deduct" reminder in the Products tab (disappears once `full_trays > 0`).

Groups: `vanilla`, `chocolate`, `brown_sugar`, `peanut_butter`. Multi-base flavors: Chocolate PB `['chocolate','peanut_butter']`, Chocolate Raspberry `['chocolate']` only (raspberry base is its own flavor, not vanilla).

Only `is_base_trigger = true` flavors (Vanilla, Chocolate, Peanut Butter) count as cross-flavor triggers. Committed flavors like Chocolate Coconut or Key Lime are not base triggers even if they share a base group.

### Pour Labels (Multi-Base Flavors)
`recipes.pour_label` is a `text NOT NULL DEFAULT ''` column. Single-base flavors have `pour_label = ''`. Multi-pour flavors (Choc PB, Choc Raspberry) have ingredient rows labeled per pour (e.g. `'Peanut Butter base'`, `'Chocolate base'`). Deductions work correctly because `activeIngMap` updates between rows.

Unique constraint: `UNIQUE (flavor_id, ingredient_id, deduction_phase, pour_label)`.

Recipes are **not currently displayed in the UI**. They were removed from the ShiftReport Products tab. If a recipe view is needed in the future, add it as a dedicated admin page.

### Recipes
- Seeded by `scripts/seed-recipes.mjs`
- Supports `{ flavorName, ingredients }` (single-base) and `{ flavorName, pours: [{label, ingredients}] }` (multi-base)
- SSC flavors = 1× base per batch (NOT 2×). USUAL flow (confirmed July 2026): bottoms set overnight, so each pour is logged as the BASE flavor's batch and SSC only gets tray entries — the SSC batch recipes fire only on the RARE same-day make logged under the SSC flavor itself. Never both for the same pour (double-deducts).
- Seed does delete-then-insert per flavor — safe to re-run

### Fudge Pops
Small fudge pops made from a **Vanilla or Chocolate** base. Pops are NOT sold individually (too small to track sales) and are NOT on any graph. Added mid-season 2026.

- Logged in the **Products tab** (ShiftReport), in the "Fudge Pops" section just below "Caramels Hand Wrapped". A ±5-pop stepper per base. ~20 pops = 1 tray.
- **Purpose:** tell the system part of a base batch went to pops. Two effects:
  1. **Base reminder accounting** — pop tray-equivalents (`pops / POPS_PER_SESSION`, =20) are added to `actualTrays` in `groupAccountedFor` for the `vanilla`/`chocolate` groups. So 2 vanilla trays + 20 pops accounts for a full 3-tray batch and the "made today" reminder clears.
  2. **Topping deduction** — per-pop toppings auto-deduct on Products submit via `logFudgePops` → `deductFudgePopToppings` in `src/core/ops.js`.
- **No base-ingredient deduction** — the base *batch* already deducted those when logged. Pops only deduct toppings.
- **Topping rates** (`FUDGE_POP_TOPPINGS` in core): each topping = **half its per-tray rate** across a full ~20-pop session, scaled linearly by pop count. Vanilla → M&Ms 5.6, Choc Chips 3.2, Oreo Pieces 3.2, Sprinkles 3.2 (oz/session). Chocolate → Oreo Pieces 3.2, M&Ms 5.6, Reeses Pieces 5.6, Sprinkles 3.2. No rounding in the math.
- **Sprinkles** is a pop-only ingredient: 4 cartons, 96 oz (6 lb) per carton, stored in oz (`container_size = 96`).
- **Storage:** `fudge_pop_logs` table (`base`, `pop_count`, `report_date`). Topping deductions link back via `ingredient_deductions.fudge_pop_log_id` (audit/future revert). No revert UI yet — use Direct Inventory Correction as the safety net.
- **Jarvis/MCP:** exposed as the `log_fudge_pops` write tool (`base` + `pops`, in `TOOL_SCHEMAS`, `WRITE_TOOLS`, `runTool`, `summarizeToolCall`). "I made 20 vanilla fudge pops" works by chat and via the MCP server — same core path as the UI.
- **Migration:** `supabase/migrations/add_fudge_pop_logs.sql` (table + `fudge_pop_log_id` column + Sprinkles row). Code degrades gracefully before it's applied (pop logging no-ops, Sprinkles skipped).

### Kettle Corn
Added as a popcorn flavor mid-season 2026. Recipe confirmed with staff/owner July 2026: **Caramel Kernels 64 oz + Cheddar Kernels 21.3333 oz + Kettle Mix 1 lb per batch**. Kettle Mix comes in **3.25 lb cartons** (`container_size = 3.25`, `container_unit = 'lbs'`) → 1/3.25 ≈ 0.31 cartons deduct per batch. DB recipe rows and `scripts/seed-recipes.mjs` are in sync — do NOT revert the seeder's Kettle Corn entry to the old Cheddar-Kernels-only version.

### Extras — `product_type = 'extra'` (Toffee, Dot Cake Frosting)
Added July 2026. **Batch-log-only items**: you make them (a batch deducts ingredients) but they are NOT sold/tracked as shelf stock — no tray/barrel count, no Dashboard card, no sales, no Analytics graph, no make-recommendations. This is a THIRD product_type alongside `fudge` and `popcorn`, chosen so the fudge filters (now tightened from `!== 'popcorn'` to **`=== 'fudge'`** in Dashboard/ShiftReport/Analytics and core `getInventory`/`getLowStock`/`getMakeRecommendations`) exclude them without a schema migration. `is_component = false`.
- They render in the ShiftReport **Batches tab** under a "Toffee & Extras" section (`extraFlavors = product_type === 'extra'`), simple made/wasted steppers like the Caramel batch section. Excluded from the Products tab and the "Today" smart-list.
- Jarvis logs them via **`log_batch`** (they're in `get_flavors` with role `own_batch`); `add_product_entry` rejects them (not fudge). System prompt has an "Extras" rule.
- **Toffee** recipe (batch phase): Butter 5 lb, Sugar 6 lb, Almonds 12 oz (0.75 lb), Corn Syrup 2 cups. Salt ~2 oz and the ~1 lb Bakers' Special superfine sugar are intentionally NOT deducted (salt has no `container_size`; Bakers' Special isn't stocked). Formula 296, dialed in July 2026 — corn syrup added, soy lecithin dropped. Toffee is made in the same FireMixer-14 kettle as fudge; Aidan makes it ~weekly (Thursdays).
- **Dot Cake Frosting** recipe (batch phase): Butter 0.75 lb (¾ of a 1-lb stick). Named "Dot Cake Frosting" (not "Dot Cakes") on purpose — the cake part is BOUGHT, one batch of frosting decorates many cakes, and this item exists purely for the butter deduction. Heavy cream + powdered sugar are used but not tracked.
- If you need to add another non-sold made item, this is the pattern: `product_type='extra'`, add a batch recipe to `seed-recipes.mjs`, done.
- Historical batches (pre-feature) were logged as records only via `scripts/log-toffee-dotcake-history.mjs` with **no deductions** (so they don't distort current stock).

### Ingredient Container Schema
- `ingredients.unit` = **delivery unit** (boxes, bags, sticks) — what stock is counted in
- `ingredients.container_unit` = **content unit** (lbs, oz, cups, pieces) — what's inside one delivery unit
- `ingredients.container_size` = how many content units per delivery unit
- Display format: `{container_size} {container_unit} per {singularize(unit)}` e.g. "25 lbs per box"
- Deduction formula: `deliveryQty = recipe_qty / container_size` (no rounding)
- Ingredients with `container_size = null` are skipped by auto-deduct — this is intentional for ingredients not yet configured (e.g. Kettle Mix)

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
| `flavors` | Flavor catalog. `product_type`, `is_component`, `default_yield`, `double_batch_reminder`, `base_groups`, `is_base_trigger`. |
| `current_inventory` | Source of truth for tray/barrel counts. `tray_count` + `barrel_count`. |
| `batch_logs` | One row per batch logged. `flavor_id`, `batch_date`, `is_wasted`. |
| `shift_reports` | One per reporting session. `report_date`. |
| `shift_report_entries` | Per-flavor deltas within a report. `full_trays`, `trays_sold`, `trays_wasted`, `in_progress_trays`. |
| `ingredients` | Raw ingredient stock. `quantity`, `unit`, `container_size`, `container_unit`, `low_stock_threshold`, `is_active`. |
| `recipes` | Per-batch/tray ingredient quantities. `quantity_per_batch`, `unit`, `deduction_phase`, `pour_label`. |
| `ingredient_deductions` | Audit log of auto-deductions. Inserted by `autoDeductIngredients` (sets `batch_log_id`) and `autoDeductTrayIngredients` (sets `shift_report_entry_id`). One of those two links is what makes a deduction reversible. |
| `shelf_bucket_logs` | Barrel movement log. `barrels_added`, `barrels_used` only — bucket columns inactive. |
| `inventory_adjustments` | Audit trail of manual count/quantity overrides from the Audit & Edit page. `target_type`, `target_id`, `field`, `old_value`, `new_value`, `reason`. |

---

## Key Files

| File | Role |
|---|---|
| `src/pages/Dashboard.jsx` | Main stock view. Loads inventory + batch logs + all flavors for caramel computation. Yesterday's shelf includes both fudge and popcorn. |
| `src/pages/ShiftReport.jsx` | Staff report form. Batches tab logs batches + deducts batch-phase ingredients + shows tray/barrel estimates. Products tab deducts tray-phase ingredients + caramel on submit. |
| `src/pages/Analytics.jsx` | Charts. Bucket charts removed. `caramelComputedTotal` + `caramelStockData` computed from batch logs day-by-day. |
| `src/pages/Admin.jsx` | Flavor management + inline count editing. |
| `src/pages/Ingredients.jsx` | Ingredient management + deduction log. Archive button is in the name row (not the data row). |
| `src/core/ops.js` | **Single source of truth** for all reads/writes. Every DB-touching fn takes a Supabase client as its first arg, so it runs in the browser, the Jarvis chat, and the MCP server. Holds the deduction logic + read/analytics queries + `runTool`/`WRITE_TOOLS`/`summarizeToolCall`. No browser-only imports. |
| `src/core/toolSchemas.js` | Shared Jarvis tool catalog (`TOOL_SCHEMAS`) + `SYSTEM_PROMPT`, consumed by `api/chat.js` and `mcp/server.js`. |
| `src/core/productionManual.js` | Full production manual (`PRODUCTION_MANUAL` string): every recipe, scale reading, cooking step, topping, yield, container size + new-chef tips. Returned by the `get_production_manual` tool. Kept OUT of the system prompt to save per-message tokens. Edit here when a recipe/process changes. |
| `src/utils/autoDeduct.js` | Browser-bound wrappers over `src/core/ops.js` (bind the anon client). Same signatures as before — call sites unchanged. |
| `src/utils/inventoryActions.js` | Browser-bound wrappers over `src/core/ops.js`. Same signatures. |
| `api/chat.js` | Vercel function — Claude inference proxy for the in-app Jarvis chat. Holds `ANTHROPIC_API_KEY`, verifies the owner's Supabase token, no DB access. Uses `claude-opus-4-8`. |
| `src/pages/Jarvis.jsx` | Admin-only chat page (`/jarvis`). Client-side agentic loop; executes tools via `jarvisClientTools` (anon client), confirms writes via `ConfirmDialog`. |
| `mcp/server.js` | Local stdio MCP server for the owner's desktop assistant. Runs the same `runTool` with a service-role client. See `mcp/README.md`. |
| ~~`src/pages/AuditEdit.jsx`~~ | **REMOVED July 2026** — the Fixes page and `src/components/audit/` are deleted; Jarvis is the fix bot now (see below). `/audit-edit` redirects to `/`. |
| `src/hooks/useFlavors.js` | Loads active flavors (`is_active = true`). Does NOT include inactive flavors. |
| `scripts/seed-recipes.mjs` | Recipe seeder. Needs `SUPABASE_SERVICE_ROLE_KEY`. Run with `node --env-file=.env scripts/seed-recipes.mjs`. |
| `scripts/fix-zero-deductions.mjs` | One-off season correction (May 2026). Parsed `ingredient_deductions.notes` to recover and apply deductions that were rounded to 0 by the old rounding bug. Keep for reference. |

---

## Season

Season start: **2026-04-22** (`SEASON_START` constant used in Analytics and autoDeduct).
Pre-season test data is excluded from all charts and caramel calculations.

### Season arc & wind-down (zero-waste closeout)

`SEASON_CONFIG` in `src/core/ops.js` is the single, **year-agnostic** season model — boundaries are MONTH/DAY so the seasonal behavior rolls over every year with no code edits:
- `openMonthDay '04-22'` · `fudgeWinddownMonthDay '08-14'` · `closeMonthDay '10-13'` · `anchorYear 2026` (the ONLY per-year knob — `SEASON_START` is derived from it for back-compat).
- `seasonPhase(date)` → `'preseason' | 'peak' | 'winddown' | 'closed'` (compares month/day). `seasonCloseDate(date)` / `daysUntilClose(date)` resolve the close in the date's own year.

**`getSeasonOutlook(sb, { window, asOf })`** is the threshold-free wind-down brain: per fudge flavor it projects, from real recent sales, days of stock left, sellout date, and **projected leftover trays at close** (the waste forecast to drive to zero), plus a verdict (`stop` / `coast` / `make_small`). `make_small` is reserved for **top sellers** (top ~30% by sell-rate) that run dry ≥7 days before close. Pumpkin Spice (late-Oct closeout flavor) is excluded. Popcorn is returned separately with `make_fresh_to_demand: true` — it is **never** part of the fudge sell-down (short shelf life → made fresh to demand right up to close).

This one core fn feeds both the `get_season_outlook` Jarvis tool and the **Analytics "Season Outlook" panel** (`SeasonOutlookPanel` in `Analytics.jsx`) — single source of truth. `getMakeRecommendations` is phase-aware: in wind-down it returns `mode: 'selldown'`, drops threshold-driven fudge recs (only surfaces fudge that genuinely runs dry before close), and keeps popcorn fill logic active.

**Key rule: wind-down supersedes thresholds automatically — `low_tray_threshold` is NEVER auto-edited.** The thresholds are peak-season numbers; they just stop being consulted for fudge in wind-down and stay valid for next season's peak. No manual threshold churn at the transition; the app carries to next season untouched (only new flavors/recipes need adding via `scripts/seed-recipes.mjs`).

---

## Auth

- Unauthenticated users: Dashboard + Shift Report only
- Authenticated (admin): all tabs
- RLS policies on all tables allow public read + insert; mutations guarded in UI by `isAdmin` check

---

## Common Pitfalls

- `useFlavors` filters `is_active = true` — if you need ALL flavors, query `flavors` directly.
- `batch_date` is `timestamptz` — slice to 10 chars before comparing to date strings.
- SSC recipes are 1× base (NOT 2×). Usual overnight flow: pours are logged as BASE batches (SSC gets tray entries only); a batch under the SSC flavor is only correct for a rare same-day make. Both for the same pour = double-deduction.
- `deductCaramelComponent` fires in `handleProductSubmit`, NOT `handleBatchSubmit`. Don't move it back.
- `autoDeductIngredients` filters `deduction_phase = 'batch'`. Don't remove that filter.
- **Never round deduction quantities.** `deliveryQty = recipe_qty / container_size` — full float. Rounding caused a silent zero-deduction bug all of early season 2026.
- Multi-pour flavors (Choc PB, Choc Raspberry) have the same ingredient appearing in two recipe rows with different `pour_label`. This is intentional — both deduct correctly because `activeIngMap` updates between rows.
- Seed script uses `pours` key for multi-base flavors and `ingredients` key for single-base. Main loop checks for both.
- `container_unit` = content unit (lbs, oz) NOT the container name. `unit` = delivery container (boxes, bags).
- The cross-day double-batch carry (`effectiveTotal`/`effectiveBatches`) only applies when `currentInProgress > 0`. Do NOT add `|| totalBatches > 0` back — that caused SSC to show "Both batches done" after a single click.
- There is no standalone `/batch` route. `Batch.jsx` was deleted. All batch logging goes through ShiftReport Batches tab.
- **Popcorn batches do NOT change barrels.** `handleBatchSubmit` only deducts ingredients for popcorn; barrels move via the Products tab, the Jarvis `add_popcorn_entry` tool, and the Audit & Edit popcorn section — all through `applyPopcornEntry` (`barrels_added`/`barrels_used`). `revertBatchLog` was fixed (June 2026) to match — it no longer decrements barrels or deletes shelf_bucket_logs for popcorn. Don't re-add that branch.
- **Shared effect helpers are the single source of truth.** `handleBatchSubmit`/`handleProductSubmit` and the Audit & Edit page both call `logBatchWithEffects` / `applyShiftEntry` / `applyTrayDeductions` / `computeTrayInventory` from `src/utils/inventoryActions.js`. Change the effect logic there, not inline, or the two paths drift.

---

## Audit & Edit Page — REMOVED July 2026 (Jarvis is the fix bot)

The `/audit-edit` page and all `src/components/audit/*` files were **deleted** at the owner's request — Jarvis already does the same corrections by chat, and the fast-paced kitchen prefers one tool. `/audit-edit` now redirects to `/`. Jarvis covers the equivalents: `log_batch` (with a date = backdate), `remove_batches` (revert/delete a mistake batch, refunds deductions), `add_product_entry` / `add_popcorn_entry` (fix a report), `set_inventory_count` (recount override — writes `inventory_adjustments`), `set_ingredient_quantity`, `move_batches` (wrong-day), and `get_recent_activity` (the activity log).

**The underlying effect helpers in `src/utils/inventoryActions.js` and `src/core/ops.js` still exist and are still used** — by the ShiftReport undo buttons and by Jarvis/MCP (`reverseShiftEntry`, `revertBatchLog`, `applyPopcornEntry`, `applyShiftEntry`, `logInventoryAdjustment`, etc.). Do NOT delete those. Only the page UI was removed. The notes below are retained for how those helpers behave:

- **Single source of truth:** all side effects go through `src/utils/inventoryActions.js`, which wraps the existing `autoDeduct.js` primitives. Backdating fires identical effects to live logging; no rounding is introduced.
- **Tray-phase deductions are now reversible.** `ingredient_deductions.shift_report_entry_id` links each tray deduction to its entry (set by `autoDeductTrayIngredients`'s 3rd arg). `reverseShiftEntry` refunds via that link; legacy entries (pre-column) fall back to recomputing the refund from the recipe and flag `legacy: true`.
- **Entry edit = reverse-then-reapply** (`reverseShiftEntry` then `applyShiftEntry`). The in-progress "topped" term isn't perfectly invertible (point-in-time state isn't stored) — net deltas reverse exactly for common cases; the Direct Inventory Correction tool is the safety net.
- **Caramel:** `deductCaramelComponent` (tray time) has an exact inverse `creditCaramelComponent`. Caramel display still computes forward from batch logs, so deleting an SSC entry self-corrects the Dashboard/Analytics caramel count.
- **Backdated entries** are grouped under a per-date `shift_reports` row with `report_type = 'manual_adjustment'`. No reads filter by `report_type`, so these count in Analytics/caramel exactly like `'snapshot'` entries.
- **Audit trail:** every #4/#5 override writes an `inventory_adjustments` row (target_type/target_id/field/old_value/new_value/reason) via `logInventoryAdjustment`.
- Schema added by `supabase/migrations/add_audit_edit_support.sql` (applied June 2026): `ingredient_deductions.shift_report_entry_id` + the `inventory_adjustments` table.
- **Popcorn barrels (`PopcornEntrySection.jsx`):** the popcorn equivalent of the tray-count fixer. Add/delete barrel movements for a date via `applyPopcornEntry` / `reversePopcornEntry` (`src/core/ops.js`). `shelf_bucket_logs` has no `report_date` — it's dated by `logged_at`, so backdated movements set `logged_at = {date}T12:00:00` and the section windows the picked day's timestamps. Reverse undoes the net barrel change only (in-progress topping isn't stored — Direct Inventory Correction is the safety net).

---

## Jarvis Assistant & MCP (Phase 2, live)

Conversational assistant (Claude Opus 4.8) that answers questions about the shop and takes
actions by chat, plus an MCP server so the owner's desktop assistant can do the same.

- **One shared core, three front-ends.** `src/core/ops.js` is client-agnostic (takes a Supabase
  client). It's used by: the browser app (anon client, via the `inventoryActions`/`autoDeduct`
  wrappers), the in-app Jarvis chat (`api/chat.js` + `src/components/JarvisWidget.jsx`, which executes tools via `src/utils/jarvisClientTools.js`), and the local MCP
  server (`mcp/server.js`, service-role client). **Change tool/deduction logic in core only** —
  never duplicate it per front-end.
- **Tools** are defined once in `src/core/toolSchemas.js` and executed by `runTool` in core.
  Reads: inventory/low-stock/sales-velocity/ingredient-stock/recent-activity/flavors/ingredients,
  plus `get_production_manual` (returns the full recipe/process/scale-weight manual from
  `src/core/productionManual.js` — for "how do I make X" / training questions; kept out of the
  base prompt to save tokens).
  Writes: `log_batch`, `add_product_entry`, `add_popcorn_entry`, `set_inventory_count`, `set_ingredient_quantity`,
  `log_fudge_pops`, `move_batches` (all route through the existing deduction helpers — no rounding, two-phase preserved).
  `move_batches` (`moveBatchDate` in core) fixes the DATE batches were logged for (wrong-day correction) — it only
  updates `batch_logs.batch_date`; ingredient stock is untouched since the deductions already happened and stay correct.
  `add_popcorn_entry` is the popcorn analogue of `add_product_entry`: barrels_added/barrels_sold/in_progress_barrels
  via `applyPopcornEntry`. Sales velocity + make-recommendations fold popcorn barrels_sold from `shelf_bucket_logs`,
  and `getMakeRecommendations` surfaces all popcorn flavors on weekend/Thu-Fri days (`fill_popcorn_today` flag).
- **Confirmation:** in-app writes confirm via `ConfirmDialog`; via MCP the desktop client's own
  tool-approval prompt is the gate.
- **Access:** owner-only. `/jarvis` is behind `AdminRoute`; `api/chat.js` verifies the Supabase
  access token (401 otherwise). The MCP server is local + service-role (RLS bypassed) — keep it
  on the owner's machine only.
- **Setup:** in-app chat needs `ANTHROPIC_API_KEY` in `.env` (local) and Vercel env. The MCP
  server reuses `SUPABASE_SERVICE_ROLE_KEY` (already in `.env`) and is registered in the desktop
  assistant per `mcp/README.md`. `vercel.json` excludes `/api` from the SPA rewrite. Run locally
  with `vercel dev` (plain `vite` won't serve `/api/chat`).

---

## Phase 2 — Data Intelligence (In Progress)

Phase 2 has already started. The season data being collected now is the foundation. The goal is to turn Jarvis into the brain for production and ordering decisions — replacing gut feel and memory with data-backed answers.

### What Phase 2 Covers

**What to make next**
- Which flavors are low relative to how fast they sell
- What the current shift should prioritize finishing (e.g. flag flavors with in-progress trays that can be topped)
- Factor in caramel tray count when recommending SSC production

**What sells most**
- Sales velocity per flavor (trays sold per day, by flavor)
- Identify top sellers vs. slow movers by time of season
- Spot flavors that consistently have waste vs. ones that always sell out

**What to order**
- Ingredient burn rate from `ingredient_deductions` → projected days of stock remaining
- Flag ingredients approaching `low_stock_threshold`
- Reorder recommendations based on deduction rate × remaining stock

**Threshold tuning**
- Use accumulated sales data to set smarter `low_tray_threshold` values per flavor
- Surface flavors where the alert threshold is too high (crying wolf) or too low (always caught short)

### Data Already Being Collected (Ready for Phase 2)
- `batch_logs` — every batch made, with date and flavor
- `shift_report_entries` — trays made, sold, wasted per flavor per session
- `ingredient_deductions` — every auto-deduction with exact qty, ingredient, and timestamp
- `shelf_bucket_logs` — barrel movements in and out for popcorn
- `current_inventory` — live tray/barrel counts

### Phase 2 Implementation Notes
- All analysis should be scoped to `SEASON_START = '2026-04-22'` to exclude pre-season test data
- The owner (Zach) will drive Phase 2 through Jarvis — expect questions like "what should I make today?", "what do I need to order?", "which flavors are underperforming?"
- A Supabase Edge Function or similar backend will likely be needed to query the DB and pass structured context to a language model for natural-language answers
- Analytics tab is the starting point for surfacing this data visually before any AI layer is added
