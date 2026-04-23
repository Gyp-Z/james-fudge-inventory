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

function isClosingLike() {
  return true
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
              trays_sold,
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

  // Chart B — Sales
  // Now simply reading trays_sold directly from what the user inputted
  const chartBData = useMemo(() => {
    const dates = new Set(filteredReports.filter(isClosingLike).map((r) => r.report_date))
    const unique = [...dates].sort()

    const closingByDate = {}
    filteredReports
      .filter(isClosingLike)
      .forEach((r) => { closingByDate[r.report_date] = r })

    return unique.map((date) => {
      const report = closingByDate[date]
      const row = { date: formatDate(report.report_date) }
      flavors.forEach((f) => {
        const ce = report.shift_report_entries?.find((e) => e.flavor_id === f.id)
        row[f.name] = ce?.trays_sold ?? 0
      })
      // If there's 0 sales but we want the graph point to exist structurally, we keep it, but user requested an empty graph if no sales.
      // We will push the row even if hasData is false so that dates show up, but only >0 values create bars.
      return row
    }).filter(row => flavors.some(f => row[f.name] > 0)) // Only show dates that actually had sales
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

  // Summary totals across filtered range
  const totals = useMemo(() => {
    let sold = 0, wasted = 0, stock = 0
    // Sum sold + wasted from all entries in range
    filteredReports.forEach((r) => {
      r.shift_report_entries?.forEach((e) => {
        sold += e.trays_sold ?? 0
        wasted += e.trays_wasted ?? 0
      })
    })
    // Current stock = latest report's full_trays sum
    const sorted = [...filteredReports].sort((a, b) => (a.report_date > b.report_date ? -1 : 1))
    const latest = sorted[0]
    latest?.shift_report_entries?.forEach((e) => { stock += e.full_trays ?? 0 })
    return { sold, wasted, stock }
  }, [filteredReports])

  if (loading) {
    return <p className="text-store-brown-light text-center py-12">Loading analytics...</p>
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

      {/* Summary stat cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Sold', value: totals.sold, color: 'text-store-green' },
          { label: 'Wasted', value: totals.wasted, color: 'text-amber-600' },
          { label: 'In Stock', value: totals.stock, color: 'text-store-brown' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white border border-store-tan rounded-xl p-3 shadow-sm text-center">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-store-brown-light mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Chart B — Sales */}
      <div>
        <h3 className="font-semibold text-store-brown mb-1">Sales</h3>
        <p className="text-xs text-store-brown-light mb-3">
          Trays sold per day, grouped by flavor
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
          emptyMsg('No sales logged in this range yet.')
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
        {chartDData.length > 0 ? (
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
          emptyMsg('No stock data in this range yet.')
        )}
      </div>
    </div>
  )
}
