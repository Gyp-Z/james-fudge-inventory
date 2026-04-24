import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Stepper from '../components/Stepper'

export default function ShiftReport() {
  const { session } = useAuth()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('products')

  // Products tab state
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [flavors, setFlavors] = useState([])
  const [entries, setEntries] = useState({})
  const [todayTotals, setTodayTotals] = useState({})

  // Ingredients tab state
  const [ingList, setIngList] = useState([])
  const [ingUsage, setIngUsage] = useState({})
  const [ingSubmitting, setIngSubmitting] = useState(false)
  const [ingSubmitted, setIngSubmitted] = useState(false)

  useEffect(() => {
    async function load() {
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

      const [{ data: flavorsData }, { data: ingredientsData }] = await Promise.all([
        supabase.from('flavors').select('id, name, low_tray_threshold').eq('is_active', true).order('name'),
        supabase.from('ingredients').select('id, name, quantity, unit').eq('is_active', true).order('name'),
      ])

      const activeFlavors = flavorsData || []
      setFlavors(activeFlavors)
      setIngList(ingredientsData || [])

      const initial = {}
      activeFlavors.forEach((f) => {
        initial[f.id] = { full_trays: 0, in_progress_trays: 0, trays_sold: 0, trays_wasted: 0, waste_reason: '' }
      })
      setEntries(initial)

      const ingInit = {}
      ;(ingredientsData || []).forEach((i) => { ingInit[i.id] = 0 })
      setIngUsage(ingInit)

      // Load today's totals for products tab
      const { data: todayReports } = await supabase
        .from('shift_reports').select('id').eq('report_date', todayStr)
      if (todayReports && todayReports.length > 0) {
        const ids = todayReports.map((r) => r.id)
        const { data: todayEntries } = await supabase
          .from('shift_report_entries').select('flavor_id, full_trays, trays_sold, trays_wasted').in('report_id', ids)
        const totalsMap = {}
        ;(todayEntries || []).forEach((e) => {
          const t = totalsMap[e.flavor_id] || { sold: 0, wasted: 0, stock: 0 }
          t.sold += e.trays_sold ?? 0
          t.wasted += e.trays_wasted ?? 0
          t.stock = Math.max(t.stock, e.full_trays ?? 0)
          totalsMap[e.flavor_id] = t
        })
        setTodayTotals(totalsMap)
      }

      setLoading(false)
    }
    load()
  }, [])

  function setField(flavorId, field, value) {
    setEntries((prev) => ({ ...prev, [flavorId]: { ...prev[flavorId], [field]: value } }))
  }

  async function handleProductSubmit() {
    setSubmitting(true)
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const { data: report, error } = await supabase
      .from('shift_reports')
      .insert({ report_date: todayStr, report_type: 'snapshot', logged_by: session?.user?.id ?? null })
      .select('id').single()
    if (error || !report) { setSubmitting(false); return }

    const entryRows = flavors.map((f) => ({
      report_id: report.id,
      flavor_id: f.id,
      full_trays: entries[f.id]?.full_trays ?? 0,
      in_progress_trays: entries[f.id]?.in_progress_trays ?? 0,
      trays_sold: entries[f.id]?.trays_sold ?? 0,
      trays_wasted: entries[f.id]?.trays_wasted ?? 0,
      waste_reason: entries[f.id]?.waste_reason?.trim() || null,
    }))
    await supabase.from('shift_report_entries').insert(entryRows)

    const inventoryRows = flavors.map((f) => ({
      flavor_id: f.id,
      tray_count: entries[f.id]?.full_trays ?? 0,
      updated_at: new Date().toISOString(),
    }))
    await supabase.from('current_inventory').upsert(inventoryRows, { onConflict: 'flavor_id' })

    setSubmitted(true)
    setSubmitting(false)
    setTimeout(() => navigate('/'), 1500)
  }

  async function handleIngredientSubmit() {
    const used = ingList.filter((i) => (ingUsage[i.id] ?? 0) > 0)
    if (used.length === 0) return
    setIngSubmitting(true)

    await Promise.all(used.map(async (ing) => {
      const amount = ingUsage[ing.id]
      await supabase.from('ingredient_depletions').insert({
        ingredient_id: ing.id,
        amount_used: amount,
        logged_by: session?.user?.id ?? null,
      })
      const newQty = Math.max(0, (ing.quantity ?? 0) - amount)
      await supabase.from('ingredients').update({ quantity: newQty }).eq('id', ing.id)
    }))

    setIngSubmitted(true)
    setIngSubmitting(false)
    setTimeout(() => {
      setIngSubmitted(false)
      const reset = {}
      ingList.forEach((i) => { reset[i.id] = 0 })
      setIngUsage(reset)
    }, 1500)
  }

  if (loading) return <p className="text-store-brown-light text-center py-12">Loading...</p>

  const todayLabel = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          Report
        </h2>
        <p className="text-store-brown-light text-sm mt-1">{todayLabel}</p>
      </div>

      {/* Tab switcher — ingredients only visible to admins */}
      {session && (
        <div className="flex gap-2">
          {['products', 'ingredients'].map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setSubmitted(false); setIngSubmitted(false) }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors touch-manipulation capitalize ${
                activeTab === tab
                  ? 'bg-store-brown text-white'
                  : 'bg-store-tan text-store-brown hover:bg-store-brown hover:text-white'
              }`}
            >
              {tab === 'products' ? 'Products' : 'Ingredients'}
            </button>
          ))}
        </div>
      )}

      {/* Products tab */}
      {activeTab === 'products' && (
        <>
          {submitted ? (
            <div className="bg-store-green-light border border-store-green rounded-xl px-4 py-4 text-center">
              <p className="text-store-green font-semibold text-lg">Report submitted ✓</p>
              <p className="text-store-green text-sm mt-1">Redirecting to dashboard...</p>
            </div>
          ) : (
            <>
              <p className="text-store-brown-light text-xs -mt-3">What's on the shelf right now?</p>
              <div className="space-y-3">
                {flavors.map((f) => {
                  const e = entries[f.id] || { full_trays: 0, in_progress_trays: 0, trays_sold: 0, trays_wasted: 0, waste_reason: '' }
                  return (
                    <div key={f.id} className="bg-white rounded-xl border border-store-tan p-4 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-store-brown text-lg">{f.name}</p>
                        {todayTotals[f.id] && (
                          <div className="flex gap-2 text-xs text-store-brown-light">
                            <span>{todayTotals[f.id].stock} in stock</span>
                            <span>·</span>
                            <span>{todayTotals[f.id].sold} sold</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-store-brown-light">Full trays</span>
                        <Stepper value={e.full_trays} onChange={(v) => setField(f.id, 'full_trays', v)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-store-brown-light">In-progress trays</span>
                        <Stepper value={e.in_progress_trays} onChange={(v) => setField(f.id, 'in_progress_trays', v)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-store-brown-light">Trays sold</span>
                        <Stepper value={e.trays_sold} onChange={(v) => setField(f.id, 'trays_sold', v)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-store-brown-light">Trays wasted</span>
                        <Stepper value={e.trays_wasted} onChange={(v) => setField(f.id, 'trays_wasted', v)} />
                      </div>
                      {e.trays_wasted > 0 && (
                        <input
                          type="text"
                          value={e.waste_reason}
                          onChange={(ev) => setField(f.id, 'waste_reason', ev.target.value)}
                          placeholder="Waste reason"
                          className="w-full border border-store-tan rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
                        />
                      )}
                    </div>
                  )
                })}
              </div>
              <button
                onClick={handleProductSubmit}
                disabled={submitting}
                className="w-full bg-store-green hover:bg-store-green-dark text-white py-4 rounded-xl text-lg font-semibold transition-colors disabled:opacity-50 touch-manipulation"
              >
                {submitting ? 'Submitting…' : 'Submit Product Report'}
              </button>
            </>
          )}
        </>
      )}

      {/* Ingredients tab */}
      {activeTab === 'ingredients' && (
        <>
          {ingSubmitted ? (
            <div className="bg-store-green-light border border-store-green rounded-xl px-4 py-4 text-center">
              <p className="text-store-green font-semibold text-lg">Usage logged ✓</p>
            </div>
          ) : (
            <>
              <p className="text-store-brown-light text-xs -mt-3">How much of each ingredient was used?</p>
              <div className="space-y-2">
                {ingList.map((ing) => (
                  <div key={ing.id} className="bg-white rounded-xl border border-store-tan px-4 py-3 shadow-sm overflow-hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-store-brown truncate">{ing.name}</p>
                      <p className="text-xs text-store-brown-light mt-0.5 truncate">{ing.quantity} {ing.unit} in stock</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.5"
                        value={ingUsage[ing.id] || ''}
                        onChange={(e) => setIngUsage((prev) => ({ ...prev, [ing.id]: parseFloat(e.target.value) || 0 }))}
                        placeholder="0"
                        className="w-20 border border-store-tan rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
                      />
                      <span className="text-xs text-store-brown-light">{ing.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={handleIngredientSubmit}
                disabled={ingSubmitting || !ingList.some((i) => (ingUsage[i.id] ?? 0) > 0)}
                className="w-full bg-store-green hover:bg-store-green-dark text-white py-4 rounded-xl text-lg font-semibold transition-colors disabled:opacity-50 touch-manipulation"
              >
                {ingSubmitting ? 'Logging…' : 'Log Ingredient Usage'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
