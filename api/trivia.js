// Vercel function — "Big Sam's Trivia of the Day" FRESH (web-sourced) question for weekends.
//
// Weekdays: the client uses the static bank and never calls this. Weekends: the first crew
// member to open Jarvis triggers one Claude+web_search generation; the result is cached in
// the daily_trivia table so everyone gets the SAME question that day. Any failure → the
// client falls back to the static bank, so trivia never breaks.
//
// Owner-only, like /api/chat: requires the caller's Supabase token.
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

export const config = { maxDuration: 30 }

// Background generation model. Opus for quality; lower this (e.g. claude-haiku-4-5) if you
// ever hit function timeouts on your plan.
const TRIVIA_MODEL = 'claude-opus-4-8'
const REQUIRED = ['question', 'answer', 'hint1', 'hint2', 'category', 'funFact']

function todayEastern() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}
function isFreshDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sun ... 6 = Sat
  return dow === 0 || dow === 6
}

const GEN_PROMPT = `Use web search to find ONE fun, surprising, SFW current-events trivia item from roughly the last two weeks — a sports result or record, an entertainment/pop-culture moment, a science/space discovery, or a viral fact. Avoid politics, elections, war, crime, tragedy, and anything graphic or divisive.
Difficulty sweet spot: something a casual person probably wouldn't know off the top of their head, but says "oh that's cool" when they hear the answer. Not too easy, not impossible.
After searching, output ONLY a JSON object (no prose, no code fences) with EXACTLY these string fields: {"question","answer","hint1","hint2","category","funFact"}. Keep the answer short and unambiguous. hint1 should be vague, hint2 more revealing. funFact is an extra tidbit to share when the answer is revealed.`

async function generate(apiKey) {
  const client = new Anthropic({ apiKey })
  let messages = [{ role: 'user', content: GEN_PROMPT }]
  let resp
  for (let i = 0; i < 6; i++) {
    resp = await client.messages.create({
      model: TRIVIA_MODEL,
      max_tokens: 1024,
      tools: [{ type: 'web_search_20260209', name: 'web_search' }],
      messages,
    })
    if (resp.stop_reason === 'pause_turn') {
      messages = [...messages, { role: 'assistant', content: resp.content }]
      continue
    }
    break
  }
  const text = (resp?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('no JSON in model output')
  const obj = JSON.parse(text.slice(start, end + 1))
  for (const f of REQUIRED) {
    if (!obj[f] || typeof obj[f] !== 'string' || !obj[f].trim()) throw new Error(`bad field: ${f}`)
  }
  return obj
}

const shape = (r) => ({ question: r.question, answer: r.answer, hint1: r.hint1, hint2: r.hint2, category: r.category, funFact: r.fun_fact })

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  const url = process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  if (!token || !url || !anon) { res.status(401).json({ error: 'unauthorized' }); return }

  const sb = createClient(url, anon)
  try {
    const { data, error } = await sb.auth.getUser(token)
    if (error || !data?.user) { res.status(401).json({ error: 'invalid session' }); return }
  } catch { res.status(401).json({ error: 'auth failed' }); return }

  const today = todayEastern()
  if (!isFreshDay(today)) { res.status(204).end(); return } // weekday → static bank

  // Already cached for today?
  const { data: existing, error: selErr } = await sb.from('daily_trivia').select('*').eq('date', today).limit(1)
  if (selErr) { res.status(204).end(); return } // table not migrated yet → static fallback
  if (existing && existing[0]) { res.status(200).json(shape(existing[0])); return }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) { res.status(204).end(); return } // no key → static fallback

  try {
    const q = await generate(apiKey)
    await sb.from('daily_trivia').upsert(
      { date: today, question: q.question, answer: q.answer, hint1: q.hint1, hint2: q.hint2, category: q.category, fun_fact: q.funFact, source: 'web' },
      { onConflict: 'date', ignoreDuplicates: true }
    )
    // Re-read the canonical row so concurrent openers all get the first-written question.
    const { data: row } = await sb.from('daily_trivia').select('*').eq('date', today).limit(1)
    res.status(200).json(shape(row?.[0] || { ...q, fun_fact: q.funFact }))
  } catch (e) {
    res.status(502).json({ error: e?.message || 'generation failed' })
  }
}
