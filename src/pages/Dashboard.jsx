import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useFlavors } from '../hooks/useFlavors'

export default function Dashboard() {
  const { flavors, loading: flavorsLoading } = useFlavors()
  const [entries, setEntries] = useState({}) // flavor_id -> { full_trays, in_progress_trays }
  const [reportFound, setReportFound] = useState(null) // null=loading, true=found, false=none
  const [ingredients, setIngredients] = useState([])
  const [ingredientsLoading, setIngredientsLoading] = useState(true)

  useEffect(() => {
    async function loadIngredients() {
      const { data } = await supabase
        .from('ingredients')
        .select('id, name, quantity, unit, low_stock_threshold')
        .eq('is_active', true)
        .order('name')
      setIngredients(data || [])
      setIngredientsLoading(false)
    }
    loadIngredients()
  }, [])

  useEffect(() => {
    async function load() {
      // Primary: most recent shift report entries (any type, any date)
      const { data: latestReports } = await supabase
        .from('shift_reports')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1)

      if (latestReports && latestReports.length > 0) {
        const { data: reportEntries } = await supabase
          .from('shift_report_entries')
          .select('flavor_id, full_trays, in_progress_trays')
          .eq('report_id', latestReports[0].id)

        const map = {}
          ; (reportEntries || []).forEach((e) => { map[e.flavor_id] = e })
        setEntries(map)
        setReportFound(true)
        return
      }

      // Fallback: current_inventory if no reports exist
      const { data: inventory } = await supabase
        .from('current_inventory')
        .select('flavor_id, tray_count')

      if (inventory && inventory.length > 0) {
        const map = {}
        inventory.forEach((row) => {
          map[row.flavor_id] = { full_trays: row.tray_count, in_progress_trays: 0 }
        })
        setEntries(map)
        setReportFound(true)
      } else {
        setReportFound(false)
      }
    }

    load()
  }, [])

  const loading = flavorsLoading || reportFound === null

  if (loading) {
    return <p className="text-store-brown-light text-center py-12">Loading...</p>
  }

  const lowIngredients = ingredients.filter(
    (i) => i.low_stock_threshold != null && i.quantity <= i.low_stock_threshold
  )

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
        Fudge Status
      </h2>
      <div className="space-y-3">
        {flavors.map((flavor) => {
          const entry = entries[flavor.id]
          const fullTrays = entry?.full_trays ?? 0
          const inProgress = entry?.in_progress_trays ?? 0
          const threshold = flavor.low_tray_threshold ?? 2

          let cardBg = 'bg-store-green-light border-store-green'
          let countColor = 'text-store-green'
          if (fullTrays === 0) {
            cardBg = 'bg-red-50 border-red-300'
            countColor = 'text-red-600'
          } else if (fullTrays < threshold) {
            cardBg = 'bg-amber-50 border-amber-300'
            countColor = 'text-amber-700'
          }

          return (
            <div key={flavor.id} className={`rounded-xl border-2 p-4 ${cardBg}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-store-brown text-lg">{flavor.name}</span>
                <div className="text-right">
                  <p className={`text-4xl font-bold tabular-nums leading-none ${countColor}`}>
                    {fullTrays}
                  </p>
                  <p className="text-xs text-store-brown-light mt-1">
                    full tray{fullTrays !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <p className="text-sm text-store-brown-light mt-2">
                <span className="font-medium text-store-brown">{inProgress}</span> half trays drying
              </p>
            </div>
          )
        })}
      </div>

      {/* Ingredients section */}
      <div className="space-y-2">
        <h3 className="text-lg font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          Ingredients
        </h3>
        {ingredientsLoading ? (
          <p className="text-store-brown-light text-sm">Loading ingredients...</p>
        ) : lowIngredients.length === 0 ? (
          <p className="text-sm text-store-green font-medium">All ingredients stocked ✓</p>
        ) : (
          <div>
            <p className="text-xs font-semibold text-store-brown-light uppercase tracking-wide mb-2">
              Needs Ordering
            </p>
            <div className="flex flex-wrap gap-2">
              {lowIngredients.map((ing) => {
                const isOut = ing.quantity === 0
                return (
                  <div
                    key={ing.id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${isOut
                        ? 'bg-red-50 border-red-300 text-red-700'
                        : 'bg-amber-50 border-amber-300 text-amber-700'
                      }`}
                  >
                    <span>{ing.name}</span>
                    <span className="opacity-70">
                      {ing.quantity} {ing.unit}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${isOut ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'
                        }`}
                    >
                      {isOut ? 'Out' : 'Low'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
