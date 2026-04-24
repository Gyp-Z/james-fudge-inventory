# James' Fudge Inventory

A full-stack kitchen management app built for a real small business — James' Fudge, a family-owned fudge store in Sea Isle City, NJ.

The store runs daily shifts where staff need to know what's in stock, what sold out, and what needs to be made. This app replaces a manual whiteboard-and-memory system with a real-time dashboard, production logs, and trend analytics.

**Live app:** [james-fudge-inventory.vercel.app](https://james-fudge-inventory.vercel.app)

---

## Access Levels

| View | Who | How |
|---|---|---|
| Staff (chef) | Not logged in | Dashboard + Report only |
| Admin (owner) | Logged in | All tabs |

Staff see fudge stock and can submit product reports. Ingredient tracking, analytics, and product management are admin-only.

---

## App Tabs

### Dashboard (`/`)
Real-time stock status for all active flavors, split into:
- **Make Soon** — flavors at or below their `low_tray_threshold` (shown in red/amber pills)
- **In Stock** — flavors above threshold (shown in green pills)
- **Yesterday's Shelf** — what was on the shelf at end of yesterday, so morning shift knows what dried overnight
- **Ingredients Alert** — ingredients at or below their low-stock threshold *(admin only)*
- Flavor pills also show in-progress tray count if nonzero

### Report (`/report`)
Staff submit this any time stock changes — after making a batch, after a busy selling period, at end of shift. Each submission is a full snapshot of current counts plus what sold and wasted since the last report.

**Products tab** (all users):
- Full trays on shelf, in-progress trays, trays sold, trays wasted (with reason)
- Running today's total of already-logged figures shown per flavor, so the next person knows what's been counted

**Ingredients tab** (admin only):
- Log how much of each ingredient was used (depleted) this session
- Each submission inserts a row into `ingredient_depletions` and subtracts from current stock

### Analytics (`/analytics`) — Admin only
Charts and summary stats built from all shift report data:
- **Sold / Wasted / In Stock** summary cards (7-day, 30-day, or all-time)
- **Sales chart** — trays sold per day, grouped by flavor (bar chart)
- **Waste chart** — total trays wasted per flavor + detail table with dates and reasons
- **Stock Trend** — `full_trays` over time, one line per flavor (line chart)
- Date range filter: 7 Days / 30 Days / All Time

### Ingredients (`/ingredients`) — Admin only
Track raw ingredient inventory. Each ingredient has a quantity, unit, and low-stock threshold.
- Tap the quantity to edit it inline
- Set a low-stock alert threshold per ingredient
- Archive/restore ingredients
- Low/out ingredients surface on the Dashboard automatically

### Products / Admin (`/admin`) — Admin only
Manage the flavor catalog:
- Add new flavors with name and low-tray threshold
- Each flavor shows current tray count + Out/Low/OK status badge
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

Active development — pre-season testing phase (season opens ~May 9). Core features working: shift reports, dashboard with yesterday's shelf, analytics with sales/waste/stock trend charts, ingredient depletion tracking, admin panel.
