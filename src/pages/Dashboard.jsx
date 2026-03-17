import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useFlavors } from '../hooks/useFlavors'

const STOCK_COLORS = {
  full: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-red-100 text-red-800',
  unknown: 'bg-gray-100 text-gray-500',
}

const STOCK_LABELS = { full: 'Full', medium: 'Medium', low: 'Low', unknown: '?' }

export default function Dashboard() {
  const { flavors, loading: flavorsLoading } = useFlavors()
  const [stockMap, setStockMap] = useState({})
  const [needsMaking, setNeedsMaking] = useState([])
  const [todayBatches, setTodayBatches] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    async function loadLatestStock() {
      // Get most recent shift report
      const { data: reports } = await supabase
        .from('shift_reports')
        .select('id')
        .order('shift_date', { ascending: false })
        .limit(1)

      if (!reports?.length) return

      const { data: items } = await supabase
        .from('shift_report_items')
        .select('flavor_id, stock_level, needs_to_be_made')
        .eq('shift_report_id', reports[0].id)

      if (items) {
        const map = {}
        const needs = []
        items.forEach((item) => {
          map[item.flavor_id] = item.stock_level
          if (item.needs_to_be_made) needs.push(item.flavor_id)
        })
        setStockMap(map)
        setNeedsMaking(needs)
      }
    }

    async function loadTodayBatches() {
      const today = new Date().toISOString().split('T')[0]
      const { data } = await supabase
        .from('batch_logs')
        .select('*, flavors(name)')
        .gte('batch_date', today)
        .order('created_at', { ascending: false })
      setTodayBatches(data || [])
    }

    loadLatestStock()
    loadTodayBatches()
  }, [])

  if (flavorsLoading) return <p className="text-gray-400 text-center py-12">Loading...</p>

  const needsMakingFlavors = flavors.filter((f) => needsMaking.includes(f.id))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Dashboard</h2>
        <button
          onClick={() => navigate('/shift')}
          className="bg-amber-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-amber-800 transition-colors"
        >
          + Shift Report
        </button>
      </div>

      {needsMakingFlavors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="font-semibold text-red-700 mb-2">Needs to Be Made</h3>
          <ul className="space-y-1">
            {needsMakingFlavors.map((f) => (
              <li key={f.id} className="text-red-600 text-sm flex items-center gap-2">
                <span>⚠️</span> {f.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="font-semibold text-gray-700 mb-3">Current Stock</h3>
        <div className="grid grid-cols-2 gap-2">
          {flavors.map((flavor) => {
            const level = stockMap[flavor.id] || 'unknown'
            return (
              <div
                key={flavor.id}
                className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between shadow-sm"
              >
                <span className="text-sm font-medium text-gray-800">{flavor.name}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STOCK_COLORS[level]}`}>
                  {STOCK_LABELS[level]}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-700">Today's Batches</h3>
          <button
            onClick={() => navigate('/batch')}
            className="text-amber-700 text-sm font-medium hover:underline"
          >
            + Log batch
          </button>
        </div>
        {todayBatches.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">No batches logged today</p>
        ) : (
          <div className="space-y-2">
            {todayBatches.map((b) => (
              <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-3 flex justify-between shadow-sm">
                <span className="text-sm font-medium text-gray-800">{b.flavors?.name}</span>
                <span className="text-sm text-gray-500">{b.weight_lbs} lbs</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
