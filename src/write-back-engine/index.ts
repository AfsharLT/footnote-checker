export { applySingleReviewItem } from "./runner";
export {
  canApplySingleReviewItem,
  createPendingWriteBackResult,
  writeBackResultLabel,
  writeBackResultForItem,
  WRITE_BACK_STATUS_LABELS,
} from "./status";
export {
  actionRange,
  formatProperty,
  isSupportedWriteBackAction,
  preflightResolvedTarget,
  preflightReviewItem,
  SUPPORTED_FORMAT_PROPERTIES,
} from "./preflight";
export {
  createAppliedMutationRecord,
  rebaseResolvedRangeThroughMutations,
  revalidateActionLocally,
} from "./local-revalidation";
export {
  createFootnoteWritePlan,
  type CurrentFootnoteWriteSnapshot,
  type FootnoteWritePlan,
  type FootnoteWritePlanStatus,
  type PlannedFootnoteAction,
} from "./footnote-write-plan";
export { DEFAULT_WRITEBACK_FOOTNOTE_CHUNK_SIZE } from "./office-adapter";
export {
  isCorrectionAutoApplyCandidate,
  runCorrectionAutoApply,
  selectCorrectionAutoApplyItems,
  type CorrectionAutoApplyProgress,
  type CorrectionAutoApplyResult,
  type CorrectionAutoApplySummary,
} from "./correction-auto-apply";
export { createWriteBackPlan, groupPlannedWriteBackItems } from "./batch-planner";
export { createBatchProgress, batchProgressPercent } from "./batch-progress";
export { createBatchWriteBackSummary } from "./batch-summary";
export { getBatchRuntimeDiagnostics, runWriteBackBatch } from "./batch-runner";
export {
  buildWriteBackReportRows,
  CURRENT_WRITEBACK_REPORT_SCHEMA_VERSION,
  WRITEBACK_REPORT_HEADERS,
} from "./batch-report";
export { serializeWriteBackReportCsv, writeBackReportFileName } from "./csv-report";
export type * from "./batch-types";
export type { WriteBackReportHeader, WriteBackReportRow } from "./batch-report";
export type * from "./types";
