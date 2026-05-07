import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { autoDeductIngredients, incrementBarrelCount } from '../utils/autoDeduct'

// Default popping rounds by flavor name (informational only, stored in notes)
const POPPING_ROUNDS = {
  'Caramel Corn': 2,
  'Nut Caramel Corn': 2,
  'Cheddar Corn': 1,
  'White Cheddar Corn': 1,
  'Oreo Popcorn': 1,
}

export default function Batch() {
  const [flavors, setFlavors] = useState([])
  const [loading, setLoading] = useState(true)
  const [flavorId, setFlavorId] = useState(null)
  const [quantity, setQuantity] = useState('')
  const [weightLbs, setWeightLbs] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recentBatches, setRecentBatches] = useState([])

  // Post-submit state
  const [lastResult, setLastResult] = useState(null) // { flavorName, deductions, negatives }
  const [showDeductions, setShowDeductions] = useState(false)

  async function loadData() {
    const todayStr = new Date().toISOString().split('T')[0]
    const [{ data: flavorData }, { data: batchData }] = await Promise.all([
      supabase
        .from('flavors')
        .select('id, name, product_type, stock_unit, default_yield')
        .eq('is_active', true)
        .order('product_type') // fudge first, then popcorn
        .order('name'),
      supabase
        .from('batch_logs')
        .select('id, flavor_id, weight_lbs, created_at, flavors(name, product_type, stock_unit)')
        .gte('batch_date', todayStr)
        .order('created_at', { ascending: false }),
    ])
    setFlavors(flavorData || [])
    setRecentBatches(batchData || [])
    if (flavorData?.length > 0 && !flavorId) {
      setFlavorId(flavorData[0].id)
      const first = flavorData[0]
      setQuantity(String(first.default_yield ?? 3))
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const selectedFlavor = flavors.find(f => f.id === flavorId)
  const isPopcorn = selectedFlavor?.product_type === 'popcorn'
  const unitLabel = isPopcorn ? 'barrels' : 'trays'

  function handleFlavorSelect(flavor) {
    setFlavorId(flavor.id)
    setQuantity(String(flavor.default_yield ?? (flavor.product_type === 'popcorn' ? 1 : 3)))
    setLastResult(null)
    setShowDeductions(false)
  }

  async function handleSubmit() {
    if (!flavorId || !selectedFlavor) return
    setSubmitting(true)
    setLastResult(null)

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

    // Build notes: include popping rounds for popcorn
    let notes = null
    if (isPopcorn) {
      const rounds = POPPING_ROUNDS[selectedFlavor.name] ?? 1
      notes = `Popping rounds: ${rounds}`
    }

    const { data: inserted, error: insertError } = await supabase
      .from('batch_logs')
      .insert({
        flavor_id: flavorId,
        batch_date: todayStr,
        weight_lbs: weightLbs ? parseFloat(weightLbs) : null,
        notes,
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      console.error('Batch log insert failed:', insertError?.message)
      setSubmitting(false)
      return
    }

    const batchLogId = inserted.id
    const batchQty = parseFloat(quantity) || (selectedFlavor.default_yield ?? (isPopcorn ? 1 : 3))

    // Fire auto-deduction and (for popcorn) barrel count increment in parallel
    const [{ deductions, negatives }] = await Promise.all([
      autoDeductIngredients(flavorId, batchLogId),
      isPopcorn ? incrementBarrelCount(flavorId, batchQty) : Promise.resolve(),
    ])

    setLastResult({
      flavorName: selectedFlavor.name,
      deductions,
      negatives,
    })
    setShowDeductions(false)
    setWeightLbs('')
    await loadData()
    setSubmitting(false)
  }

  if (loading) return <p className="text-store-brown-light text-center py-12">Loading...</p>

  const todayLabel = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long', month: 'long', day: 'numeric',
  })

  const fudgeFlavors = flavors.filter(f => f.product_type !== 'popcorn')
  const popcornFlavors = flavors.filter(f => f.product_type === 'popcorn')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          Log Batch
        </h2>
        <p className="text-store-brown-light text-sm mt-1">{todayLabel}</p>
      </div>

      {/* Flavor picker — split by type */}
      <div className="space-y-3">
        {fudgeFlavors.length > 0 && (
          <div>
            <p className="text-xs font-bold text-store-brown-light uppercase tracking-wide mb-2">Fudge</p>
            <div className="flex flex-wrap gap-2">
              {fudgeFlavors.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleFlavorSelect(f)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors touch-manipulation ${
                    flavorId === f.id
                      ? 'bg-store-brown text-white border-store-brown'
                      : 'bg-white text-store-brown border-store-tan hover:border-store-brown'
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {popcornFlavors.length > 0 && (
          <div>
            <p className="text-xs font-bold text-store-brown-light uppercase tracking-wide mb-2">Popcorn</p>
            <div className="flex flex-wrap gap-2">
              {popcornFlavors.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleFlavorSelect(f)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors touch-manipulation ${
                    flavorId === f.id
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-amber-50 text-amber-800 border-amber-200 hover:border-amber-400'
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quantity */}
      <div>
        <p className="text-sm font-medium text-store-brown mb-2 capitalize">
          {unitLabel.charAt(0).toUpperCase() + unitLabel.slice(1)}{' '}
          <span className="font-normal text-store-brown-light">— how many this batch</span>
        </p>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step={isPopcorn ? '0.5' : '1'}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder={isPopcorn ? 'e.g. 2.5' : 'e.g. 3'}
          className="w-full border border-store-tan rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
        />
      </div>

      {/* Weight (fudge only) */}
      {!isPopcorn && (
        <div>
          <p className="text-sm font-medium text-store-brown mb-2">
            Weight (lbs) <span className="font-normal text-store-brown-light">— optional</span>
          </p>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            value={weightLbs}
            onChange={(e) => setWeightLbs(e.target.value)}
            placeholder="e.g. 4.5"
            className="w-full border border-store-tan rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
          />
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting || !flavorId}
        className="w-full bg-store-green hover:bg-store-green-dark text-white py-4 rounded-xl text-lg font-semibold transition-colors disabled:opacity-50 touch-manipulation"
      >
        {submitting ? 'Logging…' : 'Log Batch'}
      </button>

      {/* Post-submit confirmation */}
      {lastResult && (
        <div className={`rounded-xl border p-4 space-y-2 ${lastResult.negatives.length > 0 ? 'bg-red-50 border-red-200' : 'bg-store-green-light border-store-green'}`}>
          <p className={`font-semibold text-sm ${lastResult.negatives.length > 0 ? 'text-red-700' : 'text-store-green'}`}>
            ✓ {lastResult.flavorName} batch logged.
            {lastResult.deductions.length > 0 ? ' Ingredients auto-deducted.' : ' No recipe found — ingredients not deducted.'}
          </p>

          {lastResult.negatives.length > 0 && (
            <div className="space-y-1">
              {lastResult.negatives.map(n => (
                <p key={n.ingredient_id} className="text-xs text-red-700 font-medium">
                  ⚠ {n.name} is now {n.new_quantity.toFixed(2)} {n.unit} — manual count needed
                </p>
              ))}
            </div>
          )}

          {lastResult.deductions.length > 0 && (
            <div>
              <button
                onClick={() => setShowDeductions(v => !v)}
                className="text-xs text-store-brown-light underline hover:text-store-brown"
              >
                {showDeductions ? 'Hide' : 'Show'} deductions ({lastResult.deductions.length})
              </button>
              {showDeductions && (
                <div className="mt-2 space-y-1">
                  {lastResult.deductions.map(d => (
                    <p key={d.ingredient_id} className="text-xs text-store-brown-light">
                      − {Number(d.quantity_deducted).toFixed(3)} {d.unit} {d.name}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Today's batches */}
      {recentBatches.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-store-brown-light uppercase tracking-wide mb-2">Today's Batches</h3>
          <div className="space-y-2">
            {recentBatches.map((b) => {
              const isPopcornBatch = b.flavors?.product_type === 'popcorn'
              return (
                <div key={b.id} className="bg-white border border-store-tan rounded-xl px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-store-brown">{b.flavors?.name}</span>
                    {isPopcornBatch && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">popcorn</span>
                    )}
                  </div>
                  <span className="text-store-brown-light text-sm">
                    {b.weight_lbs ? `${b.weight_lbs} lbs` : '1 batch'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
