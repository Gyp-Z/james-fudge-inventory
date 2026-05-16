import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useFlavors } from '../hooks/useFlavors'

export default function Dashboard() {
  const { flavors, loading: flavorsLoading } = useFlavors()
  const [entries, setEntries] = useState({})
  const [reportFound, setReportFound] = useState(null)
  const [ingredients, setIngredients] = useState([])
  const [ingredientsLoading, setIngredientsLoading] = useState(true)
  const [yesterdayEntries, setYesterdayEntries] = useState({})

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
        .from('shift_reports').select('id').eq('report_date', yesterdayStr)
      if (!reports || reports.length === 0) return

      const ids = reports.map((r) => r.id)
      const { data: ents } = await supabase
        .from('shift_report_entries')
        .select('flavor_id, full_trays, trays_sold, in_progress_trays')
        .in('report_id', ids)

      const map = {}
      ;(ents || []).forEach((e) => {
        const prev = map[e.flavor_id] || { full_trays: 0, trays_sold: 0, in_progress_trays: 0 }
        map[e.flavor_id] = {
          full_trays: prev.full_trays + (e.full_trays ?? 0),
          trays_sold: prev.trays_sold + (e.trays_sold ?? 0),
          in_progress_trays: prev.in_progress_trays + (e.in_progress_trays ?? 0),
        }
      })
      setYesterdayEntries(map)
    }
    loadYesterday()
  }, [])


  useEffect(() => {
    async function load() {
      const [
        { data: inventory },
        { data: batchData },
        { data: allFlavorsData },
      ] = await Promise.all([
        supabase.from('current_inventory').select('flavor_id, tray_count, in_progress_count, barrel_count, in_progress_barrel_count'),
        supabase.from('batch_logs').select('flavor_id, batch_date, is_wasted'),
        supabase.from('flavors').select('id, name, default_yield, is_component'),
      ])

      if (inventory && inventory.length > 0) {
        const map = {}
        inventory.forEach((row) => {
          map[row.flavor_id] = {
            full_trays: row.tray_count,
            in_progress_trays: row.in_progress_count ?? 0,
            barrel_count: row.barrel_count ?? 0,
            in_progress_barrels: row.in_progress_barrel_count ?? 0,
          }
        })

        // Override component flavor counts using batch history (forward from season start)
        if (batchData && allFlavorsData) {
          const SEASON_START = '2026-04-22'
          const componentIds = new Set(allFlavorsData.filter(f => f.is_component).map(f => f.id))
          const sscIdToYield = new Map(
            allFlavorsData
              .filter(f => f.name.toLowerCase().includes('sea salt'))
              .map(f => [f.id, f.default_yield ?? 6])
          )
          for (const flavorId of componentIds) {
            let total = 0
            batchData.forEach(b => {
              if (b.is_wasted) return
              const bDate = (b.batch_date ?? '').slice(0, 10)
              if (bDate < SEASON_START) return
              if (b.flavor_id === flavorId) total += 1
              else if (sscIdToYield.has(b.flavor_id)) total -= sscIdToYield.get(b.flavor_id) / 18
            })
            map[flavorId] = {
              ...(map[flavorId] ?? { in_progress_trays: 0, barrel_count: 0 }),
              full_trays: Math.max(0, Math.round(total * 1000) / 1000),
            }
          }
        }

        setEntries(map)
        setReportFound(true)
      } else {
        setReportFound(false)
      }
    }
    load()
  }, [])


  const loading = flavorsLoading || reportFound === null
  if (loading) return <p className="text-store-brown-light text-center py-12">Loading...</p>

  const fudgeFlavors = flavors.filter(f => f.product_type !== 'popcorn' && f.is_component !== true)
  const componentFlavors = flavors.filter(f => f.is_component === true)
  const popcornFlavors = flavors.filter(f => f.product_type === 'popcorn')

  const needsMaking = fudgeFlavors.filter((f) => (entries[f.id]?.full_trays ?? 0) <= (f.low_tray_threshold ?? 2))
  const stockedFlavors = fudgeFlavors.filter((f) => (entries[f.id]?.full_trays ?? 0) > (f.low_tray_threshold ?? 2))

  const lowPopcorn = popcornFlavors.filter((f) => (entries[f.id]?.barrel_count ?? 0) <= (f.low_tray_threshold ?? 1))
  const stockedPopcorn = popcornFlavors.filter((f) => (entries[f.id]?.barrel_count ?? 0) > (f.low_tray_threshold ?? 1))

  const lowIngredients = ingredients.filter(
    (i) => i.low_stock_threshold != null && i.quantity <= i.low_stock_threshold
  )
  const stockedIngredients = ingredients.filter(
    (i) => !(i.low_stock_threshold != null && i.quantity <= i.low_stock_threshold)
  )
  const negativeIngredients = ingredients.filter(i => i.quantity < 0)

  const renderFlavorPill = (flavor) => {
    const entry = entries[flavor.id]
    const fullTrays = entry?.full_trays ?? 0
    const inProgress = entry?.in_progress_trays ?? 0
    const threshold = flavor.low_tray_threshold ?? 2
    const isOut = fullTrays === 0
    const isLow = !isOut && fullTrays <= threshold

    const pillClass = isOut
      ? 'bg-red-50 border-red-300 text-red-700'
      : isLow ? 'bg-amber-50 border-amber-300 text-amber-700'
        : 'bg-store-green-light border-store-green text-store-green'
    const countClass = isOut
      ? 'bg-red-200 text-red-800'
      : isLow ? 'bg-amber-200 text-amber-800'
        : 'bg-store-green text-white'

    const whole = Math.floor(fullTrays)
    const numer = flavor.is_component ? Math.round((fullTrays - whole) * 18) : 0

    return (
      <div key={flavor.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${pillClass}`}>
        <span>{flavor.name}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${countClass}`}>
          {flavor.is_component ? whole : fullTrays}
        </span>
        {flavor.is_component && numer > 0 && (
          <span className="text-xs opacity-60">+{numer}/18</span>
        )}
        {!flavor.is_component && inProgress > 0 && (
          <span className="text-xs opacity-60">+{inProgress}½</span>
        )}
      </div>
    )
  }

  const renderPopcornPill = (flavor) => {
    const barrels = entries[flavor.id]?.barrel_count ?? 0
    const inProgressBarrels = entries[flavor.id]?.in_progress_barrels ?? 0
    const threshold = flavor.low_tray_threshold ?? 1
    const isOut = barrels === 0
    const isLow = !isOut && barrels <= threshold
    const pillClass = isOut
      ? 'bg-red-50 border-red-300 text-red-700'
      : isLow ? 'bg-amber-50 border-amber-300 text-amber-700'
        : 'bg-store-green-light border-store-green text-store-green'
    const countClass = isOut
      ? 'bg-red-200 text-red-800'
      : isLow ? 'bg-amber-200 text-amber-800'
        : 'bg-store-green text-white'

    return (
      <div key={flavor.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${pillClass}`}>
        <span>{flavor.name}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${countClass}`}>
          {barrels} {barrels === 1 ? 'barrel' : 'barrels'}
        </span>
        {inProgressBarrels > 0 && (
          <span className="text-xs opacity-60">+{inProgressBarrels} in progress</span>
        )}
      </div>
    )
  }

  const renderIngredientPill = (ing) => {
    const isNegative = ing.quantity < 0
    const isOut = !isNegative && ing.quantity === 0
    const isLow = !isOut && !isNegative && ing.quantity <= (ing.low_stock_threshold ?? 0)

    return (
      <div key={ing.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${
        isNegative ? 'bg-red-100 border-red-400 text-red-800'
          : isOut ? 'bg-red-50 border-red-300 text-red-700'
            : isLow ? 'bg-amber-50 border-amber-300 text-amber-700'
              : 'bg-store-green-light border-store-green text-store-green'
      }`}>
        <span>{ing.name}</span>
        <span className="opacity-70">{parseFloat(ing.quantity.toFixed(1))} {ing.unit}</span>
        {isNegative && <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold bg-red-300 text-red-900">⚠ Negative</span>}
        {isOut && !isNegative && <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold bg-red-200 text-red-800">Out</span>}
        {isLow && <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold bg-amber-200 text-amber-800">Low</span>}
      </div>
    )
  }

  return (
    <div className="space-y-8">

      {/* ── FUDGE ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          Fudge
        </h2>
        <div>
          <h3 className="text-sm font-bold text-store-brown-light uppercase tracking-wide mb-2">Make Soon</h3>
          {needsMaking.length > 0 ? (
            <div className="flex flex-wrap gap-2">{needsMaking.map(renderFlavorPill)}</div>
          ) : (
            <p className="text-sm text-store-green font-medium">All fudge stocked ✓</p>
          )}
        </div>

        {stockedFlavors.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-store-brown-light uppercase tracking-wide mb-2">Fudge In Stock</h3>
            <div className="flex flex-wrap gap-2">{stockedFlavors.map(renderFlavorPill)}</div>
          </div>
        )}
      </div>

      {/* Yesterday's Shelf */}
      {Object.keys(yesterdayEntries).length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-store-brown-light uppercase tracking-wide mb-2">Yesterday's Shelf</h3>
          <div className="flex flex-wrap gap-2">
            {fudgeFlavors.map((f) => {
              const y = yesterdayEntries[f.id]
              if (!y || (y.full_trays === 0 && y.trays_sold === 0 && y.in_progress_trays === 0)) return null
              return (
                <div key={f.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border bg-store-cream border-store-tan text-store-brown">
                  <span>{f.name}</span>
                  {y.full_trays > 0 && <span className="text-xs bg-store-tan px-1.5 py-0.5 rounded-full font-bold">{y.full_trays}</span>}
                  {y.in_progress_trays > 0 && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">{y.in_progress_trays} in progress</span>}
                  {y.trays_sold > 0 && <span className="text-xs opacity-60">{y.trays_sold} sold</span>}
                </div>
              )
            }).filter(Boolean)}
          </div>
        </div>
      )}

      <hr className="border-store-tan" />

      {/* ── CARAMEL ───────────────────────────────────────────── */}
      {componentFlavors.length > 0 && (() => {
        const lowCaramel = componentFlavors.filter(f => (entries[f.id]?.full_trays ?? 0) <= (f.low_tray_threshold ?? 2))
        const stockedCaramel = componentFlavors.filter(f => (entries[f.id]?.full_trays ?? 0) > (f.low_tray_threshold ?? 2))
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
              Caramel
            </h2>
            <div>
              <h3 className="text-sm font-bold text-store-brown-light uppercase tracking-wide mb-2">Make Soon</h3>
              {lowCaramel.length > 0 ? (
                <div className="flex flex-wrap gap-2">{lowCaramel.map(renderFlavorPill)}</div>
              ) : (
                <p className="text-sm text-store-green font-medium">Caramel stocked ✓</p>
              )}
            </div>
            {stockedCaramel.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-store-brown-light uppercase tracking-wide mb-2">Caramel In Stock</h3>
                <div className="flex flex-wrap gap-2">{stockedCaramel.map(renderFlavorPill)}</div>
              </div>
            )}
          </div>
        )
      })()}

      {componentFlavors.length > 0 && <hr className="border-store-tan" />}

      {/* ── POPCORN ───────────────────────────────────────────── */}
      {popcornFlavors.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
            Popcorn
          </h2>

          <div>
            <h3 className="text-sm font-bold text-store-brown-light uppercase tracking-wide mb-2">Make Soon</h3>
            {lowPopcorn.length > 0 ? (
              <div className="flex flex-wrap gap-2">{lowPopcorn.map(renderPopcornPill)}</div>
            ) : (
              <p className="text-sm text-store-green font-medium">All popcorn stocked ✓</p>
            )}
          </div>

          {stockedPopcorn.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-store-brown-light uppercase tracking-wide mb-2">Popcorn In Stock</h3>
              <div className="flex flex-wrap gap-2">{stockedPopcorn.map(renderPopcornPill)}</div>
            </div>
          )}

        </div>
      )}

      {popcornFlavors.length > 0 && <hr className="border-store-tan" />}

      {/* ── INGREDIENTS ───────────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
            Ingredients
          </h2>
          {ingredientsLoading ? (
            <p className="text-store-brown-light text-sm mt-2">Loading ingredients...</p>
          ) : negativeIngredients.length > 0 ? (
            <div className="mt-2 space-y-1">
              {negativeIngredients.map(i => (
                <p key={i.id} className="text-sm font-semibold text-red-700">
                  ⚠ {i.name} is negative ({parseFloat(i.quantity.toFixed(1))} {i.unit}) — manual count needed
                </p>
              ))}
            </div>
          ) : null}
          {!ingredientsLoading && lowIngredients.length > 0 ? (
            <div className="flex flex-wrap gap-2 mt-2">{lowIngredients.map(renderIngredientPill)}</div>
          ) : !ingredientsLoading && negativeIngredients.length === 0 ? (
            <p className="text-sm text-store-green font-medium mt-2">All ingredients stocked ✓</p>
          ) : null}
        </div>

        {!ingredientsLoading && stockedIngredients.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-store-brown-light uppercase tracking-wide mb-2">In Stock</h3>
            <div className="flex flex-wrap gap-2">{stockedIngredients.map(renderIngredientPill)}</div>
          </div>
        )}
      </div>

    </div>
  )
}
