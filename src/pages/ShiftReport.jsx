import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useFlavors } from '../hooks/useFlavors'

const STOCK_LEVELS = ['full', 'medium', 'low']

export default function ShiftReport() {
  const { flavors, loading } = useFlavors()
  const navigate = useNavigate()
  const [items, setItems] = useState({})
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  function updateItem(flavorId, field, value) {
    setItems((prev) => ({
      ...prev,
      [flavorId]: { ...prev[flavorId], [field]: value },
    }))
  }

  function getItem(flavorId) {
    return items[flavorId] || { stock_level: 'full', sold_out: false, needs_to_be_made: false }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)

    const today = new Date().toISOString().split('T')[0]
    const { data: session } = await supabase.auth.getSession()
    const user = session?.session?.user

    const { data: report, error } = await supabase
      .from('shift_reports')
      .insert({ shift_date: today, notes, logged_by: user?.email })
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
        stock_level: item.stock_level,
        sold_out: item.sold_out || false,
        needs_to_be_made: item.needs_to_be_made || false,
      }
    })

    await supabase.from('shift_report_items').insert(reportItems)

    setSuccess(true)
    setTimeout(() => navigate('/dashboard'), 1500)
  }

  if (loading) return <p className="text-gray-400 text-center py-12">Loading flavors...</p>

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-gray-800">Shift Report Saved!</h2>
        <p className="text-gray-500 mt-1">Redirecting to dashboard...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Start of Shift Report</h2>
      <p className="text-sm text-gray-500 -mt-4">
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {flavors.map((flavor) => {
          const item = getItem(flavor.id)
          return (
            <div key={flavor.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3">
              <h3 className="font-semibold text-gray-800">{flavor.name}</h3>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Stock Level</label>
                <div className="flex gap-2">
                  {STOCK_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => updateItem(flavor.id, 'stock_level', level)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                        item.stock_level === level
                          ? level === 'full'
                            ? 'bg-green-500 text-white'
                            : level === 'medium'
                            ? 'bg-yellow-400 text-white'
                            : 'bg-red-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.sold_out || false}
                    onChange={(e) => updateItem(flavor.id, 'sold_out', e.target.checked)}
                    className="w-4 h-4 accent-red-500"
                  />
                  Sold out yesterday
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.needs_to_be_made || false}
                    onChange={(e) => updateItem(flavor.id, 'needs_to_be_made', e.target.checked)}
                    className="w-4 h-4 accent-amber-600"
                  />
                  Needs to be made
                </label>
              </div>
            </div>
          )
        })}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything unusual? Special orders? Weather affecting traffic?"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-amber-700 hover:bg-amber-800 text-white font-semibold py-4 rounded-xl text-base transition-colors disabled:opacity-50"
        >
          {submitting ? 'Saving...' : 'Submit Shift Report'}
        </button>
      </form>
    </div>
  )
}
