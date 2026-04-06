import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function getStatus(quantity, threshold) {
  if (quantity === 0) return 'out'
  if (quantity <= threshold) return 'low'
  return 'ok'
}

function StatusBadge({ quantity, threshold }) {
  const status = getStatus(quantity, threshold)
  if (status === 'out') return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Out</span>
  )
  if (status === 'low') return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Low</span>
  )
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-store-green-light text-store-green">OK</span>
  )
}

export default function Ingredients() {
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editQty, setEditQty] = useState('')
  const [saving, setSaving] = useState(false)

  // Add form state
  const [newName, setNewName] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [newThreshold, setNewThreshold] = useState('')
  const [adding, setAdding] = useState(false)

  async function loadIngredients() {
    const { data } = await supabase
      .from('ingredients')
      .select('*')
      .eq('is_active', true)
      .order('name')
    setIngredients(data || [])
    setLoading(false)
  }

  useEffect(() => { loadIngredients() }, [])

  async function saveQuantity(ingredient) {
    const qty = parseFloat(editQty)
    if (isNaN(qty) || qty < 0) return
    setSaving(true)
    await supabase
      .from('ingredients')
      .update({ quantity: qty, last_checked: new Date().toISOString() })
      .eq('id', ingredient.id)
    setEditingId(null)
    setEditQty('')
    setSaving(false)
    await loadIngredients()
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim() || !newUnit.trim()) return
    setAdding(true)
    await supabase.from('ingredients').insert({
      name: newName.trim(),
      unit: newUnit.trim(),
      quantity: 0,
      low_stock_threshold: parseFloat(newThreshold) || 0,
    })
    setNewName('')
    setNewUnit('')
    setNewThreshold('')
    setAdding(false)
    await loadIngredients()
  }

  if (loading) return <p className="text-store-brown-light text-center py-12">Loading...</p>

  const needsOrder = ingredients.filter(i => getStatus(i.quantity, i.low_stock_threshold) !== 'ok')
  const inStock = ingredients.filter(i => getStatus(i.quantity, i.low_stock_threshold) === 'ok')

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
        Ingredients
      </h2>

      {/* Needs to Order */}
      {needsOrder.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
          <h3 className="font-semibold text-red-700 mb-3">Needs to Order ({needsOrder.length})</h3>
          {needsOrder.map(ing => (
            <IngredientRow
              key={ing.id}
              ing={ing}
              editingId={editingId}
              editQty={editQty}
              saving={saving}
              onEditStart={() => { setEditingId(ing.id); setEditQty(String(ing.quantity)) }}
              onEditChange={setEditQty}
              onSave={() => saveQuantity(ing)}
              onCancel={() => { setEditingId(null); setEditQty('') }}
            />
          ))}
        </div>
      )}

      {/* In Stock */}
      <div>
        <h3 className="font-semibold text-store-brown mb-3">In Stock ({inStock.length})</h3>
        <div className="space-y-2">
          {inStock.map(ing => (
            <IngredientRow
              key={ing.id}
              ing={ing}
              editingId={editingId}
              editQty={editQty}
              saving={saving}
              onEditStart={() => { setEditingId(ing.id); setEditQty(String(ing.quantity)) }}
              onEditChange={setEditQty}
              onSave={() => saveQuantity(ing)}
              onCancel={() => { setEditingId(null); setEditQty('') }}
            />
          ))}
          {inStock.length === 0 && (
            <p className="text-store-brown-light text-sm text-center py-4">All ingredients need reordering</p>
          )}
        </div>
      </div>

      {/* Add Ingredient */}
      <div className="bg-white rounded-xl border border-store-tan p-4 shadow-sm">
        <h3 className="font-semibold text-store-brown mb-3">Add Ingredient</h3>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Name (e.g. Heavy Cream)"
              className="flex-1 border border-store-tan rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
            />
            <input
              type="text"
              value={newUnit}
              onChange={e => setNewUnit(e.target.value)}
              placeholder="Unit (bags, cans…)"
              className="w-36 border border-store-tan rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
            />
            <input
              type="number"
              value={newThreshold}
              onChange={e => setNewThreshold(e.target.value)}
              placeholder="Alert at"
              min="0"
              step="0.5"
              className="w-24 border border-store-tan rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
            />
          </div>
          <button
            type="submit"
            disabled={adding || !newName.trim() || !newUnit.trim()}
            className="w-full bg-store-green hover:bg-store-green-dark text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add Ingredient'}
          </button>
        </form>
      </div>
    </div>
  )
}

function IngredientRow({ ing, editingId, editQty, saving, onEditStart, onEditChange, onSave, onCancel }) {
  const isEditing = editingId === ing.id

  return (
    <div className="bg-white rounded-xl border border-store-tan shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-medium text-store-brown truncate">{ing.name}</span>
          <StatusBadge quantity={ing.quantity} threshold={ing.low_stock_threshold} />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm text-store-brown-light font-mono">
            {ing.quantity} {ing.unit}
          </span>
          {!isEditing && (
            <button
              onClick={onEditStart}
              className="text-xs text-store-brown-light hover:text-store-green px-2 py-1 rounded-lg hover:bg-store-green-light transition-colors"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="border-t border-store-tan px-4 py-3 bg-store-cream flex items-center gap-2">
          <input
            type="number"
            value={editQty}
            onChange={e => onEditChange(e.target.value)}
            min="0"
            step="0.5"
            autoFocus
            className="w-24 border border-store-tan rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-white"
          />
          <span className="text-sm text-store-brown-light">{ing.unit}</span>
          <button
            onClick={onSave}
            disabled={saving}
            className="bg-store-green text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-store-green-dark transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onCancel}
            className="text-xs text-store-brown-light hover:text-store-brown px-3 py-1.5 rounded-lg hover:bg-white transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
