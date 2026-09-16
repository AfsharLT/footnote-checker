import type { ReviewConflict, ReviewItem, ReviewSummary } from "./types";

export function isCorrectionReady(item: ReviewItem): boolean {
  return (
    item.decision.effectiveStatus === "ACCEPTED" &&
    item.reviewClass === "AUTO" &&
    item.technicalEligibility.eligible &&
    item.proposedAction !== undefined &&
    item.conflicts.length === 0
  );
}

export function createReviewSummary(
  items: readonly ReviewItem[],
  conflicts: readonly ReviewConflict[]
): ReviewSummary {
  const summary: ReviewSummary = {
    total: items.length,
    byClass: { automatic: 0, manual: 0, technical: 0, info: 0 },
    byStatus: { open: 0, accepted: 0, manuallyChecked: 0, rejected: 0, deferred: 0 },
    actionable: 0,
    correctionReady: 0,
    conflicts: conflicts.length,
  };
  items.forEach((item) => {
    if (item.reviewClass === "AUTO") summary.byClass.automatic += 1;
    else if (item.reviewClass === "MANUAL") summary.byClass.manual += 1;
    else if (item.reviewClass === "TECHNICAL") summary.byClass.technical += 1;
    else summary.byClass.info += 1;

    if (item.decision.effectiveStatus === "UNREVIEWED") summary.byStatus.open += 1;
    else if (item.decision.effectiveStatus === "ACCEPTED") summary.byStatus.accepted += 1;
    else if (item.decision.effectiveStatus === "MANUALLY_CHECKED") {
      summary.byStatus.manuallyChecked += 1;
    } else if (item.decision.effectiveStatus === "REJECTED") summary.byStatus.rejected += 1;
    else summary.byStatus.deferred += 1;

    if (item.proposedAction) summary.actionable += 1;
    if (isCorrectionReady(item)) summary.correctionReady += 1;
  });
  return summary;
}
