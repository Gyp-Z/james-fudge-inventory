# James' Fudge — MCP server

Lets your **desktop Jarvis** (Claude Desktop, Claude Code, or any MCP-capable assistant)
check the shop's stock and log/fix data — using the exact same logic as the web app, so
nothing bypasses the deduction math.

## What it exposes

The same tools as the in-app Jarvis chat:

- **Read:** `get_inventory`, `get_low_stock`, `get_sales_velocity`, `get_ingredient_stock`,
  `get_recent_activity`, `get_flavors`, `get_ingredients`
- **Write:** `log_batch`, `add_product_entry`, `set_inventory_count`, `set_ingredient_quantity`

## Setup

1. Install deps (from the project root): `npm install`
2. Make sure the project `.env` has:
   - `VITE_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`  ← the server runs as the owner; keep this machine-local
3. Register the server in your assistant's MCP config.

**Claude Desktop / Claude Code style config** (`mcpServers` block):

```json
{
  "mcpServers": {
    "james-fudge": {
      "command": "node",
      "args": ["C:\\Users\\zghas\\.gemini\\antigravity\\scratch\\james-fudge-inventory\\mcp\\server.js"]
    }
  }
}
```

(Adjust the path if the project moves. The server loads `.env` from the project root
automatically, so no env vars are needed in the config block.)

## Test it standalone

```bash
npx @modelcontextprotocol/inspector node mcp/server.js
```

Then in the Inspector: list tools, call `get_inventory`, and try `log_batch` with
`{ "flavor": "Vanilla", "count": 1, "date": "2026-06-14" }`. The effect is identical to
logging it in the web app's Fixes page.

## Safety

- Runs locally and uses the **service-role** key (full DB access) — this machine = the owner.
  Don't expose this server to the network.
- Destructive tools (`log_batch`, `set_*`, `add_product_entry`) actually change data. Your
  assistant should prompt you to approve tool calls before running them (Claude Desktop and
  Claude Code do this by default).
