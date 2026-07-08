import Stepper from '../Stepper'
import Collapsible from '../Collapsible'

// One fudge flavor in the Products tab. The whole header is a tap target that
// expands/collapses the steppers, so the list stays short until a card is needed.
// `derived` is computed in ShiftReport (reminders, in-progress, today totals) so this
// stays purely presentational. `flash` replays a green wash when a chat write lands.
export default function FudgeCard({ flavor: f, entry: e, derived: d, onField, open, onToggle, stagger = 0, flash = 0 }) {
  const pending = []
  if ((e.full_trays ?? 0) > 0) pending.push(`+${e.full_trays} made`)
  if ((e.in_progress_trays ?? 0) > 0) pending.push(`+${e.in_progress_trays} in-prog`)
  if ((e.trays_sold ?? 0) > 0) pending.push(`${e.trays_sold} sold`)
  if ((e.trays_wasted ?? 0) > 0) pending.push(`${e.trays_wasted} wasted`)

  return (
    <div key={flash} className={`bg-white rounded-xl border border-store-tan shadow-sm stagger ${flash ? 'flash-update' : ''}`} style={{ '--stagger': stagger }}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3.5 flex items-center justify-between gap-2 touch-manipulation"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {d.anyReminder && !open && (
              <span className="w-2 h-2 rounded-full bg-store-gold shrink-0 animate-pulse" title="Needs attention" />
            )}
            <p className="font-semibold text-store-brown text-lg truncate" style={{ fontFamily: 'var(--font-display)' }}>{f.name}</p>
          </div>
          <div className="flex gap-x-2 gap-y-0.5 text-xs text-store-brown-light flex-wrap items-center mt-0.5">
            {d.stock !== undefined && <span>{d.stock} in stock</span>}
            {d.inProgCount > 0 && (
              <><span>·</span><span className="text-store-gold font-medium">{d.liveInProg} in progress</span></>
            )}
            {d.totalMadeToday > 0 && (
              <><span>·</span><span>{d.totalMadeToday} made today</span></>
            )}
            {d.estimatedBatches > 0 && (
              <><span>·</span><span className="text-store-green font-medium">≈ {d.estimatedBatches} {d.estimatedBatches === 1 ? 'batch' : 'batches'}</span></>
            )}
            {d.soldToday > 0 && (
              <><span>·</span><span>{d.soldToday} sold today</span></>
            )}
          </div>
          {!open && pending.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-1.5">
              {pending.map((p) => (
                <span key={p} className="text-[11px] font-semibold text-store-green bg-store-green/10 border border-store-green/30 rounded-full px-2 py-0.5">{p}</span>
              ))}
            </div>
          )}
        </div>
        <span className={`text-store-brown-light shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      <Collapsible open={open}>
        <div className="px-4 pb-4">
          <Collapsible open={d.anyReminder}>
            <div className="pb-3 space-y-2">
              {d.showInProg && (
                <div className="flex items-center gap-2 bg-store-gold/10 border border-store-gold/30 rounded-lg px-3 py-2">
                  <span className="text-store-gold font-semibold text-sm">{d.liveInProg} in progress</span>
                  <span className="text-store-brown-light text-xs">— marking trays made will top {d.liveInProg === 1 ? 'it' : 'them'}</span>
                </div>
              )}
              {d.showBaseReminder && (
                <div className="bg-store-gold/10 border border-store-gold/30 rounded-lg px-3 py-2">
                  <span className="text-store-brown text-xs font-medium">Base batch made today — enter trays to deduct</span>
                </div>
              )}
              {d.showSelfReminder && (
                <div className="bg-store-gold/10 border border-store-gold/30 rounded-lg px-3 py-2">
                  <span className="text-store-brown text-xs font-medium">Batch logged today — enter trays when ready</span>
                </div>
              )}
              {d.showDouble1 && (
                <div className="bg-store-gold/10 border border-store-gold/30 rounded-lg px-3 py-2">
                  <span className="text-store-brown text-xs font-medium">1st batch done — enter in-progress trays; log 2nd batch when you top</span>
                </div>
              )}
              {d.showDouble2 && (
                <div className="bg-store-green/10 border border-store-green/30 rounded-lg px-3 py-2">
                  <span className="text-store-green text-xs font-medium">Both batches done — move in-progress to full trays</span>
                </div>
              )}
            </div>
          </Collapsible>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-store-brown-light">Trays made</span>
              <Stepper value={e.full_trays} onChange={(v) => onField('full_trays', v)} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-store-brown-light">In-progress trays</span>
              <Stepper value={e.in_progress_trays} onChange={(v) => onField('in_progress_trays', v)} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-store-brown-light">Trays sold</span>
              <Stepper value={e.trays_sold} onChange={(v) => onField('trays_sold', v)} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-store-brown-light">Trays wasted</span>
              <Stepper value={e.trays_wasted} onChange={(v) => onField('trays_wasted', v)} />
            </div>
            <Collapsible open={e.trays_wasted > 0}>
              <div className="pt-0 space-y-2">
                <input
                  type="text"
                  value={e.waste_reason}
                  onChange={(ev) => onField('waste_reason', ev.target.value)}
                  placeholder="Waste reason"
                  className="w-full border border-store-tan rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
                />
                <label className="flex items-center gap-2 text-sm text-store-brown-light cursor-pointer">
                  <input
                    type="checkbox"
                    checked={e.waste_is_in_progress ?? false}
                    onChange={(ev) => onField('waste_is_in_progress', ev.target.checked)}
                    className="w-4 h-4 accent-store-green"
                  />
                  In-progress tray? <span className="text-xs opacity-60">(counts as ½)</span>
                </label>
              </div>
            </Collapsible>
          </div>
        </div>
      </Collapsible>
    </div>
  )
}
