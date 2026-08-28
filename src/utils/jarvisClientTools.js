// Browser binding of the shared tool executor: runs tools against the anon (RLS) client.
// Writes are gated by ConfirmDialog in the Jarvis page before this is called.
import { supabase } from '../lib/supabase'
import {
  runTool as coreRunTool,
  WRITE_TOOLS,
  summarizeToolCall,
  sanitizeMessages,
  loadDailyConversation as coreLoadConvo,
  saveDailyConversation as coreSaveConvo,
  clearDailyConversation as coreClearConvo,
} from '../core/ops.js'

export const runTool = (name, input) => coreRunTool(supabase, name, input)

// Per-day conversation memory, bound to the anon client (owner tablet).
export const loadDailyConversation = (date) => coreLoadConvo(supabase, date)
export const saveDailyConversation = (date, transcript, messages) => coreSaveConvo(supabase, date, transcript, messages)
export const clearDailyConversation = (date) => coreClearConvo(supabase, date)

export { WRITE_TOOLS, summarizeToolCall, sanitizeMessages }
