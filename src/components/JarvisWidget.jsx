import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { useAuth } from '../hooks/useAuth'
import ConfirmDialog from './ConfirmDialog'
import { runTool, WRITE_TOOLS, summarizeToolCall } from '../utils/jarvisClientTools'
import { getTodayTrivia, triviaShownToday, markTriviaShown } from '../utils/trivia'

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
  '/':            { label: 'the Dashboard',   examples: ['What should I make today?', 'Which flavors are running low?', 'How many Sea Salt Caramel can I make?'] },
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
  const triviaSeededRef = useRef(false)

  const pageCtx = contextFor(location.pathname)

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [transcript, busy, open])

  // On the first open of the day, show Big Sam's Trivia as a card AND seed the hidden
  // answer/hints into the chat history so Jarvis can judge guesses, drop hints, and reveal.
  useEffect(() => {
    if (!open || triviaSeededRef.current || triviaShownToday()) return
    triviaSeededRef.current = true
    const t = getTodayTrivia()
    messagesRef.current = [
      ...messagesRef.current,
      {
        role: 'user',
        content: `[SYSTEM CONTEXT — not from a chef] Today's "Big Sam's Trivia of the Day" has ALREADY been shown to the crew as a card on screen, so do NOT repost the question. Question: "${t.question}" | Answer: "${t.answer}" | Hint 1: "${t.hint1}" | Hint 2: "${t.hint2}" | Fun fact: "${t.funFact}". When a chef guesses: be generous with fuzzy matching and hype them up if they're basically right; if wrong, give exactly ONE hint at a time; after 3 wrong guesses (or if they say to just tell them / give up) reveal the answer and the fun fact. If they ask about anything else, just help normally and don't force trivia.`,
      },
    ]
    setTranscript((tr) => [...tr, { role: 'trivia', trivia: t }])
    markTriviaShown()
  }, [open])

  if (!session) return null // owner-only

  function pushUI(role, text) { setTranscript((t) => [...t, { role, text }]) }

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
      body: JSON.stringify({ messages: messagesRef.current }),
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
          if (WRITE_TOOLS.has(tu.name)) {
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
          <button onClick={() => setOpen(false)} aria-label="Close" className="press text-white/90 hover:text-white text-lg w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center">✕</button>
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
