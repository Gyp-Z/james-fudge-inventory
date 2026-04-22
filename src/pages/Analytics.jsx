import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts'
import { supabase } from '../lib/supabase'

export default function Analytics() {
  const [traysByFlavor, setTraysByFlavor] = useState([])
  const [dailyProduction, setDailyProduction] = useState([])
  const [stockoutData, setStockoutData] = useState([])
  const [productionData, setProductionData] = useState([])
  const [weeklyData, setWeeklyData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: stockouts } = await supabase
        .from('shift_report_items')
        .select('flavor_id, flavors(name)')
        .eq('sold_out', true)

      if (stockouts) {
        const counts = {}
        stockouts.forEach(({ flavor_id, flavors }) => {
          const name = flavors?.name || flavor_id
          counts[name] = (counts[name] || 0) + 1
        })
        setStockoutData(
          Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
        )
      }

      const { data: batches } = await supabase
        .from('batch_logs')
        .select('flavor_id, tray_count, weight_lbs, batch_date, flavors(name)')
        .order('batch_date')

      if (batches) {
        // Trays by flavor (tray_count, fall back to 1 per row if column missing)
        const trayTotals = {}
        batches.forEach(({ tray_count, flavors }) => {
          const name = flavors?.name || 'Unknown'
          trayTotals[name] = (trayTotals[name] || 0) + (tray_count ?? 1)
        })
        setTraysByFlavor(
          Object.entries(trayTotals)
            .map(([name, trays]) => ({ name, trays }))
            .sort((a, b) => b.trays - a.trays)
        )

        // Daily production — last 30 days
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        const byDay = {}
        batches
          .filter(({ batch_date }) => new Date(batch_date) >= thirtyDaysAgo)
          .forEach(({ batch_date, tray_count }) => {
            const day = new Date(batch_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            byDay[day] = (byDay[day] || 0) + (tray_count ?? 1)
          })
        setDailyProduction(
          Object.entries(byDay).map(([day, trays]) => ({ day, trays }))
        )

        // Weight-based charts (existing)
        const totals = {}
        batches.forEach(({ weight_lbs, flavors }) => {
          const name = flavors?.name || 'Unknown'
          totals[name] = (totals[name] || 0) + (weight_lbs || 0)
        })
        const weightData = Object.entries(totals)
          .filter(([, lbs]) => lbs > 0)
          .map(([name, lbs]) => ({ name, lbs: Math.round(lbs * 10) / 10 }))
          .sort((a, b) => b.lbs - a.lbs)
        setProductionData(weightData)

        const byWeek = {}
        batches.forEach(({ batch_date, weight_lbs }) => {
          if (!weight_lbs) return
          const date = new Date(batch_date)
          const weekStart = new Date(date)
          weekStart.setDate(date.getDate() - date.getDay())
          const key = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          byWeek[key] = (byWeek[key] || 0) + weight_lbs
        })
        setWeeklyData(
          Object.entries(byWeek).map(([week, lbs]) => ({ week, lbs: Math.round(lbs * 10) / 10 }))
        )
      }

      setLoading(false)
    }

    load()
  }, [])

  if (loading) return <p className="text-store-brown-light text-center py-12">Loading analytics...</p>

  const noData = stockoutData.length === 0 && traysByFlavor.length === 0

  if (noData) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">📊</div>
        <h2
          className="text-xl font-bold text-store-brown"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          No data yet
        </h2>
        <p className="text-store-brown-light mt-2 text-sm">
          Start logging shift reports and batches to see analytics here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h2
        className="text-2xl font-bold text-store-brown"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Analytics
      </h2>

      {traysByFlavor.length > 0 && (
        <div>
          <h3 className="font-semibold text-store-brown mb-1">Trays by Flavor</h3>
          <p className="text-xs text-store-brown-light mb-3">Total trays made per flavor this season</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={traysByFlavor} layout="vertical" margin={{ left: 16, right: 16 }}>
              <XAxis type="number" tick={{ fontSize: 12, fill: '#8B5E3C' }} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12, fill: '#4A2C17' }} />
              <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#F5EDD8' }} />
              <Bar dataKey="trays" fill="#7C4B2A" radius={[0, 4, 4, 0]} name="Trays made" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {dailyProduction.length > 0 && (
        <div>
          <h3 className="font-semibold text-store-brown mb-1">Daily Production</h3>
          <p className="text-xs text-store-brown-light mb-3">Trays logged per day — last 30 days</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyProduction} margin={{ left: 0, right: 16 }}>
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#8B5E3C' }} />
              <YAxis tick={{ fontSize: 11, fill: '#8B5E3C' }} />
              <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#F5EDD8' }} />
              <Bar dataKey="trays" fill="#2D5A1B" radius={[4, 4, 0, 0]} name="Trays" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {stockoutData.length > 0 && (
        <div>
          <h3 className="font-semibold text-store-brown mb-1">Stockout Frequency</h3>
          <p className="text-xs text-store-brown-light mb-3">Which flavors run out most often</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stockoutData} layout="vertical" margin={{ left: 16, right: 16 }}>
              <XAxis type="number" tick={{ fontSize: 12, fill: '#8B5E3C' }} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12, fill: '#4A2C17' }} />
              <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#F5EDD8' }} />
              <Bar dataKey="count" fill="#2D5A1B" radius={[0, 4, 4, 0]} name="Times sold out" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {productionData.length > 0 && (
        <div>
          <h3 className="font-semibold text-store-brown mb-1">Production by Flavor (lbs)</h3>
          <p className="text-xs text-store-brown-light mb-3">Total pounds made this season</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={productionData} layout="vertical" margin={{ left: 16, right: 16 }}>
              <XAxis type="number" tick={{ fontSize: 12, fill: '#8B5E3C' }} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12, fill: '#4A2C17' }} />
              <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#F5EDD8' }} />
              <Bar dataKey="lbs" fill="#4A2C17" radius={[0, 4, 4, 0]} name="Total lbs" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {weeklyData.length > 1 && (
        <div>
          <h3 className="font-semibold text-store-brown mb-1">Weekly Production (lbs)</h3>
          <p className="text-xs text-store-brown-light mb-3">How much fudge was made each week</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={weeklyData} margin={{ left: 0, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F5EDD8" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#8B5E3C' }} />
              <YAxis tick={{ fontSize: 11, fill: '#8B5E3C' }} />
              <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#F5EDD8' }} />
              <Line
                type="monotone"
                dataKey="lbs"
                stroke="#2D5A1B"
                strokeWidth={2}
                dot={{ r: 4, fill: '#2D5A1B' }}
                name="lbs made"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
