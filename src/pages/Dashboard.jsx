import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useFlavors } from '../hooks/useFlavors'

export default function Dashboard() {
  const { flavors, loading: flavorsLoading } = useFlavors()
  const [entries, setEntries] = useState({}) // flavor_id -> { full_trays, in_progress_trays }
  const [reportFound, setReportFound] = useState(null) // null=loading, true=found, false=none

  useEffect(() => {
    async function load() {
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      const yesterdayDate = new Date()
      yesterdayDate.setDate(yesterdayDate.getDate() - 1)
      const yesterdayStr = yesterdayDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

      // Try today's reports first (any type, latest)
      let reportId = null
      const { data: todayReports } = await supabase
        .from('shift_reports')
        .select('id')
        .eq('report_date', todayStr)
        .order('created_at', { ascending: false })
        .limit(1)

      if (todayReports && todayReports.length > 0) {
        reportId = todayReports[0].id
      } else {
        // Fall back to yesterday's closing
        const { data: yestReports } = await supabase
          .from('shift_reports')
          .select('id')
          .eq('report_date', yesterdayStr)
          .eq('report_type', 'closing')
          .order('created_at', { ascending: false })
          .limit(1)
        if (yestReports && yestReports.length > 0) {
          reportId = yestReports[0].id
        }
      }

      if (!reportId) {
        setReportFound(false)
        return
      }

      const { data: reportEntries } = await supabase
        .from('shift_report_entries')
        .select('flavor_id, full_trays, in_progress_trays')
        .eq('report_id', reportId)

      const map = {}
      ;(reportEntries || []).forEach((e) => { map[e.flavor_id] = e })
      setEntries(map)
      setReportFound(true)
    }

    load()
  }, [])

  const loading = flavorsLoading || reportFound === null

  if (loading) {
    return <p className="text-store-brown-light text-center py-12">Loading...</p>
  }

  if (!reportFound) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          Fudge Status
        </h2>
        <div className="bg-store-tan rounded-xl p-8 text-center space-y-2">
          <p className="text-store-brown text-lg font-semibold">No reports yet</p>
          <p className="text-store-brown-light text-sm">
            Submit your first morning report to get started!
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
        Fudge Status
      </h2>
      <div className="space-y-3">
        {flavors.map((flavor) => {
          const entry = entries[flavor.id]
          const fullTrays = entry?.full_trays ?? 0
          const inProgress = entry?.in_progress_trays ?? 0
          const threshold = flavor.low_tray_threshold ?? 2

          let cardBg = 'bg-store-green-light border-store-green'
          let countColor = 'text-store-green'
          if (fullTrays === 0) {
            cardBg = 'bg-red-50 border-red-300'
            countColor = 'text-red-600'
          } else if (fullTrays < threshold) {
            cardBg = 'bg-amber-50 border-amber-300'
            countColor = 'text-amber-700'
          }

          return (
            <div key={flavor.id} className={`rounded-xl border-2 p-4 ${cardBg}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-store-brown text-lg">{flavor.name}</span>
                <div className="text-right">
                  <p className={`text-4xl font-bold tabular-nums leading-none ${countColor}`}>
                    {fullTrays}
                  </p>
                  <p className="text-xs text-store-brown-light mt-1">
                    full tray{fullTrays !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <p className="text-sm text-store-brown-light mt-2">
                <span className="font-medium text-store-brown">{inProgress}</span> in progress
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
