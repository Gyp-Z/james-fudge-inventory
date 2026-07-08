// Browser-bound wrappers over the client-agnostic core (src/core/ops.js).
// Signatures match what ShiftReport and the Fixes components already call — the core
// refactor is behavior-preserving. The real logic (shared with the Jarvis chat and the MCP
// server) lives in core.
import { supabase } from '../lib/supabase'
import * as core from '../core/ops.js'

export const logBatchWithEffects = (flavor, dateStr, opts) =>
  core.logBatchWithEffects(supabase, flavor, dateStr, opts)

export const computeTrayInventory = core.computeTrayInventory

export const applyTrayDeductions = (flavor, fullTrays, entryId = null) =>
  core.applyTrayDeductions(supabase, flavor, fullTrays, entryId)

export const creditCaramelComponent = (flavorName, trays) =>
  core.creditCaramelComponent(supabase, flavorName, trays)

export const applyShiftEntry = (flavor, dateStr, values, opts) =>
  core.applyShiftEntry(supabase, flavor, dateStr, values, opts)

export const reverseShiftEntry = (entryId) =>
  core.reverseShiftEntry(supabase, entryId)

export const applyPopcornEntry = (flavor, dateStr, values) =>
  core.applyPopcornEntry(supabase, flavor, dateStr, values)

export const reversePopcornEntry = (logId) =>
  core.reversePopcornEntry(supabase, logId)

export const logInventoryAdjustment = (args) =>
  core.logInventoryAdjustment(supabase, args)

export const logFudgePops = (base, popCount, dateStr) =>
  core.logFudgePops(supabase, base, popCount, dateStr)

export const revertBatchLog = (batchLogId) =>
  core.revertBatchLog(supabase, batchLogId)

export const revertFudgePopLog = (logId) =>
  core.revertFudgePopLog(supabase, logId)
