import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useFlavors } from '../hooks/useFlavors'

function Section({ title, color, items, emptyText }) {
  if (items.length === 0) return null
  const colors = {
    red: 'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    green: 'bg-store-green-light border-store-green text-store-green',
  }
  return (
    <div className={`border rounded-xl p-4 ${colors[color]}`}>
      <h3 className="font-bold text-base mb-2 uppercase tracking-wide">{title}</h3>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm font-medium flex items-center justify-between">
            <span>{item.name}</span>
            {item.detail && <span className="opacity-70">{item.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Summary() {
  const { flavors, loading: flavorsLoading } = useFlavors()
  const [trayCounts, setTrayCounts] = useState({})
  const [ingredients, setIngredients] = useState([])
  const [todayBatches, setTodayBatches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [inv, ing, batches] = await Promise.all([
        supabase.from('current_inventory').select('*'),
        supabase.from('ingredients').select('id, name, quantity, low_stock_threshold, unit').eq('is_active', true).order('name'),
        supabase.from('batch_logs').select('*, flavors(name)').gte('batch_date', new Date().toISOString().split('T')[0]).order('created_at', { ascending: false }),
      ])
      if (inv.data) {
        const map = {}
        inv.data.forEach((r) => { map[r.flavor_id] = r.tray_count })
        setTrayCounts(map)
      }
      setIngredients(ing.data || [])
      setTodayBatches(batches.data || [])
      setLoading(false)
    }
    load()
  }, [])

  if (flavorsLoading || loading) return <p className="text-store-brown-light text-center py-12">Loading...</p>

  const makeNow = flavors.filter((f) => (trayCounts[f.id] ?? 0) === 0)
  const makeSoon = flavors.filter((f) => { const c = trayCounts[f.id] ?? 0; return c > 0 && c <= 2 })
  const orderNow = ingredients.filter((i) => i.quantity === 0)
  const orderSoon = ingredients.filter((i) => i.quantity > 0 && i.quantity <= i.low_stock_threshold)
  const allGood = makeNow.length === 0 && makeSoon.length === 0 && orderNow.length === 0 && orderSoon.length === 0

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const totalLbs = todayBatches.reduce((sum, b) => sum + (b.weight_lbs || 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
            Daily Summary
          </h2>
          <p className="text-store-brown-light text-sm mt-0.5">{today}</p>
        </div>
        <button
          onClick={() => window.print()}
          className="text-xs text-store-brown-light border border-store-tan px-3 py-1.5 rounded-lg hover:bg-white transition-colors"
        >
          Print
        </button>
      </div>

      {allGood ? (
        <div className="bg-store-green-light border border-store-green rounded-xl p-4">
          <p className="text-store-green font-semibold">✓ All good — nothing urgent today</p>
        </div>
      ) : (
        <div className="space-y-3">
          <Section
            title="Make Now — Out of stock"
            color="red"
            items={makeNow.map((f) => ({ name: f.name, detail: '0 trays' }))}
          />
          <Section
            title="Make Soon — Running low"
            color="amber"
            items={makeSoon.map((f) => ({ name: f.name, detail: `${trayCounts[f.id]} tray${trayCounts[f.id] !== 1 ? 's' : ''}` }))}
          />
          <Section
            title="Order Now — Out of stock"
            color="red"
            items={orderNow.map((i) => ({ name: i.name, detail: `0 ${i.unit}` }))}
          />
          <Section
            title="Order Soon — Running low"
            color="amber"
            items={orderSoon.map((i) => ({ name: i.name, detail: `${i.quantity} ${i.unit} left` }))}
          />
        </div>
      )}

      {/* Today's production */}
      <div className="bg-white border border-store-tan rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-store-brown mb-3">
          Today's Production
          {todayBatches.length > 0 && (
            <span className="ml-2 text-sm font-normal text-store-brown-light">
              {todayBatches.length} batch{todayBatches.length !== 1 ? 'es' : ''}{totalLbs > 0 ? ` · ~${totalLbs} lbs` : ''}
            </span>
          )}
        </h3>
        {todayBatches.length === 0 ? (
          <p className="text-store-brown-light text-sm">No batches logged yet today</p>
        ) : (
          <div className="space-y-1.5">
            {todayBatches.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm">
                <span className="font-medium text-store-brown">{b.flavors?.name}</span>
                <span className="text-store-brown-light">{b.weight_lbs ? `~${b.weight_lbs} lbs` : '1 tray'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Current tray counts */}
      <div className="bg-white border border-store-tan rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-store-brown mb-3">Current Stock</h3>
        <div className="space-y-1.5">
          {flavors.map((f) => {
            const count = trayCounts[f.id] ?? 0
            return (
              <div key={f.id} className="flex items-center justify-between text-sm">
                <span className={`font-medium ${count === 0 ? 'text-red-600' : 'text-store-brown'}`}>{f.name}</span>
                <span className={count === 0 ? 'text-red-500 font-semibold' : 'text-store-brown-light'}>
                  {count} tray{count !== 1 ? 's' : ''}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
