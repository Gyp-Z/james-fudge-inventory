import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useFlavors } from '../hooks/useFlavors'
import TrayCounter from '../components/TrayCounter'

export default function ShiftReport() {
  const { flavors, loading } = useFlavors()
  const navigate = useNavigate()
  const [items, setItems] = useState({})
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  function getItem(flavorId) {
    return items[flavorId] || { tray_count: 0, sold_out: false, needs_to_be_made: false }
  }

  function updateItem(flavorId, field, value) {
    setItems((prev) => ({ ...prev, [flavorId]: { ...getItem(flavorId), [field]: value } }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)

    const today = new Date().toISOString().split('T')[0]
    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData?.session?.user

    const { data: report, error } = await supabase
      .from('shift_reports')
      .insert({ shift_date: today, notes, logged_by: user?.email ?? 'staff' })
      .select()
      .single()

    if (error) {
      alert('Error saving shift report. Please try again.')
      setSubmitting(false)
      return
    }

    const reportItems = flavors.map((f) => {
      const item = getItem(f.id)
      return {
        shift_report_id: report.id,
        flavor_id: f.id,
        tray_count: item.tray_count,
        sold_out: item.sold_out,
        needs_to_be_made: item.needs_to_be_made,
      }
    })

    await supabase.from('shift_report_items').insert(reportItems)

    // Upsert into current_inventory to set today's baseline
    const inventoryUpserts = flavors.map((f) => ({
      flavor_id: f.id,
      tray_count: getItem(f.id).tray_count,
      updated_at: new Date().toISOString(),
    }))
    await supabase.from('current_inventory').upsert(inventoryUpserts, { onConflict: 'flavor_id' })

    setSuccess(true)
    setTimeout(() => navigate('/dashboard'), 1500)
  }

  if (loading) return <p className="text-store-brown-light text-center py-12">Loading flavors...</p>

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          Shift Report Saved!
        </h2>
        <p className="text-store-brown-light mt-1">Redirecting to dashboard...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          Start of Shift Report
        </h2>
        <p className="text-sm text-store-brown-light mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {flavors.map((flavor) => {
          const item = getItem(flavor.id)
          return (
            <div key={flavor.id} className="bg-white rounded-xl border border-store-tan p-4 shadow-sm space-y-4">
              <h3 className="font-semibold text-store-brown">{flavor.name}</h3>
              <div>
                <label className="text-xs font-medium text-store-brown-light mb-2 block">
                  Trays at start of shift
                </label>
                <TrayCounter
                  count={item.tray_count}
                  onChange={(n) => updateItem(flavor.id, 'tray_count', n)}
                />
              </div>
              <div className="flex gap-5">
                <label className="flex items-center gap-2 text-sm text-store-brown cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.sold_out}
                    onChange={(e) => updateItem(flavor.id, 'sold_out', e.target.checked)}
                    className="w-4 h-4 accent-red-500"
                  />
                  Sold out yesterday
                </label>
                <label className="flex items-center gap-2 text-sm text-store-brown cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.needs_to_be_made}
                    onChange={(e) => updateItem(flavor.id, 'needs_to_be_made', e.target.checked)}
                    className="w-4 h-4 accent-store-green"
                  />
                  Needs to be made
                </label>
              </div>
            </div>
          )
        })}

        <div>
          <label className="block text-sm font-medium text-store-brown mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything unusual? Special orders? Weather?"
            className="w-full border border-store-tan rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-store-green hover:bg-store-green-dark text-white font-semibold py-4 rounded-xl text-base transition-colors disabled:opacity-50"
        >
          {submitting ? 'Saving...' : 'Submit Shift Report'}
        </button>
      </form>
    </div>
  )
}
