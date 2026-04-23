import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Stepper from '../components/Stepper'

export default function ClosingReport() {
  const { session } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const [flavors, setFlavors] = useState([])
  const [entries, setEntries] = useState({}) // flavor_id -> { full_trays, in_progress_trays, trays_made, trays_wasted, waste_reason }
  const [existingReport, setExistingReport] = useState(null)
  const [existingEntries, setExistingEntries] = useState({})
  const [morningEntries, setMorningEntries] = useState({}) // for trays_sold calculation
  const [summaryData, setSummaryData] = useState(null)

  useEffect(() => {
    async function load() {
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

      // Check if closing already submitted today
      const { data: existing } = await supabase
        .from('shift_reports')
        .select('id, created_at')
        .eq('report_date', todayStr)
        .eq('report_type', 'closing')
        .order('created_at', { ascending: false })
        .limit(1)

      // Load active flavors
      const { data: flavorsData } = await supabase
        .from('flavors')
        .select('id, name')
        .eq('is_active', true)
        .order('name')

      setFlavors(flavorsData || [])

      if (existing && existing.length > 0) {
        const { data: exEntries } = await supabase
          .from('shift_report_entries')
          .select('flavor_id, full_trays, in_progress_trays, trays_made, trays_wasted, waste_reason')
          .eq('report_id', existing[0].id)
        const map = {}
        ;(exEntries || []).forEach((e) => { map[e.flavor_id] = e })
        setExistingReport(existing[0])
        setExistingEntries(map)
        setLoading(false)
        return
      }

      // Get today's morning report for pre-fill
      const { data: morningReport } = await supabase
        .from('shift_reports')
        .select('id')
        .eq('report_date', todayStr)
        .eq('report_type', 'morning')
        .order('created_at', { ascending: false })
        .limit(1)

      let morningMap = {}
      if (morningReport && morningReport.length > 0) {
        const { data: mEntries } = await supabase
          .from('shift_report_entries')
          .select('flavor_id, full_trays, in_progress_trays')
          .eq('report_id', morningReport[0].id)
        ;(mEntries || []).forEach((e) => { morningMap[e.flavor_id] = e })
      }

      setMorningEntries(morningMap)

      const initial = {}
      ;(flavorsData || []).forEach((f) => {
        initial[f.id] = {
          full_trays: morningMap[f.id]?.full_trays ?? 0,
          in_progress_trays: morningMap[f.id]?.in_progress_trays ?? 0,
          trays_made: 0,
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
        report_type: 'closing',
        logged_by: session?.user?.id ?? null,
      })
      .select('id')
      .single()

    if (error || !report) {
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

    // Upsert current_inventory with closing tray counts
    const inventoryRows = flavors.map((f) => ({
      flavor_id: f.id,
      tray_count: entries[f.id]?.full_trays ?? 0,
      updated_at: new Date().toISOString(),
    }))
    await supabase.from('current_inventory').upsert(inventoryRows, { onConflict: 'flavor_id' })

    // Build summary: trays_sold = (morning full_trays + trays_made) - (closing full_trays + trays_wasted)
    const summary = flavors.map((f) => {
      const e = entries[f.id] || {}
      const morningFull = morningEntries[f.id]?.full_trays ?? 0
      const traysSold = (morningFull + (e.trays_made ?? 0)) - ((e.full_trays ?? 0) + (e.trays_wasted ?? 0))
      return { id: f.id, name: f.name, traysSold: Math.max(0, traysSold) }
    })

    setSummaryData(summary)
    setSubmitted(true)
    setSubmitting(false)

    // Auto-redirect after 3 seconds
    setTimeout(() => navigate('/dashboard'), 3000)
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

  // Post-submit confirmation summary
  if (submitted && summaryData) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
            Closing Report
          </h2>
          <p className="text-store-brown-light text-sm mt-1">{todayLabel}</p>
        </div>

        <div className="bg-store-green-light border border-store-green rounded-xl px-4 py-3">
          <p className="text-store-green font-semibold text-sm">Closing report submitted ✓</p>
        </div>

        <div className="space-y-2">
          {summaryData.map((s) => (
            <div
              key={s.id}
              className="bg-white rounded-xl border border-store-tan p-4 shadow-sm flex items-center justify-between"
            >
              <span className="font-semibold text-store-brown">{s.name}</span>
              <span className="text-store-brown-light text-sm">
                <span className="font-bold text-store-brown text-xl">{s.traysSold}</span> sold today
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={() => navigate('/dashboard')}
          className="w-full bg-store-green hover:bg-store-green-dark text-white py-4 rounded-xl text-lg font-semibold transition-colors touch-manipulation"
        >
          Done
        </button>
      </div>
    )
  }

  // Already submitted today — read-only
  if (existingReport) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
            Closing Report
          </h2>
          <p className="text-store-brown-light text-sm mt-1">{todayLabel}</p>
        </div>

        <div className="bg-store-green-light border border-store-green rounded-xl px-4 py-3">
          <p className="text-store-green font-semibold text-sm">Closing report submitted ✓</p>
        </div>

        <div className="space-y-2">
          {flavors.map((f) => {
            const e = existingEntries[f.id]
            return (
              <div key={f.id} className="bg-white rounded-xl border border-store-tan p-4 shadow-sm">
                <p className="font-semibold text-store-brown mb-2">{f.name}</p>
                <div className="flex flex-wrap gap-4 text-sm text-store-brown-light">
                  <span><span className="font-bold text-store-brown text-xl">{e?.full_trays ?? 0}</span> full</span>
                  <span><span className="font-bold text-store-brown text-xl">{e?.in_progress_trays ?? 0}</span> in progress</span>
                  <span><span className="font-bold text-store-brown text-xl">{e?.trays_made ?? 0}</span> made</span>
                  <span><span className="font-bold text-store-brown text-xl">{e?.trays_wasted ?? 0}</span> wasted</span>
                </div>
                {e?.waste_reason && (
                  <p className="text-xs text-store-brown-light mt-2">Waste reason: {e.waste_reason}</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Entry form
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          Closing Report
        </h2>
        <p className="text-store-brown-light text-sm mt-1">{todayLabel}</p>
      </div>

      <div className="space-y-3">
        {flavors.map((f) => {
          const e = entries[f.id] || { full_trays: 0, in_progress_trays: 0, trays_made: 0, trays_wasted: 0, waste_reason: '' }
          return (
            <div key={f.id} className="bg-white rounded-xl border border-store-tan p-4 shadow-sm space-y-4">
              <p className="font-semibold text-store-brown text-lg">{f.name}</p>

              <div className="flex items-center justify-between">
                <span className="text-sm text-store-brown-light">Full trays now</span>
                <Stepper value={e.full_trays} onChange={(v) => setField(f.id, 'full_trays', v)} />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-store-brown-light">In-progress trays</span>
                <Stepper value={e.in_progress_trays} onChange={(v) => setField(f.id, 'in_progress_trays', v)} />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-store-brown-light">Trays made today</span>
                <Stepper value={e.trays_made} onChange={(v) => setField(f.id, 'trays_made', v)} />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-store-brown-light">Trays wasted</span>
                <Stepper value={e.trays_wasted} onChange={(v) => setField(f.id, 'trays_wasted', v)} />
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
        {submitting ? 'Submitting…' : 'Submit Closing Report'}
      </button>
    </div>
  )
}
