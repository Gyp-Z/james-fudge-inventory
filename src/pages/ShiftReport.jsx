import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Stepper from '../components/Stepper'

export default function ShiftReport() {
  const { session } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const [flavors, setFlavors] = useState([])
  const [entries, setEntries] = useState({}) // flavor_id -> { full_trays, in_progress_trays, trays_made, trays_wasted, waste_reason }

  useEffect(() => {
    async function load() {
      // Get active flavors
      const { data: flavorsData } = await supabase
        .from('flavors')
        .select('id, name, low_tray_threshold')
        .eq('is_active', true)
        .order('name')

      const activeFlavors = flavorsData || []
      setFlavors(activeFlavors)

      // Pre-fill from most recent report (any type)
      const { data: latestReport } = await supabase
        .from('shift_reports')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1)

      let prefill = {}
      if (latestReport && latestReport.length > 0) {
        const { data: prevEntries } = await supabase
          .from('shift_report_entries')
          .select('flavor_id, full_trays, in_progress_trays')
          .eq('report_id', latestReport[0].id)
          ; (prevEntries || []).forEach((e) => { prefill[e.flavor_id] = e })
      }

      const initial = {}
      activeFlavors.forEach((f) => {
        initial[f.id] = {
          full_trays: prefill[f.id]?.full_trays ?? 0,
          in_progress_trays: prefill[f.id]?.in_progress_trays ?? 0,
          trays_wasted: 0,
          waste_reason: '',
        }
      })

      setEntries(initial)
      setLoading(false)
    }

    load()
  }, [])

  function setField(flavorId, field, value) {
    setEntries((prev) => ({
      ...prev,
      [flavorId]: { ...prev[flavorId], [field]: value },
    }))
  }

  async function handleSubmit() {
    setSubmitting(true)
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

    const { data: report, error } = await supabase
      .from('shift_reports')
      .insert({
        report_date: todayStr,
        report_type: 'snapshot',
        logged_by: session?.user?.id ?? null,
      })
      .select('id')
      .single()

    if (error || !report) {
      console.error('Failed to create report:', error)
      setSubmitting(false)
      return
    }

    const entryRows = flavors.map((f) => ({
      report_id: report.id,
      flavor_id: f.id,
      full_trays: entries[f.id]?.full_trays ?? 0,
      in_progress_trays: entries[f.id]?.in_progress_trays ?? 0,
      trays_made: entries[f.id]?.trays_made ?? 0,
      trays_wasted: entries[f.id]?.trays_wasted ?? 0,
      waste_reason: entries[f.id]?.waste_reason?.trim() || null,
    }))
    await supabase.from('shift_report_entries').insert(entryRows)

    // Upsert current_inventory to match submitted counts
    const inventoryRows = flavors.map((f) => ({
      flavor_id: f.id,
      tray_count: entries[f.id]?.full_trays ?? 0,
      updated_at: new Date().toISOString(),
    }))
    await supabase.from('current_inventory').upsert(inventoryRows, { onConflict: 'flavor_id' })

    setSubmitted(true)
    setSubmitting(false)
    setTimeout(() => navigate('/'), 1500)
  }

  if (loading) {
    return <p className="text-store-brown-light text-center py-12">Loading...</p>
  }

  const todayLabel = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  if (submitted) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
            Report
          </h2>
          <p className="text-store-brown-light text-sm mt-1">{todayLabel}</p>
        </div>
        <div className="bg-store-green-light border border-store-green rounded-xl px-4 py-4 text-center">
          <p className="text-store-green font-semibold text-lg">Report submitted ✓</p>
          <p className="text-store-green text-sm mt-1">Redirecting to dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          Report
        </h2>
        <p className="text-store-brown-light text-sm mt-1">{todayLabel}</p>
        <p className="text-store-brown-light text-xs mt-1">What's on the shelf right now?</p>
      </div>

      <div className="space-y-3">
        {flavors.map((f) => {
          const e = entries[f.id] || { full_trays: 0, in_progress_trays: 0, trays_made: 0, trays_wasted: 0, waste_reason: '' }
          return (
            <div key={f.id} className="bg-white rounded-xl border border-store-tan p-4 shadow-sm space-y-4">
              <p className="font-semibold text-store-brown text-lg">{f.name}</p>

              <div className="flex items-center justify-between">
                <span className="text-sm text-store-brown-light">Full trays</span>
                <Stepper
                  value={e.full_trays}
                  onChange={(v) => setField(f.id, 'full_trays', v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-store-brown-light">In-progress trays</span>
                <Stepper
                  value={e.in_progress_trays}
                  onChange={(v) => setField(f.id, 'in_progress_trays', v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-store-brown-light">Trays wasted</span>
                <Stepper
                  value={e.trays_wasted}
                  onChange={(v) => setField(f.id, 'trays_wasted', v)}
                />
              </div>

              {e.trays_wasted > 0 && (
                <input
                  type="text"
                  value={e.waste_reason}
                  onChange={(ev) => setField(f.id, 'waste_reason', ev.target.value)}
                  placeholder="Waste reason"
                  className="w-full border border-store-tan rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
                />
              )}
            </div>
          )
        })}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full bg-store-green hover:bg-store-green-dark text-white py-4 rounded-xl text-lg font-semibold transition-colors disabled:opacity-50 touch-manipulation"
      >
        {submitting ? 'Submitting…' : 'Submit Report'}
      </button>
    </div>
  )
}
