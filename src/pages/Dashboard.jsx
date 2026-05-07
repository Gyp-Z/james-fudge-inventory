import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useFlavors } from '../hooks/useFlavors'

export default function Dashboard() {
  const { flavors, loading: flavorsLoading } = useFlavors()
  const [entries, setEntries] = useState({})  // flavor_id -> { full_trays, in_progress_trays, barrel_count }
  const [reportFound, setReportFound] = useState(null)
  const [ingredients, setIngredients] = useState([])
  const [ingredientsLoading, setIngredientsLoading] = useState(true)
  const [yesterdayEntries, setYesterdayEntries] = useState({})

  // Shelf bucket state
  const [shelfBucketFlavor, setShelfBucketFlavor] = useState(null) // flavor object
  const [bucketSmall, setBucketSmall] = useState('')
  const [bucketLarge, setBucketLarge] = useState('')
  const [bucketBarrels, setBucketBarrels] = useState('')
  const [savingBuckets, setSavingBuckets] = useState(false)
  const [latestBucketLogs, setLatestBucketLogs] = useState({}) // flavor_id -> log row

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

  // Load latest shelf bucket log for each tracks_shelf_buckets flavor
  useEffect(() => {
    async function loadBucketLogs() {
      const bucketFlavors = flavors.filter(f => f.tracks_shelf_buckets)
      if (bucketFlavors.length === 0) return

      const ids = bucketFlavors.map(f => f.id)
      const { data } = await supabase
        .from('shelf_bucket_logs')
        .select('flavor_id, small_buckets, large_buckets, barrels_used, logged_at')
        .in('flavor_id', ids)
        .order('logged_at', { ascending: false })

      if (!data) return
      // Keep only the most recent log per flavor
      const map = {}
      for (const row of data) {
        if (!map[row.flavor_id]) map[row.flavor_id] = row
      }
      setLatestBucketLogs(map)
    }
    if (!flavorsLoading) loadBucketLogs()
  }, [flavors, flavorsLoading])

  async function handleSaveBuckets() {
    if (!shelfBucketFlavor) return
    setSavingBuckets(true)
    const { error } = await supabase.from('shelf_bucket_logs').insert({
      flavor_id: shelfBucketFlavor.id,
      small_buckets: parseInt(bucketSmall) || 0,
      large_buckets: parseInt(bucketLarge) || 0,
      barrels_used: bucketBarrels ? parseFloat(bucketBarrels) : null,
    })
    if (!error) {
      // Update local state immediately
      const newLog = {
        flavor_id: shelfBucketFlavor.id,
        small_buckets: parseInt(bucketSmall) || 0,
        large_buckets: parseInt(bucketLarge) || 0,
        barrels_used: bucketBarrels ? parseFloat(bucketBarrels) : null,
        logged_at: new Date().toISOString(),
      }
      setLatestBucketLogs(prev => ({ ...prev, [shelfBucketFlavor.id]: newLog }))
    }
    setSavingBuckets(false)
    setShelfBucketFlavor(null)
    setBucketSmall('')
    setBucketLarge('')
    setBucketBarrels('')
  }

  const loading = flavorsLoading || reportFound === null

  if (loading) {
    return <p className="text-store-brown-light text-center py-12">Loading...</p>
  }

  const fudgeFlavors = flavors.filter(f => f.product_type !== 'popcorn')
  const popcornFlavors = flavors.filter(f => f.product_type === 'popcorn')

  const needsMaking = fudgeFlavors.filter((f) => {
    const fullTrays = entries[f.id]?.full_trays ?? 0
    return fullTrays <= (f.low_tray_threshold ?? 2)
  })

  const stockedFlavors = fudgeFlavors.filter((f) => {
    const fullTrays = entries[f.id]?.full_trays ?? 0
    return fullTrays > (f.low_tray_threshold ?? 2)
  })

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

  const renderPopcornCard = (flavor) => {
    const barrels = entries[flavor.id]?.barrel_count ?? 0
    const threshold = flavor.low_tray_threshold ?? 1
    const isOut = barrels === 0
    const isLow = !isOut && barrels <= threshold
    const bucketLog = latestBucketLogs[flavor.id]

    const cardClass = isOut
      ? 'bg-red-50 border-red-200'
      : isLow
        ? 'bg-amber-50 border-amber-200'
        : 'bg-white border-store-tan'

    const barrelBadgeClass = isOut
      ? 'bg-red-200 text-red-800'
      : isLow
        ? 'bg-amber-200 text-amber-800'
        : 'bg-amber-600 text-white'

    return (
      <div key={flavor.id} className={`rounded-xl border px-4 py-3 space-y-2 ${cardClass}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-store-brown">{flavor.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${barrelBadgeClass}`}>
              {barrels} {barrels === 1 ? 'barrel' : 'barrels'}
            </span>
            {isOut && <span className="text-xs text-red-600 font-semibold">Out</span>}
            {isLow && !isOut && <span className="text-xs text-amber-600 font-semibold">Low</span>}
          </div>
          {flavor.tracks_shelf_buckets && (
            <button
              onClick={() => {
                setShelfBucketFlavor(flavor)
                setBucketSmall('')
                setBucketLarge('')
                setBucketBarrels('')
              }}
              className="text-xs text-store-brown-light hover:text-store-brown underline"
            >
              Log Shelf Buckets
            </button>
          )}
        </div>

        {/* Latest shelf bucket log */}
        {flavor.tracks_shelf_buckets && bucketLog && (
          <p className="text-xs text-store-brown-light">
            Last shelf: {bucketLog.small_buckets} small, {bucketLog.large_buckets} large
            {bucketLog.barrels_used ? ` · from ${bucketLog.barrels_used} barrels` : ''}
            {' · '}{new Date(bucketLog.logged_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
        )}

        {/* Inline shelf bucket form */}
        {shelfBucketFlavor?.id === flavor.id && (
          <div className="bg-white border border-store-tan rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-store-brown">Log Shelf Buckets — {flavor.name}</p>
            <div className="flex gap-2 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-store-brown-light">Small buckets</label>
                <input
                  type="number" min="0" inputMode="numeric"
                  value={bucketSmall} onChange={e => setBucketSmall(e.target.value)}
                  className="w-20 border border-store-tan rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-store-brown-light">Large buckets</label>
                <input
                  type="number" min="0" inputMode="numeric"
                  value={bucketLarge} onChange={e => setBucketLarge(e.target.value)}
                  className="w-20 border border-store-tan rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-store-brown-light">Barrels used (opt)</label>
                <input
                  type="number" min="0" step="0.5" inputMode="decimal"
                  value={bucketBarrels} onChange={e => setBucketBarrels(e.target.value)}
                  className="w-24 border border-store-tan rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveBuckets}
                disabled={savingBuckets}
                className="bg-store-green text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-store-green-dark transition-colors disabled:opacity-50"
              >
                {savingBuckets ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setShelfBucketFlavor(null)}
                className="text-xs text-store-brown-light hover:text-store-brown px-2 py-1.5"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderIngredientPill = (ing) => {
    const isNegative = ing.quantity < 0
    const isOut = !isNegative && ing.quantity === 0
    const isLow = !isOut && !isNegative && ing.quantity <= (ing.low_stock_threshold ?? 0)

    return (
      <div
        key={ing.id}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${
          isNegative
            ? 'bg-red-100 border-red-400 text-red-800'
            : isOut
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
        {isNegative && (
          <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold bg-red-300 text-red-900">⚠ Negative</span>
        )}
        {isOut && !isNegative && (
          <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold bg-red-200 text-red-800">Out</span>
        )}
        {isLow && (
          <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold bg-amber-200 text-amber-800">Low</span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── FUDGE SECTION ─────────────────────────────────────── */}
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
            <p className="text-sm text-store-green font-medium mt-2">All fudge stocked ✓</p>
          )}
        </div>

        {stockedFlavors.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-store-brown-light uppercase tracking-wide mb-2">Fudge In Stock</h3>
            <div className="flex flex-wrap gap-2">
              {stockedFlavors.map(renderFlavorPill)}
            </div>
          </div>
        )}
      </div>

      {/* Yesterday's Shelf */}
      {Object.keys(yesterdayEntries).length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-store-brown-light uppercase tracking-wide mb-2">
            Yesterday's Shelf
          </h3>
          <div className="flex flex-wrap gap-2">
            {fudgeFlavors.map((f) => {
              const y = yesterdayEntries[f.id]
              if (!y || (y.full_trays === 0 && y.trays_sold === 0 && y.in_progress_trays === 0)) return null
              return (
                <div
                  key={f.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border bg-store-cream border-store-tan text-store-brown"
                >
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

      {/* ── POPCORN SECTION ───────────────────────────────────── */}
      {popcornFlavors.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
            Popcorn
          </h2>
          <div className="space-y-2">
            {popcornFlavors.map(renderPopcornCard)}
          </div>
        </div>
      )}

      {popcornFlavors.length > 0 && <hr className="border-store-tan" />}

      {/* ── INGREDIENTS ALERT ─────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
            Ingredients Alert
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
            <div className="flex flex-wrap gap-2 mt-2">
              {lowIngredients.map(renderIngredientPill)}
            </div>
          ) : !ingredientsLoading && negativeIngredients.length === 0 ? (
            <p className="text-sm text-store-green font-medium mt-2">All ingredients stocked ✓</p>
          ) : null}
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
    </div>
  )
}
