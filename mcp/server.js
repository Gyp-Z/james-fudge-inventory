// Local stdio MCP server for James' Fudge.
//
// Exposes the SAME tools as the in-app Jarvis chat (from src/core/toolSchemas.js) and runs
// them through the SAME logic (src/core/ops.js → runTool) — so the owner's desktop Jarvis
// assistant can check stock and log/fix data with identical effects to the web app.
//
// Runs on the owner's machine and uses the Supabase SERVICE ROLE key from the project .env
// (never shipped to the browser). The desktop assistant is responsible for confirming
// destructive tool calls in its own UI.
//
// Register it in your desktop assistant's MCP config — see mcp/README.md.

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { TOOL_SCHEMAS } from '../src/core/toolSchemas.js'
import { runTool } from '../src/core/ops.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[james-fudge mcp] Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const server = new Server({ name: 'james-fudge', version: '1.0.0' }, { capabilities: { tools: {} } })

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_SCHEMAS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })),
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params
  try {
    const result = await runTool(sb, name, args || {})
    return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: !!result?.error }
  } catch (err) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: err?.message || 'tool failed' }) }], isError: true }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('[james-fudge mcp] ready on stdio') // stderr only — stdout is the MCP transport
