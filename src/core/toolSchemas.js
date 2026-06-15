// Shared tool catalog + system prompt, defined ONCE and consumed by both:
//   - the in-app Jarvis chat (api/chat.js sends these to Claude)
//   - the local MCP server (mcp/server.js registers these as MCP tools)
// Tool execution lives in src/core/ops.js (runTool).

export const SYSTEM_PROMPT = `You are Jarvis, the assistant for James' Fudge — a family fudge and popcorn shop in Sea Isle City, NJ. You help the owner check stock, decide what to make, plan ordering, and correct/log data by conversation.

Business rules you must respect:
- Season started 2026-04-22. All dates are US Eastern (America/New_York). When the owner says "yesterday"/"today", compute the Eastern date.
- Fudge is tracked in trays; popcorn in barrels.
- Caramel is a component (not sold directly) used to make Sea Salt Caramel fudge: 1 caramel tray makes 18 SSC trays. The caramel count is computed forward from batch logs — read it via get_inventory, never guess it.
- Logging a batch deducts that flavor's base ingredients automatically. Logging a product entry (trays made) deducts per-tray toppings automatically, and for Sea Salt Caramel also draws down caramel. You never do this math yourself — the tools do it.
- Popcorn batches do NOT change barrels; barrels move through product entries.

How to behave:
- Never invent a flavor or ingredient name. If unsure of the exact name, call get_flavors or get_ingredients first.
- Prefer a tool call over answering from memory for any question about current numbers.
- Before taking a write action (log_batch, add_product_entry, set_inventory_count, set_ingredient_quantity), make sure you have the flavor/ingredient, the date, and the amounts. Confirmation of write actions is handled outside of you, so just call the tool with the right arguments.
- Be concise and practical. Lead with the answer. The owner is busy and non-technical.

Deciding WHAT TO MAKE (use get_make_recommendations):
- It ranks flavors that are at/under the owner's own restock threshold or about to run out, using BOTH how many are left and how fast they sell. A slow seller can be the #1 priority if only 1-2 are left (e.g. Chocolate Coconut). Lead with the most urgent.
- One batch of a flavor yields its "makes_per_batch" trays of THAT flavor only (e.g. Pistachio: one batch = 3 pistachio trays). You cannot get one flavor from another flavor's batch.
- role = "finish_from_base": made by making the BASE batch (the "batch_flavor", e.g. Chocolate) and finishing it with toppings (e.g. Chocolate Reese's = a chocolate base + Reese's). So if Chocolate Reese's is low, suggest making a Chocolate batch and finishing it as Reese's. If several chocolate-based toppings are low, one chocolate batch can cover several — say so.
- role = "own_batch": must be made as its own batch and can't be finished from a base (Key Lime, Chocolate Coconut, Chocolate Raspberry, Pistachio, Chocolate Mint, etc.).
- role = "ssc" (Sea Salt Caramel): needs caramel. 1 caramel tray makes 18 SSC trays, and caramel is made 1 tray per batch. If SSC needs making and caramel_trays is low, tell them to make the CARAMEL first, then the SSC.
- "double_batch" flavors take two pours/batches to complete one make — mention it when relevant.

LOGGING PRODUCTION (this order is mess-up-proof — never skip it):
- Recording trays made is TWO steps, in order: (1) log_batch — this deducts the base ingredients; then (2) add_product_entry for the trays — this deducts toppings and updates the shelf count.
- If a chef says they made trays of something (e.g. "I made 3 chocolate") and the batch wasn't logged first, do NOT just add the product entry. Ask whether they want to log the batch first and then the product entry, and offer to do both in order. Skipping the batch log means the base ingredients never come out of stock.
- For a "finish_from_base" flavor, the batch you log is the BASE (its batch_flavor) and the product entry is the variant. For "own_batch" flavors, the batch and the product are the same flavor. Call get_flavors if you need a flavor's role/batch_flavor.`

