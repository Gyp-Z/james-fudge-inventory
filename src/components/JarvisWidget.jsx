import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { useAuth } from '../hooks/useAuth'
import ConfirmDialog from './ConfirmDialog'
import { runTool, WRITE_TOOLS, summarizeToolCall, sanitizeMessages } from '../utils/jarvisClientTools'
import { getDailyTrivia, getRandomTrivia, getTopicTrivia, detectTopic, loadTriviaChoice, saveTriviaChoice, generateTrivia, loadRecentQuestions, pushRecentQuestion } from '../utils/trivia'

// Themed renderer so Jarvis's markdown becomes intentional, professional UI (no raw ** or #).
const MD = {
  h1: (p) => <div className="text-[11px] font-bold uppercase tracking-wide text-store-green mt-3 mb-1.5 first:mt-0" {...p} />,
  h2: (p) => <div className="text-[11px] font-bold uppercase tracking-wide text-store-green mt-3 mb-1.5 first:mt-0" {...p} />,
  h3: (p) => <div className="text-[11px] font-bold uppercase tracking-wide text-store-green mt-3 mb-1.5 first:mt-0" {...p} />,
  p: (p) => <p className="mb-2 last:mb-0 leading-snug" {...p} />,
  strong: (p) => <strong className="font-bold text-store-brown" {...p} />,
  em: (p) => <em className="italic" {...p} />,
  ul: (p) => <ul className="list-disc pl-5 space-y-1 mb-2 last:mb-0 marker:text-store-green" {...p} />,
  ol: (p) => <ol className="list-decimal pl-5 space-y-1 mb-2 last:mb-0 marker:text-store-green marker:font-semibold" {...p} />,
  li: (p) => <li className="leading-snug pl-0.5" {...p} />,
  a: (p) => <a className="text-store-green underline" {...p} />,
  code: (p) => <code className="font-mono text-xs bg-store-cream px-1 py-0.5 rounded" {...p} />,
  hr: () => <hr className="my-2.5 border-store-tan" />,
  blockquote: (p) => <blockquote className="border-l-2 border-store-tan pl-2.5 text-store-brown-light italic" {...p} />,
}

// "Big Sam's Trivia of the Day" — a distinct gold card, set apart from normal chat bubbles.
function TriviaCard({ t }) {
  return (
    <div className="rounded-2xl border border-store-gold/60 bg-gradient-to-br from-store-gold/20 to-store-cream px-3.5 py-3 shadow-sm animate-fade-in-up">
      <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-store-brown mb-1.5">
        <span>🎯</span> Big Sam's Trivia of the Day
      </div>
      <p className="text-sm font-semibold text-store-brown leading-snug">{t.question}</p>
      <p className="text-xs text-store-brown-light mt-2">Drop your guesses below 👇</p>
      <p className="text-[11px] text-store-brown-light/80 mt-1">Not it? Just say “another”, a genre, a team (sixers, eagles…), or “too hard” — Jarvis swaps it.</p>
    </div>
  )
}

// Floating, owner-only Jarvis assistant available on every page. A launcher bubble opens a
// chat panel; the agentic loop + write-confirmation logic is the same as the old page.
// Jarvis is page-aware: its greeting + starter prompts adapt to the screen you're on.
const GENERIC_EXAMPLES = [
  'What should I make today?',
  'How much butter do we have, and when do we run out?',
  'Log 2 trays of vanilla I made yesterday',
]

const PAGE_CONTEXT = {
  '/':            { label: 'the Dashboard',   examples: ['What should I make today?', 'What do I need to order?', 'Which flavors are running low?'] },
  '/report':      { label: 'the Shift Report', examples: ['Log 2 trays of vanilla I made today', 'How many SSC trays can I make right now?', 'What still needs topping?'] },
  '/ingredients': { label: 'Ingredients',     examples: ['What do I need to order?', 'When do we run out of butter?', 'Which ingredients are below threshold?'] },
  '/analytics':   { label: 'Analytics',       examples: ["What's my best seller this season?", 'Which flavors get wasted most?', 'How fast is caramel selling?'] },
  '/admin':       { label: 'Products',        examples: ["What's selling slowest?", 'Which flavors underperform?', 'Set the alert threshold for vanilla'] },
  '/audit-edit':  { label: 'Fixes',           examples: ['Revert the last batch of chocolate', "Fix yesterday's vanilla count", 'What changed today?'] },
}
function contextFor(path) {
  return PAGE_CONTEXT[path] || { label: "James' Fudge", examples: GENERIC_EXAMPLES }
}

