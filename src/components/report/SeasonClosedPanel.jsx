import { Link } from 'react-router-dom'

// Shown in place of the Shift Report entry tabs once the season is over
// (seasonPhase === 'closed'). The app becomes observe-only: no batches, no
// product entries — just the story of the season that was.
export default function SeasonClosedPanel() {
  return (
    <div className="bg-white border border-store-tan rounded-2xl p-8 text-center space-y-4 shadow-sm animate-fade-in-up">
      <p className="text-5xl">🌅</p>
      <div>
        <h3 className="text-xl font-bold text-store-brown" style={{ fontFamily: 'var(--font-display)' }}>
          That's a wrap on the season
        </h3>
        <p className="text-sm text-store-brown-light mt-2 max-w-sm mx-auto">
          The store is closed for the year, so logging is paused. Everything the crew
          made, sold, and learned this season is saved — go see how it went.
        </p>
      </div>
      <Link
        to="/season-recap"
        className="press inline-block bg-store-green hover:bg-store-green-dark text-white px-6 py-3 rounded-xl text-sm font-bold shadow-sm touch-manipulation"
      >
        View the Season Recap →
      </Link>
      <p className="text-xs text-store-brown-light">See you in April 🍬</p>
    </div>
  )
}
