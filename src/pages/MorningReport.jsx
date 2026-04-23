import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Stepper from '../components/Stepper'

export default function MorningReport() {
  const { session } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [flavors, setFlavors] = useState([])
  const [entries, setEntries] = useState({}) // flavor_id -> { full_trays, in_progress_trays }
  const [existingReport, setExistingReport] = useState(null) // null=none, object=found
  const [existingEntries, setExistingEntries] = useState({})

  useEffect(() => {
    async function load() {
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

      // Check if morning report already submitted today
      const { data: existing } = await supabase
        .from('shift_reports')
        .select('id, created_at')
        .eq('report_date', todayStr)
        .eq('report_type', 'morning')
        .order('created_at', { ascending: false })
        .limit(1)

      if (existing && existing.length > 0) {
        const { data: exEntries } = await supabase
          .from('shift_report_entries')
          .select('flavor_id, full_trays, in_progress_trays')
          .eq('report_id', existing[0].id)
        const map = {}
        ;(exEntries || []).forEach((e) => { map[e.flavor_id] = e })

        const { data: flavorsData } = await supabase
          .from('flavors')
          .select('id, name')
          .eq('active', true)
          .order('name')

        setFlavors(flavorsData || [])
        setExistingReport(existing[0])
        setExistingEntries(map)
        setLoading(false)
        return
      }

      // Get last closing report for pre-fill
      const { data: lastClosingReport } = await supabase
        .from('shift_reports')
        .select('id')
        .eq('report_type', 'closing')
        .order('created_at', { ascending: false })
        .limit(1)

      let closingEntries = {}
      if (lastClosingReport && lastClosingReport.length > 0) {
        const { data: ces } = await supabase
          .from('shift_report_entries')
          .select('flavor_id, full_trays, in_progress_trays')
          .eq('report_id', lastClosingReport[0].id)
        ;(ces || []).forEach((e) => { closingEntries[e.flavor_id] = e })
      }

      const { data: flavorsData } = await supabase
        .from('flavors')
        .select('id, name, low_tray_threshold')
        .eq('is_active', true)
        .order('name')

      const initial = {}
      ;(flavorsData || []).forEach((f) => {
        initial[f.id] = {
          full_trays: closingEntries[f.id]?.full_trays ?? 0,
          in_progress_trays: closingEntries[f.id]?.in_progress_trays ?? 0,
        }
      })

      setFlavors(flavorsData || [])
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
        report_type: 'morning',
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
      trays_made: 0,
      trays_wasted: 0,
      waste_reason: null,
    }))
    await supabase.from('shift_report_entries').insert(entryRows)

    const inventoryRows = flavors.map((f) => ({
      flavor_id: f.id,
      tray_count: entries[f.id]?.full_trays ?? 0,
      updated_at: new Date().toISOString(),
    }))
    await supabase.from('current_inventory').upsert(inventoryRows, { onConflict: 'flavor_id' })

    navigate('/dashboard')
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

  // Already submitted — read-only view
  if (existingReport) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
            Morning Report
          </h2>
          <p className="text-store-brown-light text-sm mt-1">{todayLabel}</p>
        </div>

        <div className="bg-store-green-light border border-store-green rounded-xl px-4 py-3">
          <p className="text-store-green font-semibold text-sm">Morning report already submitted for today ✓</p>
        </div>

        <div className="space-y-2">
          {flavors.map((f) => {
            const e = existingEntries[f.id]
            return (
              <div key={f.id} className="bg-white rounded-xl border border-store-tan p-4 shadow-sm">
                <p className="font-semibold text-store-brown mb-2">{f.name}</p>
                <div className="flex gap-6 text-sm text-store-brown-light">
                  <span><span className="font-bold text-store-brown text-xl">{e?.full_trays ?? 0}</span> full</span>
                  <span><span className="font-bold text-store-brown text-xl">{e?.in_progress_trays ?? 0}</span> in progress</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Submit form
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          Morning Report
        </h2>
        <p className="text-store-brown-light text-sm mt-1">{todayLabel}</p>
      </div>

      <div className="space-y-3">
        {flavors.map((f) => {
          const e = entries[f.id] || { full_trays: 0, in_progress_trays: 0 }
          return (
            <div key={f.id} className="bg-white rounded-xl border border-store-tan p-4 shadow-sm space-y-4">
              <p className="font-semibold text-store-brown text-lg">{f.name}</p>

              <div className="flex items-center justify-between">
                <span className="text-sm text-store-brown-light">Full trays on shelf</span>
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
            </div>
          )
        })}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full bg-store-green hover:bg-store-green-dark text-white py-4 rounded-xl text-lg font-semibold transition-colors disabled:opacity-50 touch-manipulation"
      >
        {submitting ? 'Submitting…' : 'Submit Morning Report'}
      </button>
    </div>
  )
}
