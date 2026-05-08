import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Admin() {
  const [flavors, setFlavors] = useState([])
  const [inventory, setInventory] = useState({}) // flavor_id -> { trays, barrels }
  const [recipes, setRecipes] = useState({}) // flavor_id -> [{ name, qty, unit }]
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('fudge')
  const [newYield, setNewYield] = useState('3')
  const [newThreshold, setNewThreshold] = useState('2')
  const [newTracksShelf, setNewTracksShelf] = useState(false)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editingThresholdId, setEditingThresholdId] = useState(null)
  const [editThreshold, setEditThreshold] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  async function loadFlavors() {
    const { data } = await supabase.from('flavors').select('*').order('name')
    setFlavors(data || [])
    setLoading(false)
  }

  async function loadInventory() {
    const { data } = await supabase.from('current_inventory').select('flavor_id, tray_count, barrel_count')
    if (data) {
      const map = {}
      data.forEach(r => { map[r.flavor_id] = { trays: r.tray_count ?? 0, barrels: r.barrel_count ?? 0 } })
      setInventory(map)
    }
  }

  async function loadRecipes() {
    const { data } = await supabase
      .from('recipes')
      .select('flavor_id, quantity_per_batch, unit, ingredients(name)')
      .order('flavor_id')
    if (data) {
      const map = {}
      data.forEach(r => {
        if (!map[r.flavor_id]) map[r.flavor_id] = []
        map[r.flavor_id].push({ name: r.ingredients?.name ?? '?', qty: r.quantity_per_batch, unit: r.unit })
      })
      setRecipes(map)
    }
  }

  useEffect(() => {
    loadFlavors()
    loadInventory()
    loadRecipes()
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    const isPopcorn = newType === 'popcorn'
    const { data: inserted } = await supabase.from('flavors').insert({
      name: newName.trim(),
      is_active: true,
      product_type: newType,
      stock_unit: isPopcorn ? 'barrel' : 'tray',
      default_yield: parseFloat(newYield) || (isPopcorn ? 1 : 3),
      low_tray_threshold: parseInt(newThreshold) || (isPopcorn ? 1 : 2),
      tracks_shelf_buckets: isPopcorn ? newTracksShelf : false,
    }).select('id').single()
    if (inserted) {
      await supabase.from('current_inventory')
        .upsert({ flavor_id: inserted.id, tray_count: 0, barrel_count: 0 }, { onConflict: 'flavor_id' })
    }
    setNewName('')
    await Promise.all([loadFlavors(), loadInventory()])
    setAdding(false)
  }

  async function toggleActive(flavor) {
    await supabase.from('flavors').update({ is_active: !flavor.is_active }).eq('id', flavor.id)
    await loadFlavors()
  }

  async function saveThreshold(flavor) {
    const val = parseInt(editThreshold)
    if (isNaN(val) || val < 0) return
    await supabase.from('flavors').update({ low_tray_threshold: val }).eq('id', flavor.id)
    setEditingThresholdId(null)
    setEditThreshold('')
    await loadFlavors()
  }

  async function saveCount(flavor, newCount) {
    const field = flavor.product_type === 'popcorn' ? 'barrel_count' : 'tray_count'
    await supabase
      .from('current_inventory')
      .upsert({ flavor_id: flavor.id, [field]: newCount }, { onConflict: 'flavor_id' })
    await loadInventory()
  }

  if (loading) return <p className="text-store-brown-light text-center py-12">Loading...</p>

  const active = flavors.filter(f => f.is_active)
  const archived = flavors.filter(f => !f.is_active)

  const needsMaking = active.filter(f => {
    const count = f.product_type === 'popcorn' ? (inventory[f.id]?.barrels ?? 0) : (inventory[f.id]?.trays ?? 0)
    return count <= (f.low_tray_threshold ?? 2)
  })
  const stocked = active.filter(f => {
    const count = f.product_type === 'popcorn' ? (inventory[f.id]?.barrels ?? 0) : (inventory[f.id]?.trays ?? 0)
    return count > (f.low_tray_threshold ?? 2)
  })

  const rowProps = (f) => ({
    f,
    count: f.product_type === 'popcorn' ? (inventory[f.id]?.barrels ?? 0) : (inventory[f.id]?.trays ?? 0),
    recipe: recipes[f.id] ?? [],
    editingThresholdId,
    editThreshold,
    setEditingThresholdId,
    setEditThreshold,
    saveThreshold,
    toggleActive,
    onSaveCount: saveCount,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          Products
        </h2>
        <button
          onClick={() => setShowArchived(v => !v)}
          className="text-xs text-store-brown-light underline hover:text-store-brown"
        >
          {showArchived ? 'Hide Archived' : 'Show Archived'}
        </button>
      </div>

      {needsMaking.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="font-semibold text-red-700 mb-3">Make Soon ({needsMaking.length})</h3>
          <div className="space-y-2">
            {needsMaking.map(f => <FlavorRow key={f.id} {...rowProps(f)} />)}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-semibold text-store-brown mb-3">
          {needsMaking.length > 0 ? `Stocked (${stocked.length})` : `Active (${active.length})`}
        </h3>
        <div className="space-y-2">
          {(needsMaking.length > 0 ? stocked : active).map(f => <FlavorRow key={f.id} {...rowProps(f)} />)}
          {active.length === 0 && (
            <p className="text-store-brown-light text-sm text-center py-4">No active products</p>
          )}
        </div>
      </div>

      {showArchived && archived.length > 0 && (
        <div>
          <h3 className="font-semibold text-store-brown-light mb-3">Archived ({archived.length})</h3>
          <div className="space-y-2 opacity-60">
            {archived.map(f => (
              <div key={f.id} className="bg-store-cream rounded-xl border border-store-tan p-3 flex items-center justify-between">
                <span className="text-sm text-store-brown-light">{f.name}</span>
                <button onClick={() => toggleActive(f)} className="text-xs text-store-green hover:text-store-green-dark px-2 py-1 rounded-lg hover:bg-store-green-light transition-colors">
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {showArchived && archived.length === 0 && (
        <p className="text-store-brown-light text-sm text-center py-2">No archived products</p>
      )}

      <div className="bg-white rounded-xl border border-store-tan p-4 shadow-sm">
        <h3 className="font-semibold text-store-brown mb-3">Add Product</h3>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Chocolate Peanut Butter"
              className="flex-1 min-w-0 border border-store-tan rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
            />
            <div className="flex rounded-xl border border-store-tan overflow-hidden text-sm font-medium shrink-0">
              {['fudge', 'popcorn'].map(t => (
                <button
                  key={t} type="button"
                  onClick={() => {
                    setNewType(t)
                    setNewYield(t === 'popcorn' ? '1' : '3')
                    setNewThreshold(t === 'popcorn' ? '1' : '2')
                    setNewTracksShelf(false)
                  }}
                  className={`px-3 py-2.5 capitalize transition-colors ${newType === t ? 'bg-store-green text-white' : 'bg-store-cream text-store-brown hover:bg-store-tan'}`}
                >{t}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 flex items-center gap-2 border border-store-tan rounded-xl px-4 py-2.5 bg-store-cream">
              <span className="text-xs text-store-brown-light whitespace-nowrap">Default yield</span>
              <input
                type="number" value={newYield} onChange={e => setNewYield(e.target.value)}
                min="0" step="0.5"
                className="flex-1 min-w-0 bg-transparent text-sm text-store-brown focus:outline-none text-right"
              />
              <span className="text-xs text-store-brown-light shrink-0">{newType === 'popcorn' ? 'barrels' : 'trays'}</span>
            </div>
            <div className="flex-1 flex items-center gap-2 border border-store-tan rounded-xl px-4 py-2.5 bg-store-cream">
              <span className="text-xs text-store-brown-light whitespace-nowrap">Alert at</span>
              <input
                type="number" value={newThreshold} onChange={e => setNewThreshold(e.target.value)}
                min="0" step="1"
                className="flex-1 min-w-0 bg-transparent text-sm text-store-brown focus:outline-none text-right"
              />
              <span className="text-xs text-store-brown-light shrink-0">{newType === 'popcorn' ? 'barrels' : 'trays'}</span>
            </div>
          </div>
          {newType === 'popcorn' && (
            <label className="flex items-center gap-3 px-4 py-2.5 border border-store-tan rounded-xl bg-store-cream cursor-pointer">
              <input type="checkbox" checked={newTracksShelf} onChange={e => setNewTracksShelf(e.target.checked)} className="accent-store-green w-4 h-4" />
              <span className="text-sm text-store-brown">Tracks shelf buckets (Caramel Corn, Nut Caramel Corn)</span>
            </label>
          )}
          <button type="submit" disabled={adding || !newName.trim()} className="w-full bg-store-green hover:bg-store-green-dark text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
            {adding ? 'Adding…' : 'Add Product'}
          </button>
        </form>
      </div>
    </div>
  )
}

function parseCaramelInput(s) {
  const m1 = s.trim().match(/^(\d+)\s+(\d+)\/18$/)
  if (m1) return parseInt(m1[1]) + parseInt(m1[2]) / 18
  const m2 = s.trim().match(/^(\d+)\/18$/)
  if (m2) return parseInt(m2[1]) / 18
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function FlavorRow({ f, count, recipe, editingThresholdId, editThreshold, setEditingThresholdId, setEditThreshold, saveThreshold, toggleActive, onSaveCount }) {
  const [showRecipe, setShowRecipe] = useState(false)
  const [smallBucket, setSmallBucket] = useState(f.low_small_bucket_threshold ?? 0)
  const [largeBucket, setLargeBucket] = useState(f.low_large_bucket_threshold ?? 0)
  const [editingBucket, setEditingBucket] = useState(false)
  const [editingCount, setEditingCount] = useState(false)
  const [countInput, setCountInput] = useState('')

  async function saveBucketThresholds() {
    await supabase.from('flavors').update({
      low_small_bucket_threshold: Math.max(0, smallBucket),
      low_large_bucket_threshold: Math.max(0, largeBucket),
    }).eq('id', f.id)
    setEditingBucket(false)
  }
  const isPopcorn = f.product_type === 'popcorn'
  const unit = isPopcorn ? 'barrel' : 'tray'
  const units = isPopcorn ? 'barrels' : 'trays'
  const threshold = f.low_tray_threshold ?? (isPopcorn ? 1 : 2)
  const isOut = count === 0
  const isLow = !isOut && count <= threshold

  return (
    <div className="bg-white rounded-xl border border-store-tan shadow-sm overflow-hidden">
      <div className="p-3 flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
        <div className="flex items-start sm:items-center gap-2 flex-1">
          <span className="text-sm font-medium text-store-brown leading-tight">{f.name}</span>
          {isOut ? (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Out</span>
          ) : isLow ? (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Low</span>
          ) : (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-store-green-light text-store-green">OK</span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
          {f.is_component ? (
            editingCount ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={countInput}
                  onChange={e => setCountInput(e.target.value)}
                  placeholder="e.g. 1 6/18"
                  autoFocus
                  className="w-24 border border-store-tan rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
                />
                <button
                  onClick={async () => {
                    const v = parseCaramelInput(countInput)
                    if (v !== null && v >= 0) { await onSaveCount(f, v); setEditingCount(false) }
                  }}
                  className="text-xs bg-store-green text-white px-2 py-1 rounded-lg hover:bg-store-green-dark transition-colors"
                >Save</button>
                <button onClick={() => setEditingCount(false)} className="text-xs text-store-brown-light hover:text-store-brown px-2 py-1 rounded-lg transition-colors">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => {
                  const whole = Math.floor(count)
                  const numer = Math.round((count - whole) * 18)
                  setCountInput(numer === 0 ? `${whole}` : whole === 0 ? `${numer}/18` : `${whole} ${numer}/18`)
                  setEditingCount(true)
                }}
                className="text-sm text-store-brown-light font-mono hover:text-store-green px-2 py-1 rounded-lg hover:bg-store-green-light transition-colors"
              >
                {(() => {
                  const whole = Math.floor(count)
                  const numer = Math.round((count - whole) * 18)
                  if (numer === 0) return `${whole} ${units}`
                  if (whole === 0) return `${numer}/18 ${units}`
                  return `${whole} ${numer}/18 ${units}`
                })()}
              </button>
            )
          ) : (
            <span className="text-sm text-store-brown-light font-mono">
              {`${count} ${count === 1 ? unit : units}`}
            </span>
          )}
          {editingThresholdId === f.id ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={editThreshold}
                onChange={e => setEditThreshold(e.target.value)}
                min="0"
                max="20"
                autoFocus
                className="w-14 border border-store-tan rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
              />
              <span className="text-xs text-store-brown-light">{units}</span>
              <button onClick={() => saveThreshold(f)} className="text-xs bg-store-green text-white px-2 py-1 rounded-lg hover:bg-store-green-dark transition-colors">Save</button>
              <button onClick={() => { setEditingThresholdId(null); setEditThreshold('') }} className="text-xs text-store-brown-light hover:text-store-brown px-2 py-1 rounded-lg transition-colors">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => { setEditingThresholdId(f.id); setEditThreshold(String(threshold)) }}
              className="text-xs text-store-brown-light hover:text-store-green px-2 py-1 rounded-lg hover:bg-store-green-light transition-colors"
            >
              Alert at {threshold} {units}
            </button>
          )}
          {f.tracks_shelf_buckets && (
            editingBucket ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-store-brown-light">S</span>
                <input
                  type="number" min="0" step="1" autoFocus
                  value={smallBucket}
                  onChange={e => setSmallBucket(Number(e.target.value))}
                  className="w-12 border border-store-tan rounded-lg px-1.5 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
                />
                <span className="text-xs text-store-brown-light">L</span>
                <input
                  type="number" min="0" step="1"
                  value={largeBucket}
                  onChange={e => setLargeBucket(Number(e.target.value))}
                  className="w-12 border border-store-tan rounded-lg px-1.5 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
                />
                <button onClick={saveBucketThresholds} className="text-xs bg-store-green text-white px-2 py-1 rounded-lg hover:bg-store-green-dark transition-colors">Save</button>
                <button onClick={() => { setEditingBucket(false); setSmallBucket(f.low_small_bucket_threshold ?? 0); setLargeBucket(f.low_large_bucket_threshold ?? 0) }} className="text-xs text-store-brown-light hover:text-store-brown px-2 py-1 rounded-lg transition-colors">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => setEditingBucket(true)}
                className="text-xs text-store-brown-light hover:text-store-green px-2 py-1 rounded-lg hover:bg-store-green-light transition-colors"
              >
                Bucket S {smallBucket} L {largeBucket}
              </button>
            )
          )}
          {recipe.length > 0 && (
            <button
              onClick={() => setShowRecipe(v => !v)}
              className="text-xs text-store-brown-light hover:text-store-green px-2 py-1 rounded-lg hover:bg-store-green-light transition-colors"
            >
              {showRecipe ? 'Hide recipe' : 'Recipe'}
            </button>
          )}
          <button onClick={() => toggleActive(f)} className="text-xs text-store-brown-light hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50">
            Archive
          </button>
        </div>
      </div>

      {showRecipe && recipe.length > 0 && (
        <div className="border-t border-store-tan px-4 py-3 bg-store-cream">
          <p className="text-xs font-bold text-store-brown-light uppercase tracking-wide mb-2">Recipe — per batch</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1">
            {recipe.sort((a, b) => a.name.localeCompare(b.name)).map((r, i) => (
              <div key={i} className="flex justify-between text-xs text-store-brown gap-2">
                <span className="truncate">{r.name}</span>
                <span className="text-store-brown-light whitespace-nowrap font-mono">{r.qty} {r.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
