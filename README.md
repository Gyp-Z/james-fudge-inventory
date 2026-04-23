# James' Fudge Inventory

A full-stack kitchen management app built for a real small business — James' Fudge, a family-owned fudge store in Sea Isle City, NJ.

The store runs daily shifts where staff need to know what's in stock, what sold out, and what needs to be made. This app replaces a manual whiteboard-and-memory system with a real-time dashboard, production logs, and trend analytics.

**Live app:** [james-fudge-inventory.vercel.app](https://james-fudge-inventory.vercel.app)

---

## For Jarvis (AI Assistant)

This section describes the full data model and app behavior so an AI assistant can accurately answer questions, help with inventory decisions, and assist staff.

### What Jarvis should know

- Every time a staff member submits a **Report**, it creates a `shift_report` row and one `shift_report_entry` row per active flavor.
- Each entry records: `full_trays` (what's physically on the shelf), `in_progress_trays` (being made/drying), `trays_sold` (sold since last report), `trays_wasted` (thrown out), and `waste_reason`.
- Reports are submitted multiple times per day — every time something changes. There is no single "closing report"; each submission is a snapshot.
- The **most recent report per flavor** (by `created_at`) is the source of truth for current stock.
- **In Stock** (on the Analytics page) = sum of `full_trays` from each flavor's most recent report entry.
- Each tray of fudge weighs approximately **7.25 lbs** of product (8.40 lbs total minus ~1.15 lbs for the tray and paper).
- Flavors are managed in the Admin (Products) tab. Active flavors appear across the app; inactive ones are archived but not deleted.
- Ingredients are tracked separately with quantities and low-stock thresholds.
- The season runs approximately **May–September**. Data before May 9 is pre-season testing.

### Key tables (Supabase / PostgreSQL)

| Table | Purpose |
|---|---|
| `flavors` | Flavor catalog — name, `is_active`, `low_tray_threshold` |
| `shift_reports` | One row per report submission — `report_date`, `created_at`, `report_type`, `logged_by` |
| `shift_report_entries` | One row per flavor per report — `full_trays`, `in_progress_trays`, `trays_sold`, `trays_wasted`, `waste_reason` |
| `ingredients` | Ingredient inventory — `name`, `quantity`, `unit`, `low_stock_threshold`, `is_active` |
| `current_inventory` | Denormalized tray counts updated on each report submit (used as fallback) |
| `batch_logs` | Production log — `flavor_id`, `batch_date`, `weight_lbs` |

---

## App Tabs

### Dashboard (`/`)
Real-time stock status for all active flavors, split into:
- **Make Soon** — flavors at or below their `low_tray_threshold` (shown in red/amber pills)
- **In Stock** — flavors above threshold (shown in green pills)
- **Yesterday's Shelf** — what was on the shelf at end of yesterday, so morning shift knows what dried overnight
- **Ingredients Alert** — ingredients at or below their low-stock threshold
- Flavor pills also show in-progress tray count if nonzero

### Report (`/report`)
Staff submit this any time stock changes — after making a batch, after a busy selling period, at end of shift. Each submission is a full snapshot of current counts plus what sold and wasted since the last report.

Each flavor card shows:
- Full trays (on the shelf, complete)
- In-progress trays (drying, not ready yet)
- Trays sold (since last report)
- Trays wasted (with reason if >0)
- A running today's total of already-logged sold/stock figures, so the next person knows what's been counted

### Analytics (`/analytics`) — Admin only
Charts and summary stats built from all shift report data:
- **Sold / Wasted / In Stock** summary cards (7-day, 30-day, or all-time)
- **Sales chart** — trays sold per day, grouped by flavor (bar chart)
- **Waste chart** — total trays wasted per flavor + detail table with dates and reasons
- **Stock Trend** — `full_trays` over time, one line per flavor (line chart)
- Date range filter: 7 Days / 30 Days / All Time

### Ingredients (`/ingredients`)
Track raw ingredient inventory. Each ingredient has a quantity, unit, and low-stock threshold. Staff can update quantities directly. Low-stock items surface on the Dashboard automatically.

### Products / Admin (`/admin`) — Admin only
Manage the flavor catalog:
- Add new flavors with name and low-tray threshold
- Toggle flavors active/inactive (inactive flavors disappear from reports and dashboard)
- Restore archived flavors

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
2. Open the SQL Editor and run `supabase/schema.sql` to create all tables
3. Go to **Authentication > Users** and create a user account
4. Copy your Project URL and anon key from **Settings > API**

### 2. Environment Variables

```bash
cp .env.example .env
```

Fill in your Supabase credentials in `.env`:

```
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### 3. Run Locally

```bash
npm install
npm run dev
```

### 4. Deploy to Vercel

1. Push the repo to GitHub
2. Import it at [vercel.com](https://vercel.com)
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables
4. Deploy — Vercel auto-detects Vite and builds correctly

---

## Project Background

James' Fudge has been a Sea Isle City staple for decades. The store runs a tight summer operation with a small staff making fudge daily. Before this app, stock tracking was done by memory and verbal handoff between shifts — which meant lost data, repeated work, and no visibility into what was actually selling.

This app was built to give the owners real visibility into their kitchen for the first time, without requiring any technical knowledge to operate it.

---

## Status

Active development — pre-season testing phase (season opens ~May 9). Core features working: shift reports, dashboard with yesterday's shelf, analytics with sales/waste/stock trend charts, ingredient tracking, admin panel.
