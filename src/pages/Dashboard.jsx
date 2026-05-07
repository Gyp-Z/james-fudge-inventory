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
  const [todayBuckets, setTodayBuckets] = useState({})

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
    async function loadBuckets() {
      const { data, error } = await supabase
        .from('shelf_bucket_logs')
        .select('flavor_id, small_buckets_made, large_buckets_made, small_buckets_sold, large_buckets_sold')
      if (error) return
      const map = {}
      ;(data || []).forEach(row => {
        const prev = map[row.flavor_id] || { small: 0, large: 0 }
        map[row.flavor_id] = {
          small: prev.small + (row.small_buckets_made ?? 0) - (row.small_buckets_sold ?? 0),
          large: prev.large + (row.large_buckets_made ?? 0) - (row.large_buckets_sold ?? 0),
        }
      })
      setTodayBuckets(map)
    }
    loadBuckets()
  }, [])

  useEffect(() => {
    async function load() {
      const { data: inventory } = await supabase
        .from('current_inventory')
        .select('flavor_id, tray_count, in_progress_count, barrel_count')

      if (inventory && inventory.length > 0) {
        const map = {}
        inventory.forEach((row) => {
          map[row.flavor_id] = {
            full_trays: row.tray_count,
            in_progress_trays: row.in_progress_count ?? 0,
            barrel_count: row.barrel_count ?? 0,
          }
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
  if (loading) return <p className="text-store-brown-light text-center py-12">Loading...</p>

  const fudgeFlavors = flavors.filter(f => f.product_type !== 'popcorn' && f.is_component !== true)
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

    return (
      <div key={flavor.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${pillClass}`}>
        <span>{flavor.name}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${countClass}`}>{fullTrays}</span>
        {inProgress > 0 && <span className="text-xs opacity-60">+{inProgress}½</span>}
      </div>
    )
  }

  const renderPopcornPill = (flavor) => {
    const barrels = entries[flavor.id]?.barrel_count ?? 0
    const threshold = flavor.low_tray_threshold ?? 1
    const isOut = barrels === 0
    const isLow = !isOut && barrels <= threshold
    const buckets = todayBuckets[flavor.id]

    const pillClass = isOut
      ? 'bg-red-50 border-red-300 text-red-700'
      : isLow ? 'bg-amber-50 border-amber-300 text-amber-700'
        : 'bg-store-green-light border-store-green text-store-green'
    const countClass = isOut
      ? 'bg-red-200 text-red-800'
      : isLow ? 'bg-amber-200 text-amber-800'
        : 'bg-store-green text-white'

    const bucketParts = []
    if (buckets?.small > 0) bucketParts.push(`${buckets.small}S`)
    if (buckets?.large > 0) bucketParts.push(`${buckets.large}L`)

    return (
      <div key={flavor.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${pillClass}`}>
        <span>{flavor.name}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${countClass}`}>
          {barrels} {barrels === 1 ? 'barrel' : 'barrels'}
        </span>
        {bucketParts.length > 0 && (
          <span className="text-xs opacity-70">{bucketParts.join(' ')} on shelf</span>
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
        <span className="opacity-70">{ing.quantity} {ing.unit}</span>
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
        <div>
          <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
            Make Soon
          </h2>
          {needsMaking.length > 0 ? (
            <div className="flex flex-wrap gap-2 mt-2">{needsMaking.map(renderFlavorPill)}</div>
          ) : (
            <p className="text-sm text-store-green font-medium mt-2">All fudge stocked ✓</p>
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

      {/* ── POPCORN ───────────────────────────────────────────── */}
      {popcornFlavors.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
              Popcorn
            </h2>
            {lowPopcorn.length > 0 ? (
              <div className="flex flex-wrap gap-2 mt-2">{lowPopcorn.map(renderPopcornPill)}</div>
            ) : (
              <p className="text-sm text-store-green font-medium mt-2">All popcorn stocked ✓</p>
            )}
          </div>

          {stockedPopcorn.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-store-brown-light uppercase tracking-wide mb-2">Popcorn In Stock</h3>
              <div className="flex flex-wrap gap-2">{stockedPopcorn.map(renderPopcornPill)}</div>
            </div>
          )}

          {popcornFlavors.some(f => f.tracks_shelf_buckets) && (
            <div>
              <h3 className="text-sm font-bold text-store-brown-light uppercase tracking-wide mb-2">Popcorn Shelves</h3>
              <div className="flex flex-wrap gap-2">
                {popcornFlavors.filter(f => f.tracks_shelf_buckets).map(f => {
                  const b = todayBuckets[f.id] || { small: 0, large: 0 }
                  const smallThreshold = f.low_small_bucket_threshold ?? 0
                  const largeThreshold = f.low_large_bucket_threshold ?? 0
                  const smallOut = b.small === 0
                  const largeOut = b.large === 0
                  const smallLow = !smallOut && smallThreshold > 0 && b.small <= smallThreshold
                  const largeLow = !largeOut && largeThreshold > 0 && b.large <= largeThreshold
                  const isOut = smallOut && largeOut
                  const isLow = !isOut && (smallLow || largeLow || (smallThreshold === 0 && largeThreshold === 0 && !isOut ? false : smallOut || largeOut))
                  const pillClass = isOut
                    ? 'bg-red-50 border-red-300 text-red-700'
                    : (smallLow || largeLow || (smallThreshold > 0 && smallOut) || (largeThreshold > 0 && largeOut))
                      ? 'bg-amber-50 border-amber-300 text-amber-700'
                      : 'bg-store-green-light border-store-green text-store-green'
                  const smallClass = smallOut
                    ? 'text-red-600 font-bold'
                    : smallLow ? 'text-amber-600 font-bold' : ''
                  const largeClass = largeOut
                    ? 'text-red-600 font-bold'
                    : largeLow ? 'text-amber-600 font-bold' : ''
                  return (
                    <div key={f.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${pillClass}`}>
                      <span>{f.name}</span>
                      <span className="text-xs font-mono">
                        <span className={smallClass}>{b.small}S</span>
                        <span className="opacity-50"> / </span>
                        <span className={largeClass}>{b.large}L</span>
                      </span>
                    </div>
                  )
                })}
              </div>
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
                  ⚠ {i.name} is negative ({i.quantity.toFixed(2)} {i.unit}) — manual count needed
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
