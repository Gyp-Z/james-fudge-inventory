import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import ConfirmDialog from '../ConfirmDialog'
import { applyShiftEntry, reverseShiftEntry } from '../../utils/inventoryActions'

const EMPTY = { flavorId: '', full_trays: 0, in_progress_trays: 0, trays_sold: 0, trays_wasted: 0, waste_is_in_progress: false, waste_reason: '' }

// Capability #3 — add / edit / delete shift_report_entries for the chosen date, firing the
// same tray-phase deductions + caramel + inventory effects the live Products submit does.
// Edit = reverse the old entry, then apply the new values (delete-then-re-add).
export default function ShiftEntrySection({ pickedDate, flavors, onDone }) {
  const fudge = flavors.filter((f) => f.product_type === 'fudge' && !f.is_component)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [recipePreview, setRecipePreview] = useState([])
  const [confirmSave, setConfirmSave] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)

  const flavor = flavors.find((f) => f.id === form.flavorId)
  const wasted = Number(form.trays_wasted) || 0
  const made = Number(form.full_trays) || 0

  const loadEntries = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('shift_report_entries')
      .select('id, flavor_id, full_trays, in_progress_trays, trays_sold, trays_wasted, in_progress_wasted, waste_reason, shift_reports!inner(report_date), flavors(name)')
      .eq('shift_reports.report_date', pickedDate)
      .order('id')
    setEntries(data || [])
    setLoading(false)
  }, [pickedDate])

  useEffect(() => { loadEntries() }, [loadEntries])

  useEffect(() => {
    if (!form.flavorId) { setRecipePreview([]); return }
    supabase
      .from('recipes')
      .select('quantity_per_batch, unit, ingredients(name)')
      .eq('flavor_id', form.flavorId)
      .eq('deduction_phase', 'tray')
      .then(({ data }) => setRecipePreview(data || []))
  }, [form.flavorId])

  function set(field, value) { setForm((p) => ({ ...p, [field]: value })) }

  function resetForm() { setForm(EMPTY); setEditingId(null); setRecipePreview([]) }

  function startEdit(e) {
    setEditingId(e.id)
    setForm({
      flavorId: e.flavor_id,
      full_trays: e.full_trays ?? 0,
      in_progress_trays: e.in_progress_trays ?? 0,
      trays_sold: e.trays_sold ?? 0,
      trays_wasted: (e.trays_wasted ?? 0) + (e.in_progress_wasted ?? 0),
      waste_is_in_progress: (e.in_progress_wasted ?? 0) > 0,
      waste_reason: e.waste_reason ?? '',
    })
    setNote(null)
  }

  function buildValues() {
    const isInProg = form.waste_is_in_progress
    return {
      full_trays: Number(form.full_trays) || 0,
      in_progress_trays: Number(form.in_progress_trays) || 0,
      trays_sold: Number(form.trays_sold) || 0,
      trays_wasted: isInProg ? 0 : wasted,
      in_progress_wasted: isInProg ? wasted : 0,
      waste_reason: form.waste_reason,
    }
  }

  async function doSave() {
    setBusy(true)
    let legacyWarn = false
    if (editingId) {
      const r = await reverseShiftEntry(editingId)
      if (r.legacy) legacyWarn = true
    }
    await applyShiftEntry(flavor, pickedDate, buildValues())
    setBusy(false)
    setConfirmSave(false)
    setNote(
      `${editingId ? 'Updated' : 'Added'} ${flavor.name} for ${pickedDate}.` +
      (legacyWarn ? ' (Old entry had no linked deductions — ingredient refund was recomputed from the recipe; verify ingredient counts.)' : '')
    )
    resetForm()
    await loadEntries()
    onDone()
  }

  async function doDelete() {
    setBusy(true)
    const r = await reverseShiftEntry(deleteTarget.id)
    setBusy(false)
    setNote(
      `Removed ${deleteTarget.flavors?.name} entry.` +
      (r.legacy ? ' (No linked deductions — ingredient refund recomputed from recipe; verify counts.)' : '')
    )
    setDeleteTarget(null)
    await loadEntries()
    onDone()
  }

  const canSave = !!flavor && (made > 0 || form.in_progress_trays > 0 || form.trays_sold > 0 || wasted > 0)
  const numCls = 'w-full border border-store-tan rounded-xl px-3 py-2 text-sm bg-white text-store-brown focus:outline-none focus:ring-2 focus:ring-store-green'

  return (
    <div className="space-y-4">
      {/* Existing entries for this date */}
      <div>
        <h4 className="text-xs font-bold text-store-brown-light uppercase tracking-wide mb-2">
          Entries on {pickedDate}
        </h4>
        {loading ? (
          <p className="text-store-brown-light text-sm py-2">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-store-brown-light text-sm py-2">No product entries on this date.</p>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <div key={e.id} className="bg-white rounded-xl border border-store-tan p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-store-brown truncate">{e.flavors?.name ?? '?'}</div>
                  <div className="text-xs text-store-brown-light">
                    made {e.full_trays} · sold {e.trays_sold} · in-prog {e.in_progress_trays} · wasted {(e.trays_wasted ?? 0) + (e.in_progress_wasted ?? 0)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(e)} className="text-xs font-semibold text-store-green hover:bg-store-green-light px-2.5 py-1.5 rounded-lg transition-colors">Edit</button>
                  <button onClick={() => setDeleteTarget(e)} className="text-xs font-semibold text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / edit form */}
      <div className="bg-white rounded-xl border border-store-tan p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-store-brown text-sm">{editingId ? 'Edit entry' : 'Add entry'}</h4>
          {editingId && <button onClick={resetForm} className="text-xs text-store-brown-light hover:text-store-brown">Cancel edit</button>}
        </div>
        <select value={form.flavorId} onChange={(e) => set('flavorId', e.target.value)} disabled={!!editingId} className={`${numCls} disabled:opacity-60`}>
          <option value="">Select a fudge flavor…</option>
          {fudge.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['full_trays', 'Full trays made'],
            ['in_progress_trays', 'In-progress trays'],
            ['trays_sold', 'Trays sold'],
            ['trays_wasted', 'Trays wasted'],
          ].map(([field, label]) => (
            <label key={field} className="text-xs text-store-brown-light">
              {label}
              <input type="number" min="0" value={form[field]} onChange={(e) => set(field, e.target.value)} className={`${numCls} mt-1`} />
            </label>
          ))}
        </div>
        {wasted > 0 && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-store-brown">
              <input type="checkbox" checked={form.waste_is_in_progress} onChange={(e) => set('waste_is_in_progress', e.target.checked)} />
              Waste was in-progress trays (not full)
            </label>
            <input type="text" value={form.waste_reason} onChange={(e) => set('waste_reason', e.target.value)} placeholder="Waste reason (optional)" className={numCls} />
          </div>
        )}
        <button onClick={() => setConfirmSave(true)} disabled={!canSave} className="w-full bg-store-green hover:bg-store-green-dark text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
          {editingId ? 'Save changes' : 'Add entry'}
        </button>
      </div>

      {note && <p className="text-sm text-store-green bg-store-green-light rounded-xl px-3 py-2">{note}</p>}

      <ConfirmDialog
        open={confirmSave}
        title={editingId ? 'Save entry changes?' : 'Add entry?'}
        message={`${flavor?.name} on ${pickedDate}.`}
        busy={busy}
        confirmText={editingId ? 'Save' : 'Add'}
        onConfirm={doSave}
        onCancel={() => setConfirmSave(false)}
        summary={
          <>
            {editingId && <div>First reverses the old entry's deductions, then applies the new values.</div>}
            {made > 0 && recipePreview.length > 0 ? (
              <>
                <div className="font-semibold">Will deduct (× {made} full trays):</div>
                {recipePreview.map((r, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <span>{r.ingredients?.name ?? '?'}</span>
                    <span className="font-mono">{r.quantity_per_batch * made} {r.unit}</span>
                  </div>
                ))}
              </>
            ) : made > 0 ? (
              <div>No per-tray recipe configured — only inventory updates.</div>
            ) : (
              <div>No full trays — only inventory updates, no ingredient deduction.</div>
            )}
            {flavor?.name?.toLowerCase().includes('sea salt') && made > 0 && (
              <div>Caramel: −{(made / 18).toFixed(4)} tray (SSC).</div>
            )}
          </>
        }
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this entry?"
        message={`${deleteTarget?.flavors?.name} on ${pickedDate}. Reverses its deductions and inventory.`}
        isDangerous
        busy={busy}
        confirmText="Delete"
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
        summary={<div>Refunds tray-phase ingredients and re-credits caramel (if SSC), then removes the entry.</div>}
      />
    </div>
  )
}
