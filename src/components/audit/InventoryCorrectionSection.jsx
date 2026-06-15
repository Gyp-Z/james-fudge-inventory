import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import ConfirmDialog from '../ConfirmDialog'
import { logInventoryAdjustment } from '../../utils/inventoryActions'

// Capability #4 — direct physical-recount override of current_inventory tray/barrel counts.
export default function InventoryCorrectionSection({ flavors, inventory, onDone }) {
  const [flavorId, setFlavorId] = useState('')
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)

  const flavor = flavors.find((f) => f.id === flavorId)
  const isPopcorn = flavor?.product_type === 'popcorn'
  const field = isPopcorn ? 'barrel_count' : 'tray_count'
  const label = isPopcorn ? 'barrels' : 'trays'
  const current = flavor ? (inventory[flavorId]?.[field] ?? 0) : 0
  const newVal = value === '' ? null : Number(value)
  const canSave = !!flavor && newVal != null && !Number.isNaN(newVal) && newVal !== current

  function pick(id) {
    setFlavorId(id)
    const f = flavors.find((x) => x.id === id)
    const fld = f?.product_type === 'popcorn' ? 'barrel_count' : 'tray_count'
    setValue(String(inventory[id]?.[fld] ?? 0))
    setNote(null)
  }

  async function doSave() {
    setBusy(true)
    await supabase
      .from('current_inventory')
      .upsert({ flavor_id: flavorId, [field]: newVal, updated_at: new Date().toISOString() }, { onConflict: 'flavor_id' })
    await logInventoryAdjustment({
      target_type: 'flavor', target_id: flavorId, field,
      old_value: current, new_value: newVal, reason,
    })
    setBusy(false)
    setConfirmOpen(false)
    setNote(`${flavor.name} ${label} set to ${newVal} (was ${current}).`)
    setReason('')
    onDone()
  }

  const inputCls = 'w-full border border-store-tan rounded-xl px-3 py-2 text-sm bg-white text-store-brown focus:outline-none focus:ring-2 focus:ring-store-green'

  return (
    <div className="space-y-3">
      {flavor?.is_component && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Note: the Caramel count shown on the Dashboard is computed forward from batch logs, so a
          direct override here may be recomputed away. Prefer fixing batches/SSC entries.
        </p>
      )}
      <select value={flavorId} onChange={(e) => pick(e.target.value)} className={inputCls}>
        <option value="">Select a flavor…</option>
        {flavors.map((f) => (
          <option key={f.id} value={f.id}>{f.name}{f.product_type === 'popcorn' ? ' · popcorn' : ''}</option>
        ))}
      </select>

      {flavor && (
        <>
          <div className="flex items-center gap-3">
            <span className="text-sm text-store-brown-light">Current: <span className="font-mono text-store-brown">{current} {label}</span></span>
          </div>
          <label className="text-xs text-store-brown-light">
            New count ({label})
            <input type="number" min="0" step="any" value={value} onChange={(e) => setValue(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional, e.g. physical recount)" className={inputCls} />
          <button onClick={() => setConfirmOpen(true)} disabled={!canSave} className="w-full bg-store-green hover:bg-store-green-dark text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
            Set {label} count
          </button>
        </>
      )}

      {note && <p className="text-sm text-store-green bg-store-green-light rounded-xl px-3 py-2">{note}</p>}

      <ConfirmDialog
        open={confirmOpen}
        title="Overwrite count?"
        message={`${flavor?.name} ${label}`}
        isDangerous
        busy={busy}
        confirmText="Overwrite"
        onConfirm={doSave}
        onCancel={() => setConfirmOpen(false)}
        summary={<div className="font-mono">{current} → {newVal} {label}</div>}
      />
    </div>
  )
}
