import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

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
  const { session } = useAuth()
  const isAdmin = !!session

  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)

  // Edit quantity state
  const [editingId, setEditingId] = useState(null)
  const [editQty, setEditQty] = useState('')
  const [saving, setSaving] = useState(false)

  // Edit threshold state
  const [editingThresholdId, setEditingThresholdId] = useState(null)
  const [editThreshold, setEditThreshold] = useState('')

  // Add form state
  const [newName, setNewName] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [newThreshold, setNewThreshold] = useState('')
  const [adding, setAdding] = useState(false)

  // Archive toggle
  const [showArchived, setShowArchived] = useState(false)

  async function loadIngredients() {
    let query = supabase.from('ingredients').select('*').order('name')
    if (!showArchived) query = query.eq('is_active', true)
    const { data } = await query
    setIngredients(data || [])
    setLoading(false)
  }

  useEffect(() => { loadIngredients() }, [showArchived])

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

  async function saveThreshold(ingredient) {
    const val = parseFloat(editThreshold)
    if (isNaN(val) || val < 0) return
    await supabase.from('ingredients').update({ low_stock_threshold: val }).eq('id', ingredient.id)
    setEditingThresholdId(null)
    setEditThreshold('')
    await loadIngredients()
  }

  async function handleArchive(ingredient) {
    await supabase.from('ingredients').update({ is_active: false }).eq('id', ingredient.id)
    await loadIngredients()
  }

  async function handleUnarchive(ingredient) {
    await supabase.from('ingredients').update({ is_active: true }).eq('id', ingredient.id)
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

  const activeIngredients = ingredients.filter(i => i.is_active !== false)
  const archivedIngredients = ingredients.filter(i => i.is_active === false)
  const needsOrder = activeIngredients.filter(i => getStatus(i.quantity, i.low_stock_threshold) !== 'ok')
  const inStock = activeIngredients.filter(i => getStatus(i.quantity, i.low_stock_threshold) === 'ok')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          Ingredients
        </h2>
        <button
          onClick={() => setShowArchived((v) => !v)}
          className="text-xs text-store-brown-light underline hover:text-store-brown"
        >
          {showArchived ? 'Hide Archived' : 'Show Archived'}
        </button>
      </div>

      {needsOrder.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="font-semibold text-red-700 mb-3">Needs to Order ({needsOrder.length})</h3>
          <div className="space-y-2">
            {needsOrder.map(ing => (
              <IngredientRow key={ing.id} ing={ing} isAdmin={isAdmin}
                editingId={editingId} editQty={editQty} saving={saving}
                onEditStart={(i) => { setEditingId(i.id); setEditQty(String(i.quantity)) }}
                onEditChange={setEditQty} onSave={saveQuantity}
                onEditCancel={() => { setEditingId(null); setEditQty('') }}
                editingThresholdId={editingThresholdId} editThreshold={editThreshold}
                onThresholdStart={(i) => { setEditingThresholdId(i.id); setEditThreshold(String(i.low_stock_threshold ?? 0)) }}
                onThresholdChange={setEditThreshold} onThresholdSave={saveThreshold}
                onThresholdCancel={() => { setEditingThresholdId(null); setEditThreshold('') }}
                onArchive={handleArchive} onUnarchive={handleUnarchive}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-semibold text-store-brown mb-3">In Stock ({inStock.length})</h3>
        <div className="space-y-2">
          {inStock.map(ing => (
            <IngredientRow key={ing.id} ing={ing} isAdmin={isAdmin}
              editingId={editingId} editQty={editQty} saving={saving}
              onEditStart={(i) => { setEditingId(i.id); setEditQty(String(i.quantity)) }}
              onEditChange={setEditQty} onSave={saveQuantity}
              onEditCancel={() => { setEditingId(null); setEditQty('') }}
              editingThresholdId={editingThresholdId} editThreshold={editThreshold}
              onThresholdStart={(i) => { setEditingThresholdId(i.id); setEditThreshold(String(i.low_stock_threshold ?? 0)) }}
              onThresholdChange={setEditThreshold} onThresholdSave={saveThreshold}
              onThresholdCancel={() => { setEditingThresholdId(null); setEditThreshold('') }}
              onArchive={handleArchive} onUnarchive={handleUnarchive}
            />
          ))}
          {inStock.length === 0 && (
            <p className="text-store-brown-light text-sm text-center py-4">All ingredients need reordering</p>
          )}
        </div>
      </div>

      {showArchived && archivedIngredients.length > 0 && (
        <div>
          <h3 className="font-semibold text-store-brown-light mb-3">Archived ({archivedIngredients.length})</h3>
          <div className="space-y-2 opacity-60">
            {archivedIngredients.map(ing => (
              <IngredientRow key={ing.id} ing={ing} isAdmin={isAdmin}
                editingId={editingId} editQty={editQty} saving={saving}
                onEditStart={(i) => { setEditingId(i.id); setEditQty(String(i.quantity)) }}
                onEditChange={setEditQty} onSave={saveQuantity}
                onEditCancel={() => { setEditingId(null); setEditQty('') }}
                editingThresholdId={editingThresholdId} editThreshold={editThreshold}
                onThresholdStart={(i) => { setEditingThresholdId(i.id); setEditThreshold(String(i.low_stock_threshold ?? 0)) }}
                onThresholdChange={setEditThreshold} onThresholdSave={saveThreshold}
                onThresholdCancel={() => { setEditingThresholdId(null); setEditThreshold('') }}
                onArchive={handleArchive} onUnarchive={handleUnarchive}
              />
            ))}
          </div>
        </div>
      )}
      {showArchived && archivedIngredients.length === 0 && (
        <p className="text-store-brown-light text-sm text-center py-2">No archived ingredients</p>
      )}

      {isAdmin && (
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
                placeholder="Unit"
                className="w-28 border border-store-tan rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
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
      )}
    </div>
  )
}

function IngredientRow({
  ing, isAdmin,
  editingId, editQty, saving, onEditStart, onEditChange, onSave, onEditCancel,
  editingThresholdId, editThreshold, onThresholdStart, onThresholdChange, onThresholdSave, onThresholdCancel,
  onArchive, onUnarchive,
}) {
  const isEditing = editingId === ing.id
  const isEditingThreshold = editingThresholdId === ing.id

  return (
    <div className="bg-white rounded-xl border border-store-tan shadow-sm overflow-hidden">
      <div className="flex items-start sm:items-center justify-between px-4 py-3 gap-3 flex-col sm:flex-row">
        <div className="flex items-center gap-3 flex-1">
          <span className="text-sm font-medium text-store-brown">{ing.name}</span>
          <StatusBadge quantity={ing.quantity} threshold={ing.low_stock_threshold} />
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <span className="text-sm text-store-brown-light font-mono">{ing.quantity} {ing.unit}</span>

          {!isEditing && !isEditingThreshold && isAdmin && ing.is_active && (
            <>
              {isEditingThreshold ? null : (
                <button
                  onClick={() => onThresholdStart(ing)}
                  className="text-xs text-store-brown-light hover:text-store-green px-2 py-1 rounded-lg hover:bg-store-green-light transition-colors"
                >
                  Alert at {ing.low_stock_threshold ?? 0} {ing.unit}
                </button>
              )}
              <button
                onClick={() => onEditStart(ing)}
                className="text-xs text-store-brown-light hover:text-store-green px-2 py-1 rounded-lg hover:bg-store-green-light transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => onArchive(ing)}
                className="text-xs text-store-brown-light hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
              >
                Archive
              </button>
            </>
          )}

          {!isEditing && !isEditingThreshold && !ing.is_active && (
            <button
              onClick={() => onUnarchive(ing)}
              className="text-xs text-store-brown-light hover:text-store-green px-2 py-1 rounded-lg hover:bg-store-green-light transition-colors"
            >
              Unarchive
            </button>
          )}
        </div>
      </div>

      {/* Edit quantity panel */}
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
            onClick={() => onSave(ing)}
            disabled={saving}
            className="bg-store-green text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-store-green-dark transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onEditCancel}
            className="text-xs text-store-brown-light hover:text-store-brown px-3 py-1.5 rounded-lg hover:bg-white transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Edit threshold panel */}
      {isEditingThreshold && (
        <div className="border-t border-store-tan px-4 py-3 bg-store-cream flex items-center gap-2">
          <span className="text-xs text-store-brown-light">Alert when below</span>
          <input
            type="number"
            value={editThreshold}
            onChange={e => onThresholdChange(e.target.value)}
            min="0"
            step="0.5"
            autoFocus
            className="w-20 border border-store-tan rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-white"
          />
          <span className="text-sm text-store-brown-light">{ing.unit}</span>
          <button
            onClick={() => onThresholdSave(ing)}
            className="bg-store-green text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-store-green-dark transition-colors"
          >
            Save
          </button>
          <button
            onClick={onThresholdCancel}
            className="text-xs text-store-brown-light hover:text-store-brown px-3 py-1.5 rounded-lg hover:bg-white transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
