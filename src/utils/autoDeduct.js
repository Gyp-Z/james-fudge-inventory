// Browser-bound wrappers over the client-agnostic core (src/core/ops.js).
// Signatures are unchanged from before the core refactor, so existing call sites
// (ShiftReport, the Fixes components) keep working identically. The real logic — and the
// single source of truth shared with the Jarvis chat and the MCP server — lives in core.
import { supabase } from '../lib/supabase'
import * as core from '../core/ops.js'

export const autoDeductIngredients = (flavorId, batchLogId) =>
  core.autoDeductIngredients(supabase, flavorId, batchLogId)

export const autoDeductTrayIngredients = (flavorId, fullTrays, shiftReportEntryId = null) =>
  core.autoDeductTrayIngredients(supabase, flavorId, fullTrays, shiftReportEntryId)

export const deductCaramelComponent = (flavorName, batchYield) =>
  core.deductCaramelComponent(supabase, flavorName, batchYield)

export const incrementBarrelCount = (flavorId, amount) =>
  core.incrementBarrelCount(supabase, flavorId, amount)

export const revertBatchLog = (batchLogId) =>
  core.revertBatchLog(supabase, batchLogId)