export const TOOL_SCHEMAS = [
  {
    name: 'get_inventory',
    description: 'Current stock: trays per fudge flavor, barrels per popcorn flavor, plus the computed caramel tray count. Call this for "what do we have", "what\'s on the shelf", or before recommending what to make.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_low_stock',
    description: 'Flavors at/under their low threshold and ingredients at/under their low threshold. Call this for "what\'s low" or "what do I need to order".',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_make_recommendations',
    description: 'Ranked list of what to make next, using each flavor\'s restock threshold + sell-rate, plus how it\'s produced (own batch vs finished from a base), batch yield, double-batch needs, and the caramel level for Sea Salt Caramel. Call this for "what should I make", "what\'s next", or production planning.',
    input_schema: { type: 'object', properties: { days: { type: 'integer', description: 'Sell-rate window in days (default 14)' }, horizon: { type: 'integer', description: 'Also include flavors with this many days of stock left or fewer (default 2)' } }, additionalProperties: false },
  },
  {
    name: 'get_sales_velocity',
    description: 'Trays sold per day per flavor over a recent window. Call this for "what\'s selling" or to weigh production decisions.',
    input_schema: { type: 'object', properties: { days: { type: 'integer', description: 'Window length in days (default 7)' } }, additionalProperties: false },
  },
  {
    name: 'get_ingredient_stock',
    description: 'Ingredient quantities with burn rate and projected days of stock remaining. Call this for "how much butter is left and when do we run out" or ordering decisions.',
    input_schema: { type: 'object', properties: { days: { type: 'integer', description: 'Burn-rate window in days (default 14)' } }, additionalProperties: false },
  },
  {
    name: 'get_recent_activity',
    description: 'Batches and product entries logged in a recent window, optionally filtered to one flavor. Call this for "what was logged" or to check whether something was already entered.',
    input_schema: { type: 'object', properties: { days: { type: 'integer', description: 'Window length in days (default 7)' }, flavor: { type: 'string', description: 'Optional flavor name filter' } }, additionalProperties: false },
  },
  {
    name: 'get_flavors',
    description: 'Exact flavor names and types. Call this before any write if you are unsure of the exact flavor name.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_ingredients',
    description: 'Exact ingredient names, units, and quantities. Call this before set_ingredient_quantity if unsure of the exact name.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'log_batch',
    description: 'Record that a batch was made (or wasted). Use for "I made 2 vanilla yesterday I forgot to log". Base ingredients auto-deduct (popcorn deducts ingredients but not barrels; caramel adds 1 tray per batch).',
    input_schema: {
      type: 'object',
      properties: {
        flavor: { type: 'string', description: 'Exact flavor name' },
        count: { type: 'integer', description: 'Number of batches (default 1)' },
        date: { type: 'string', description: 'YYYY-MM-DD (Eastern). Defaults to today.' },
        is_wasted: { type: 'boolean', description: 'True if the batch was wasted (no ingredient deduction)' },
        waste_reason: { type: 'string', description: 'Optional reason if wasted' },
      },
      required: ['flavor'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_product_entry',
    description: 'Add an end-of-day product entry for a FUDGE flavor on a date: trays made, sold, wasted, in-progress. Per-tray toppings auto-deduct; Sea Salt Caramel also draws down caramel. Use to add/fix a missed report.',
    input_schema: {
      type: 'object',
      properties: {
        flavor: { type: 'string', description: 'Exact fudge flavor name' },
        date: { type: 'string', description: 'YYYY-MM-DD (Eastern). Defaults to today.' },
        full_trays: { type: 'integer', description: 'Full trays made' },
        trays_sold: { type: 'integer', description: 'Trays sold' },
        trays_wasted: { type: 'integer', description: 'Full trays wasted' },
        in_progress_trays: { type: 'integer', description: 'In-progress (half) trays made' },
      },
      required: ['flavor'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_inventory_count',
    description: 'Directly set a flavor\'s shelf count (trays for fudge, barrels for popcorn) after a physical recount. Records an audit entry.',
    input_schema: {
      type: 'object',
      properties: {
        flavor: { type: 'string', description: 'Exact flavor name' },
        value: { type: 'number', description: 'The true count' },
        reason: { type: 'string', description: 'Optional reason, e.g. "physical recount"' },
      },
      required: ['flavor', 'value'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_ingredient_quantity',
    description: 'Directly set an ingredient\'s quantity after a physical recount (e.g. butter 125 -> 115). Records an audit entry.',
    input_schema: {
      type: 'object',
      properties: {
        ingredient: { type: 'string', description: 'Exact ingredient name' },
        value: { type: 'number', description: 'The true quantity (in the ingredient\'s delivery unit)' },
        reason: { type: 'string', description: 'Optional reason' },
      },
      required: ['ingredient', 'value'],
      additionalProperties: false,
    },
  },
]
