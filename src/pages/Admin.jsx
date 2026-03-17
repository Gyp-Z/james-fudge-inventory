import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Admin() {
  const [flavors, setFlavors] = useState([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  async function loadFlavors() {
    const { data } = await supabase
      .from('flavors')
      .select('*')
      .order('name')
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
    await supabase
      .from('flavors')
      .update({ is_active: !flavor.is_active })
      .eq('id', flavor.id)
    await loadFlavors()
  }

  if (loading) return <p className="text-gray-400 text-center py-12">Loading...</p>

  const active = flavors.filter((f) => f.is_active)
  const archived = flavors.filter((f) => !f.is_active)

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Admin</h2>

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-3">Add Flavor</h3>
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Chocolate Peanut Butter"
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <button
            type="submit"
            disabled={adding}
            className="bg-amber-700 hover:bg-amber-800 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            Add
          </button>
        </form>
      </div>

      <div>
        <h3 className="font-semibold text-gray-700 mb-3">Active Flavors ({active.length})</h3>
        <div className="space-y-2">
          {active.map((f) => (
            <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between shadow-sm">
              <span className="text-sm font-medium text-gray-800">{f.name}</span>
              <button
                onClick={() => toggleActive(f)}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
              >
                Archive
              </button>
            </div>
          ))}
          {active.length === 0 && <p className="text-gray-400 text-sm text-center py-4">No active flavors</p>}
        </div>
      </div>

      {archived.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-400 mb-3">Archived ({archived.length})</h3>
          <div className="space-y-2">
            {archived.map((f) => (
              <div key={f.id} className="bg-gray-50 rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                <span className="text-sm text-gray-400">{f.name}</span>
                <button
                  onClick={() => toggleActive(f)}
                  className="text-xs text-amber-600 hover:text-amber-700 px-2 py-1 rounded-lg hover:bg-amber-50 transition-colors"
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
