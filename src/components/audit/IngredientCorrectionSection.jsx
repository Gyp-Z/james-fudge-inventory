import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import ConfirmDialog from '../ConfirmDialog'
import { logInventoryAdjustment } from '../../utils/inventoryActions'

// Capability #5 — set an ingredient's quantity directly (manual recount), with an audit row.
export default function IngredientCorrectionSection({ ingredients, onDone }) {
  const [ingId, setIngId] = useState('')
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)

  const ing = ingredients.find((i) => i.id === ingId)
  const current = ing?.quantity ?? 0
  const newVal = value === '' ? null : Number(value)
  const canSave = !!ing && newVal != null && !Number.isNaN(newVal) && newVal !== current

  function pick(id) {
    setIngId(id)
    const i = ingredients.find((x) => x.id === id)
    setValue(i ? String(i.quantity ?? 0) : '')
    setNote(null)
  }

  async function doSave() {
    setBusy(true)
    await supabase.from('ingredients').update({ quantity: newVal }).eq('id', ingId)
    await logInventoryAdjustment({
      target_type: 'ingredient', target_id: ingId, field: 'quantity',
      old_value: current, new_value: newVal, reason,
    })
    setBusy(false)
    setConfirmOpen(false)
    setNote(`${ing.name} set to ${newVal} ${ing.unit} (was ${current}).`)
    setReason('')
    onDone()
  }

  const inputCls = 'w-full border border-store-tan rounded-xl px-3 py-2 text-sm bg-white text-store-brown focus:outline-none focus:ring-2 focus:ring-store-green'

  return (
    <div className="space-y-3">
      <select value={ingId} onChange={(e) => pick(e.target.value)} className={inputCls}>
        <option value="">Select an ingredient…</option>
        {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>

      {ing && (
        <>
          <span className="text-sm text-store-brown-light">Current: <span className="font-mono text-store-brown">{current} {ing.unit}</span></span>
          <label className="text-xs text-store-brown-light block">
            New quantity ({ing.unit})
            <input type="number" min="0" step="any" value={value} onChange={(e) => setValue(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional, e.g. physical recount)" className={inputCls} />
          <button onClick={() => setConfirmOpen(true)} disabled={!canSave} className="w-full bg-store-green hover:bg-store-green-dark text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
            Set quantity
          </button>
        </>
      )}

      {note && <p className="text-sm text-store-green bg-store-green-light rounded-xl px-3 py-2">{note}</p>}

      <ConfirmDialog
        open={confirmOpen}
        title="Overwrite quantity?"
        message={ing?.name}
        isDangerous
        busy={busy}
        confirmText="Overwrite"
        onConfirm={doSave}
        onCancel={() => setConfirmOpen(false)}
        summary={<div className="font-mono">{current} → {newVal} {ing?.unit}</div>}
      />
    </div>
  )
}
