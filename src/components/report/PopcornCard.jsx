import Stepper from '../Stepper'
import Collapsible from '../Collapsible'
import { supabase } from '../../lib/supabase'

// One popcorn flavor in the Products tab — collapsed row that expands to the barrel
// steppers + threshold input, mirroring FudgeCard. Amber styling matches the old card.
export default function PopcornCard({
  flavor: f, entry: pe, derived: d, onField, threshold, onThreshold,
  open, onToggle, stagger = 0, flash = 0,
}) {
  const pending = []
  if ((pe.barrels_added ?? 0) > 0) pending.push(`+${pe.barrels_added} added`)
  if ((pe.in_progress_barrels ?? 0) > 0) pending.push(`+${pe.in_progress_barrels} in-prog`)
  if ((pe.barrels_sold ?? 0) > 0) pending.push(`${pe.barrels_sold} sold`)

  return (
    <div key={flash} className={`bg-amber-50 rounded-xl border border-amber-200 shadow-sm stagger ${flash ? 'flash-update' : ''}`} style={{ '--stagger': stagger }}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3.5 flex items-center justify-between gap-2 touch-manipulation"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {d.needsBarrels && !open && (
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse" title="Needs barrels" />
            )}
            <p className="font-semibold text-amber-900 text-lg truncate">{f.name}</p>
          </div>
          <div className="flex gap-x-2 gap-y-0.5 text-xs flex-wrap items-center mt-0.5">
            <span className="font-bold text-amber-700">{d.barrels} barrels on hand</span>
            {d.totalBarrelsToday > 0 && (
              <>
                <span className="text-amber-400">·</span>
                <span className="text-amber-700">{d.totalBarrelsToday} added today</span>
                <span className="text-amber-400">·</span>
                <span className="text-amber-600 font-medium">≈ {d.estimatedBatches} {d.estimatedBatches === 1 ? 'batch' : 'batches'}</span>
              </>
            )}
            {d.liveInProgBarrels > 0 && (
              <><span className="text-amber-400">·</span><span className="text-amber-600 font-medium">{d.liveInProgBarrels} in progress</span></>
            )}
          </div>
          {!open && pending.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-1.5">
              {pending.map((p) => (
                <span key={p} className="text-[11px] font-semibold text-amber-700 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5">{p}</span>
              ))}
            </div>
          )}
        </div>
        <span className={`text-amber-600 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      <Collapsible open={open}>
        <div className="px-4 pb-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-amber-800">Alert threshold</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                step="1"
                value={threshold ?? 1}
                onChange={(e) => onThreshold(Number(e.target.value))}
                onBlur={async (e) => {
                  const val = Math.max(0, Number(e.target.value))
                  await supabase.from('flavors').update({ low_tray_threshold: val }).eq('id', f.id)
                }}
                className="w-16 text-center border border-amber-300 rounded-lg px-2 py-1 text-sm text-amber-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <span className="text-xs text-amber-700">barrels</span>
            </div>
          </div>

          {d.liveInProgBarrels > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <span className="text-amber-700 font-semibold text-sm">{d.liveInProgBarrels} in progress</span>
              <span className="text-amber-600 text-xs">— adding barrels will top {d.liveInProgBarrels === 1 ? 'it' : 'them'}</span>
            </div>
          )}

          {d.needsBarrels && (
            <div className="bg-amber-100 border border-amber-300 rounded-lg px-3 py-2">
              <span className="text-amber-800 text-xs">Batch logged today — add barrels when ready</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-amber-800">Barrels added</span>
            <Stepper value={pe.barrels_added} onChange={(v) => onField('barrels_added', v)} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-amber-800">In-progress barrels</span>
            <Stepper value={pe.in_progress_barrels} onChange={(v) => onField('in_progress_barrels', v)} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-amber-800">Barrels sold</span>
            <Stepper value={pe.barrels_sold} onChange={(v) => onField('barrels_sold', v)} />
          </div>
        </div>
      </Collapsible>
    </div>
  )
}
