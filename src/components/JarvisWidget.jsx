import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import ConfirmDialog from './ConfirmDialog'
import { runTool, WRITE_TOOLS, summarizeToolCall } from '../utils/jarvisClientTools'

// Floating, owner-only Jarvis assistant available on every page. A launcher bubble opens a
// chat panel; the agentic loop + write-confirmation logic is the same as the old page.
const EXAMPLES = [
  'What should I make today?',
  'How much butter do we have, and when do we run out?',
  'Log 2 trays of vanilla I made yesterday',
]
const MAX_TURNS = 8

export default function JarvisWidget() {
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  const [transcript, setTranscript] = useState([]) // { role, text }
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const scrollRef = useRef(null)
  const messagesRef = useRef([])

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [transcript, busy, open])

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
        className="fixed z-40 right-4 bottom-20 sm:bottom-6 w-14 h-14 rounded-full bg-store-green text-white shadow-lg flex items-center justify-center text-2xl hover:bg-store-green-dark active:scale-95 transition-all"
      >
        🤖
      </button>
    )
  }

  return (
    <>
      <div className="fixed z-40 right-4 bottom-20 sm:bottom-6 w-[calc(100vw-2rem)] sm:w-96 h-[65vh] sm:h-[560px] flex flex-col bg-white border border-store-tan rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-store-green text-white shrink-0">
          <span className="font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
            🤖 Jarvis
          </span>
          <button onClick={() => setOpen(false)} aria-label="Close" className="text-white/90 hover:text-white text-lg px-1">✕</button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-store-cream/40">
          {transcript.length === 0 && (
            <div className="text-sm text-store-brown-light space-y-2 pt-1">
              <p>Ask me about the shop, or tell me to log/fix something:</p>
              <div className="flex flex-col gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => send(ex)} className="text-left text-xs bg-white border border-store-tan rounded-lg px-2.5 py-1.5 text-store-brown hover:bg-store-cream transition-colors">
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {transcript.map((m, i) => {
            if (m.role === 'user') return (
              <div key={i} className="flex justify-end"><div className="bg-store-green text-white rounded-2xl rounded-br-sm px-3 py-1.5 max-w-[85%] text-sm whitespace-pre-wrap">{m.text}</div></div>
            )
            if (m.role === 'assistant') return (
              <div key={i} className="flex justify-start"><div className="bg-white border border-store-tan rounded-2xl rounded-bl-sm px-3 py-1.5 max-w-[85%] text-sm text-store-brown whitespace-pre-wrap">{m.text}</div></div>
            )
            if (m.role === 'tool') return <div key={i} className="text-center text-xs text-store-brown-light">{m.text}</div>
            return <div key={i} className="text-center text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1">{m.text}</div>
          })}

          {busy && <div className="text-center text-xs text-store-brown-light animate-pulse">Jarvis is thinking…</div>}
        </div>

        {/* Input */}
        <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="p-2.5 flex items-center gap-2 border-t border-store-tan bg-white shrink-0">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Jarvis…"
            disabled={busy}
            className="flex-1 min-w-0 border border-store-tan rounded-xl px-3 py-2 text-sm bg-store-cream text-store-brown focus:outline-none focus:ring-2 focus:ring-store-green disabled:opacity-60"
          />
          <button type="submit" disabled={busy || !input.trim()} className="bg-store-green hover:bg-store-green-dark text-white px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 shrink-0">
            Send
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
