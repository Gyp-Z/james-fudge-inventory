/**
 * fix-data.js — Seeds shift report, ingredients, and creates shift_report_entries table.
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY if present (bypasses RLS, can do all ops).
 * Falls back to VITE_SUPABASE_ANON_KEY for ops the anon key can reach.
 * Anything blocked prints a manual SQL block to paste in the Supabase dashboard.
 *
 * Run: node scripts/fix-data.js
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env')
const envVars = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    })
)

const SUPABASE_URL = envVars['VITE_SUPABASE_URL']
const SERVICE_KEY = envVars['SUPABASE_SERVICE_ROLE_KEY']
const ANON_KEY = envVars['VITE_SUPABASE_ANON_KEY']

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

const hasServiceKey = !!SERVICE_KEY
const activeKey = SERVICE_KEY || ANON_KEY

if (!hasServiceKey) {
  console.warn('⚠  No SUPABASE_SERVICE_ROLE_KEY in .env — some ops will need manual SQL in the dashboard.')
  console.warn('   Add SUPABASE_SERVICE_ROLE_KEY=<your-key> to .env and re-run to do everything automatically.\n')
}

const supabase = createClient(SUPABASE_URL, activeKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Check table existence ────────────────────────────────────────────────────
const { error: tableCheckErr } = await supabase.from('shift_report_entries').select('id').limit(1)
const tableExists = !tableCheckErr

// ─── Check if ingredients is empty ───────────────────────────────────────────
const { data: existingIngs, error: ingCheckErr } = await supabase.from('ingredients').select('id').limit(1)
// If RLS blocks this, ingCheckErr will be set — treat as "unknown"
const ingredientsHasData = !ingCheckErr && existingIngs && existingIngs.length > 0

// ─── Try to run DDL if service key is available ───────────────────────────────
async function runSQL(label, sql) {
  for (const fn of ['exec_sql', 'run_sql', 'execute_sql']) {
    const { error } = await supabase.rpc(fn, { query: sql })
    if (!error) {
      console.log(`✓ ${label}`)
      return true
    }
    if (!error.message?.includes('Could not find')) break
  }
  return false
}

let ddlOk = tableExists
if (!tableExists && hasServiceKey) {
  const sqlBlocks = [
    ['CREATE shift_report_entries', `CREATE TABLE IF NOT EXISTS shift_report_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES shift_reports(id) ON DELETE CASCADE,
  flavor_id uuid NOT NULL REFERENCES flavors(id),
  full_trays integer NOT NULL DEFAULT 0,
  in_progress_trays integer NOT NULL DEFAULT 0,
  trays_made integer DEFAULT 0,
  trays_wasted integer DEFAULT 0,
  waste_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);`],
    ['ENABLE RLS on shift_report_entries', `ALTER TABLE shift_report_entries ENABLE ROW LEVEL SECURITY;`],
    ['SELECT policy', `CREATE POLICY "Public read shift_report_entries" ON shift_report_entries FOR SELECT USING (true);`],
    ['INSERT policy', `CREATE POLICY "Public insert shift_report_entries" ON shift_report_entries FOR INSERT WITH CHECK (true);`],
  ]
  const results = await Promise.all(sqlBlocks.map(([label, sql]) => runSQL(label, sql)))
  ddlOk = results.every(Boolean)
}

// ─── Get Vanilla flavor ───────────────────────────────────────────────────────
const { data: vanilla, error: vanillaErr } = await supabase
  .from('flavors')
  .select('id')
  .eq('name', 'Vanilla')
  .single()

if (vanillaErr || !vanilla) {
  console.error('Could not find Vanilla flavor:', vanillaErr?.message)
  console.error('Run seed.js first: node --env-file=.env scripts/seed.js')
  process.exit(1)
}
console.log(`✓ Vanilla flavor found (id: ${vanilla.id})`)

// ─── Insert shift report ──────────────────────────────────────────────────────
// Live DB has: id, shift_date, notes, logged_by, created_at (no report_type column)
const { data: report, error: reportErr } = await supabase
  .from('shift_reports')
  .insert({ shift_date: '2026-04-22' })
  .select()
  .single()

if (reportErr) {
  console.error('Error inserting shift report:', reportErr.message)
  process.exit(1)
}
console.log(`✓ Inserted shift report for 2026-04-22 (id: ${report.id})`)

// ─── Insert shift_report_entries row ─────────────────────────────────────────
if (ddlOk) {
  const { error: entryErr } = await supabase.from('shift_report_entries').insert({
    report_id: report.id,
    flavor_id: vanilla.id,
    full_trays: 15,
    in_progress_trays: 0,
    trays_made: 15,
    trays_wasted: 0,
  })
  if (entryErr) {
    console.error('Error inserting shift_report_entry:', entryErr.message)
  } else {
    console.log('✓ Inserted shift_report_entry: Vanilla — 15 full trays')
  }
} else if (!tableExists) {
  console.warn('⚠  Skipping shift_report_entries insert — table not created yet')
}

// ─── Upsert current_inventory ─────────────────────────────────────────────────
const { error: invErr } = await supabase.from('current_inventory').upsert(
  { flavor_id: vanilla.id, tray_count: 15, updated_at: new Date().toISOString() },
  { onConflict: 'flavor_id' }
)
if (invErr) {
  console.error('Error upserting current_inventory:', invErr.message)
} else {
  console.log('✓ Upserted current_inventory: Vanilla → 15 trays')
}

// ─── Ingredients ─────────────────────────────────────────────────────────────
const ingredients = [
  { name: 'Brown Sugar',     quantity: 12,  unit: 'bags' },
  { name: 'Butter',          quantity: 72,  unit: 'units' },
  { name: 'Chocolate',       quantity: 3,   unit: 'boxes' },
  { name: 'Corn Syrup',      quantity: 15,  unit: 'barrels' },
  { name: 'Evaporated Milk', quantity: 31,  unit: 'cans' },
  { name: 'Fondant',         quantity: 17,  unit: 'boxes' },
  { name: 'Fondex',          quantity: 10,  unit: 'barrels' },
  { name: 'Heavy Cream',     quantity: 60,  unit: 'units' },
  { name: 'Invert Sugar',    quantity: 5,   unit: 'barrels' },
  { name: 'Popcorn',         quantity: 0,   unit: 'bags' },
  { name: 'Salt',            quantity: 0.3, unit: 'containers' },
  { name: 'Sugar',           quantity: 43,  unit: 'bags' },
  { name: 'Vanilla Extract', quantity: 1.5, unit: 'containers' },
  { name: 'Peanut Butter',   quantity: 0,   unit: 'units' },
  { name: 'Maple Flavoring', quantity: 0,   unit: 'units' },
  { name: 'Walnuts',         quantity: 0,   unit: 'units' },
  { name: 'Marshmallow',     quantity: 0,   unit: 'units' },
]

let ingInserted = 0
let ingUpdated = 0
let ingBlocked = false

if (!ingredientsHasData) {
  for (const ing of ingredients) {
    // Check by name first
    const { data: existing } = await supabase
      .from('ingredients')
      .select('id')
      .eq('name', ing.name)
      .single()

    if (existing) {
      const { error: updErr } = await supabase
        .from('ingredients')
        .update({ quantity: ing.quantity, unit: ing.unit })
        .eq('id', existing.id)
      if (updErr) {
        if (updErr.message?.includes('row-level security')) { ingBlocked = true; break }
        console.error(`  Error updating ${ing.name}:`, updErr.message)
      } else {
        ingUpdated++
      }
    } else {
      const { error: insErr } = await supabase
        .from('ingredients')
        .insert({ name: ing.name, quantity: ing.quantity, unit: ing.unit })
      if (insErr) {
        if (insErr.message?.includes('row-level security')) { ingBlocked = true; break }
        console.error(`  Error inserting ${ing.name}:`, insErr.message)
      } else {
        ingInserted++
      }
    }
  }
}

if (ingredientsHasData) {
  console.log('✓ Ingredients already have data — skipping (use Supabase dashboard to edit if needed)')
} else if (ingBlocked) {
  console.warn('⚠  Ingredients blocked by RLS — anon key cannot write to ingredients table.')
} else {
  console.log(`✓ Ingredients: ${ingInserted} inserted, ${ingUpdated} updated`)
}

// ─── Summary + Manual SQL ─────────────────────────────────────────────────────
const needsManual = !ddlOk || ingBlocked

console.log('\n✅ Script complete.')

if (needsManual) {
  console.log('\n━━━ MANUAL SQL NEEDED ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Open: https://supabase.com/dashboard/project/xitveqxxcpftevxesojk/sql/new')
  console.log('Paste and run the following:\n')

  if (!ddlOk) {
    console.log(`-- 1. Create shift_report_entries table
CREATE TABLE IF NOT EXISTS shift_report_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES shift_reports(id) ON DELETE CASCADE,
  flavor_id uuid NOT NULL REFERENCES flavors(id),
  full_trays integer NOT NULL DEFAULT 0,
  in_progress_trays integer NOT NULL DEFAULT 0,
  trays_made integer DEFAULT 0,
  trays_wasted integer DEFAULT 0,
  waste_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE shift_report_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read shift_report_entries" ON shift_report_entries FOR SELECT USING (true);
CREATE POLICY "Public insert shift_report_entries" ON shift_report_entries FOR INSERT WITH CHECK (true);
`)
    // Print the entry insert with the actual report ID
    console.log(`-- 2. Insert shift_report_entry for today's report
INSERT INTO shift_report_entries (report_id, flavor_id, full_trays, in_progress_trays, trays_made, trays_wasted)
VALUES ('${report.id}', '${vanilla.id}', 15, 0, 15, 0);
`)
  }

  if (ingBlocked) {
    console.log(`-- 3. Allow anon write on ingredients (needed for staff use)
CREATE POLICY IF NOT EXISTS "Anon insert ingredients" ON ingredients FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Anon update ingredients" ON ingredients FOR UPDATE TO anon USING (true);
`)
    // Also add archived column if missing
    console.log(`-- 4. Add archived column (Migration v6)
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
`)
    const vals = ingredients.map(i => `('${i.name}', ${i.quantity}, '${i.unit}', false)`).join(',\n  ')
    console.log(`-- 5. Seed ingredients (upsert by name)
INSERT INTO ingredients (name, quantity, unit, archived) VALUES
  ${vals}
ON CONFLICT (name) DO UPDATE SET quantity = EXCLUDED.quantity, unit = EXCLUDED.unit, archived = false;
`)
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('\nAfter running the SQL above, re-run this script to confirm everything is set.')
  console.log('Or: add SUPABASE_SERVICE_ROLE_KEY to .env to do it all automatically next time.')
}
