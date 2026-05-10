# James' Fudge Inventory — Agent Notes

This file is for Claude / AI agents working on this codebase. Not user-facing.

---

## What This App Is

James' Fudge is a family-owned fudge and popcorn shop in Sea Isle City, NJ. It runs a tight summer operation — small staff, daily production, and a lot of product moving in and out. Before this app, everything was tracked by memory and whiteboard handoff between shifts.

This app gives the owner and staff real-time visibility into stock, production, and ingredients without needing any technical knowledge. It runs on a tablet in the kitchen.

---

## Daily Workflow

**Morning (staff)**
1. Open Dashboard — check what's on the shelf from yesterday, what flavors are low
2. See Caramel tray count to know if SSC can still be made
3. Check Popcorn Shelves section to see how many small/large buckets of Caramel Corn and Nut Caramel Corn are out

**During the day (staff)**
- When a batch is made: open Shift Report → Products tab → log the batch. This auto-deducts recipe ingredients from stock.
- When barrels of popcorn move to shelf: log barrel/bucket movements in the Products tab
- When an order of supplies arrives: Shift Report → Ingredients tab → Order Received

**End of shift (staff)**
- Submit the Products report: trays sold, trays wasted (with reason), in-progress counts
- The report is additive — staff can submit multiple times per day, each submission adds deltas

**Admin (owner only)**
- Analytics tab: review trends — what's selling, what's being wasted, how long stock lasts
- Ingredients tab: adjust quantities after a physical recount, set thresholds, review auto-deduction log
- Admin tab: add/deactivate flavors, set yield and alert thresholds, manage bucket alert thresholds for shelf-tracked popcorn flavors

---

## Jarvis Context

When helping with this codebase, keep this business context in mind:

- **Staff are non-technical.** The UI must be simple and forgiving. Large tap targets, clear labels, minimal steps.
- **The owner wants numbers, not complexity.** Analytics should be readable at a glance — summaries first, charts second.
- **Recipes and ingredient deductions are load-bearing.** A wrong deduction multiplier or unit conversion silently breaks ingredient stock counts. Be careful with recipe math.
- **The season runs ~May–September.** `SEASON_START = '2026-04-22'` is the anchor for all running totals. Pre-season test data exists in the DB but is excluded from charts and caramel calculations.
- **Caramel is not sold directly.** It's a component that feeds Sea Salt Caramel fudge. Its count is computed forward from batch logs, not read from `current_inventory` — because the stored value drifts if SSC deductions ever had wrong yields.
- **Shelf buckets (Caramel Corn, Nut Caramel Corn) are separate from barrels.** Barrels are the production unit; buckets are the retail unit. `shelf_bucket_logs` tracks both the fill event and the sale event.

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
- Each SSC batch yields 6 trays → deducts `6/18` of a caramel tray
- Constant: `CARAMEL_TRAYS_PER_SSC_TRAY = 1/18` in `src/utils/autoDeduct.js`
- SSC detection: `flavorName.toLowerCase().includes('sea salt')`
- Caramel count in Dashboard and Analytics is computed **forward from batch logs** (season start Apr 22 2026), NOT from `current_inventory.tray_count` — the stored value can drift if deductions were logged with wrong yield. The graph starts at the full stocked peak (total caramel batches made) and only plots SSC drops.
- Display format: `1 6/18` (whole + numerator/18). Admin page accepts `X Y/18`, `Y/18`, or decimal.

### Batch logging → auto-deduction
When a batch is logged in Shift Report:
1. `autoDeductIngredients(flavorId, batchLogId)` — fetches `recipes` rows, converts recipe qty → delivery units using `container_size`, deducts from `ingredients.quantity`, inserts into `ingredient_deductions`.
2. `deductCaramelComponent(flavorName, batchYield)` — runs for SSC flavors only, deducts from `current_inventory.tray_count` for Caramel.
3. `incrementBarrelCount(flavorId, amount)` — runs for popcorn batches only.
4. Fudge `tray_count` is NOT auto-incremented on batch log — managed via Shift Report shelf counts.

### Recipes
- Stored in `recipes` table: `(flavor_id, ingredient_id, quantity_per_batch, unit)`
- Seeded by `scripts/seed-recipes.mjs`
- SSC flavors = 2× their base (mergeIngredients handles deduplication and summing)
- Seed does delete-then-insert per flavor — safe to re-run, always produces clean state
- Key quantities: Peanuts = 5 lbs, Butter per vanilla base = 2 lbs (commercial 1 lb sticks so container_size = 1)

### Shelf buckets (Caramel Corn, Nut Caramel Corn)
- `shelf_bucket_logs` table: `small_buckets_made`, `large_buckets_made`, `small_buckets_sold`, `large_buckets_sold`, `barrels_used`
- Dashboard computes net on-shelf counts by summing all rows (made - sold)
- Alert thresholds: `low_small_bucket_threshold`, `low_large_bucket_threshold` on `flavors` table

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
| `flavors` | Flavor catalog. `product_type` = fudge/popcorn. `is_component` = true for Caramel. `default_yield` = trays/barrels per batch. |
| `current_inventory` | Source of truth for tray/barrel counts. `tray_count` + `barrel_count`. |
| `batch_logs` | One row per batch logged. `flavor_id`, `batch_date`, `is_wasted`. |
| `shift_reports` | One per reporting session. `report_date`. |
| `shift_report_entries` | Per-flavor deltas within a report. `full_trays`, `trays_sold`, `trays_wasted`, `in_progress_trays`. |
| `ingredients` | Raw ingredient stock. `quantity`, `unit`, `container_size`, `low_stock_threshold`, `is_active`. |
| `recipes` | Per-batch ingredient quantities. `quantity_per_batch`, `unit`. Links flavor → ingredient. |
| `ingredient_deductions` | Audit log of auto-deductions. Inserted by `autoDeductIngredients`. |
| `shelf_bucket_logs` | Popcorn shelf bucket events (made/sold/used). |

---

## Key Files

| File | Role |
|---|---|
| `src/pages/Dashboard.jsx` | Main stock view. Loads inventory + batch logs + all flavors for caramel computation. |
| `src/pages/ShiftReport.jsx` | Staff report form. Calls auto-deduction after batch inserts. |
| `src/pages/Analytics.jsx` | Charts. `caramelComputedTotal` + `caramelStockData` computed from batch logs forward. |
| `src/pages/Admin.jsx` | Flavor management + inline count editing. |
| `src/pages/Ingredients.jsx` | Ingredient management + deduction log. |
| `src/utils/autoDeduct.js` | `autoDeductIngredients`, `deductCaramelComponent`, `incrementBarrelCount`. |
| `src/hooks/useFlavors.js` | Loads active flavors (`is_active = true`). Does NOT include inactive flavors — use a separate query if you need inactive SSC flavors for deduction math. |
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

- `useFlavors` filters `is_active = true` — if you need ALL flavors (e.g. detecting inactive SSC flavors in analytics), query `flavors` directly without the filter.
- `batch_date` is `timestamptz` — slice to 10 chars before comparing to date strings.
- `mergeIngredients` in seed-recipes.mjs sums duplicate name+unit entries — SSC recipes use `mergeIngredients([BASE, BASE])` to get correct 2× quantities as single rows.
- Caramel display uses `/18` fractions — the denominator is always 18 (not a variable).
- When re-seeding recipes, the script deletes all rows for each flavor before inserting — this means ingredient_deductions refs to old recipe ingredient_ids are preserved (SET NULL on delete) but the recipes themselves are fresh.
