import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useFlavors } from '../hooks/useFlavors'
import TrayCounter from '../components/TrayCounter'

export default function Dashboard() {
  const { flavors, loading: flavorsLoading } = useFlavors()
  const [trayCounts, setTrayCounts] = useState({})
  const [needsMaking, setNeedsMaking] = useState([])
  const [todayBatches, setTodayBatches] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    async function loadLatestStock() {
      const { data: reports } = await supabase
        .from('shift_reports')
        .select('id')
        .order('shift_date', { ascending: false })
        .limit(1)

      if (!reports?.length) return

      const { data: items } = await supabase
        .from('shift_report_items')
        .select('flavor_id, tray_count, needs_to_be_made')
        .eq('shift_report_id', reports[0].id)

      if (items) {
        const counts = {}
        const needs = []
        items.forEach((item) => {
          counts[item.flavor_id] = item.tray_count
          if (item.needs_to_be_made || item.tray_count === 0) needs.push(item.flavor_id)
        })
        setTrayCounts(counts)
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

  function handleTrayChange(flavorId, newCount) {
    setTrayCounts((prev) => ({ ...prev, [flavorId]: newCount }))
  }

  if (flavorsLoading) return <p className="text-store-brown-light text-center py-12">Loading...</p>

  const needsMakingFlavors = flavors.filter(
    (f) => needsMaking.includes(f.id) || (trayCounts[f.id] ?? -1) === 0
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2
          className="text-2xl font-bold text-store-brown"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Dashboard
        </h2>
        <button
          onClick={() => navigate('/shift')}
          className="bg-store-green text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-store-green-dark transition-colors"
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
                {(trayCounts[f.id] ?? -1) === 0 && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Out of stock</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="font-semibold text-store-brown mb-3">Tray Counts</h3>
        <div className="space-y-2">
          {flavors.map((flavor) => {
            const count = trayCounts[flavor.id] ?? 0
            const isEmpty = count === 0
            return (
              <div
                key={flavor.id}
                className={`bg-white rounded-xl border p-4 flex items-center justify-between shadow-sm ${
                  isEmpty ? 'border-red-200 bg-red-50' : 'border-store-tan'
                }`}
              >
                <div>
                  <span className="font-semibold text-store-brown">{flavor.name}</span>
                  {isEmpty && (
                    <span className="ml-2 text-xs text-red-500 font-medium">Out of stock</span>
                  )}
                </div>
                <TrayCounter
                  count={count}
                  onChange={(n) => handleTrayChange(flavor.id, n)}
                />
              </div>
            )
          })}
        </div>
        <p className="text-xs text-store-brown-light mt-2 text-center">
          Tap + / − to adjust counts during your shift
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-store-brown">Today's Batches</h3>
          <button
            onClick={() => navigate('/batch')}
            className="text-store-green text-sm font-medium hover:underline"
          >
            + Log batch
          </button>
        </div>
        {todayBatches.length === 0 ? (
          <p className="text-store-brown-light text-sm text-center py-4">No batches logged today</p>
        ) : (
          <div className="space-y-2">
            {todayBatches.map((b) => (
              <div
                key={b.id}
                className="bg-white rounded-xl border border-store-tan p-3 flex justify-between shadow-sm"
              >
                <span className="text-sm font-medium text-store-brown">{b.flavors?.name}</span>
                <span className="text-sm text-store-brown-light">{b.weight_lbs} lbs</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
