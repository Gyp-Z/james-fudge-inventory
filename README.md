# James' Fudge Inventory

A full-stack kitchen management app built for a real small business — James' Fudge, a family-owned fudge store in Sea Isle City, NJ.

The store runs daily shifts where staff need to know what's in stock, what sold out, and what needs to be made. This app replaces a manual whiteboard-and-memory system with a real-time dashboard, production logs, and trend analytics.

**Live app:** Coming soon — deploying to Vercel once Supabase is active

---

## What It Does

### Shift Reports
Staff start each shift by logging current stock levels, marking items that sold out, and flagging what needs to be produced. This creates a timestamped record of every shift.

### Batch Log
When a batch of fudge is made, staff log the flavor and weight in pounds. Every production run is tracked — not just that it happened, but how much was made.

### Live Dashboard
Real-time view of current inventory across all flavors, with automatic low-stock alerts. Today's batches are surfaced at the top so staff can see what's been made without digging.

### Analytics
Charts and trends built on the logged data:
- Which flavors stock out most often
- Production volume by flavor over time
- Weekly production trends
- Helps the owner make smarter stocking and production decisions over the season

### Admin Panel
Manage the full flavor catalog — add new flavors, archive discontinued ones, restore archived flavors. Changes reflect immediately across the app.

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

Active development. Core features are working. Analytics and admin panel are complete. Next up: print-friendly shift summary, mobile UX polish, and historical data export.
