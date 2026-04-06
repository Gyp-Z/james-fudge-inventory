import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Admin() {
  const [flavors, setFlavors] = useState([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editingThresholdId, setEditingThresholdId] = useState(null)
  const [editThreshold, setEditThreshold] = useState('')

  async function loadFlavors() {
    const { data } = await supabase.from('flavors').select('*').order('name')
    setFlavors(data || [])
    setLoading(false)
  }

  useEffect(() => { loadFlavors() }, [])

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

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
        Admin
      </h2>

      <div className="bg-white rounded-xl border border-store-tan p-4 shadow-sm">
        <h3 className="font-semibold text-store-brown mb-3">Add Flavor</h3>
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

      <div>
        <h3 className="font-semibold text-store-brown mb-1">Active Flavors ({active.length})</h3>
        <p className="text-xs text-store-brown-light mb-3">
          "Alert at" controls when a flavor shows as Make Soon on the dashboard.
        </p>
        <div className="space-y-2">
          {active.map((f) => (
            <div key={f.id} className="bg-white rounded-xl border border-store-tan shadow-sm overflow-hidden">
              <div className="p-3 flex items-center justify-between">
                <span className="text-sm font-medium text-store-brown">{f.name}</span>
                <div className="flex items-center gap-3">
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
          ))}
          {active.length === 0 && (
            <p className="text-store-brown-light text-sm text-center py-4">No active flavors</p>
          )}
        </div>
      </div>

      {archived.length > 0 && (
        <div>
          <h3 className="font-semibold text-store-brown-light mb-3">Archived ({archived.length})</h3>
          <div className="space-y-2">
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
    </div>
  )
}
