import { buildProposedReviewAction } from "./action-builder";
import { classifyReviewItem } from "./classifier";
import { detectReviewConflicts } from "./conflict-detector";
import { reconcileReviewDecisions, resolveReviewDecision } from "./decision-state";
import { createReviewSummary } from "./summary";
import {
  addTechnicalEligibilityReason,
  evaluateTechnicalEligibility,
} from "./technical-eligibility";
import type { ReviewEngineInput, ReviewEngineResult, ReviewItem } from "./types";

export function runReviewEngine(input: ReviewEngineInput): ReviewEngineResult {
  const startedAt = Date.now();
  const footnotes = new Map(input.footnotes.map((footnote) => [footnote.id, footnote]));
  const decisionState = reconcileReviewDecisions(input.decisionState ?? {}, input.findings);

  let items: ReviewItem[] = input.findings.map((finding) => {
    const proposedAction = buildProposedReviewAction(finding);
    const eligibility = evaluateTechnicalEligibility(
      finding,
      footnotes.get(finding.footnoteId),
      proposedAction,
      input.protectedRangesByFootnoteId?.get(finding.footnoteId) ?? []
    );
    const classification = classifyReviewItem(finding, proposedAction, eligibility);
    const canAccept =
      proposedAction !== undefined &&
      eligibility.eligible &&
      classification.reviewClass !== "INFO" &&
      classification.reviewClass !== "TECHNICAL";
    return {
      reviewItemId: `review:${finding.findingId}`,
      finding,
      reviewClass: classification.reviewClass,
      classificationReason: classification.reason,
      ...(proposedAction ? { proposedAction } : {}),
      decision: { effectiveStatus: "UNREVIEWED", source: "MODE_DEFAULT" },
      technicalEligibility: eligibility,
      conflicts: [],
      canAccept,
      sourceTextHash: finding.sourceTextHash,
    };
  });

  const conflicts = detectReviewConflicts(items);
  const conflictsByItem = new Map<string, typeof conflicts>();
  conflicts.forEach((conflict) => {
    conflict.reviewItemIds.forEach((reviewItemId) => {
      const existing = conflictsByItem.get(reviewItemId);
      if (existing) existing.push(conflict);
      else conflictsByItem.set(reviewItemId, [conflict]);
    });
  });
  items = items.map((item) => {
    const itemConflicts = conflictsByItem.get(item.reviewItemId) ?? [];
    if (itemConflicts.length === 0) return item;
    return {
      ...item,
      reviewClass: "TECHNICAL",
      classificationReason: "CONFLICTING_ACTION",
      technicalEligibility: addTechnicalEligibilityReason(
        item.technicalEligibility,
        "CONFLICTING_ACTION"
      ),
      conflicts: itemConflicts.map((conflict) => ({
        conflictId: conflict.conflictId,
        reason: conflict.reason,
        reviewItemIds: conflict.reviewItemIds,
      })),
      canAccept: false,
    };
  });
  items = items.map((item) => ({
    ...item,
    decision: resolveReviewDecision(item, input.mode, decisionState),
  }));

  return {
    items,
    conflicts,
    summary: createReviewSummary(items, conflicts),
    decisionState,
    durationMs: Date.now() - startedAt,
  };
}
