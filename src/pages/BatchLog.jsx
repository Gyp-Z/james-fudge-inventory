import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useFlavors } from '../hooks/useFlavors'

// SQL to run in Supabase SQL editor if not already done:
// ALTER TABLE batch_logs ADD COLUMN IF NOT EXISTS tray_count integer NOT NULL DEFAULT 3;
// CREATE TABLE IF NOT EXISTS waste_log (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   type text NOT NULL CHECK (type IN ('ingredient', 'flavor')),
//   reference_id uuid NOT NULL,
//   reference_name text NOT NULL,
//   quantity numeric NOT NULL,
//   unit text,
//   notes text,
//   created_at timestamptz NOT NULL DEFAULT now()
// );

export default function BatchLog() {
  const { flavors, loading: flavorsLoading } = useFlavors()
  const [flavorId, setFlavorId] = useState('')
  const [trayCount, setTrayCount] = useState(3)
  const [weightLbs, setWeightLbs] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recentBatches, setRecentBatches] = useState([])

  // Waste log state
  const [wasteOpen, setWasteOpen] = useState(false)
  const [ingredients, setIngredients] = useState([])
  const [wasteIngredientId, setWasteIngredientId] = useState('')
  const [wasteFlavorId, setWasteFlavorId] = useState('')
  const [wasteQuantity, setWasteQuantity] = useState('')
  const [wasteUnit, setWasteUnit] = useState('')
  const [wasteNotes, setWasteNotes] = useState('')
  const [wasteSubmitting, setWasteSubmitting] = useState(false)

  async function loadRecent() {
    const { data } = await supabase
      .from('batch_logs')
      .select('*, flavors(name)')
      .order('created_at', { ascending: false })
      .limit(20)
    setRecentBatches(data || [])
  }

  useEffect(() => {
    loadRecent()
    supabase
      .from('ingredients')
      .select('id, name')
      .then(({ data }) => setIngredients(data || []))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!flavorId) return
    setSubmitting(true)

    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData?.session?.user

    const { error } = await supabase.from('batch_logs').insert({
      flavor_id: flavorId,
      tray_count: trayCount,
      weight_lbs: weightLbs ? parseFloat(weightLbs) : null,
      batch_date: new Date().toISOString(),
      notes,
      logged_by: user?.email,
    })

    if (!error) {
      const { data: existing } = await supabase
        .from('current_inventory')
        .select('tray_count')
        .eq('flavor_id', flavorId)
        .single()

      const newCount = (existing?.tray_count ?? 0) + trayCount
      await supabase.from('current_inventory').upsert(
        { flavor_id: flavorId, tray_count: newCount, updated_at: new Date().toISOString() },
        { onConflict: 'flavor_id' }
      )

      setFlavorId('')
      setTrayCount(3)
      setWeightLbs('')
      setNotes('')
      loadRecent()
    } else {
      alert('Error logging batch: ' + error.message)
    }
    setSubmitting(false)
  }

  async function handleWasteSubmit(e) {
    e.preventDefault()
    if (!wasteIngredientId && !wasteFlavorId) {
      alert('Select an ingredient or flavor to log waste.')
      return
    }
    if (!wasteQuantity) return
    setWasteSubmitting(true)

    const isIngredient = !!wasteIngredientId
    const refId = isIngredient ? wasteIngredientId : wasteFlavorId
    const refName = isIngredient
      ? ingredients.find((i) => i.id === wasteIngredientId)?.name || wasteIngredientId
      : flavors.find((f) => f.id === wasteFlavorId)?.name || wasteFlavorId

    const { error } = await supabase.from('waste_log').insert({
      type: isIngredient ? 'ingredient' : 'flavor',
      reference_id: refId,
      reference_name: refName,
      quantity: parseFloat(wasteQuantity),
      unit: wasteUnit || null,
      notes: wasteNotes || null,
    })

    if (!error) {
      setWasteIngredientId('')
      setWasteFlavorId('')
      setWasteQuantity('')
      setWasteUnit('')
      setWasteNotes('')
      setWasteOpen(false)
    } else {
      alert('Error logging waste: ' + error.message + '\n\nMake sure the waste_log table exists in Supabase (see SQL comment at top of BatchLog.jsx).')
    }
    setWasteSubmitting(false)
  }

  if (flavorsLoading) return <p className="text-store-brown-light text-center py-12">Loading...</p>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          Log a Batch
        </h2>
        <p className="text-sm text-store-brown-light mt-1">Log how many trays were made this batch</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-store-tan p-4 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-store-brown mb-1">Flavor</label>
          <select
            value={flavorId}
            onChange={(e) => setFlavorId(e.target.value)}
            required
            className="w-full border border-store-tan rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
          >
            <option value="">Select a flavor...</option>
            {flavors.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-store-brown mb-1">Number of trays</label>
          <input
            type="number"
            min="1"
            value={trayCount}
            onChange={(e) => setTrayCount(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full border border-store-tan rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-store-brown mb-1">
            Estimated weight <span className="text-store-brown-light font-normal">(optional)</span>
          </label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={weightLbs}
            onChange={(e) => setWeightLbs(e.target.value)}
            placeholder="e.g. 6.5"
            className="w-full border border-store-tan rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-store-brown mb-1">
            Notes <span className="text-store-brown-light font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. new recipe, extra sugar"
            className="w-full border border-store-tan rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-store-green hover:bg-store-green-dark text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
        >
          {submitting ? 'Logging...' : '+ Log Batch'}
        </button>
      </form>

      {/* Waste Log Section */}
      <div className="bg-white rounded-xl border border-store-tan shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setWasteOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-store-cream transition-colors"
        >
          <span className="font-semibold text-store-brown text-sm">Log Waste</span>
          <span className="text-store-brown-light text-sm">{wasteOpen ? '▲' : '▼'}</span>
        </button>

        {wasteOpen && (
          <form onSubmit={handleWasteSubmit} className="px-4 pb-4 space-y-4 border-t border-store-tan pt-4">
            <div>
              <label className="block text-sm font-medium text-store-brown mb-1">
                Ingredient <span className="text-store-brown-light font-normal">(pick one)</span>
              </label>
              <select
                value={wasteIngredientId}
                onChange={(e) => { setWasteIngredientId(e.target.value); if (e.target.value) setWasteFlavorId('') }}
                className="w-full border border-store-tan rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
              >
                <option value="">None</option>
                {ingredients.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-store-brown mb-1">
                Flavor <span className="text-store-brown-light font-normal">(pick one)</span>
              </label>
              <select
                value={wasteFlavorId}
                onChange={(e) => { setWasteFlavorId(e.target.value); if (e.target.value) setWasteIngredientId('') }}
                className="w-full border border-store-tan rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
              >
                <option value="">None</option>
                {flavors.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-store-brown mb-1">Quantity</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  required
                  value={wasteQuantity}
                  onChange={(e) => setWasteQuantity(e.target.value)}
                  placeholder="e.g. 2"
                  className="w-full border border-store-tan rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-store-brown mb-1">
                  Unit <span className="text-store-brown-light font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={wasteUnit}
                  onChange={(e) => setWasteUnit(e.target.value)}
                  placeholder="lbs, cups..."
                  className="w-full border border-store-tan rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-store-brown mb-1">
                Notes <span className="text-store-brown-light font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={wasteNotes}
                onChange={(e) => setWasteNotes(e.target.value)}
                placeholder="e.g. dropped tray, burned batch"
                className="w-full border border-store-tan rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
              />
            </div>

            <button
              type="submit"
              disabled={wasteSubmitting}
              className="w-full bg-store-brown hover:opacity-80 text-white font-semibold py-3 rounded-xl transition-opacity disabled:opacity-50"
            >
              {wasteSubmitting ? 'Logging...' : 'Log Waste'}
            </button>
          </form>
        )}
      </div>

      <div>
        <h3 className="font-semibold text-store-brown mb-3">Recent Batches</h3>
        {recentBatches.length === 0 ? (
          <p className="text-store-brown-light text-sm text-center py-4">No batches logged yet</p>
        ) : (
          <div className="space-y-2">
            {recentBatches.map((b) => (
              <div key={b.id} className="bg-white rounded-xl border border-store-tan p-3 shadow-sm">
                <div className="flex justify-between items-start">
                  <span className="font-medium text-store-brown text-sm">{b.flavors?.name}</span>
                  <span className="text-sm font-semibold text-store-green">
                    {b.tray_count ?? 1} tray{(b.tray_count ?? 1) !== 1 ? 's' : ''}
                    {b.weight_lbs ? ` · ~${b.weight_lbs} lbs` : ''}
                  </span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-store-brown-light">
                    {new Date(b.batch_date).toLocaleDateString('en-US', {
                      timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
                    })}
                  </span>
                  {b.notes && <span className="text-xs text-store-brown-light italic">{b.notes}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
