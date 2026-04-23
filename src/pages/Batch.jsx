import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Batch() {
  const [flavors, setFlavors] = useState([])
  const [loading, setLoading] = useState(true)
  const [flavorId, setFlavorId] = useState(null)
  const [weightLbs, setWeightLbs] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recentBatches, setRecentBatches] = useState([])

  async function loadData() {
    const todayStr = new Date().toISOString().split('T')[0]
    const [{ data: flavorData }, { data: batchData }] = await Promise.all([
      supabase.from('flavors').select('id, name').eq('is_active', true).order('name'),
      supabase
        .from('batch_logs')
        .select('id, flavor_id, weight_lbs, created_at, flavors(name)')
        .gte('batch_date', todayStr)
        .order('created_at', { ascending: false }),
    ])
    setFlavors(flavorData || [])
    setRecentBatches(batchData || [])
    if (flavorData?.length > 0 && !flavorId) setFlavorId(flavorData[0].id)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  async function handleSubmit() {
    if (!flavorId) return
    setSubmitting(true)
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    await supabase.from('batch_logs').insert({
      flavor_id: flavorId,
      batch_date: todayStr,
      weight_lbs: weightLbs ? parseFloat(weightLbs) : null,
    })
    setWeightLbs('')
    await loadData()
    setSubmitting(false)
  }

  if (loading) return <p className="text-store-brown-light text-center py-12">Loading...</p>

  const todayLabel = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          Log Batch
        </h2>
        <p className="text-store-brown-light text-sm mt-1">{todayLabel}</p>
      </div>

      {/* Flavor picker */}
      <div>
        <p className="text-sm font-medium text-store-brown mb-2">Flavor</p>
        <div className="flex flex-wrap gap-2">
          {flavors.map((f) => (
            <button
              key={f.id}
              onClick={() => setFlavorId(f.id)}
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

      {/* Weight */}
      <div>
        <p className="text-sm font-medium text-store-brown mb-2">Weight (lbs) <span className="font-normal text-store-brown-light">— optional</span></p>
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

      <button
        onClick={handleSubmit}
        disabled={submitting || !flavorId}
        className="w-full bg-store-green hover:bg-store-green-dark text-white py-4 rounded-xl text-lg font-semibold transition-colors disabled:opacity-50 touch-manipulation"
      >
        {submitting ? 'Logging…' : 'Log Batch'}
      </button>

      {/* Today's batches */}
      {recentBatches.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-store-brown-light uppercase tracking-wide mb-2">Today's Batches</h3>
          <div className="space-y-2">
            {recentBatches.map((b) => (
              <div key={b.id} className="bg-white border border-store-tan rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="font-medium text-store-brown">{b.flavors?.name}</span>
                <span className="text-store-brown-light text-sm">
                  {b.weight_lbs ? `${b.weight_lbs} lbs` : '1 batch'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
