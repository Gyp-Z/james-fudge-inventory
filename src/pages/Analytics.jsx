import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts'
import { supabase } from '../lib/supabase'

const FLAVOR_COLORS = [
  '#7C4B2A', '#2D5A1B', '#C4843A', '#5B3A7E', '#2E86AB',
  '#E84855', '#3BB273', '#F6AE2D', '#8B5E3C', '#4A7B35',
]

const RANGE_OPTIONS = [
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
  { label: 'All Time', days: null },
]

function getDateStr(date) {
  return date.toLocaleDateString('en-CA')
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Analytics() {
  const [reports, setReports] = useState([])
  const [flavors, setFlavors] = useState([])
  const [range, setRange] = useState(7)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: reportData }, { data: flavorData }] = await Promise.all([
        supabase
          .from('shift_reports')
          .select(`
            id,
            report_date,
            report_type,
            shift_report_entries(
              flavor_id,
              full_trays,
              in_progress_trays,
              trays_made,
              trays_wasted,
              waste_reason,
              flavors(name)
            )
          `)
          .order('report_date'),
        supabase
          .from('flavors')
          .select('id, name')
          .eq('is_active', true)
          .order('name'),
      ])

      setReports(reportData || [])
      setFlavors(flavorData || [])
      setLoading(false)
    }
    load()
  }, [])

  const filteredReports = useMemo(() => {
    if (!range) return reports
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - range)
    const cutoffStr = getDateStr(cutoff)
    return reports.filter((r) => r.report_date >= cutoffStr)
  }, [reports, range])

  const uniqueDates = useMemo(() => {
    const dates = new Set(filteredReports.map((r) => r.report_date))
    return [...dates].sort()
  }, [filteredReports])

  const isClosingLike = (r) => r.report_type === 'closing' || r.report_type === 'snapshot'

  // Chart A — Daily Production: stacked bars, trays_made from closing/snapshot per day
  const chartAData = useMemo(() => {
    const closingByDate = {}
    filteredReports
      .filter(isClosingLike)
      .forEach((r) => { closingByDate[r.report_date] = r })

    return uniqueDates
      .map((date) => {
        const report = closingByDate[date]
        const row = { date: formatDate(date) }
        flavors.forEach((f) => {
          const entry = report?.shift_report_entries?.find((e) => e.flavor_id === f.id)
          row[f.name] = entry?.trays_made ?? 0
        })
        return row
      })
      .filter((row) => flavors.some((f) => row[f.name] > 0))
  }, [filteredReports, uniqueDates, flavors])

  // Chart B — Sales: trays_sold between consecutive reports
  // Formula: (prev full_trays + curr trays_made) - (curr full_trays + curr trays_wasted)
  const chartBData = useMemo(() => {
    const sorted = filteredReports.slice().sort((a, b) => a.report_date.localeCompare(b.report_date))
    const result = []
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const curr = sorted[i]
      const row = { date: formatDate(curr.report_date) }
      let hasData = false
      flavors.forEach((f) => {
        const pe = prev.shift_report_entries?.find((e) => e.flavor_id === f.id)
        const ce = curr.shift_report_entries?.find((e) => e.flavor_id === f.id)
        const prevFull = pe?.full_trays ?? 0
        const traysMade = ce?.trays_made ?? 0
        const currFull = ce?.full_trays ?? 0
        const traysWasted = ce?.trays_wasted ?? 0
        const sold = Math.max(0, prevFull + traysMade - currFull - traysWasted)
        row[f.name] = sold
        if (sold > 0) hasData = true
      })
      if (hasData) result.push(row)
    }
    return result
  }, [filteredReports, flavors])

  // Chart C — Waste: total per flavor + detail table
  const { chartCData, wasteTable } = useMemo(() => {
    const totals = {}
    const table = []
    flavors.forEach((f) => { totals[f.name] = 0 })

    filteredReports
      .filter(isClosingLike)
      .forEach((r) => {
        r.shift_report_entries?.forEach((e) => {
          if ((e.trays_wasted ?? 0) > 0) {
            const name = e.flavors?.name || e.flavor_id
            totals[name] = (totals[name] ?? 0) + e.trays_wasted
            table.push({
              date: formatDate(r.report_date),
              flavor: name,
              amount: e.trays_wasted,
              reason: e.waste_reason || '—',
            })
          }
        })
      })

    const chartData = Object.entries(totals)
      .filter(([, v]) => v > 0)
      .map(([name, trays]) => ({ name, trays }))
      .sort((a, b) => b.trays - a.trays)

    return { chartCData: chartData, wasteTable: table }
  }, [filteredReports, flavors])

  // Chart D — Stock Trend: full_trays at close/snapshot per day per flavor
  const chartDData = useMemo(() => {
    const closingByDate = {}
    filteredReports
      .filter(isClosingLike)
      .forEach((r) => { closingByDate[r.report_date] = r })

    return uniqueDates
      .filter((date) => closingByDate[date])
      .map((date) => {
        const report = closingByDate[date]
        const row = { date: formatDate(date) }
        flavors.forEach((f) => {
          const entry = report?.shift_report_entries?.find((e) => e.flavor_id === f.id)
          row[f.name] = entry?.full_trays ?? null
        })
        return row
      })
  }, [filteredReports, uniqueDates, flavors])

  const closingDays = new Set(
    reports.filter(isClosingLike).map((r) => r.report_date)
  ).size

  if (loading) {
    return <p className="text-store-brown-light text-center py-12">Loading analytics...</p>
  }

  if (closingDays < 2) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">📊</div>
        <h2
          className="text-xl font-bold text-store-brown"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Keep logging shifts
        </h2>
        <p className="text-store-brown-light mt-2 text-sm">
          Analytics will appear after a few days of data! 📊
        </p>
      </div>
    )
  }

  const tooltipStyle = { borderRadius: 8, borderColor: '#F5EDD8', fontSize: 12 }
  const xProps = { tick: { fontSize: 11, fill: '#8B5E3C' } }
  const yProps = { tick: { fontSize: 11, fill: '#8B5E3C' } }
  const emptyMsg = (msg) => (
    <p className="text-store-brown-light text-sm text-center py-8">{msg}</p>
  )

  return (
    <div className="space-y-10">
      {/* Header + date range buttons */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2
          className="text-2xl font-bold text-store-brown"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Analytics
        </h2>
        <div className="flex gap-2">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => setRange(opt.days)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors touch-manipulation ${range === opt.days
                ? 'bg-store-brown text-white'
                : 'bg-store-tan text-store-brown hover:bg-store-brown hover:text-white'
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart A — Daily Production */}
      <div>
        <h3 className="font-semibold text-store-brown mb-1">Daily Production</h3>
        <p className="text-xs text-store-brown-light mb-3">
          Trays made per day (stacked by flavor)
        </p>
        {chartAData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartAData} margin={{ left: 0, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F5EDD8" />
              <XAxis dataKey="date" {...xProps} />
              <YAxis {...yProps} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {flavors.map((f, i) => (
                <Bar
                  key={f.id}
                  dataKey={f.name}
                  stackId="prod"
                  fill={FLAVOR_COLORS[i % FLAVOR_COLORS.length]}
                  radius={i === flavors.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          emptyMsg('No production data in this range.')
        )}
      </div>

      {/* Chart B — Sales */}
      <div>
        <h3 className="font-semibold text-store-brown mb-1">Sales</h3>
        <p className="text-xs text-store-brown-light mb-3">
          Trays sold per day, grouped by flavor (calculated between consecutive reports)
        </p>
        {chartBData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartBData} margin={{ left: 0, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F5EDD8" />
              <XAxis dataKey="date" {...xProps} />
              <YAxis {...yProps} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {flavors.map((f, i) => (
                <Bar
                  key={f.id}
                  dataKey={f.name}
                  fill={FLAVOR_COLORS[i % FLAVOR_COLORS.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          emptyMsg('No days with both morning and closing reports in this range.')
        )}
      </div>

      {/* Chart C — Waste */}
      <div>
        <h3 className="font-semibold text-store-brown mb-1">Waste</h3>
        <p className="text-xs text-store-brown-light mb-3">
          Total trays wasted per flavor over selected range
        </p>
        {chartCData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartCData} layout="vertical" margin={{ left: 16, right: 16 }}>
                <XAxis type="number" {...xProps} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  tick={{ fontSize: 12, fill: '#4A2C17' }}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="trays" fill="#C4843A" radius={[0, 4, 4, 0]} name="Trays wasted" />
              </BarChart>
            </ResponsiveContainer>

            {wasteTable.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-store-tan">
                      <th className="text-left py-2 pr-4 text-store-brown-light font-medium">Date</th>
                      <th className="text-left py-2 pr-4 text-store-brown-light font-medium">Flavor</th>
                      <th className="text-left py-2 pr-4 text-store-brown-light font-medium">Trays</th>
                      <th className="text-left py-2 text-store-brown-light font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wasteTable.map((row, i) => (
                      <tr key={i} className="border-b border-store-tan last:border-0">
                        <td className="py-2 pr-4 text-store-brown-light">{row.date}</td>
                        <td className="py-2 pr-4 text-store-brown font-medium">{row.flavor}</td>
                        <td className="py-2 pr-4 text-store-brown">{row.amount}</td>
                        <td className="py-2 text-store-brown-light">{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          emptyMsg('No waste logged in this range.')
        )}
      </div>

      {/* Chart D — Stock Trend */}
      <div>
        <h3 className="font-semibold text-store-brown mb-1">Stock Trend</h3>
        <p className="text-xs text-store-brown-light mb-3">
          Full tray count at close of day, one line per flavor
        </p>
        {chartDData.length > 1 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartDData} margin={{ left: 0, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F5EDD8" />
              <XAxis dataKey="date" {...xProps} />
              <YAxis {...yProps} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {flavors.map((f, i) => (
                <Line
                  key={f.id}
                  type="monotone"
                  dataKey={f.name}
                  stroke={FLAVOR_COLORS[i % FLAVOR_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          emptyMsg('Need at least 2 closing reports for a trend line.')
        )}
      </div>
    </div>
  )
}
