import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Ingredients() {
  const [ingredients, setIngredients] = useState([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  async function loadIngredients() {
    const { data } = await supabase
      .from('ingredients')
      .select('*')
      .eq('is_active', true)
      .order('needs_reorder', { ascending: false })
      .order('name')
    setIngredients(data || [])
    setLoading(false)
  }

  useEffect(() => { loadIngredients() }, [])

  async function toggleReorder(ingredient) {
    await supabase
      .from('ingredients')
      .update({ needs_reorder: !ingredient.needs_reorder, last_checked: new Date().toISOString() })
      .eq('id', ingredient.id)
    await loadIngredients()
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    await supabase.from('ingredients').insert({ name: newName.trim() })
    setNewName('')
    await loadIngredients()
    setAdding(false)
  }

  if (loading) return <p className="text-store-brown-light text-center py-12">Loading...</p>

  const needsReorder = ingredients.filter((i) => i.needs_reorder)
  const inStock = ingredients.filter((i) => !i.needs_reorder)

  return (
    <div className="space-y-6">
      <h2
        className="text-2xl font-bold text-store-brown"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Ingredients
      </h2>

      {needsReorder.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="font-semibold text-red-700 mb-3">Needs to Order ({needsReorder.length})</h3>
          <div className="space-y-2">
            {needsReorder.map((ing) => (
              <div key={ing.id} className="flex items-center justify-between">
                <span className="text-sm font-medium text-red-700 flex items-center gap-2">
                  <span>⚠️</span> {ing.name}
                </span>
                <button
                  onClick={() => toggleReorder(ing)}
                  className="text-xs bg-store-green text-white px-3 py-1.5 rounded-lg font-medium hover:bg-store-green-dark transition-colors"
                >
                  Mark In Stock
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-store-tan p-4 shadow-sm">
        <h3 className="font-semibold text-store-brown mb-3">Add Ingredient</h3>
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Heavy Cream"
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
        <h3 className="font-semibold text-store-brown mb-3">In Stock ({inStock.length})</h3>
        <div className="space-y-2">
          {inStock.map((ing) => (
            <div
              key={ing.id}
              className="bg-white rounded-xl border border-store-tan p-3 flex items-center justify-between shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className="text-green-500 text-sm">✓</span>
                <span className="text-sm font-medium text-store-brown">{ing.name}</span>
              </div>
              <button
                onClick={() => toggleReorder(ing)}
                className="text-xs text-store-brown-light hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
              >
                Need to Order
              </button>
            </div>
          ))}
          {inStock.length === 0 && (
            <p className="text-store-brown-light text-sm text-center py-4">All ingredients need reordering</p>
          )}
        </div>
      </div>
    </div>
  )
}
