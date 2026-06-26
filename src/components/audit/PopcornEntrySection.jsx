import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import ConfirmDialog from '../ConfirmDialog'
import { applyPopcornEntry, reversePopcornEntry } from '../../utils/inventoryActions'

const EMPTY = { flavorId: '', barrels_added: 0, barrels_sold: 0, in_progress_barrels: 0 }

// Popcorn equivalent of ShiftEntrySection — add / delete barrel movements for the chosen
// date, firing the same shelf-count + shelf_bucket_logs effects the live Products submit does.
// barrels_sold = barrels bucketed off the shelf to sell (bucketing popcorn IS a sale).
export default function PopcornEntrySection({ pickedDate, flavors, onDone }) {
  const popcorn = flavors.filter((f) => f.product_type === 'popcorn' && f.is_active)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY)
  const [confirmSave, setConfirmSave] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)

  const flavor = flavors.find((f) => f.id === form.flavorId)
  const nameById = Object.fromEntries(flavors.map((f) => [f.id, f.name]))

  // shelf_bucket_logs is dated by logged_at only, so window the picked day's timestamps.
  const loadLogs = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('shelf_bucket_logs')
      .select('id, flavor_id, barrels_added, barrels_used, logged_at')
      .gte('logged_at', `${pickedDate}T00:00:00`)
      .lte('logged_at', `${pickedDate}T23:59:59`)
      .order('logged_at')
    setLogs((data || []).filter((b) => (b.barrels_added ?? 0) > 0 || (b.barrels_used ?? 0) > 0))
    setLoading(false)
  }, [pickedDate])

  useEffect(() => { loadLogs() }, [loadLogs])

  function set(field, value) { setForm((p) => ({ ...p, [field]: value })) }
  function resetForm() { setForm(EMPTY); setNote(null) }

  function buildValues() {
    return {
      barrels_added: Number(form.barrels_added) || 0,
      barrels_sold: Number(form.barrels_sold) || 0,
      in_progress_barrels: Number(form.in_progress_barrels) || 0,
    }
  }

  async function doSave() {
    setBusy(true)
    await applyPopcornEntry(flavor, pickedDate, buildValues())
    setBusy(false)
    setConfirmSave(false)
    setNote(`Recorded ${flavor.name} barrels for ${pickedDate}.`)
    resetForm()
    await loadLogs()
    onDone()
  }

  async function doDelete() {
    setBusy(true)
    await reversePopcornEntry(deleteTarget.id)
    setBusy(false)
    setNote(`Removed barrel movement for ${nameById[deleteTarget.flavor_id] ?? 'popcorn'}.`)
    setDeleteTarget(null)
    await loadLogs()
    onDone()
  }

  const v = buildValues()
  const canSave = !!flavor && (v.barrels_added > 0 || v.barrels_sold > 0 || v.in_progress_barrels > 0)
  const numCls = 'w-full border border-store-tan rounded-xl px-3 py-2 text-sm bg-white text-store-brown focus:outline-none focus:ring-2 focus:ring-store-green'

  return (
    <div className="space-y-4">
      {/* Existing barrel movements for this date */}
      <div>
        <h4 className="text-xs font-bold text-store-brown-light uppercase tracking-wide mb-2">
          Barrel movements on {pickedDate}
        </h4>
        {loading ? (
          <p className="text-store-brown-light text-sm py-2">Loading…</p>
        ) : logs.length === 0 ? (
          <p className="text-store-brown-light text-sm py-2">No barrel movements on this date.</p>
        ) : (
          <div className="space-y-2">
            {logs.map((b) => (
              <div key={b.id} className="bg-white rounded-xl border border-store-tan p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-store-brown truncate">{nameById[b.flavor_id] ?? '?'}</div>
                  <div className="text-xs text-store-brown-light">
                    {(b.barrels_added ?? 0) > 0 && <span>added {b.barrels_added}</span>}
                    {(b.barrels_added ?? 0) > 0 && (b.barrels_used ?? 0) > 0 && <span> · </span>}
                    {(b.barrels_used ?? 0) > 0 && <span>sold {b.barrels_used}</span>}
                  </div>
                </div>
                <button onClick={() => setDeleteTarget(b)} className="text-xs font-semibold text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors shrink-0">Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add form */}
      <div className="bg-white rounded-xl border border-store-tan p-3 space-y-3">
        <h4 className="font-semibold text-store-brown text-sm">Add a barrel movement</h4>
        <select value={form.flavorId} onChange={(e) => set('flavorId', e.target.value)} className={numCls}>
          <option value="">Select a popcorn flavor…</option>
          {popcorn.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['barrels_added', 'Barrels added'],
            ['barrels_sold', 'Barrels sold'],
            ['in_progress_barrels', 'In-progress'],
          ].map(([field, label]) => (
            <label key={field} className="text-xs text-store-brown-light">
              {label}
              <input type="number" min="0" value={form[field]} onChange={(e) => set(field, e.target.value)} className={`${numCls} mt-1`} />
            </label>
          ))}
        </div>
        <p className="text-xs text-store-brown-light">
          “Barrels sold” = barrels bucketed off the shelf to sell (bucketing popcorn counts as a sale).
        </p>
        <button onClick={() => setConfirmSave(true)} disabled={!canSave} className="w-full bg-store-green hover:bg-store-green-dark text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
          Add movement
        </button>
      </div>

      {note && <p className="text-sm text-store-green bg-store-green-light rounded-xl px-3 py-2">{note}</p>}

      <ConfirmDialog
        open={confirmSave}
        title="Record barrels?"
        message={`${flavor?.name} on ${pickedDate}.`}
        busy={busy}
        confirmText="Add"
        onConfirm={doSave}
        onCancel={() => setConfirmSave(false)}
        summary={
          <div className="space-y-0.5">
            <div>Added: {v.barrels_added} · Sold: {v.barrels_sold} · In-progress: {v.in_progress_barrels}</div>
            <div>Updates the shelf barrel count and logs the movement.</div>
          </div>
        }
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this movement?"
        message={`${nameById[deleteTarget?.flavor_id] ?? 'Popcorn'} on ${pickedDate}.`}
        isDangerous
        busy={busy}
        confirmText="Delete"
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
        summary={<div>Undoes the net barrel change and removes the movement. In-progress topping isn’t stored — use Fix a shelf count if the in-progress number drifts.</div>}
      />
    </div>
  )
}
