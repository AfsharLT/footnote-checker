import type { Finding } from "../footnote-engine/types";
import { reviewPolicyFor } from "./policy-registry";
import type {
  ProposedReviewAction,
  ReviewClass,
  ReviewReason,
  TechnicalEligibility,
  TechnicalEligibilityReason,
} from "./types";

function technicalReason(reasons: readonly TechnicalEligibilityReason[]): ReviewReason {
  if (reasons.includes("PROTECTED_RANGE")) return "PROTECTED_RANGE";
  if (reasons.includes("SOURCE_CHANGED")) return "SOURCE_CHANGED";
  if (reasons.includes("CONFLICTING_ACTION")) return "CONFLICTING_ACTION";
  if (reasons.includes("MIXED_FORMATTING")) return "MIXED_FORMATTING";
  if (reasons.includes("INVALID_RANGE") || reasons.includes("ORIGINAL_TEXT_MISMATCH")) {
    return "INVALID_RANGE";
  }
  return "ACTION_NOT_BUILDABLE";
}

function hasUnknownFormattingRole(finding: Finding): boolean {
  if (finding.category !== "formatting") return false;
  const role = finding.metadata?.role;
  const property = finding.metadata?.formattingProperty;
  if (role === "unknown" || role === "ambiguous") return true;
  if (property !== "italic") return false;
  return !["author", "bearbeiter", "editor", "workTitle"].includes(String(role));
}

export function classifyReviewItem(
  finding: Finding,
  proposedAction: ProposedReviewAction | undefined,
  eligibility: TechnicalEligibility
): { reviewClass: ReviewClass; reason: ReviewReason } {
  const policy = reviewPolicyFor(finding, proposedAction);
  if (policy.reviewClass === "TECHNICAL" || policy.reviewClass === "INFO") {
    return { reviewClass: policy.reviewClass, reason: policy.reason };
  }
  if (finding.metadata?.legacySafetyLevel === "UNCERTAIN") {
    return { reviewClass: "MANUAL", reason: "LEGACY_MAPPING_UNCERTAIN" };
  }
  if (
    finding.metadata?.requiresManualReview === true ||
    finding.metadata?.baselineConfidence === "AMBIGUOUS"
  ) {
    return { reviewClass: "MANUAL", reason: "SEMANTIC_UNCERTAINTY" };
  }
  if (hasUnknownFormattingRole(finding)) {
    return { reviewClass: "MANUAL", reason: "UNKNOWN_ROLE" };
  }
  if (policy.reviewClass === "MANUAL") {
    return { reviewClass: "MANUAL", reason: policy.reason };
  }
  if (!eligibility.eligible) {
    return { reviewClass: "TECHNICAL", reason: technicalReason(eligibility.reasons) };
  }
  return {
    reviewClass: "AUTO",
    reason:
      proposedAction?.type === "FORMAT_CHANGE" ? "DETERMINISTIC_FORMAT_CHANGE" : policy.reason,
  };
}
