import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Stepper from '../Stepper'
import ConfirmDialog from '../ConfirmDialog'
import { logBatchWithEffects } from '../../utils/inventoryActions'

// Capability #1 — add a batch for any flavor on the chosen (possibly past) date, firing the
// exact same batch-phase effects as the live Batches tab.
export default function BackdateBatchSection({ pickedDate, flavors, onDone }) {
  const [flavorId, setFlavorId] = useState('')
  const [made, setMade] = useState(0)
  const [wasted, setWasted] = useState(0)
  const [wasteReason, setWasteReason] = useState('')
  const [recipePreview, setRecipePreview] = useState([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const flavor = flavors.find((f) => f.id === flavorId)
  const total = made + wasted
  const canSubmit = !!flavor && total > 0

  useEffect(() => {
    setResult(null)
    if (!flavorId) { setRecipePreview([]); return }
    supabase
      .from('recipes')
      .select('quantity_per_batch, unit, ingredients(name)')
      .eq('flavor_id', flavorId)
      .eq('deduction_phase', 'batch')
      .then(({ data }) => setRecipePreview(data || []))
  }, [flavorId])

  async function doSubmit() {
    setBusy(true)
    for (let i = 0; i < made; i++) await logBatchWithEffects(flavor, pickedDate, { isWasted: false })
    for (let i = 0; i < wasted; i++) await logBatchWithEffects(flavor, pickedDate, { isWasted: true, wasteReason })
    setBusy(false)
    setConfirmOpen(false)
    setResult(`Logged ${total} batch${total === 1 ? '' : 'es'} of ${flavor.name} on ${pickedDate}.`)
    setMade(0); setWasted(0); setWasteReason('')
    onDone()
  }

  return (
    <div className="space-y-4">
      <select
        value={flavorId}
        onChange={(e) => setFlavorId(e.target.value)}
        className="w-full border border-store-tan rounded-xl px-3 py-2.5 text-sm bg-white text-store-brown focus:outline-none focus:ring-2 focus:ring-store-green"
      >
        <option value="">Select a flavor…</option>
        {flavors.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}{!f.is_active ? ' (archived)' : ''}{f.product_type === 'popcorn' ? ' · popcorn' : ''}
          </option>
        ))}
      </select>

      {flavor && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-store-brown">Batches made</span>
            <Stepper value={made} onChange={setMade} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-store-brown">Batches wasted</span>
            <Stepper value={wasted} onChange={setWasted} />
          </div>
          {wasted > 0 && (
            <input
              type="text"
              value={wasteReason}
              onChange={(e) => setWasteReason(e.target.value)}
              placeholder="Waste reason (optional)"
              className="w-full border border-store-tan rounded-xl px-3 py-2 text-sm bg-white text-store-brown focus:outline-none focus:ring-2 focus:ring-store-green"
            />
          )}

          <button
            onClick={() => setConfirmOpen(true)}
            disabled={!canSubmit}
            className="w-full bg-store-green hover:bg-store-green-dark text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            Log batch{total === 1 ? '' : 'es'} on {pickedDate}
          </button>
        </>
      )}

      {result && (
        <p className="text-sm text-store-green bg-store-green-light rounded-xl px-3 py-2">{result}</p>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Log backdated batch?"
        message={`${made} made${wasted ? ` + ${wasted} wasted` : ''} of ${flavor?.name} on ${pickedDate}.`}
        isDangerous={false}
        busy={busy}
        confirmText="Log it"
        onConfirm={doSubmit}
        onCancel={() => setConfirmOpen(false)}
        summary={
          <>
            {flavor?.is_component && <div>Caramel: +{made} tray{made === 1 ? '' : 's'} to inventory.</div>}
            {flavor?.product_type === 'popcorn' && <div>Popcorn: ingredients only — barrels are unchanged.</div>}
            {made > 0 && recipePreview.length > 0 ? (
              <>
                <div className="font-semibold">Will deduct (× {made} made):</div>
                {recipePreview.map((r, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <span>{r.ingredients?.name ?? '?'}</span>
                    <span className="font-mono">{r.quantity_per_batch * made} {r.unit}</span>
                  </div>
                ))}
              </>
            ) : made > 0 ? (
              <div>No base-ingredient recipe configured — nothing to deduct.</div>
            ) : (
              <div>Wasted batches don't deduct ingredients.</div>
            )}
          </>
        }
      />
    </div>
  )
}
