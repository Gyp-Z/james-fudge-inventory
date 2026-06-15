import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import ConfirmDialog from '../ConfirmDialog'
import { revertBatchLog } from '../../utils/autoDeduct'
import { todayEastern, daysAgoEastern } from '../../utils/dates'

// Capability #2 — searchable, filterable list of batch_logs with a Revert button per row.
export default function BatchRevertSection({ flavors, onDone }) {
  const [start, setStart] = useState(daysAgoEastern(7))
  const [end, setEnd] = useState(todayEastern())
  const [flavorFilter, setFlavorFilter] = useState('all')
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [target, setTarget] = useState(null) // batch row pending revert
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    // batch_date is timestamptz — include the whole end day with a < next-day bound.
    const endNext = new Date(end + 'T00:00:00')
    endNext.setDate(endNext.getDate() + 1)
    let q = supabase
      .from('batch_logs')
      .select('id, flavor_id, batch_date, is_wasted, waste_reason, flavors(name, product_type, is_component)')
      .gte('batch_date', start)
      .lt('batch_date', endNext.toLocaleDateString('en-CA'))
      .order('batch_date', { ascending: false })
    if (flavorFilter !== 'all') q = q.eq('flavor_id', flavorFilter)
    const { data } = await q
    setBatches(data || [])
    setLoading(false)
  }, [start, end, flavorFilter])

  useEffect(() => { load() }, [load])

  async function doRevert() {
    setBusy(true)
    await revertBatchLog(target.id)
    setBusy(false)
    setTarget(null)
    await load()
    onDone()
  }

  const inputCls = 'border border-store-tan rounded-xl px-3 py-2 text-sm bg-white text-store-brown focus:outline-none focus:ring-2 focus:ring-store-green'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} className={inputCls} />
        <span className="text-store-brown-light text-sm">to</span>
        <input type="date" value={end} max={todayEastern()} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
        <select value={flavorFilter} onChange={(e) => setFlavorFilter(e.target.value)} className={`${inputCls} flex-1 min-w-[8rem]`}>
          <option value="all">All flavors</option>
          {flavors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-store-brown-light text-sm py-4 text-center">Loading…</p>
      ) : batches.length === 0 ? (
        <p className="text-store-brown-light text-sm py-4 text-center">No batches in this range.</p>
      ) : (
        <div className="space-y-2">
          {batches.map((b) => (
            <div key={b.id} className="bg-white rounded-xl border border-store-tan p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-store-brown truncate">{b.flavors?.name ?? '?'}</div>
                <div className="text-xs text-store-brown-light">
                  {b.batch_date?.slice(0, 10)}
                  {b.is_wasted && <span className="ml-2 text-red-600 font-semibold">wasted</span>}
                </div>
              </div>
              <button
                onClick={() => setTarget(b)}
                className="text-xs font-semibold text-red-600 hover:text-white hover:bg-red-600 border border-red-200 px-3 py-1.5 rounded-lg transition-colors shrink-0"
              >
                Revert
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!target}
        title="Revert this batch?"
        message={`${target?.flavors?.name} logged ${target?.batch_date?.slice(0, 10)}. This deletes the batch and its deductions.`}
        isDangerous
        busy={busy}
        confirmText="Revert"
        onConfirm={doRevert}
        onCancel={() => setTarget(null)}
        summary={
          <>
            <div>Refunds the ingredients this batch deducted.</div>
            {target?.flavors?.is_component && <div>Caramel: −1 tray from inventory.</div>}
            {target?.flavors?.product_type === 'popcorn' && <div>Popcorn: barrels unchanged (batches don't add barrels).</div>}
          </>
        }
      />
    </div>
  )
}
