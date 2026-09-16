import type {
  BatchItemResult,
  BatchWriteBackSummary,
  PlannedWriteBackItem,
  WriteBackPlan,
} from "./batch-types";

function resultByReviewItemId(results: readonly BatchItemResult[]): Map<string, BatchItemResult> {
  return new Map(results.map((result) => [result.reviewItemId, result]));
}

export function createBatchWriteBackSummary(
  plan: WriteBackPlan,
  results: readonly BatchItemResult[]
): BatchWriteBackSummary {
  const byId = resultByReviewItemId(results);
  const summary: BatchWriteBackSummary = {
    totalFindings: plan.items.length,
    planned: plan.totals.eligible,
    applied: 0,
    alreadyResolved: 0,
    stale: 0,
    failed: 0,
    manualReview: 0,
    technical: 0,
    info: 0,
    rejected: 0,
    deferred: 0,
    manuallyChecked: 0,
    notActionable: 0,
  };
  for (const item of plan.items) {
    const result = byId.get(item.reviewItemId);
    if (item.planned && result) {
      if (result.writeBackStatus === "APPLIED" && result.alreadyResolved) {
        summary.alreadyResolved += 1;
      } else if (result.writeBackStatus === "APPLIED") {
        summary.applied += 1;
      } else if (result.writeBackStatus === "STALE") {
        summary.stale += 1;
      } else if (result.writeBackStatus === "FAILED") {
        summary.failed += 1;
      } else {
        summary.notActionable += 1;
      }
      continue;
    }
    classifyExcluded(item, summary);
  }
  return summary;
}

function classifyExcluded(item: PlannedWriteBackItem, summary: BatchWriteBackSummary): void {
  if (item.exclusionReason === "MANUAL_REVIEW_REQUIRED") summary.manualReview += 1;
  else if (item.exclusionReason === "TECHNICAL_BLOCK" || item.exclusionReason === "CONFLICT") {
    summary.technical += 1;
  } else if (item.exclusionReason === "INFORMATION_ONLY") summary.info += 1;
  else if (item.exclusionReason === "USER_REJECTED") summary.rejected += 1;
  else if (item.exclusionReason === "USER_DEFERRED") summary.deferred += 1;
  else if (item.exclusionReason === "USER_MANUALLY_CHECKED") summary.manuallyChecked += 1;
  else if (item.exclusionReason === "ALREADY_APPLIED") summary.alreadyResolved += 1;
  else summary.notActionable += 1;
}
