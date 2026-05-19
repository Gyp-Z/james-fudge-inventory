# James' Fudge Inventory

A full-stack kitchen management app built for a real small business — James' Fudge, a family-owned fudge and popcorn store in Sea Isle City, NJ.

The store runs daily shifts where staff need to know what's in stock, what sold out, and what needs to be made. This app replaces a manual whiteboard-and-memory system with a real-time dashboard, production logs, ingredient auto-deduction, and trend analytics.

**Live app:** [james-fudge-inventory.vercel.app](https://james-fudge-inventory.vercel.app)

---

## Access Levels

| View | Who | How |
|---|---|---|
| Staff | Not logged in | Dashboard + Shift Report only |
| Admin (owner) | Logged in | All tabs |

---

## App Tabs

### Dashboard (`/`)
Real-time stock status for everything in the store, split into sections:

**Fudge**
- **Make Soon** — flavors at or below `low_tray_threshold` (red/amber pills)
- **In Stock** — flavors above threshold (green pills)
- **Yesterday's Shelf** — fudge trays and popcorn barrels that were on the shelf at end of yesterday, so morning shift knows what dried overnight

**Caramel**
- Shows the Caramel (component) flavor separately since it feeds Sea Salt Caramel production
- Count is computed from batch history (season start forward) using correct 6/18 caramel-per-SSC-tray rate
- Fraction displayed as e.g. `1 6/18`

**Popcorn**
- Barrel counts per flavor with low-stock alerts

**Ingredients**
- Negative-quantity warnings (manual recount needed) shown at the top
- Low/out ingredients listed with Out/Low badges
- All stocked ingredients listed below

---

### Shift Report (`/report`)
Three tabs: Batches, Products, Ingredients.

**Batches tab**
- Log fudge and popcorn batches made (or wasted) for the day
- Logging a batch auto-deducts base recipe ingredients from stock
- **Double-batch reminder badges** — 16 flavors that require 2 physical pours show an amber "1 of 2" badge after the first batch is logged, turning green when both are done
- **Base-group reminders** — logging a plain Vanilla or Chocolate batch triggers reminder badges on all flavors that use that base (e.g. logging Vanilla highlights Cookies & Cream, Vanilla Chocolate Chip, Vanilla M&M, etc.)

**Products tab**
- Log trays made (full + in-progress), trays sold, and trays wasted (with reason) per fudge flavor
- Log barrel movements for popcorn flavors
- Each fudge flavor card has a collapsible **Recipe ▾** section showing per-batch ingredients and per-tray toppings
- Submitting the report auto-deducts per-tray toppings (M&Ms, walnuts, oreos, etc.) based on full tray counts entered
- SSC caramel deduction also fires at submit time (not batch time), based on full SSC trays reported

**Ingredients tab**
- **Order Received** — log incoming supply; adds to stock
- **Manual Usage** — log ingredient usage outside of a batch (subtracts from stock, inserts audit row)

---

### Two-Phase Ingredient Deduction

Recipes are split into two phases:

| Phase | Trigger | What it deducts |
|-------|---------|-----------------|
| `batch` | When a batch is logged | Base ingredients only (sugar, butter, cream, etc.) |
| `tray` | When shift report is submitted | Per-tray toppings (M&Ms, walnuts, oreo pieces, chocolate chips, reese's pieces, marshmallows) |

This ensures toppings are deducted accurately based on how many trays of each flavor were actually produced — not just how many base batches were logged.

**Multi-pour flavors** (Chocolate Peanut Butter, Chocolate Raspberry) have two labeled pour sections in the recipe display (e.g. "Per batch — Peanut Butter base" and "Per batch — Chocolate base").

**SSC caramel:** 1 caramel tray = enough for 18 SSC trays. Deduction moves from batch time to tray-submit time so it reflects actual production, not estimated batches.

---

### Analytics (`/analytics`) — Admin only
Charts and stats filtered by 7 Days / 30 Days / All Time.

**Summary cards (always visible, all three modes)**
- **Fudge trays** — trays in stock + trays sold + trays wasted (for the selected time range)
- **Popcorn barrels** — barrels in stock + barrels sold + batches wasted
- **Caramel trays** — trays in stock (computed from batch history, shown as e.g. `1 6/18`) + batches wasted

**Fudge mode**
- Sales bar chart — trays sold per day by flavor
- Waste bar chart + detail table (date, flavor, trays, reason)
- Stock Trend line chart — inventory level per flavor over time

**Caramel mode**
- Stock Trend line chart — starts at full peak on the first caramel batch date, drops each time SSC batches are logged; no data points plotted before the first caramel batch

**Popcorn mode**
- Barrels on Shelf trend line chart — stock level over time
- Barrels Made cumulative line chart
- Barrels Sold bar chart
- Wasted Batches bar chart

---

### Ingredients (`/ingredients`) — Admin only
Manage raw ingredient inventory:
- Tap quantity to edit inline
- Set low-stock threshold per ingredient
- Set **container size** per ingredient inline (e.g. "50 lbs per bag") — required for auto-deduction to work; rows without it show an amber "Set container size" prompt
- Container size format: `{amount} {content unit} per {delivery unit}` — e.g. "400 oz per box", "40 pieces per bag"
- Archive / restore ingredients (Archive button sits inline with the ingredient name)
- **Recent Deductions** section — last 50 auto-deductions with date, flavor, ingredient, amount

---

### Admin / Products (`/admin`) — Admin only
Manage flavors and component inventory:
- **Add new product** with name, type (Fudge / Popcorn toggle), default yield, and alert threshold — automatically creates the inventory row on add
- Click tray/barrel count to edit inline — supports `X Y/18` fraction format for Caramel
- Toggle flavors active/inactive (inactive flavors disappear from reports and dashboard)
- Restore archived flavors

---

## Flavor & Recipe System

### Base Groups
Each flavor is assigned one or more base groups in the `flavors.base_groups` column:

| Base | Flavors |
|------|---------|
| `vanilla` | Vanilla, Vanilla M&M, Vanilla Walnut, Vanilla Marshmallow, Vanilla SSC, Vanilla Chocolate Chip, Cookies & Cream, Dirt, Key Lime, Pistachio, Snickerdoodle |
| `chocolate` | Chocolate, Chocolate M&M, Chocolate Walnut, Chocolate Marshmallow, Chocolate SSC, Chocolate Rocky Road, Chocolate Reese's, Chocolate Raspberry, Chocolate Mint, Chocolate Coconut, Dirt |
| `brown_sugar` | Maple Walnut |
| `peanut_butter` | Peanut Butter |
| Multi-base | Chocolate Peanut Butter `['chocolate','peanut_butter']`, Chocolate Raspberry `['chocolate']` |

### Double-Batch Reminder Flavors
These 16 flavors require 2 physical pours per complete make and show reminder badges in the Batches tab:
Chocolate M&M, Chocolate SSC, Chocolate Walnut, Maple Walnut, Vanilla Chocolate Chip, Vanilla Marshmallow, Vanilla SSC, Vanilla Walnut, Chocolate Marshmallow, Chocolate Peanut Butter, Chocolate Raspberry, Chocolate Reese's, Chocolate Rocky Road, Cookies & Cream, Dirt, Vanilla M&M.

### Seeding Recipes
```bash
node --env-file=.env scripts/seed-recipes.mjs
```
Safe to re-run — deletes and re-inserts per flavor each time. Supports `ingredients` (single-base) and `pours` (multi-base labeled sections) entries.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite 8 |
| Routing | React Router v7 |
| Database + Auth | Supabase (PostgreSQL) |
| Charts | Recharts |
| Styling | Tailwind CSS v4 |
| Deployment | Vercel |

---

## Local Setup

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Run migrations via the SQL Editor (see `supabase/` directory)
3. Go to **Authentication > Users** and create an admin account
4. Copy your Project URL and anon key from **Settings > API**

### 2. Environment Variables

```bash
cp .env.example .env
```

Fill in `.env`:

```
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key   # seed script only
```

### 3. Seed Recipes

```bash
node --env-file=.env scripts/seed-recipes.mjs
```

### 4. Run Locally

```bash
npm install
npm run dev
```

### 5. Deploy to Vercel

1. Push to GitHub
2. Import at [vercel.com](https://vercel.com)
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables
4. Deploy — Vercel auto-detects Vite

---

## Key Database Columns (common gotchas)

| Column | Notes |
|--------|-------|
| `recipes.deduction_phase` | `'batch'` or `'tray'` — controls when deduction fires |
| `recipes.pour_label` | Empty string for single-base flavors; named label (e.g. `'Chocolate base'`) for multi-pour flavors |
| `flavors.double_batch_reminder` | Boolean — shows reminder badges in Batches tab |
| `flavors.base_groups` | `text[]` — drives cross-flavor base reminders in Products tab |
| `ingredients.container_unit` | The **content unit** (lbs, oz, cups) — NOT the container name |
| `ingredients.unit` | The **delivery unit** (boxes, bags, sticks) — what stock is counted in |
| `batch_logs.batch_date` | `timestamptz` — always `.slice(0, 10)` before comparing to date strings |

---

## Season

Season start: **2026-04-22**. Pre-season test data is excluded from all charts and caramel calculations.

---

## Project Background

James' Fudge has been a Sea Isle City staple for decades. The store runs a tight summer operation with a small staff making fudge and popcorn daily. Before this app, stock tracking was done by memory and verbal handoff between shifts — which meant lost data, repeated work, and no visibility into what was actually selling.

This app was built to give the owners real visibility into their kitchen for the first time, without requiring any technical knowledge to operate it.
