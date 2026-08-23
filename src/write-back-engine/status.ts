import type { ReviewItem } from "@/review-engine";
import type { WriteBackResult, WriteBackState, WriteBackStatus } from "./types";
import { isSupportedWriteBackAction } from "./preflight";

export const WRITE_BACK_STATUS_LABELS: Record<WriteBackStatus, string> = {
  PENDING: "Ausstehend",
  APPLIED: "Durchgeführt",
  FAILED: "Fehlgeschlagen",
  STALE: "Erneut prüfen",
};

export function writeBackResultLabel(result: WriteBackResult): string {
  return result.reason === "ALREADY_RESOLVED"
    ? "Bereits erledigt"
    : WRITE_BACK_STATUS_LABELS[result.status];
}

export function createPendingWriteBackResult(
  reviewItem: ReviewItem,
  message = "Ausstehend"
): WriteBackResult {
  return {
    reviewItemId: reviewItem.reviewItemId,
    status: "PENDING",
    actionKind: reviewItem.proposedAction?.type,
    message,
  };
}

export function writeBackResultForItem(
  state: WriteBackState,
  reviewItem: ReviewItem
): WriteBackResult | undefined {
  const stored = state[reviewItem.reviewItemId];
  if (stored) return stored;
  return canApplySingleReviewItem(reviewItem)
    ? createPendingWriteBackResult(reviewItem)
    : undefined;
}

export function canApplySingleReviewItem(
  reviewItem: ReviewItem,
  result?: WriteBackResult
): boolean {
  if (
    reviewItem.decision.effectiveStatus !== "ACCEPTED" ||
    !reviewItem.proposedAction ||
    !reviewItem.technicalEligibility.eligible ||
    reviewItem.conflicts.length > 0 ||
    !isSupportedWriteBackAction(reviewItem.proposedAction)
  ) {
    return false;
  }
  if (result?.status === "APPLIED" || result?.status === "STALE") return false;
  return !(result?.status === "PENDING" && result.message === "Wird durchgeführt …");
}
