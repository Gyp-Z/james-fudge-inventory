// "Big Sam's Trivia of the Day" — deterministic daily question + per-device once-a-day gate.
//
// Named after the crew's cousin Sam (currently in Poland for a law internship). The same
// question shows for everyone on the same Eastern day, and rotates without repeating inside
// the bank's length (90+ questions → no repeats within a 90-day window).
import triviaBank from '../data/triviaBank.json'
import specialDays from '../data/triviaSpecialDays.json'

// Reference day for the rotation. Index = (days since this date) mod bank length.
const REF_DATE = '2026-01-01'
const STORAGE_KEY = 'bigsams-trivia-shown'

function todayEastern() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

function daysSinceRef(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [ry, rm, rd] = REF_DATE.split('-').map(Number)
  // Use UTC midnights so DST never shifts the day count.
  const ms = Date.UTC(y, m - 1, d) - Date.UTC(ry, rm - 1, rd)
  return Math.floor(ms / 86400000)
}

// A date-specific question for a holiday / notable day (keyed by "MM-DD"), or null.
// These OVERRIDE the rotation and the weekend web question — e.g. July 4th, Juneteenth,
// Michael Jackson's birthday, Joel Embiid's birthday, One Piece days, etc.
export function getSpecialDay() {
  const today = todayEastern()
  const entry = specialDays[today.slice(5)] // MM-DD
  if (!entry) return null
  const pick = Array.isArray(entry) ? entry[Number(today.slice(0, 4)) % entry.length] : entry
  return { ...pick, date: today, special: true }
}

// For GENERAL/random pulls (no genre asked), down-weight niche categories so they don't
// dominate — most of the crew (and the cashiers) don't watch anime. When someone explicitly
// asks for the Anime genre, it's picked from the full anime pool, so this only affects
// "general knowledge" / "another" pulls.
const GENERAL_WEIGHT = { Anime: 0.3 }

// A random question from the bank, optionally filtered to a category, optionally excluding
// questions already shown this session. Powers "give me another" and genre switch-ups.
export function getRandomTrivia({ category = null, exclude = [] } = {}) {
  const exSet = new Set(exclude)
  const pool = category ? triviaBank.filter((q) => q.category === category) : triviaBank
  let candidates = pool.filter((q) => !exSet.has(q.question))
  if (candidates.length === 0) candidates = pool.length ? pool : triviaBank // ran out → allow repeats
  if (candidates.length === 0) return null

  let pick
  if (category) {
    // Explicit genre → straight random within it (full anime when anime is requested).
    pick = candidates[Math.floor(Math.random() * candidates.length)]
  } else {
    // General/random → weighted so niche categories (anime) only come up occasionally.
    const weights = candidates.map((q) => GENERAL_WEIGHT[q.category] ?? 1)
    const total = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    pick = candidates[candidates.length - 1]
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i]
      if (r <= 0) { pick = candidates[i]; break }
    }
  }
  return { ...pick, date: todayEastern() }
}

// Today's question: a special-day entry if one exists, otherwise the static rotation.
export function getTodayTrivia() {
  const special = getSpecialDay()
  if (special) return special
  const today = todayEastern()
  const n = triviaBank.length
  const idx = ((daysSinceRef(today) % n) + n) % n
  return { ...triviaBank[idx], date: today, index: idx }
}

// Weekends get a fresh, web-sourced current-events question (Sat/Sun, Eastern).
export function isFreshDay() {
  const [y, m, d] = todayEastern().split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sun ... 6 = Sat
  return dow === 0 || dow === 6
}

// Hybrid pick: on weekends try the live /api/trivia question (cached server-side so the whole
// crew gets the same one); fall back to the static bank on weekdays or if anything fails.
export async function getDailyTrivia(token) {
  const special = getSpecialDay() // holidays/birthdays beat everything
  if (special) return special
  if (isFreshDay()) {
    try {
      const res = await fetch('/api/trivia', { headers: { Authorization: `Bearer ${token ?? ''}` } })
      if (res.status === 200) {
        const data = await res.json()
        if (data?.question && data?.answer) return { ...data, source: 'web' }
      }
    } catch {
      /* network/server issue — fall through to the static bank */
    }
  }
  return getTodayTrivia()
}

// Has this device already been shown today's trivia?
export function triviaShownToday() {
  try {
    return localStorage.getItem(STORAGE_KEY) === todayEastern()
  } catch {
    return false
  }
}

export function markTriviaShown() {
  try {
    localStorage.setItem(STORAGE_KEY, todayEastern())
  } catch {
    /* localStorage unavailable (private mode etc.) — fine, trivia just may re-show */
  }
}

// Persist the chosen question + reroll history for TODAY, so a page refresh keeps your pick
// instead of snapping back to the original. Cleared automatically on a new day.
const CHOICE_KEY = 'bigsams-trivia-choice'
export function loadTriviaChoice() {
  try {
    const data = JSON.parse(localStorage.getItem(CHOICE_KEY) || 'null')
    if (!data || data.date !== todayEastern()) return null // stale → new day resets to default
    if (!Array.isArray(data.history) || data.history.length === 0 || typeof data.pos !== 'number') return null
    return { history: data.history, pos: Math.max(0, Math.min(data.pos, data.history.length - 1)) }
  } catch {
    return null
  }
}
export function saveTriviaChoice(history, pos) {
  try {
    localStorage.setItem(CHOICE_KEY, JSON.stringify({ date: todayEastern(), history, pos }))
  } catch {
    /* ignore */
  }
}
