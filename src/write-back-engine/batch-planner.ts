/* global performance */

import type { ReviewItem, ReviewMode } from "@/review-engine";
import { isSupportedWriteBackAction } from "./preflight";
import type {
  BatchExclusionReason,
  PlannedWriteBackItem,
  WriteBackPlan,
  WriteBackPlanTotals,
} from "./batch-types";
import type { WriteBackResult, WriteBackState } from "./types";

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function actionStart(item: ReviewItem): number {
  const action = item.proposedAction;
  if (!action) return item.finding.start;
  return action.type === "TEXT_INSERT" ? action.position : action.start;
}

function actionRank(item: ReviewItem): number {
  if (item.proposedAction?.type === "TEXT_REPLACE") return 0;
  if (item.proposedAction?.type === "TEXT_INSERT") return 1;
  if (item.proposedAction?.type === "FORMAT_CHANGE") return 2;
  return 3;
}

function exclusionReason(
  item: ReviewItem,
  mode: ReviewMode,
  existing?: WriteBackResult
): BatchExclusionReason | undefined {
  if (existing?.status === "APPLIED") return "ALREADY_APPLIED";
  if (existing?.status === "STALE") return "STALE_BEFORE_RUN";
  if (item.decision.explicitStatus === "REJECTED") return "USER_REJECTED";
  if (item.decision.explicitStatus === "DEFERRED") return "USER_DEFERRED";
  if (item.decision.explicitStatus === "MANUALLY_CHECKED") return "USER_MANUALLY_CHECKED";
  if (item.conflicts.length > 0) return "CONFLICT";
  if (item.reviewClass === "MANUAL") return "MANUAL_REVIEW_REQUIRED";
  if (item.reviewClass === "TECHNICAL") return "TECHNICAL_BLOCK";
  if (item.reviewClass === "INFO") return "INFORMATION_ONLY";
  if (!item.proposedAction) return "NO_ACTION";
  if (!item.technicalEligibility.eligible) return "TECHNICAL_BLOCK";
  if (!isSupportedWriteBackAction(item.proposedAction)) return "UNSUPPORTED_ACTION";
  if (mode === "ANALYSIS") return "NOT_ACCEPTED";
  if (
    mode === "REVIEW" &&
    !(
      item.decision.source === "USER" &&
      item.decision.explicitStatus === "ACCEPTED" &&
      item.decision.effectiveStatus === "ACCEPTED"
    )
  ) {
    return "NOT_ACCEPTED";
  }
  if (
    mode === "CORRECTION" &&
    !(item.reviewClass === "AUTO" && item.decision.effectiveStatus === "ACCEPTED")
  ) {
    return "NOT_ACCEPTED";
  }
  return undefined;
}

function totals(items: readonly PlannedWriteBackItem[]): WriteBackPlanTotals {
  return {
    totalReviewItems: items.length,
    eligible: items.filter((item) => item.planned).length,
    excluded: items.filter((item) => !item.planned).length,
    manual: items.filter((item) => item.exclusionReason === "MANUAL_REVIEW_REQUIRED").length,
    technical: items.filter(
      (item) => item.exclusionReason === "TECHNICAL_BLOCK" || item.exclusionReason === "CONFLICT"
    ).length,
    info: items.filter((item) => item.exclusionReason === "INFORMATION_ONLY").length,
    rejected: items.filter((item) => item.exclusionReason === "USER_REJECTED").length,
    deferred: items.filter((item) => item.exclusionReason === "USER_DEFERRED").length,
    manuallyChecked: items.filter((item) => item.exclusionReason === "USER_MANUALLY_CHECKED")
      .length,
    alreadyApplied: items.filter((item) => item.exclusionReason === "ALREADY_APPLIED").length,
  };
}

export function groupPlannedWriteBackItems(
  items: readonly PlannedWriteBackItem[]
): Map<string, PlannedWriteBackItem[]> {
  const groups = new Map<string, PlannedWriteBackItem[]>();
  for (const item of items) {
    const group = groups.get(item.footnoteId);
    if (group) group.push(item);
    else groups.set(item.footnoteId, [item]);
  }
  return groups;
}

export function createWriteBackPlan(input: {
  mode: ReviewMode;
  items: readonly ReviewItem[];
  state?: WriteBackState;
  createdAt?: string;
}): WriteBackPlan {
  const planningStartedAt = performance.now();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const sourceOrder = new Map(input.items.map((item, index) => [item.reviewItemId, index]));
  const plannedItems = input.items.map((item): PlannedWriteBackItem => {
    const reason = exclusionReason(item, input.mode, input.state?.[item.reviewItemId]);
    return {
      reviewItemId: item.reviewItemId,
      footnoteId: item.finding.footnoteId,
      footnoteOrdinal: item.finding.footnoteOrdinal,
      ruleId: item.finding.ruleId,
      actionKind: item.proposedAction?.type,
      planned: reason === undefined,
      ...(reason ? { exclusionReason: reason } : {}),
      originalStart: item.finding.start,
      originalEnd: item.finding.end,
      dependencyGroupId: `footnote:${item.finding.footnoteId}`,
    };
  });
  plannedItems.sort((left, right) => {
    const leftItem = input.items[sourceOrder.get(left.reviewItemId) ?? 0];
    const rightItem = input.items[sourceOrder.get(right.reviewItemId) ?? 0];
    return (
      left.footnoteOrdinal - right.footnoteOrdinal ||
      actionRank(leftItem) - actionRank(rightItem) ||
      (actionRank(leftItem) < 2 ? actionStart(rightItem) - actionStart(leftItem) : 0) ||
      (sourceOrder.get(left.reviewItemId) ?? 0) - (sourceOrder.get(right.reviewItemId) ?? 0) ||
      left.reviewItemId.localeCompare(right.reviewItemId)
    );
  });
  const identity = `${input.mode}:${createdAt}:${plannedItems
    .map((item) => `${item.reviewItemId}:${item.planned ? "1" : item.exclusionReason}`)
    .join("|")}`;
  return {
    planId: `writeback-plan-${stableHash(identity)}`,
    mode: input.mode,
    createdAt,
    items: plannedItems,
    totals: totals(plannedItems),
    planningDurationMs: performance.now() - planningStartedAt,
  };
}