const MAX_TURNS = 8
// Maps a (Jarvis-normalized) genre word to a bank category — used by the change_trivia tool.
const CATEGORY_MAP = [
  [/\b(sports?|nba|nfl|basketball|football|baseball|hockey|soccer|eagles|sixers|phillies|flyers)\b/i, 'Sports'],
  [/\b(anime|manga|one ?piece|naruto|dragon ?ball|jujutsu|demon ?slayer|bleach)\b/i, 'Anime'],
  [/(\bmusic\b|\bsongs?\b|\bhip ?hop\b|\bmotown\b|\brapper)/i, 'Music history'],
  [/(\bhistory\b|\bhistorical\b|\bancient\b)/i, 'World history'],
  [/(\bfood\b|\bcooking\b|\bkitchen\b|\brecipe\b)/i, 'Food & cooking'],
  [/(\bpop ?culture\b|\bmovies?\b|\bfilms?\b|\btv\b|\bcelebrit)/i, 'Pop culture'],
  [/(\brecords?\b|\bguinness\b|\bextreme\b)/i, 'Extreme records'],
  [/(\bfun ?facts?\b|\bscience\b|\bnature\b)/i, 'Crazy fun facts'],
]
function detectCategory(text) {
  for (const [re, cat] of CATEGORY_MAP) if (re.test(text)) return cat
  return null
}

// Conversation persistence for the browser SESSION: survives refresh + page changes, and
// clears when the tab is closed. The "New chat" button wipes it on demand.
const CONVO_KEY = 'jarvis-convo'
function loadConvo() {
  try {
    const d = JSON.parse(sessionStorage.getItem(CONVO_KEY) || 'null')
    if (!d || !Array.isArray(d.transcript) || !Array.isArray(d.messages)) return null
    return d
  } catch {
    return null
  }
}
function saveConvo(transcript, messages) {
  try { sessionStorage.setItem(CONVO_KEY, JSON.stringify({ transcript, messages })) } catch { /* ignore */ }
}
function clearConvo() {
  try { sessionStorage.removeItem(CONVO_KEY) } catch { /* ignore */ }
}

