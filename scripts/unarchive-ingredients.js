import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

// First check if the archived column exists by attempting a read with it
const { error: checkErr } = await supabase
  .from('ingredients')
  .select('archived')
  .limit(1)

if (checkErr && (checkErr.code === 'PGRST204' || checkErr.message?.toLowerCase().includes('archived'))) {
  console.log('⚠  The `archived` column does not exist yet on the ingredients table.')
  console.log('')
  console.log('Run this SQL in your Supabase dashboard first:')
  console.log('  https://supabase.com/dashboard/project/_/sql/new')
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('Then re-run this script.')
  process.exit(1)
}

const { error } = await supabase
  .from('ingredients')
  .update({ archived: false })
  .neq('id', '00000000-0000-0000-0000-000000000000')

if (error) console.error(error)
else console.log('✓ All ingredients unarchived')
