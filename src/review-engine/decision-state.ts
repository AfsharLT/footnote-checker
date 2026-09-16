import type { Finding } from "../footnote-engine/types";
import type {
  ReviewDecision,
  ReviewDecisionState,
  ReviewItem,
  ReviewMode,
  ReviewStatus,
  StoredReviewDecision,
} from "./types";

export function canMarkManuallyChecked(item: ReviewItem): boolean {
  return (
    item.proposedAction === undefined &&
    (item.reviewClass === "MANUAL" || item.reviewClass === "INFO")
  );
}

function decisionRecord(item: ReviewItem, status: ReviewStatus): StoredReviewDecision {
  return {
    findingId: item.finding.findingId,
    sourceTextHash: item.finding.sourceTextHash,
    ruleId: item.finding.ruleId,
    start: item.finding.start,
    end: item.finding.end,
    status,
  };
}

export function setReviewStatus(
  state: ReviewDecisionState,
  item: ReviewItem,
  status: ReviewStatus
): ReviewDecisionState {
  if (status === "MANUALLY_CHECKED" && !canMarkManuallyChecked(item)) return state;
  return { ...state, [item.finding.findingId]: decisionRecord(item, status) };
}

export function clearExplicitReviewStatus(
  state: ReviewDecisionState,
  findingId: string
): ReviewDecisionState {
  const next = { ...state };
  delete next[findingId];
  return next;
}

export function setReviewStatusesBulk(
  state: ReviewDecisionState,
  items: readonly ReviewItem[],
  status: ReviewStatus
): ReviewDecisionState {
  return items.reduce((next, item) => setReviewStatus(next, item, status), state);
}

export function acceptAllAutomatic(
  state: ReviewDecisionState,
  items: readonly ReviewItem[]
): ReviewDecisionState {
  return setReviewStatusesBulk(
    state,
    items.filter((item) => item.reviewClass === "AUTO" && item.canAccept),
    "ACCEPTED"
  );
}

export function resetAllDecisions(): ReviewDecisionState {
  return {};
}

export function reconcileReviewDecisions(
  state: ReviewDecisionState,
  findings: readonly Finding[]
): ReviewDecisionState {
  const valid = new Map(findings.map((finding) => [finding.findingId, finding]));
  return Object.fromEntries(
    Object.entries(state).filter(([findingId, decision]) => {
      const finding = valid.get(findingId);
      return (
        finding !== undefined &&
        decision.sourceTextHash === finding.sourceTextHash &&
        decision.ruleId === finding.ruleId &&
        decision.start === finding.start &&
        decision.end === finding.end
      );
    })
  );
}

export function resolveReviewDecision(
  item: Pick<ReviewItem, "finding" | "reviewClass" | "canAccept">,
  mode: ReviewMode,
  state: ReviewDecisionState
): ReviewDecision {
  const explicit = state[item.finding.findingId];
  if (explicit) {
    return {
      explicitStatus: explicit.status,
      effectiveStatus: explicit.status,
      source: "USER",
    };
  }
  return {
    effectiveStatus:
      mode === "CORRECTION" && item.reviewClass === "AUTO" && item.canAccept
        ? "ACCEPTED"
        : "UNREVIEWED",
    source: "MODE_DEFAULT",
  };
}