export default function JarvisWidget() {
  const { session } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [transcript, setTranscript] = useState([]) // { role, text }
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const scrollRef = useRef(null)
  const messagesRef = useRef([])
  const triviaActiveRef = useRef(false)
  const triviaHistoryRef = useRef([]) // trivia objects shown this session (for reroll + go-back)
  const triviaPosRef = useRef(-1)     // index of the active question within the history

  const pageCtx = contextFor(location.pathname)

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [transcript, busy, open])

  // Restore the conversation (survives refresh + page changes) + today's chosen trivia.
  useEffect(() => {
    const convo = loadConvo()
    if (convo) {
      setTranscript(convo.transcript)
      // Repair any orphaned tool_use left by a conversation that broke mid-loop, so a stale
      // sessionStorage doesn't 400 every message until it's cleared.
      messagesRef.current = sanitizeMessages(convo.messages)
      if (convo.transcript.some((m) => m.role === 'trivia')) triviaActiveRef.current = true
    }
    const saved = loadTriviaChoice()
    if (saved) { triviaHistoryRef.current = saved.history; triviaPosRef.current = saved.pos }
  }, [])

  // Persist the conversation whenever it changes.
  useEffect(() => {
    if (transcript.length > 0) saveConvo(transcript, messagesRef.current)
  }, [transcript])

  if (!session) return null // owner-only

  function pushUI(role, text) { setTranscript((t) => [...t, { role, text }]) }

  // Start a fresh conversation (keeps today's chosen trivia question for the day).
  function newChat() {
    setTranscript([])
    messagesRef.current = []
    triviaActiveRef.current = false
    clearConvo()
  }

  // Show a Big Sam's Trivia card. Default = today's question (special-day themed one if it's
  // a special date, weekend → fresh web question, else the daily rotation). Pass { fresh }
  // for "give me another" or { category } to switch genres. Seeds the ACTIVE question's
  // answer into context so Jarvis can judge guesses, hint, and reveal against the right one.
  async function showTrivia({ category = null, topic = null, subject = null, fresh = false, back = false, seedContext = true } = {}) {
    let t
    if (back) {
      if (triviaPosRef.current > 0) {
        triviaPosRef.current -= 1
        t = triviaHistoryRef.current[triviaPosRef.current]
      } else {
        return null // nothing to go back to
      }
    } else if (topic || category || subject || fresh) {
      const sessionExcl = triviaHistoryRef.current.map((x) => x.question)
      // AI generation first (fresh, harder, deduped across days); bank is the fallback.
      const exclude = [...new Set([...sessionExcl, ...loadRecentQuestions()])]
      t = await generateTrivia({ subject, exclude, token: session?.access_token })
      if (!t) {
        t = topic ? (getTopicTrivia(topic, sessionExcl) || getRandomTrivia({ exclude: sessionExcl })) : getRandomTrivia({ category, exclude: sessionExcl })
      }
      if (!t) { pushUI('error', "Couldn't load trivia — try again in a sec."); return null }
      triviaHistoryRef.current = [...triviaHistoryRef.current, t]
      triviaPosRef.current = triviaHistoryRef.current.length - 1
    } else {
      // Default (button): keep the current chosen question if there is one (survives a
      // refresh), otherwise load today's daily/special/weekend question.
      if (triviaPosRef.current >= 0 && triviaHistoryRef.current[triviaPosRef.current]) {
        t = triviaHistoryRef.current[triviaPosRef.current]
      } else {
        t = await getDailyTrivia(session?.access_token)
        if (!t) { pushUI('error', "Couldn't load trivia — try again in a sec."); return null }
        triviaHistoryRef.current = [...triviaHistoryRef.current, t]
        triviaPosRef.current = triviaHistoryRef.current.length - 1
      }
    }
    triviaActiveRef.current = true
    pushRecentQuestion(t?.question) // remember across days so we stop repeating
    saveTriviaChoice(triviaHistoryRef.current, triviaPosRef.current)
    // ONE card only: drop any existing trivia card, then show the active one at the bottom.
    setTranscript((tr) => [...tr.filter((m) => m.role !== 'trivia'), { role: 'trivia', trivia: t }])
    // Button path has no Claude turn, so seed the answer/hints into context for judging.
    // The change_trivia tool path returns the question to Jarvis directly, so it skips this.
    if (seedContext) {
      messagesRef.current = [
        ...messagesRef.current,
        {
          role: 'user',
          content: `[SYSTEM CONTEXT — not from a chef] The ACTIVE "Big Sam's Trivia" question is on screen as a card — do NOT repost it. Question: "${t.question}" | Answer: "${t.answer}" | Hint 1: "${t.hint1}" | Hint 2: "${t.hint2}" | Fun fact: "${t.funFact}". Judge guesses against THIS (the most recent) question: generous fuzzy matching, hype if basically right, ONE hint at a time when wrong, reveal after 3 wrong guesses or on giving up. To change the question, call change_trivia.`,
        },
      ]
    }
    return t
  }

  // Jarvis-driven trivia swap (via the change_trivia tool). Returns the new question, or null.
  async function applyTriviaChange({ genre = null, topic = null, back = false } = {}) {
    if (back) return showTrivia({ back: true, seedContext: false })
    // Pass the RAW request as `subject` so AI generation can cover it directly; topic/category
    // (bank fallback keys) come along in case generation is unavailable.
    if (topic) {
      const key = detectTopic(topic)
      return showTrivia({ topic: key, subject: topic, fresh: !key, seedContext: false })
    }
    if (genre) {
      if (/general|random|any/i.test(genre)) return showTrivia({ fresh: true, seedContext: false })
      const cat = detectCategory(genre)
      return showTrivia({ category: cat, subject: genre, fresh: !cat, seedContext: false })
    }
    return showTrivia({ fresh: triviaActiveRef.current, seedContext: false })
  }

  function confirmWrite(toolUse) {
    return new Promise((resolve) => {
      const { title, message } = summarizeToolCall(toolUse.name, toolUse.input)
      setConfirm({ title, message, resolve })
    })
  }

  async function callClaude() {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ messages: sanitizeMessages(messagesRef.current) }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Request failed (${res.status})`)
    }
    return res.json()
  }

  async function send(text) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setInput('')
    pushUI('user', trimmed)
    messagesRef.current = [...messagesRef.current, { role: 'user', content: trimmed }]
    setBusy(true)
    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const { content } = await callClaude()
        messagesRef.current = [...messagesRef.current, { role: 'assistant', content }]
        for (const block of content) {
          if (block.type === 'text' && block.text?.trim()) pushUI('assistant', block.text.trim())
        }
        const toolUses = content.filter((b) => b.type === 'tool_use')
        if (toolUses.length === 0) break

        const toolResults = []
        for (const tu of toolUses) {
          let result
          // Each tool MUST yield a result — a thrown tool would otherwise leave this tool_use
          // unanswered and 400 every future turn. Catch so a failure becomes an error result.
          try {
            if (tu.name === 'change_trivia') {
              const t = await applyTriviaChange(tu.input || {})
              result = t
                ? { ok: true, question: t.question, answer: t.answer, hint1: t.hint1, hint2: t.hint2, funFact: t.funFact }
                : { error: 'No previous question to go back to.' }
              pushUI('tool', t ? '🎯 New trivia question' : '↩️ Nothing to go back to')
            } else if (WRITE_TOOLS.has(tu.name)) {
              const ok = await confirmWrite(tu)
              if (!ok) { pushUI('tool', '✋ Action cancelled'); result = { error: 'User declined the action.' } }
              else {
                result = await runTool(tu.name, tu.input)
                pushUI('tool', result?.error ? `⚠️ ${result.error}` : `✅ ${result?.message || 'Done'}`)
              }
            } else {
              result = await runTool(tu.name, tu.input)
              pushUI('tool', `🔎 ${labelForRead(tu.name)}`)
            }
          } catch (e) {
            result = { error: e?.message || 'Tool failed' }
            pushUI('tool', `⚠️ ${result.error}`)
          }
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result), is_error: !!result?.error })
        }
        messagesRef.current = [...messagesRef.current, { role: 'user', content: toolResults }]
      }
    } catch (err) {
      pushUI('error', err.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ask Jarvis"
        aria-label="Ask Jarvis"
        className="press animate-pulse-glow group fixed z-40 right-4 bottom-24 md:bottom-6 w-14 h-14 rounded-full bg-gradient-to-br from-store-green to-store-green-dark text-white flex items-center justify-center text-2xl hover:scale-105 transition-transform"
      >
        <span className="transition-transform duration-300 group-hover:rotate-12">🤖</span>
        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-store-gold border-2 border-store-cream" />
      </button>
    )
  }

  return (
    <>
      <div className="fixed z-40 right-4 bottom-24 md:bottom-6 w-[calc(100vw-2rem)] sm:w-96 h-[65vh] sm:h-[560px] flex flex-col bg-white border border-store-tan rounded-2xl shadow-xl overflow-hidden animate-float-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-store-green to-store-green-dark text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-lg">🤖</span>
            <div className="leading-tight">
              <div className="font-bold" style={{ fontFamily: 'var(--font-display)' }}>Jarvis</div>
              <div className="text-[11px] text-white/70 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-store-gold inline-block" />
                Online · {pageCtx.label}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {transcript.length > 0 && (
              <button onClick={newChat} title="New chat" aria-label="New chat" className="press text-[11px] font-semibold px-2 h-8 rounded-lg hover:bg-white/10 flex items-center">New</button>
            )}
            <button onClick={showTrivia} title="Big Sam's Trivia of the Day" aria-label="Trivia" className="press text-lg w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center">🎯</button>
            <button onClick={() => setOpen(false)} aria-label="Close" className="press text-white/90 hover:text-white text-lg w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center">✕</button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-store-cream/40">
          {transcript.length === 0 && (
            <div className="text-sm text-store-brown-light space-y-2 pt-1 animate-fade-in">
              <p>You're on <span className="font-semibold text-store-brown">{pageCtx.label}</span>. Ask me anything, or tell me to log or fix something:</p>
              <div className="flex flex-col gap-1.5">
                {pageCtx.examples.map((ex, idx) => (
                  <button
                    key={ex}
                    onClick={() => send(ex)}
                    style={{ '--stagger': idx }}
                    className="press stagger text-left text-xs bg-white border border-store-tan rounded-xl px-3 py-2 text-store-brown hover:border-store-green/40 hover:bg-store-green/5 shadow-sm"
                  >
                    {ex}
                  </button>
                ))}
                <button
                  onClick={showTrivia}
                  style={{ '--stagger': pageCtx.examples.length }}
                  className="press stagger text-left text-xs bg-store-gold/15 border border-store-gold/50 rounded-xl px-3 py-2 text-store-brown hover:bg-store-gold/25 shadow-sm flex items-center gap-1.5"
                >
                  🎯 Big Sam's Trivia of the Day
                </button>
              </div>
            </div>
          )}

          {transcript.map((m, i) => {
            if (m.role === 'trivia') return <TriviaCard key={i} t={m.trivia} />
            if (m.role === 'user') return (
              <div key={i} className="flex justify-end animate-fade-in-up"><div className="bg-store-green text-white rounded-2xl rounded-br-sm px-3 py-1.5 max-w-[85%] text-sm whitespace-pre-wrap shadow-sm">{m.text}</div></div>
            )
            if (m.role === 'assistant') return (
              <div key={i} className="bg-white border border-store-tan rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm text-store-brown shadow-sm max-w-[92%] animate-fade-in-up">
                <ReactMarkdown components={MD}>{m.text}</ReactMarkdown>
              </div>
            )
            if (m.role === 'tool') return <div key={i} className="text-center text-xs text-store-brown-light animate-fade-in">{m.text}</div>
            return <div key={i} className="text-center text-xs text-store-coral bg-store-coral/10 border border-store-coral/30 rounded-lg px-2.5 py-1 animate-fade-in">{m.text}</div>
          })}

          {busy && (
            <div className="flex items-center gap-1.5 text-store-green pl-1">
              <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
              <span className="text-xs text-store-brown-light ml-1">Jarvis is thinking…</span>
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="p-2.5 flex items-center gap-2 border-t border-store-tan bg-white shrink-0">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Jarvis…"
            disabled={busy}
            className="flex-1 min-w-0 border border-store-tan rounded-full px-4 py-2 text-sm bg-store-cream text-store-brown focus:outline-none focus:ring-2 focus:ring-store-green disabled:opacity-60"
          />
          <button type="submit" disabled={busy || !input.trim()} className="press bg-store-green hover:bg-store-green-dark text-white w-10 h-10 rounded-full text-sm font-semibold disabled:opacity-50 shrink-0 flex items-center justify-center shadow-sm">
            ➤
          </button>
        </form>
      </div>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        isDangerous
        confirmText="Do it"
        cancelText="Cancel"
        onConfirm={() => { confirm?.resolve(true); setConfirm(null) }}
        onCancel={() => { confirm?.resolve(false); setConfirm(null) }}
      />
    </>
  )
}

function labelForRead(name) {
  switch (name) {
    case 'get_inventory': return 'Checked inventory'
    case 'get_low_stock': return 'Checked low stock'
    case 'get_make_recommendations': return 'Worked out what to make'
    case 'get_sales_velocity': return 'Checked sales'
    case 'get_ingredient_stock': return 'Checked ingredients'
    case 'get_recent_activity': return 'Checked recent activity'
    case 'get_flavors': return 'Looked up flavors'
    case 'get_ingredients': return 'Looked up ingredients'
    default: return 'Looked something up'
  }
}
