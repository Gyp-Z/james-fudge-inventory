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
- **Yesterday's Shelf** — what was on the shelf at end of yesterday so morning shift knows what dried overnight

**Caramel**
- Shows the Caramel (component) flavor separately since it feeds Sea Salt Caramel production
- Count is computed from batch history (season start forward) using correct 6/18 caramel-per-SSC-tray rate
- Fraction displayed as e.g. `1 6/18`

**Popcorn**
- Barrel counts per flavor with low-stock alerts
- **Popcorn Shelves** — live bucket counts (small/large) computed from shelf_bucket_logs for Caramel Corn and Nut Caramel Corn

**Ingredients**
- Negative-quantity warnings (manual recount needed) shown at the top
- Low/out ingredients listed with Out/Low badges
- All stocked ingredients listed below

---

### Shift Report (`/report`)
Submitted any time stock changes — after making batches, after selling, or at end of shift. Two tabs:

**Products tab**
- Log fudge batches made (full trays + in-progress), trays sold, trays wasted (with reason)
- Log popcorn batches and barrel movements
- Log shelf bucket fill/sell events for Caramel Corn and Nut Caramel Corn
- Submitting a batch automatically deducts recipe ingredients from stock

**Ingredients tab**
- **Used This Session** — manually log ingredient usage (subtracts from stock, inserts audit row)
- **Order Received** — log incoming supply; adds to stock

**Auto-deduction on batch log:**
Each batch logged triggers `autoDeductIngredients` which:
1. Fetches the flavor's recipe from the `recipes` table
2. Converts recipe quantities to delivery units using each ingredient's `container_size`
3. Subtracts from `ingredients.quantity` and inserts a row into `ingredient_deductions`
4. Allows quantities to go negative (triggers a warning on dashboard — manual recount needed)

For Sea Salt Caramel batches, `deductCaramelComponent` also runs:
- 1 caramel tray = enough for 18 SSC trays
- Each SSC batch yields 6 trays → deducts 6/18 of a caramel tray from `current_inventory`

---

### Analytics (`/analytics`) — Admin only
Charts and stats filtered by 7 Days / 30 Days / All Time.

**Summary cards (always visible)**
- Fudge trays in stock
- Popcorn barrels in stock
- Caramel trays in stock (computed from batch history, shown as e.g. `1 6/18`)

**Fudge mode**
- Sold / Wasted / In Stock summary cards
- Sales bar chart — trays sold per day by flavor
- Waste bar chart + detail table (date, flavor, trays, reason)
- Stock Trend line chart — inventory level per flavor over time

**Caramel mode**
- Stock Trend line chart — starts at the full stocked count on the first caramel batch date, drops when SSC batches are logged

**Popcorn mode**
- Batches Made / Wasted summary cards
- Barrels Sold bar chart
- Wasted Batches bar chart
- Shelves sub-view (Caramel Corn / Nut Caramel Corn only): Buckets Made + Bucket Sales line/bar charts

---

### Ingredients (`/ingredients`) — Admin only
Manage raw ingredient inventory:
- Tap quantity to edit inline
- Set low-stock threshold per ingredient
- Archive / restore ingredients
- **Recent Deductions** section — last 50 auto-deductions with date, flavor, ingredient, amount

---

### Admin / Products (`/admin`) — Admin only
Manage flavors and component inventory:
- Add new flavors with name, product type (fudge/popcorn), stock unit (tray/barrel), and thresholds
- Click tray/barrel count to edit inline — supports `X Y/18` fraction format for Caramel
- Toggle flavors active/inactive (inactive flavors disappear from reports and dashboard)
- Restore archived flavors
- Set `default_yield`, `tracks_shelf_buckets`, and bucket alert thresholds per flavor

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
2. Run the migration SQL blocks in `supabase/migration_v2_popcorn_recipes.sql` via the SQL Editor
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

This seeds per-batch ingredient quantities for all fudge and popcorn flavors. Safe to re-run — it deletes and re-inserts recipe rows cleanly each time.

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

## Project Background

James' Fudge has been a Sea Isle City staple for decades. The store runs a tight summer operation with a small staff making fudge and popcorn daily. Before this app, stock tracking was done by memory and verbal handoff between shifts — which meant lost data, repeated work, and no visibility into what was actually selling.

This app was built to give the owners real visibility into their kitchen for the first time, without requiring any technical knowledge to operate it.
