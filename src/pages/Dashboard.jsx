import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useFlavors } from '../hooks/useFlavors'
import { useAuth } from '../hooks/useAuth'

export default function Dashboard() {
  const { session } = useAuth()
  const { flavors, loading: flavorsLoading } = useFlavors()
  const [entries, setEntries] = useState({}) // flavor_id -> { full_trays, in_progress_trays }
  const [reportFound, setReportFound] = useState(null) // null=loading, true=found, false=none
  const [ingredients, setIngredients] = useState([])
  const [ingredientsLoading, setIngredientsLoading] = useState(true)
  const [yesterdayEntries, setYesterdayEntries] = useState({}) // flavor_id -> { full_trays, trays_sold }

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
    async function loadYesterday() {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      const yesterdayStr = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

      const { data: reports } = await supabase
        .from('shift_reports')
        .select('id')
        .eq('report_date', yesterdayStr)
        .order('created_at', { ascending: false })
        .limit(1)

      if (!reports || reports.length === 0) return

      const { data: ents } = await supabase
        .from('shift_report_entries')
        .select('flavor_id, full_trays, trays_sold')
        .eq('report_id', reports[0].id)

      const map = {}
      ;(ents || []).forEach((e) => { map[e.flavor_id] = e })
      setYesterdayEntries(map)
    }
    loadYesterday()
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

  const needsMaking = flavors.filter((f) => {
    const fullTrays = entries[f.id]?.full_trays ?? 0
    return fullTrays <= (f.low_tray_threshold ?? 2)
  })

  const stockedFlavors = flavors.filter((f) => {
    const fullTrays = entries[f.id]?.full_trays ?? 0
    return fullTrays > (f.low_tray_threshold ?? 2)
  })

  const lowIngredients = ingredients.filter(
    (i) => i.low_stock_threshold != null && i.quantity <= i.low_stock_threshold
  )

  const stockedIngredients = ingredients.filter(
    (i) => !(i.low_stock_threshold != null && i.quantity <= i.low_stock_threshold)
  )

  const renderFlavorPill = (flavor) => {
    const entry = entries[flavor.id]
    const fullTrays = entry?.full_trays ?? 0
    const inProgress = entry?.in_progress_trays ?? 0
    const threshold = flavor.low_tray_threshold ?? 2

    const isOut = fullTrays === 0
    const isLow = !isOut && fullTrays <= threshold

    const pillClass = isOut
      ? 'bg-red-50 border-red-300 text-red-700'
      : isLow
        ? 'bg-amber-50 border-amber-300 text-amber-700'
        : 'bg-store-green-light border-store-green text-store-green'

    const countClass = isOut
      ? 'bg-red-200 text-red-800'
      : isLow
        ? 'bg-amber-200 text-amber-800'
        : 'bg-store-green text-white'

    return (
      <div
        key={flavor.id}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${pillClass}`}
      >
        <span>{flavor.name}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${countClass}`}>
          {fullTrays}
        </span>
        {inProgress > 0 && (
          <span className="text-xs opacity-60">+{inProgress}½</span>
        )}
      </div>
    )
  }

  const renderIngredientPill = (ing) => {
    const isOut = ing.quantity === 0
    const isLow = !isOut && ing.quantity <= (ing.low_stock_threshold ?? 0)

    return (
      <div
        key={ing.id}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${isOut
            ? 'bg-red-50 border-red-300 text-red-700'
            : isLow
              ? 'bg-amber-50 border-amber-300 text-amber-700'
              : 'bg-store-green-light border-store-green text-store-green'
          }`}
      >
        <span>{ing.name}</span>
        <span className="opacity-70">
          {ing.quantity} {ing.unit}
        </span>
        {(isOut || isLow) && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${isOut ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'
              }`}
          >
            {isOut ? 'Out' : 'Low'}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Flavors Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
            Make Soon
          </h2>
          {needsMaking.length > 0 ? (
            <div className="flex flex-wrap gap-2 mt-2">
              {needsMaking.map(renderFlavorPill)}
            </div>
          ) : (
            <p className="text-sm text-store-green font-medium mt-2">All products stocked ✓</p>
          )}
        </div>

        {stockedFlavors.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-store-brown-light uppercase tracking-wide mb-2">
              In Stock
            </h3>
            <div className="flex flex-wrap gap-2">
              {stockedFlavors.map(renderFlavorPill)}
            </div>
          </div>
        )}
      </div>

      {Object.keys(yesterdayEntries).length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-store-brown-light uppercase tracking-wide mb-2">
            Yesterday's Shelf
          </h3>
          <div className="flex flex-wrap gap-2">
            {flavors.map((f) => {
              const y = yesterdayEntries[f.id]
              if (!y) return null
              return (
                <div
                  key={f.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border bg-store-cream border-store-tan text-store-brown"
                >
                  <span>{f.name}</span>
                  <span className="text-xs bg-store-tan px-1.5 py-0.5 rounded-full font-bold">{y.full_trays}</span>
                  {y.trays_sold > 0 && <span className="text-xs opacity-60">{y.trays_sold} sold</span>}
                </div>
              )
            }).filter(Boolean)}
          </div>
        </div>
      )}

      {session && (
        <>
          <hr className="border-store-tan" />

          {/* Ingredients Section */}
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
                Ingredients Alert
              </h2>
              {ingredientsLoading ? (
                <p className="text-store-brown-light text-sm mt-2">Loading ingredients...</p>
              ) : lowIngredients.length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-2">
                  {lowIngredients.map(renderIngredientPill)}
                </div>
              ) : (
                <p className="text-sm text-store-green font-medium mt-2">All ingredients stocked ✓</p>
              )}
            </div>

            {!ingredientsLoading && stockedIngredients.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-store-brown-light uppercase tracking-wide mb-2">
                  In Stock
                </h3>
                <div className="flex flex-wrap gap-2">
                  {stockedIngredients.map(renderIngredientPill)}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
