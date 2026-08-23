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
export { createAppliedMutationRecord, revalidateActionLocally } from "./local-revalidation";
export {
  isCorrectionAutoApplyCandidate,
  runCorrectionAutoApply,
  selectCorrectionAutoApplyItems,
  type CorrectionAutoApplyProgress,
  type CorrectionAutoApplyResult,
  type CorrectionAutoApplySummary,
} from "./correction-auto-apply";
export type * from "./types";
