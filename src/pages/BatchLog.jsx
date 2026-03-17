import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useFlavors } from '../hooks/useFlavors'

export default function BatchLog() {
  const { flavors, loading: flavorsLoading } = useFlavors()
  const [flavorId, setFlavorId] = useState('')
  const [weightLbs, setWeightLbs] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recentBatches, setRecentBatches] = useState([])

  async function loadRecent() {
    const { data } = await supabase
      .from('batch_logs')
      .select('*, flavors(name)')
      .order('created_at', { ascending: false })
      .limit(20)
    setRecentBatches(data || [])
  }

  useEffect(() => { loadRecent() }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!flavorId || !weightLbs) return
    setSubmitting(true)

    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData?.session?.user

    const { error } = await supabase.from('batch_logs').insert({
      flavor_id: flavorId,
      weight_lbs: parseFloat(weightLbs),
      batch_date: new Date().toISOString(),
      notes,
      logged_by: user?.email,
    })

    if (!error) {
      setFlavorId('')
      setWeightLbs('')
      setNotes('')
      loadRecent()
    } else {
      alert('Error logging batch.')
    }
    setSubmitting(false)
  }

  if (flavorsLoading) return <p className="text-gray-400 text-center py-12">Loading...</p>

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Log a Batch</h2>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Flavor</label>
          <select
            value={flavorId}
            onChange={(e) => setFlavorId(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
          >
            <option value="">Select a flavor...</option>
            {flavors.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Weight (lbs)</label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={weightLbs}
            onChange={(e) => setWeightLbs(e.target.value)}
            required
            placeholder="e.g. 3.5"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. double batch, new recipe"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-amber-700 hover:bg-amber-800 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
        >
          {submitting ? 'Logging...' : 'Log Batch'}
        </button>
      </form>

      <div>
        <h3 className="font-semibold text-gray-700 mb-3">Recent Batches</h3>
        {recentBatches.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">No batches logged yet</p>
        ) : (
          <div className="space-y-2">
            {recentBatches.map((b) => (
              <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
                <div className="flex justify-between items-start">
                  <span className="font-medium text-gray-800 text-sm">{b.flavors?.name}</span>
                  <span className="text-sm font-semibold text-amber-700">{b.weight_lbs} lbs</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-gray-400">
                    {new Date(b.batch_date).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                    })}
                  </span>
                  {b.notes && <span className="text-xs text-gray-500 italic">{b.notes}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
