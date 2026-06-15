// Vercel serverless function — the ONLY place the Anthropic API key lives.
// Stateless Claude inference proxy for the in-app Jarvis chat. It does NOT touch the
// database; tools are executed in the browser (with confirmation) by the Jarvis page.
//
// Security: this is a public URL, so it requires the caller's Supabase access token and
// verifies it before spending any tokens. Owner-only, matching the Jarvis page gating.
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { SYSTEM_PROMPT, TOOL_SCHEMAS } from '../src/core/toolSchemas.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  // ── Verify the caller is the authenticated owner ──
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'Missing auth token' })
    return
  }
  try {
    const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
    const { data, error } = await sb.auth.getUser(token)
    if (error || !data?.user) {
      res.status(401).json({ error: 'Invalid session' })
      return
    }
  } catch {
    res.status(401).json({ error: 'Auth verification failed' })
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' })
    return
  }

  const messages = req.body?.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array required' })
    return
  }

  try {
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: TOOL_SCHEMAS,
      messages,
    })
    res.status(200).json({ content: message.content, stop_reason: message.stop_reason })
  } catch (err) {
    const status = err?.status && Number.isInteger(err.status) ? err.status : 500
    res.status(status).json({ error: err?.message || 'Claude request failed' })
  }
}
