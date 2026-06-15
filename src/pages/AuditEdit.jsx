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
  { key: 'backdate', label: 'Backdate a Batch', icon: '🍫' },
  { key: 'revert', label: 'Remove / Revert a Batch', icon: '↩️' },
  { key: 'entries', label: 'Product Entries', icon: '📦' },
  { key: 'inventory', label: 'Correct Inventory Counts', icon: '🔢' },
  { key: 'ingredients', label: 'Correct Ingredient Stock', icon: '🧂' },
  { key: 'activity', label: 'Activity Log', icon: '🔍' },
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
          Audit &amp; Edit
        </h2>
        <p className="text-sm text-store-brown-light mt-1">
          Fix mistakes safely — backdate, correct, or remove logged data. Ingredient and
          inventory counts adjust automatically, just like the live report.
        </p>
      </div>

      {/* Date picker — the date most sections act on */}
      <div className="bg-white rounded-xl border border-store-tan p-4 shadow-sm flex items-center gap-3 flex-wrap">
        <label className="text-sm font-semibold text-store-brown">Working date</label>
        <input
          type="date"
          value={pickedDate}
          max={todayEastern()}
          onChange={(e) => setPickedDate(e.target.value)}
          className="border border-store-tan rounded-xl px-3 py-2 text-sm bg-store-cream text-store-brown focus:outline-none focus:ring-2 focus:ring-store-green"
        />
        {pickedDate !== todayEastern() && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            Backdated
          </span>
        )}
      </div>

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
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-store-cream transition-colors"
                >
                  <span className="font-semibold text-store-brown flex items-center gap-2">
                    <span className="text-lg">{s.icon}</span>
                    {s.label}
                  </span>
                  <span className="text-store-brown-light text-sm">{isOpen ? '▲' : '▼'}</span>
                </button>
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
