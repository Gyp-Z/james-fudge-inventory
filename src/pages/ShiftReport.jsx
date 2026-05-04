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
  const [currentInventory, setCurrentInventory] = useState({}) // flavor_id -> tray_count
  const [currentInProgress, setCurrentInProgress] = useState({}) // flavor_id -> in_progress_count

  // Ingredients tab — usage state
  const [ingList, setIngList] = useState([])
  const [ingUsage, setIngUsage] = useState({})
  const [ingSubmitting, setIngSubmitting] = useState(false)
  const [ingSubmitted, setIngSubmitted] = useState(false)

  // Ingredients tab — received/restock state
  const [ingReceived, setIngReceived] = useState({})
  const [recSubmitting, setRecSubmitting] = useState(false)
  const [recSubmitted, setRecSubmitted] = useState(false)

  useEffect(() => {
    async function load() {
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

      const [{ data: flavorsData }, { data: ingredientsData }, { data: invData }] = await Promise.all([
        supabase.from('flavors').select('id, name, low_tray_threshold').eq('is_active', true).order('name'),
        supabase.from('ingredients').select('id, name, quantity, unit').eq('is_active', true).order('name'),
        supabase.from('current_inventory').select('flavor_id, tray_count, in_progress_count'),
      ])

      const activeFlavors = flavorsData || []
      const ings = ingredientsData || []
      setFlavors(activeFlavors)
      setIngList(ings)

      const initial = {}
      activeFlavors.forEach((f) => {
        initial[f.id] = { full_trays: 0, in_progress_trays: 0, trays_sold: 0, trays_wasted: 0, waste_reason: '' }
      })
      setEntries(initial)

      const ingInit = {}
      const recInit = {}
      ings.forEach((i) => { ingInit[i.id] = 0; recInit[i.id] = 0 })
      setIngUsage(ingInit)
      setIngReceived(recInit)

      const invMap = {}
      const inProgMap = {}
      ;(invData || []).forEach((row) => {
        invMap[row.flavor_id] = row.tray_count ?? 0
        inProgMap[row.flavor_id] = row.in_progress_count ?? 0
      })
      setCurrentInventory(invMap)
      setCurrentInProgress(inProgMap)

      // Load today's totals for products tab
      const { data: todayReports } = await supabase
        .from('shift_reports').select('id').eq('report_date', todayStr)
      if (todayReports && todayReports.length > 0) {
        const ids = todayReports.map((r) => r.id)
        const { data: todayEntries } = await supabase
          .from('shift_report_entries').select('flavor_id, full_trays, trays_sold, trays_wasted').in('report_id', ids)
        const totalsMap = {}
        ;(todayEntries || []).forEach((e) => {
          const t = totalsMap[e.flavor_id] || { sold: 0, wasted: 0, made: 0 }
          t.sold += e.trays_sold ?? 0
          t.wasted += e.trays_wasted ?? 0
          t.made += e.full_trays ?? 0
          totalsMap[e.flavor_id] = t
        })
        setTodayTotals(totalsMap)
      }

      setLoading(false)
    }
    load()
  }, [])

  // Reload fresh quantities after any ingredient submit
  async function reloadIngList() {
    const { data } = await supabase.from('ingredients').select('id, name, quantity, unit').eq('is_active', true).order('name')
    setIngList(data || [])
  }

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

    const entryRows = flavors
      .filter((f) => {
        const e = entries[f.id]
        return (e?.full_trays ?? 0) > 0 || (e?.in_progress_trays ?? 0) > 0 || (e?.trays_sold ?? 0) > 0 || (e?.trays_wasted ?? 0) > 0
      })
      .map((f) => ({
        report_id: report.id,
        flavor_id: f.id,
        full_trays: entries[f.id]?.full_trays ?? 0,
        in_progress_trays: entries[f.id]?.in_progress_trays ?? 0,
        trays_sold: entries[f.id]?.trays_sold ?? 0,
        trays_wasted: entries[f.id]?.trays_wasted ?? 0,
        waste_reason: entries[f.id]?.waste_reason?.trim() || null,
      }))
    if (entryRows.length > 0) {
      await supabase.from('shift_report_entries').insert(entryRows)
    }

    // Fetch fresh inventory then apply delta — only touch flavors with non-zero activity
    const { data: freshInv } = await supabase.from('current_inventory').select('flavor_id, tray_count')
    const freshMap = {}
    ;(freshInv || []).forEach((row) => { freshMap[row.flavor_id] = row.tray_count ?? 0 })

    const activeRows = flavors
      .filter((f) => {
        const e = entries[f.id]
        return (e?.full_trays ?? 0) !== 0 || (e?.in_progress_trays ?? 0) !== 0 || (e?.trays_sold ?? 0) !== 0 || (e?.trays_wasted ?? 0) !== 0
      })
      .map((f) => {
        const e = entries[f.id]
        const made = e?.full_trays ?? 0
        const newInProg = e?.in_progress_trays ?? 0
        const sold = e?.trays_sold ?? 0
        const wasted = e?.trays_wasted ?? 0
        const existingInProg = currentInProgress[f.id] ?? 0
        // topped = how many in-progress trays were completed this session
        const topped = Math.min(made, existingInProg)
        return {
          flavor_id: f.id,
          tray_count: Math.max(0, (freshMap[f.id] ?? 0) + made - sold - wasted),
          in_progress_count: Math.max(0, existingInProg + newInProg - topped),
          updated_at: new Date().toISOString(),
        }
      })

    if (activeRows.length > 0) {
      await supabase.from('current_inventory').upsert(activeRows, { onConflict: 'flavor_id' })
    }

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

    await reloadIngList()
    setIngSubmitted(true)
    setIngSubmitting(false)
    setTimeout(() => {
      setIngSubmitted(false)
      setIngUsage((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, 0])))
    }, 1500)
  }

  async function handleIngredientReceive() {
    const incoming = ingList.filter((i) => (ingReceived[i.id] ?? 0) > 0)
    if (incoming.length === 0) return
    setRecSubmitting(true)

    await Promise.all(incoming.map(async (ing) => {
      const amount = ingReceived[ing.id]
      const newQty = (ing.quantity ?? 0) + amount
      await supabase.from('ingredients').update({ quantity: newQty }).eq('id', ing.id)
    }))

    await reloadIngList()
    setRecSubmitted(true)
    setRecSubmitting(false)
    setTimeout(() => {
      setRecSubmitted(false)
      setIngReceived((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, 0])))
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

      {/* Tab switcher — visible to everyone */}
      <div className="flex gap-2">
        {['products', 'ingredients'].map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setSubmitted(false); setIngSubmitted(false); setRecSubmitted(false) }}
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
              <p className="text-store-brown-light text-xs -mt-3">Log what you made, sold, or wasted this session.</p>
              <div className="space-y-3">
                {flavors.map((f) => {
                  const e = entries[f.id] || { full_trays: 0, in_progress_trays: 0, trays_sold: 0, trays_wasted: 0, waste_reason: '' }
                  const inProgCount = currentInProgress[f.id] ?? 0
                  return (
                    <div key={f.id} className="bg-white rounded-xl border border-store-tan p-4 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-store-brown text-lg">{f.name}</p>
                        <div className="flex gap-2 text-xs text-store-brown-light flex-wrap items-center">
                          {currentInventory[f.id] !== undefined && (
                            <span>{currentInventory[f.id]} in stock</span>
                          )}
                          {todayTotals[f.id]?.made > 0 && (
                            <><span>·</span><span>{todayTotals[f.id].made} made today</span></>
                          )}
                          {todayTotals[f.id]?.sold > 0 && (
                            <><span>·</span><span>{todayTotals[f.id].sold} sold today</span></>
                          )}
                        </div>
                      </div>
                      {inProgCount > 0 && (
                        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <span className="text-amber-700 font-semibold text-sm">{inProgCount} in progress</span>
                          <span className="text-amber-600 text-xs">— marking trays made will top {inProgCount === 1 ? 'it' : 'them'}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-store-brown-light">Trays made</span>
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
        <div className="space-y-6">

          {/* Used this session */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-store-brown">Used This Session</p>
              <p className="text-xs text-store-brown-light mt-0.5">How much of each ingredient was used?</p>
            </div>
            {ingSubmitted ? (
              <div className="bg-store-green-light border border-store-green rounded-xl px-4 py-3 text-center">
                <p className="text-store-green font-semibold">Usage logged ✓</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {ingList.map((ing) => (
                    <IngRow
                      key={ing.id}
                      ing={ing}
                      value={ingUsage[ing.id] || ''}
                      onChange={(v) => setIngUsage((prev) => ({ ...prev, [ing.id]: parseFloat(v) || 0 }))}
                    />
                  ))}
                </div>
                <button
                  onClick={handleIngredientSubmit}
                  disabled={ingSubmitting || !ingList.some((i) => (ingUsage[i.id] ?? 0) > 0)}
                  className="w-full bg-store-green hover:bg-store-green-dark text-white py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 touch-manipulation"
                >
                  {ingSubmitting ? 'Logging…' : 'Log Usage'}
                </button>
              </>
            )}
          </div>

          <hr className="border-store-tan" />

          {/* Order received */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-store-brown">Order Received</p>
              <p className="text-xs text-store-brown-light mt-0.5">Did an order come in? Enter what was received.</p>
            </div>
            {recSubmitted ? (
              <div className="bg-store-green-light border border-store-green rounded-xl px-4 py-3 text-center">
                <p className="text-store-green font-semibold">Order logged ✓</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {ingList.map((ing) => (
                    <IngRow
                      key={ing.id}
                      ing={ing}
                      value={ingReceived[ing.id] || ''}
                      onChange={(v) => setIngReceived((prev) => ({ ...prev, [ing.id]: parseFloat(v) || 0 }))}
                    />
                  ))}
                </div>
                <button
                  onClick={handleIngredientReceive}
                  disabled={recSubmitting || !ingList.some((i) => (ingReceived[i.id] ?? 0) > 0)}
                  className="w-full bg-store-brown text-white py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 touch-manipulation hover:opacity-90"
                >
                  {recSubmitting ? 'Logging…' : 'Log Received Order'}
                </button>
              </>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

function IngRow({ ing, value, onChange }) {
  return (
    <div className="bg-white rounded-xl border border-store-tan px-4 py-3 shadow-sm overflow-hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
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
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="w-20 border border-store-tan rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
        />
        <span className="text-xs text-store-brown-light">{ing.unit}</span>
      </div>
    </div>
  )
}
