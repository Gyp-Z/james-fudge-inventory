import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Admin() {
  const [flavors, setFlavors] = useState([])
  const [inventory, setInventory] = useState({}) // flavor_id -> tray_count
  const [newName, setNewName] = useState('')
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
    const { data } = await supabase.from('current_inventory').select('flavor_id, tray_count')
    if (data) {
      const map = {}
      data.forEach((r) => { map[r.flavor_id] = r.tray_count })
      setInventory(map)
    }
  }

  useEffect(() => {
    loadFlavors()
    loadInventory()
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    await supabase.from('flavors').insert({ name: newName.trim(), is_active: true })
    setNewName('')
    await loadFlavors()
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

  if (loading) return <p className="text-store-brown-light text-center py-12">Loading...</p>

  const active = flavors.filter((f) => f.is_active)
  const archived = flavors.filter((f) => !f.is_active)

  // Split active into "needs to make" (low/out) vs "stocked"
  const needsMaking = active.filter((f) => {
    const trays = inventory[f.id] ?? 0
    const threshold = f.low_tray_threshold ?? 2
    return trays <= threshold
  })
  const stocked = active.filter((f) => {
    const trays = inventory[f.id] ?? 0
    const threshold = f.low_tray_threshold ?? 2
    return trays > threshold
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          Products
        </h2>
        <button
          onClick={() => setShowArchived((v) => !v)}
          className="text-xs text-store-brown-light underline hover:text-store-brown"
        >
          {showArchived ? 'Hide Archived' : 'Show Archived'}
        </button>
      </div>

      {/* Needs to Make */}
      {needsMaking.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="font-semibold text-red-700 mb-3">Make Soon ({needsMaking.length})</h3>
          <div className="space-y-2">
            {needsMaking.map((f) => (
              <FlavorRow
                key={f.id}
                f={f}
                trays={inventory[f.id] ?? 0}
                editingThresholdId={editingThresholdId}
                editThreshold={editThreshold}
                setEditingThresholdId={setEditingThresholdId}
                setEditThreshold={setEditThreshold}
                saveThreshold={saveThreshold}
                toggleActive={toggleActive}
              />
            ))}
          </div>
        </div>
      )}

      {/* Stocked */}
      <div>
        <h3 className="font-semibold text-store-brown mb-3">
          {needsMaking.length > 0 ? `Stocked (${stocked.length})` : `Active (${active.length})`}
        </h3>
        <div className="space-y-2">
          {(needsMaking.length > 0 ? stocked : active).map((f) => (
            <FlavorRow
              key={f.id}
              f={f}
              trays={inventory[f.id] ?? 0}
              editingThresholdId={editingThresholdId}
              editThreshold={editThreshold}
              setEditingThresholdId={setEditingThresholdId}
              setEditThreshold={setEditThreshold}
              saveThreshold={saveThreshold}
              toggleActive={toggleActive}
            />
          ))}
          {active.length === 0 && (
            <p className="text-store-brown-light text-sm text-center py-4">No active products</p>
          )}
        </div>
      </div>

      {/* Archived */}
      {showArchived && archived.length > 0 && (
        <div>
          <h3 className="font-semibold text-store-brown-light mb-3">Archived ({archived.length})</h3>
          <div className="space-y-2 opacity-60">
            {archived.map((f) => (
              <div key={f.id} className="bg-store-cream rounded-xl border border-store-tan p-3 flex items-center justify-between">
                <span className="text-sm text-store-brown-light">{f.name}</span>
                <button
                  onClick={() => toggleActive(f)}
                  className="text-xs text-store-green hover:text-store-green-dark px-2 py-1 rounded-lg hover:bg-store-green-light transition-colors"
                >
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

      {/* Add Product — at bottom */}
      <div className="bg-white rounded-xl border border-store-tan p-4 shadow-sm">
        <h3 className="font-semibold text-store-brown mb-3">Add Product</h3>
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Chocolate Peanut Butter"
            className="flex-1 border border-store-tan rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
          />
          <button
            type="submit"
            disabled={adding}
            className="bg-store-green hover:bg-store-green-dark text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            Add
          </button>
        </form>
      </div>
    </div>
  )
}

function FlavorRow({ f, trays, editingThresholdId, editThreshold, setEditingThresholdId, setEditThreshold, saveThreshold, toggleActive }) {
  const isOut = trays === 0
  const isLow = !isOut && trays <= (f.low_tray_threshold ?? 2)

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
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-store-brown-light font-mono">{trays} tray{trays !== 1 ? 's' : ''}</span>
          {editingThresholdId === f.id ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={editThreshold}
                onChange={(e) => setEditThreshold(e.target.value)}
                min="0"
                max="20"
                autoFocus
                className="w-14 border border-store-tan rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
              />
              <span className="text-xs text-store-brown-light">trays</span>
              <button
                onClick={() => saveThreshold(f)}
                className="text-xs bg-store-green text-white px-2 py-1 rounded-lg hover:bg-store-green-dark transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => { setEditingThresholdId(null); setEditThreshold('') }}
                className="text-xs text-store-brown-light hover:text-store-brown px-2 py-1 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setEditingThresholdId(f.id); setEditThreshold(String(f.low_tray_threshold ?? 2)) }}
              className="text-xs text-store-brown-light hover:text-store-green px-2 py-1 rounded-lg hover:bg-store-green-light transition-colors"
            >
              Alert at {f.low_tray_threshold ?? 2} trays
            </button>
          )}
          <button
            onClick={() => toggleActive(f)}
            className="text-xs text-store-brown-light hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
          >
            Archive
          </button>
        </div>
      </div>
    </div>
  )
}
