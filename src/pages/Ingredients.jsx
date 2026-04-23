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

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Ingredients() {
  const { session } = useAuth()
  const isAdmin = !!session

  const [ingredients, setIngredients] = useState([])
  const [restocks, setRestocks] = useState({}) // { ingredient_id: [restock, ...] }
  const [loading, setLoading] = useState(true)

  // Edit state
  const [editingId, setEditingId] = useState(null)
  const [editQty, setEditQty] = useState('')
  const [saving, setSaving] = useState(false)

  // Restock state
  const [restockingId, setRestockingId] = useState(null)
  const [restockQty, setRestockQty] = useState('')
  const [restockNotes, setRestockNotes] = useState('')
  const [restockSaving, setRestockSaving] = useState(false)

  // Add form state
  const [newName, setNewName] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [newThreshold, setNewThreshold] = useState('')
  const [adding, setAdding] = useState(false)

  // History toggle
  const [showHistoryId, setShowHistoryId] = useState(null)

  // Archive toggle
  const [showArchived, setShowArchived] = useState(false)

  async function loadIngredients() {
    let query = supabase.from('ingredients').select('*').order('name')
    if (!showArchived) query = query.eq('is_active', true)
    const { data } = await query
    setIngredients(data || [])
    setLoading(false)
  }

  async function handleArchive(ingredient) {
    await supabase
      .from('ingredients')
      .update({ is_active: false })
      .eq('id', ingredient.id)
    await loadIngredients()
  }

  async function handleUnarchive(ingredient) {
    await supabase
      .from('ingredients')
      .update({ is_active: true })
      .eq('id', ingredient.id)
    await loadIngredients()
  }

  async function loadRestocks() {
    const { data } = await supabase
      .from('ingredient_restocks')
      .select('*')
      .order('restocked_at', { ascending: false })
    if (data) {
      const grouped = {}
      data.forEach((r) => {
        if (!grouped[r.ingredient_id]) grouped[r.ingredient_id] = []
        if (grouped[r.ingredient_id].length < 3) grouped[r.ingredient_id].push(r)
      })
      setRestocks(grouped)
    }
  }

  useEffect(() => {
    loadIngredients()
    loadRestocks()
  }, [showArchived])

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

  async function logRestock(ingredient) {
    const qty = parseFloat(restockQty)
    if (isNaN(qty) || qty <= 0) return
    setRestockSaving(true)
    await supabase.from('ingredient_restocks').insert({
      ingredient_id: ingredient.id,
      quantity_added: qty,
      notes: restockNotes.trim() || null,
    })
    await supabase
      .from('ingredients')
      .update({ quantity: ingredient.quantity + qty, last_checked: new Date().toISOString() })
      .eq('id', ingredient.id)
    setRestockingId(null)
    setRestockQty('')
    setRestockNotes('')
    setRestockSaving(false)
    await loadIngredients()
    await loadRestocks()
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

  const rowProps = { isAdmin, editingId, editQty, saving, restockingId, restockQty, restockNotes, restockSaving, showHistoryId, restocks, showArchived }
  const rowHandlers = {
    onEditStart: (ing) => { setEditingId(ing.id); setEditQty(String(ing.quantity)) },
    onEditChange: setEditQty,
    onSave: saveQuantity,
    onEditCancel: () => { setEditingId(null); setEditQty('') },
    onRestockStart: (ing) => { setRestockingId(ing.id); setRestockQty('') },
    onRestockQtyChange: setRestockQty,
    onRestockNotesChange: setRestockNotes,
    onRestockSave: logRestock,
    onRestockCancel: () => { setRestockingId(null); setRestockQty(''); setRestockNotes('') },
    onToggleHistory: (id) => setShowHistoryId(showHistoryId === id ? null : id),
    onArchive: handleArchive,
    onUnarchive: handleUnarchive,
  }

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

      {/* Order Report */}
      {needsOrder.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="font-semibold text-red-700 mb-3">Needs to Order ({needsOrder.length})</h3>
          <div className="space-y-2">
            {needsOrder.map(ing => (
              <IngredientRow key={ing.id} ing={ing} {...rowProps} {...rowHandlers} />
            ))}
          </div>
        </div>
      )}

      {/* In Stock */}
      <div>
        <h3 className="font-semibold text-store-brown mb-3">In Stock ({inStock.length})</h3>
        <div className="space-y-2">
          {inStock.map(ing => (
            <IngredientRow key={ing.id} ing={ing} {...rowProps} {...rowHandlers} />
          ))}
          {inStock.length === 0 && (
            <p className="text-store-brown-light text-sm text-center py-4">All ingredients need reordering</p>
          )}
        </div>
      </div>

      {/* Archived */}
      {showArchived && archivedIngredients.length > 0 && (
        <div>
          <h3 className="font-semibold text-store-brown-light mb-3">Archived ({archivedIngredients.length})</h3>
          <div className="space-y-2 opacity-60">
            {archivedIngredients.map(ing => (
              <IngredientRow key={ing.id} ing={ing} {...rowProps} {...rowHandlers} />
            ))}
          </div>
        </div>
      )}
      {showArchived && archivedIngredients.length === 0 && (
        <p className="text-store-brown-light text-sm text-center py-2">No archived ingredients</p>
      )}

      {/* Add Ingredient — admin only */}
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
      )}
    </div>
  )
}

