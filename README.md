# James' Fudge Inventory

Inventory and kitchen management app for James' Fudge, Sea Isle City NJ.

Built with React + Vite, Supabase, Recharts, and Tailwind CSS.

## Features

- **Shift Report** -- Start-of-shift stock snapshot, sold out markers, what needs to be made
- **Batch Log** -- Log fudge production with flavor and weight (lbs)
- **Dashboard** -- Live stock overview, low-stock alerts, today's batches
- **Analytics** -- Stockout frequency, production by flavor, weekly trends
- **Admin** -- Manage the flavor list (add, archive, restore)

## Setup

### 1. Supabase

1. Create a free project at supabase.com
2. Go to SQL Editor and run `supabase/schema.sql`
3. Go to Authentication > Users and create a user (store email + password)
4. Copy your Project URL and anon key from Settings > API

### 2. Environment

```bash
cp .env.example .env
```

Fill in your Supabase URL and anon key in `.env`.

### 3. Run locally

```bash
npm install
npm run dev
```

### 4. Deploy to Vercel

1. Push to GitHub
2. Connect repo in vercel.com
3. Add environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
4. Deploy

## Stack

| Layer | Choice |
|-------|--------|
| Frontend | React 19 + Vite 8 |
| Routing | React Router v7 |
| Database + Auth | Supabase (Postgres) |
| Charts | Recharts |
| Styling | Tailwind CSS v4 |
| Deployment | Vercel |
