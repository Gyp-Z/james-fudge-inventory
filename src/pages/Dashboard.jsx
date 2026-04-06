import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useFlavors } from '../hooks/useFlavors'
import TrayCounter from '../components/TrayCounter'

export default function Dashboard() {
  const { flavors, loading: flavorsLoading } = useFlavors()
  const [trayCounts, setTrayCounts] = useState({})
  const [todayBatches, setTodayBatches] = useState([])
  const [ingredients, setIngredients] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    async function loadInventory() {
      const { data } = await supabase.from('current_inventory').select('*')
      if (data) {
        const map = {}
        data.forEach((row) => { map[row.flavor_id] = row.tray_count })
        setTrayCounts(map)
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

    async function loadIngredients() {
      const { data } = await supabase
        .from('ingredients')
        .select('id, name, quantity, low_stock_threshold')
        .eq('is_active', true)
      setIngredients(data || [])
    }

    loadInventory()
    loadTodayBatches()
    loadIngredients()
  }, [])

  async function handleTrayChange(flavorId, newCount) {
    setTrayCounts((prev) => ({ ...prev, [flavorId]: newCount }))
    await supabase.from('current_inventory').upsert(
      { flavor_id: flavorId, tray_count: newCount, updated_at: new Date().toISOString() },
      { onConflict: 'flavor_id' }
    )
  }

  if (flavorsLoading) return <p className="text-store-brown-light text-center py-12">Loading...</p>

  const makeNow = flavors.filter((f) => (trayCounts[f.id] ?? 0) === 0)
  const makeSoon = flavors.filter((f) => { const c = trayCounts[f.id] ?? 0; return c > 0 && c <= 2 })
  const orderNow = ingredients.filter((i) => i.quantity === 0)
  const orderSoon = ingredients.filter((i) => i.quantity > 0 && i.quantity <= i.low_stock_threshold)
  const allGood = makeNow.length === 0 && makeSoon.length === 0 && orderNow.length === 0 && orderSoon.length === 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          Dashboard
        </h2>
        <button
          onClick={() => navigate('/shift')}
          className="bg-store-green text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-store-green-dark transition-colors"
        >
          + Shift Report
        </button>
      </div>

      {/* Priority section */}
      {allGood ? (
        <div className="bg-store-green-light border border-store-green rounded-xl p-4">
          <p className="text-store-green font-semibold text-sm">✓ All good — nothing urgent right now</p>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-amber-800 text-sm uppercase tracking-wide">Today's Priorities</h3>
          {makeNow.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">Make Now</p>
              <div className="flex flex-wrap gap-2">
                {makeNow.map((f) => (
                  <span key={f.id} className="bg-red-100 text-red-700 text-sm font-medium px-3 py-1 rounded-full">
                    {f.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {makeSoon.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Make Soon</p>
              <div className="flex flex-wrap gap-2">
                {makeSoon.map((f) => (
                  <span key={f.id} className="bg-amber-100 text-amber-800 text-sm font-medium px-3 py-1 rounded-full">
                    {f.name} ({trayCounts[f.id]} tray{trayCounts[f.id] !== 1 ? 's' : ''})
                  </span>
                ))}
              </div>
            </div>
          )}
          {orderNow.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">Order Now</p>
              <div className="flex flex-wrap gap-2">
                {orderNow.map((i) => (
                  <span key={i.id} className="bg-red-100 text-red-700 text-sm font-medium px-3 py-1 rounded-full">
                    {i.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {orderSoon.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Order Soon</p>
              <div className="flex flex-wrap gap-2">
                {orderSoon.map((i) => (
                  <span key={i.id} className="bg-amber-100 text-amber-800 text-sm font-medium px-3 py-1 rounded-full">
                    {i.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <h3 className="font-semibold text-store-brown mb-3">Tray Counts</h3>
        <div className="space-y-2">
          {flavors.map((flavor) => {
            const count = trayCounts[flavor.id] ?? 0
            return (
              <div
                key={flavor.id}
                className={`bg-white rounded-xl border p-4 flex items-center justify-between shadow-sm ${
                  count === 0 ? 'border-red-200 bg-red-50' : 'border-store-tan'
                }`}
              >
                <span className="font-semibold text-store-brown">{flavor.name}</span>
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
        </div>
        {todayBatches.length === 0 ? (
          <p className="text-store-brown-light text-sm text-center py-4">No batches logged today</p>
        ) : (
          <div className="space-y-2">
            {todayBatches.map((b) => (
              <div key={b.id} className="bg-white rounded-xl border border-store-tan p-3 flex justify-between shadow-sm">
                <span className="text-sm font-medium text-store-brown">{b.flavors?.name}</span>
                <span className="text-sm text-store-brown-light">
                  {b.weight_lbs ? `~${b.weight_lbs} lbs` : '1 tray'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
