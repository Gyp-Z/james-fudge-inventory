// Browser binding of the shared tool executor: runs tools against the anon (RLS) client.
// Writes are gated by ConfirmDialog in the Jarvis page before this is called.
import { supabase } from '../lib/supabase'
import { runTool as coreRunTool, WRITE_TOOLS, summarizeToolCall } from '../core/ops.js'

export const runTool = (name, input) => coreRunTool(supabase, name, input)
export { WRITE_TOOLS, summarizeToolCall }
