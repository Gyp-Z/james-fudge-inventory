import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getSeasonRecap } from '../core/ops.js'

// The season's story on one page. Publicly viewable (staff + owner) — once the store
// closes this becomes the main thing the app is for until spring. All numbers come
// from getSeasonRecap in core (same data Jarvis's get_season_recap tool returns).
export default function SeasonRecap() {
  const [recap, setRecap] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSeasonRecap(supabase, {})
      .then(setRecap)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-store-brown-light text-center py-12">Adding up the season…</p>
  if (!recap) return <p className="text-store-brown-light text-center py-12">Couldn't load the recap — try again.</p>

  const t = recap.totals
  const stillRunning = recap.season_phase !== 'closed'

  const heroStats = [
    { label: 'Trays of fudge sold', value: t.fudge_trays_sold, emoji: '🍫' },
    { label: 'Trays made', value: t.fudge_trays_made, emoji: '👩‍🍳' },
    { label: 'Batches cooked', value: t.batches, emoji: '🔥' },
    { label: 'Popcorn barrels sold', value: t.popcorn_barrels_sold, emoji: '🍿' },
  ]

  const smallStats = [
    { label: 'Waste rate', value: `${t.waste_rate_pct}%`, note: `${t.fudge_trays_wasted} trays wasted` },
    { label: 'Caramel batches', value: t.caramel_batches, note: `${t.caramels_handwrapped_trays} trays hand-wrapped` },
    { label: 'Fudge pops', value: t.fudge_pops, note: 'made mid-season' },
    { label: 'Days active', value: t.active_days, note: `${recap.window.start.slice(5)} → ${recap.window.end.slice(5)}` },
  ]

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center space-y-2 pt-2">
        <p className="text-4xl">🌅</p>
        <h2 className="text-3xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          Season {recap.year}
        </h2>
        <p className="text-sm text-store-brown-light max-w-sm mx-auto">
          {stillRunning
            ? 'The season so far — numbers keep growing until close.'
            : "The store's closed for the year. Here's everything the crew pulled off."}
        </p>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3">
        {heroStats.map((s, i) => (
          <div key={s.label} className="bg-white border border-store-tan rounded-2xl p-5 text-center shadow-sm card-lift stagger" style={{ '--stagger': i }}>
            <p className="text-2xl">{s.emoji}</p>
            <p className="text-3xl font-bold text-store-green tabular-nums mt-1" style={{ fontFamily: 'var(--font-display)' }}>
              {s.value.toLocaleString()}
            </p>
            <p className="text-xs text-store-brown-light font-medium mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {smallStats.map((s, i) => (
          <div key={s.label} className="bg-store-cream border border-store-tan rounded-xl px-3 py-3 text-center stagger" style={{ '--stagger': i + 4 }}>
            <p className="text-lg font-bold text-store-brown tabular-nums">{s.value}</p>
            <p className="text-[11px] font-semibold text-store-brown-light">{s.label}</p>
            <p className="text-[10px] text-store-brown-light/80 mt-0.5">{s.note}</p>
          </div>
        ))}
      </div>

      {/* Top sellers podium */}
      {recap.top_sellers.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-store-brown uppercase tracking-wide">🏆 Top sellers</h3>
          <div className="space-y-2">
            {recap.top_sellers.map((s, i) => {
              const max = recap.top_sellers[0]?.sold || 1
              return (
                <div key={s.name} className="bg-white border border-store-tan rounded-xl px-4 py-3 shadow-sm stagger" style={{ '--stagger': i }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-semibold text-store-brown">
                      <span className="mr-2">{['🥇', '🥈', '🥉'][i] || `${i + 1}.`}</span>{s.name}
                    </p>
                    <p className="text-sm font-bold text-store-green tabular-nums">{s.sold} trays</p>
                  </div>
                  <div className="h-2 bg-store-cream rounded-full overflow-hidden">
                    <div className="h-full bg-store-green rounded-full" style={{ width: `${Math.max(4, (s.sold / max) * 100)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Popcorn + busiest day, side by side */}
      <div className="grid sm:grid-cols-2 gap-3">
        {recap.top_popcorn.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
            <h3 className="text-sm font-bold text-amber-900 uppercase tracking-wide">🍿 Popcorn podium</h3>
            {recap.top_popcorn.map((p, i) => (
              <div key={p.name} className="flex items-center justify-between text-sm">
                <span className="text-amber-900">{['🥇', '🥈', '🥉'][i]} {p.name}</span>
                <span className="font-bold text-amber-700 tabular-nums">{p.barrels_sold} barrels</span>
              </div>
            ))}
          </div>
        )}
        {recap.busiest_day && (
          <div className="bg-white border border-store-tan rounded-2xl p-4 flex flex-col items-center justify-center text-center space-y-1">
            <h3 className="text-sm font-bold text-store-brown uppercase tracking-wide">📈 Busiest day</h3>
            <p className="text-xl font-bold text-store-green" style={{ fontFamily: 'var(--font-display)' }}>
              {new Date(`${recap.busiest_day.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <p className="text-xs text-store-brown-light">{recap.busiest_day.sold} trays + barrels sold in one day</p>
          </div>
        )}
      </div>

      {/* Waste — the honest section */}
      {recap.most_wasted.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-store-brown uppercase tracking-wide">🗑️ Most wasted (next year's watch list)</h3>
          <div className="bg-white border border-store-tan rounded-xl divide-y divide-store-tan/60 shadow-sm">
            {recap.most_wasted.map((w) => (
              <div key={w.name} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-store-brown">{w.name}</span>
                <span className="font-semibold text-store-coral tabular-nums">{w.wasted} trays</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full per-flavor table */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-store-brown uppercase tracking-wide">Every flavor, all season</h3>
        <div className="bg-white border border-store-tan rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-store-cream text-store-brown-light uppercase tracking-wide text-[10px]">
                <th className="text-left px-3 py-2 font-bold">Flavor</th>
                <th className="text-right px-2 py-2 font-bold">Batches</th>
                <th className="text-right px-2 py-2 font-bold">Made</th>
                <th className="text-right px-2 py-2 font-bold">Sold</th>
                <th className="text-right px-3 py-2 font-bold">Wasted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-store-tan/50">
              {recap.per_flavor.map((r) => (
                <tr key={`${r.type}-${r.name}`} className={r.type === 'popcorn' ? 'bg-amber-50/60' : r.type === 'component' ? 'bg-store-cream/60' : ''}>
                  <td className="px-3 py-2 font-medium text-store-brown">
                    {r.name}
                    {r.type === 'popcorn' && <span className="text-amber-600 ml-1">🍿</span>}
                    {r.type === 'component' && <span className="text-store-brown-light ml-1 text-[10px]">(component)</span>}
                  </td>
                  <td className="text-right px-2 py-2 tabular-nums text-store-brown-light">{r.batches || '—'}</td>
                  <td className="text-right px-2 py-2 tabular-nums text-store-brown-light">
                    {r.type === 'popcorn' ? (r.barrelsAdded || '—') : (r.made || '—')}
                  </td>
                  <td className="text-right px-2 py-2 tabular-nums font-semibold text-store-green">
                    {r.type === 'popcorn' ? (r.barrelsSold || '—') : (r.sold || '—')}
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums text-store-coral">{r.wasted || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-store-brown-light">Popcorn rows are barrels; everything else is trays. Season window {recap.window.start} → {recap.window.end}.</p>
      </div>

      {!stillRunning && (
        <p className="text-center text-sm text-store-brown-light pb-4">See you in April 🍬</p>
      )}
    </div>
  )
}
