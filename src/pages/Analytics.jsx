import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend
} from 'recharts'
import { supabase } from '../lib/supabase'

export default function Analytics() {
  const [stockoutData, setStockoutData] = useState([])
  const [productionData, setProductionData] = useState([])
  const [weeklyData, setWeeklyData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // Stockout frequency per flavor
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

      // Production by flavor (total lbs)
      const { data: batches } = await supabase
        .from('batch_logs')
        .select('flavor_id, weight_lbs, batch_date, flavors(name)')
        .order('batch_date')

      if (batches) {
        // Total lbs per flavor
        const totals = {}
        batches.forEach(({ weight_lbs, flavors }) => {
          const name = flavors?.name || 'Unknown'
          totals[name] = (totals[name] || 0) + weight_lbs
        })
        setProductionData(
          Object.entries(totals)
            .map(([name, lbs]) => ({ name, lbs: Math.round(lbs * 10) / 10 }))
            .sort((a, b) => b.lbs - a.lbs)
        )

        // Weekly production totals
        const byWeek = {}
        batches.forEach(({ batch_date, weight_lbs }) => {
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

  if (loading) return <p className="text-gray-400 text-center py-12">Loading analytics...</p>

  const noData = stockoutData.length === 0 && productionData.length === 0

  if (noData) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">📊</div>
        <h2 className="text-xl font-bold text-gray-700">No data yet</h2>
        <p className="text-gray-500 mt-2 text-sm">
          Start logging shift reports and batches to see analytics here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-bold text-gray-800">Analytics</h2>

      {stockoutData.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-700 mb-4">Stockout Frequency</h3>
          <p className="text-xs text-gray-400 mb-3">Which flavors run out most often</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stockoutData} layout="vertical" margin={{ left: 16, right: 16 }}>
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#b45309" radius={[0, 4, 4, 0]} name="Times sold out" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {productionData.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-700 mb-4">Production by Flavor (lbs)</h3>
          <p className="text-xs text-gray-400 mb-3">Total pounds made this season</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={productionData} layout="vertical" margin={{ left: 16, right: 16 }}>
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="lbs" fill="#d97706" radius={[0, 4, 4, 0]} name="Total lbs" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {weeklyData.length > 1 && (
        <div>
          <h3 className="font-semibold text-gray-700 mb-4">Weekly Production (lbs)</h3>
          <p className="text-xs text-gray-400 mb-3">How much fudge was made each week</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={weeklyData} margin={{ left: 0, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="lbs" stroke="#b45309" strokeWidth={2} dot={{ r: 4 }} name="lbs made" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
