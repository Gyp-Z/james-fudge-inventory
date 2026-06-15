import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { todayEastern } from '../utils/dates'
import BackdateBatchSection from '../components/audit/BackdateBatchSection'
import BatchRevertSection from '../components/audit/BatchRevertSection'
import ShiftEntrySection from '../components/audit/ShiftEntrySection'
import InventoryCorrectionSection from '../components/audit/InventoryCorrectionSection'
import IngredientCorrectionSection from '../components/audit/IngredientCorrectionSection'
import ActivitySection from '../components/audit/ActivitySection'

const SECTIONS = [
  {
    key: 'backdate',
    label: 'Add a batch you forgot to log',
    blurb: 'Made a batch on an earlier day but never logged it? Add it here and the ingredients come out automatically — just like if you’d logged it that day.',
    icon: '🍫',
  },
  {
    key: 'revert',
    label: 'Undo a batch logged by mistake',
    blurb: 'Logged a batch that wasn’t really made, or picked the wrong flavor? Remove it and the ingredients go back.',
    icon: '↩️',
  },
  {
    key: 'entries',
    label: 'Fix tray counts (made / sold / wasted)',
    blurb: 'Add or fix how many trays were made, sold, or wasted on a day. Use this if an end-of-day report was missed or had a wrong number.',
    icon: '📦',
  },
  {
    key: 'inventory',
    label: 'Fix a shelf count',
    blurb: 'Counted the shelf and the number in the app is wrong? Set it to what’s really there.',
    icon: '🔢',
  },
  {
    key: 'ingredients',
    label: 'Fix an ingredient amount',
    blurb: 'Counted an ingredient (butter, sugar…) and the app is off? Set it to the real amount.',
    icon: '🧂',
  },
  {
    key: 'activity',
    label: 'See what was logged on a day',
    blurb: 'Look back at everything that was logged in a date range — batches, tray counts, ingredient use, and fixes.',
    icon: '🔍',
  },
]

export default function AuditEdit() {
  const [pickedDate, setPickedDate] = useState(todayEastern())
  const [flavors, setFlavors] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [inventory, setInventory] = useState({}) // flavor_id -> { tray_count, barrel_count, in_progress_count }
  const [loading, setLoading] = useState(true)
  const [openSection, setOpenSection] = useState('backdate')

  const reload = useCallback(async () => {
    const [{ data: fl }, { data: ing }, { data: inv }] = await Promise.all([
      supabase.from('flavors').select('*').order('name'),
      supabase.from('ingredients').select('*').eq('is_active', true).order('name'),
      supabase.from('current_inventory').select('flavor_id, tray_count, barrel_count, in_progress_count'),
    ])
    setFlavors(fl || [])
    setIngredients(ing || [])
    const map = {}
    ;(inv || []).forEach((r) => {
      map[r.flavor_id] = {
        tray_count: r.tray_count ?? 0,
        barrel_count: r.barrel_count ?? 0,
        in_progress_count: r.in_progress_count ?? 0,
      }
    })
    setInventory(map)
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  const sectionProps = { pickedDate, flavors, ingredients, inventory, onDone: reload }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          Fix &amp; Add Past Days
        </h2>
        <p className="text-sm text-store-brown-light mt-1">
          Forgot to log something, or logged it wrong? Fix it here. First pick the day it
          happened, then choose what you need to do below. Counts and ingredients update
          on their own — you don’t have to do any math.
        </p>
      </div>

      {/* Date picker — the date most sections act on */}
      <div className="bg-white rounded-xl border border-store-tan p-4 shadow-sm space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm font-semibold text-store-brown">Step 1 — Pick the day</label>
          <input
            type="date"
            value={pickedDate}
            max={todayEastern()}
            onChange={(e) => setPickedDate(e.target.value)}
            className="border border-store-tan rounded-xl px-3 py-2 text-sm bg-store-cream text-store-brown focus:outline-none focus:ring-2 focus:ring-store-green"
          />
          {pickedDate !== todayEastern() && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              Earlier day
            </span>
          )}
        </div>
        <p className="text-xs text-store-brown-light">
          The day the thing you’re fixing actually happened. Leave it as today if it’s for today.
        </p>
      </div>

      <h3 className="text-sm font-semibold text-store-brown pt-1">Step 2 — Pick what you need to do</h3>

      {loading ? (
        <p className="text-store-brown-light text-center py-12">Loading…</p>
      ) : (
        <div className="space-y-3">
          {SECTIONS.map((s) => {
            const isOpen = openSection === s.key
            return (
              <div key={s.key} className="bg-white rounded-xl border border-store-tan shadow-sm overflow-hidden">
                <button
                  onClick={() => setOpenSection(isOpen ? null : s.key)}
                  className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left hover:bg-store-cream transition-colors"
                >
                  <span className="flex items-start gap-2.5 min-w-0">
                    <span className="text-xl leading-none mt-0.5">{s.icon}</span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-store-brown">{s.label}</span>
                      {!isOpen && <span className="block text-xs text-store-brown-light mt-0.5">{s.blurb}</span>}
                    </span>
                  </span>
                  <span className="text-store-brown-light text-sm shrink-0 mt-1">{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <p className="px-4 pb-1 -mt-1 text-xs text-store-brown-light">{s.blurb}</p>
                )}
                {isOpen && (
                  <div className="border-t border-store-tan px-4 py-4 bg-store-cream/40">
                    {s.key === 'backdate' && <BackdateBatchSection {...sectionProps} />}
                    {s.key === 'revert' && <BatchRevertSection {...sectionProps} />}
                    {s.key === 'entries' && <ShiftEntrySection {...sectionProps} />}
                    {s.key === 'inventory' && <InventoryCorrectionSection {...sectionProps} />}
                    {s.key === 'ingredients' && <IngredientCorrectionSection {...sectionProps} />}
                    {s.key === 'activity' && <ActivitySection {...sectionProps} />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
