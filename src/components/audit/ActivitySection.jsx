import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { todayEastern, daysAgoEastern } from '../../utils/dates'

function Block({ title, count, children }) {
  return (
    <div>
      <h4 className="text-xs font-bold text-store-brown-light uppercase tracking-wide mb-1.5">{title} ({count})</h4>
      {count === 0 ? <p className="text-xs text-store-brown-light pb-1">None.</p> : <div className="space-y-1">{children}</div>}
    </div>
  )
}

// Capability #6 — read-only view of what happened in a date range: batches, product
// entries, ingredient deductions, and manual adjustments. Filterable by flavor/ingredient.
export default function ActivitySection({ flavors, ingredients }) {
  const [start, setStart] = useState(daysAgoEastern(7))
  const [end, setEnd] = useState(todayEastern())
  const [flavorFilter, setFlavorFilter] = useState('all')
  const [ingFilter, setIngFilter] = useState('all')
  const [data, setData] = useState({ batches: [], entries: [], deductions: [], adjustments: [] })
  const [loading, setLoading] = useState(true)

  const flavorName = (id) => flavors.find((f) => f.id === id)?.name ?? '?'
  const ingName = (id) => ingredients.find((i) => i.id === id)?.name ?? '?'

  const load = useCallback(async () => {
    setLoading(true)
    const endNext = new Date(end + 'T00:00:00')
    endNext.setDate(endNext.getDate() + 1)
    const endExcl = endNext.toLocaleDateString('en-CA')
    const endTs = endExcl + 'T00:00:00'

    let bq = supabase.from('batch_logs')
      .select('id, flavor_id, batch_date, is_wasted')
      .gte('batch_date', start).lt('batch_date', endExcl).order('batch_date', { ascending: false })
    if (flavorFilter !== 'all') bq = bq.eq('flavor_id', flavorFilter)

    let eq = supabase.from('shift_report_entries')
      .select('id, flavor_id, full_trays, in_progress_trays, trays_sold, trays_wasted, in_progress_wasted, shift_reports!inner(report_date)')
      .gte('shift_reports.report_date', start).lte('shift_reports.report_date', end)
    if (flavorFilter !== 'all') eq = eq.eq('flavor_id', flavorFilter)

    let dq = supabase.from('ingredient_deductions')
      .select('id, ingredient_id, quantity_deducted, unit, notes, deducted_at')
      .gte('deducted_at', start).lt('deducted_at', endTs).order('deducted_at', { ascending: false })
    if (ingFilter !== 'all') dq = dq.eq('ingredient_id', ingFilter)

    let aq = supabase.from('inventory_adjustments')
      .select('id, target_type, target_id, field, old_value, new_value, reason, created_at')
      .gte('created_at', start).lt('created_at', endTs).order('created_at', { ascending: false })

    const [b, e, d, a] = await Promise.all([bq, eq, dq, aq])
    let adjustments = a.data || []
    if (flavorFilter !== 'all') adjustments = adjustments.filter((x) => x.target_id === flavorFilter)
    if (ingFilter !== 'all') adjustments = adjustments.filter((x) => x.target_id === ingFilter)

    setData({ batches: b.data || [], entries: e.data || [], deductions: d.data || [], adjustments })
    setLoading(false)
  }, [start, end, flavorFilter, ingFilter])

  useEffect(() => { load() }, [load])

  const inputCls = 'border border-store-tan rounded-xl px-3 py-2 text-sm bg-white text-store-brown focus:outline-none focus:ring-2 focus:ring-store-green'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} className={inputCls} />
        <span className="text-store-brown-light text-sm">to</span>
        <input type="date" value={end} max={todayEastern()} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={flavorFilter} onChange={(e) => setFlavorFilter(e.target.value)} className={`${inputCls} flex-1 min-w-[8rem]`}>
          <option value="all">All flavors</option>
          {flavors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select value={ingFilter} onChange={(e) => setIngFilter(e.target.value)} className={`${inputCls} flex-1 min-w-[8rem]`}>
          <option value="all">All ingredients</option>
          {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-store-brown-light text-sm py-4 text-center">Loading…</p>
      ) : (
        <div className="space-y-4 text-store-brown">
          <Block title="Batches" count={data.batches.length}>
            {data.batches.map((b) => (
              <div key={b.id} className="text-xs flex justify-between gap-2 bg-white border border-store-tan rounded-lg px-3 py-1.5">
                <span>{b.batch_date?.slice(0, 10)} · {flavorName(b.flavor_id)}</span>
                {b.is_wasted && <span className="text-red-600 font-semibold">wasted</span>}
              </div>
            ))}
          </Block>

          <Block title="Product entries" count={data.entries.length}>
            {data.entries.map((e) => (
              <div key={e.id} className="text-xs bg-white border border-store-tan rounded-lg px-3 py-1.5">
                <span className="font-medium">{e.shift_reports?.report_date} · {flavorName(e.flavor_id)}</span>
                <span className="text-store-brown-light"> — made {e.full_trays}, sold {e.trays_sold}, in-prog {e.in_progress_trays}, wasted {(e.trays_wasted ?? 0) + (e.in_progress_wasted ?? 0)}</span>
              </div>
            ))}
          </Block>

          <Block title="Ingredient deductions" count={data.deductions.length}>
            {data.deductions.map((d) => (
              <div key={d.id} className="text-xs flex justify-between gap-2 bg-white border border-store-tan rounded-lg px-3 py-1.5">
                <span>{d.deducted_at?.slice(0, 10)} · {ingName(d.ingredient_id)}</span>
                <span className="font-mono">−{Number(d.quantity_deducted).toFixed(4)} {d.unit}</span>
              </div>
            ))}
          </Block>

          <Block title="Manual adjustments" count={data.adjustments.length}>
            {data.adjustments.map((a) => (
              <div key={a.id} className="text-xs bg-white border border-store-tan rounded-lg px-3 py-1.5">
                <span className="font-medium">{a.created_at?.slice(0, 10)} · {a.target_type === 'flavor' ? flavorName(a.target_id) : ingName(a.target_id)}</span>
                <span className="text-store-brown-light"> — {a.field}: {a.old_value} → {a.new_value}{a.reason ? ` (${a.reason})` : ''}</span>
              </div>
            ))}
          </Block>
        </div>
      )}
    </div>
  )
}