function IngredientRow({
  ing, isAdmin,
  editingId, editQty, saving, onEditStart, onEditChange, onSave, onEditCancel,
  restockingId, restockQty, restockNotes, restockSaving, onRestockStart, onRestockQtyChange, onRestockNotesChange, onRestockSave, onRestockCancel,
  showHistoryId, restocks, onToggleHistory, showArchived, onArchive, onUnarchive,
}) {
  const isEditing = editingId === ing.id
  const isRestocking = restockingId === ing.id
  const isShowingHistory = showHistoryId === ing.id
  const history = restocks[ing.id] || []

  return (
    <div className="bg-white rounded-xl border border-store-tan shadow-sm overflow-hidden">
      {/* Main row */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-medium text-store-brown truncate">{ing.name}</span>
          <StatusBadge quantity={ing.quantity} threshold={ing.low_stock_threshold} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-store-brown-light font-mono">{ing.quantity} {ing.unit}</span>
          {!isEditing && !isRestocking && (
            <>
              {!ing.is_active ? (
                <button
                  onClick={() => onUnarchive(ing)}
                  className="text-xs text-store-brown-light hover:text-store-green px-2 py-1 rounded-lg hover:bg-store-green-light transition-colors"
                >
                  Unarchive
                </button>
              ) : (
                <>
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => onEditStart(ing)}
                        className="text-xs text-store-brown-light hover:text-store-green px-2 py-1 rounded-lg hover:bg-store-green-light transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onRestockStart(ing)}
                        className="text-xs bg-store-green text-white px-2 py-1 rounded-lg hover:bg-store-green-dark transition-colors"
                      >
                        + Restock
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => onArchive(ing)}
                    className="text-xs text-store-brown-light hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Archive
                  </button>
                </>
              )}
            </>
          )}
          {history.length > 0 && !isEditing && !isRestocking && (
            <button
              onClick={() => onToggleHistory(ing.id)}
              className="text-xs text-store-brown-light hover:text-store-brown px-2 py-1 rounded-lg hover:bg-store-cream transition-colors"
            >
              {isShowingHistory ? '▲' : `${history.length} restock${history.length !== 1 ? 's' : ''} ▼`}
            </button>
          )}
        </div>
      </div>

      {/* Edit panel */}
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

      {/* Restock panel */}
      {isRestocking && (
        <div className="border-t border-store-tan px-4 py-3 bg-store-green-light space-y-2">
          <p className="text-xs font-semibold text-store-green uppercase tracking-wide">Log Restock</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={restockQty}
              onChange={e => onRestockQtyChange(e.target.value)}
              placeholder="Qty received"
              min="0.5"
              step="0.5"
              autoFocus
              className="w-28 border border-store-tan rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-white"
            />
            <span className="text-sm text-store-brown-light">{ing.unit}</span>
          </div>
          <input
            type="text"
            value={restockNotes}
            onChange={e => onRestockNotesChange(e.target.value)}
            placeholder="Notes (optional)"
            className="w-full border border-store-tan rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-white"
          />
          <div className="flex gap-2">
            <button
              onClick={() => onRestockSave(ing)}
              disabled={restockSaving || !restockQty}
              className="bg-store-green text-white text-xs font-semibold px-4 py-1.5 rounded-lg hover:bg-store-green-dark transition-colors disabled:opacity-50"
            >
              {restockSaving ? 'Saving…' : 'Save Restock'}
            </button>
            <button
              onClick={onRestockCancel}
              className="text-xs text-store-brown-light hover:text-store-brown px-3 py-1.5 rounded-lg hover:bg-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Restock history */}
      {isShowingHistory && history.length > 0 && (
        <div className="border-t border-store-tan px-4 py-2 bg-store-cream space-y-1">
          {history.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-xs text-store-brown-light">
              <span>{formatDate(r.restocked_at)}{r.notes ? ` — ${r.notes}` : ''}</span>
              <span className="font-medium text-store-green">+{r.quantity_added} {ing.unit}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
