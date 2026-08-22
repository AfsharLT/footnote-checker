import type { AnalysisProtectedRange, Finding } from "../footnote-engine/types";
import type { FootnoteSnapshot, ProtectedRange } from "../taskpane/taskpane";
import type {
  ProposedReviewAction,
  TechnicalEligibility,
  TechnicalEligibilityReason,
} from "./types";

type AnyProtectedRange = AnalysisProtectedRange | ProtectedRange;

function actionRange(
  action: ProposedReviewAction | undefined
): { start: number; end: number } | undefined {
  if (!action) return undefined;
  return action.type === "TEXT_INSERT"
    ? { start: action.position, end: action.position }
    : { start: action.start, end: action.end };
}

function overlapsProtected(
  range: { start: number; end: number } | undefined,
  protectedRanges: readonly AnyProtectedRange[]
): boolean {
  if (!range) return false;
  if (range.start === range.end) {
    return protectedRanges.some(
      (protectedRange) => protectedRange.start <= range.start && range.start < protectedRange.end
    );
  }
  return protectedRanges.some(
    (protectedRange) => range.start < protectedRange.end && range.end > protectedRange.start
  );
}

function addReason(
  reasons: TechnicalEligibilityReason[],
  reason: TechnicalEligibilityReason,
  when: boolean
): void {
  if (when && !reasons.includes(reason)) reasons.push(reason);
}

export function evaluateTechnicalEligibility(
  finding: Finding,
  footnote: FootnoteSnapshot | undefined,
  proposedAction: ProposedReviewAction | undefined,
  additionalProtectedRanges: readonly AnalysisProtectedRange[] = []
): TechnicalEligibility {
  const contentText = footnote?.contentText ?? "";
  const rangeValid =
    Boolean(footnote) &&
    Number.isInteger(finding.start) &&
    Number.isInteger(finding.end) &&
    finding.start >= 0 &&
    finding.start <= finding.end &&
    finding.end <= contentText.length;
  const originalTextMatches =
    rangeValid && finding.originalText === contentText.slice(finding.start, finding.end);
  const sourceHashMatches =
    Boolean(footnote) && finding.sourceTextHash === footnote?.originalTextHash;
  const proposedActionBuildable = proposedAction !== undefined;
  const actualFormatting = finding.metadata?.actual;
  const expectedFormatting = finding.metadata?.expected;
  const formattingBaseline = finding.metadata?.baselineSource;
  const formattingBaselineConfidence = finding.metadata?.baselineConfidence;
  const formattingStateKnown =
    finding.category !== "formatting" ||
    (actualFormatting !== undefined &&
      actualFormatting !== null &&
      actualFormatting !== "mixed" &&
      actualFormatting !== "Mixed" &&
      expectedFormatting !== undefined &&
      expectedFormatting !== null &&
      expectedFormatting !== "mixed" &&
      expectedFormatting !== "Mixed" &&
      [
        "CITATION_SETTING",
        "ROLE_SETTING",
        "LOCAL_DOMINANT_FORMAT",
        "DOCUMENT_FOOTNOTE_FORMAT",
      ].includes(String(formattingBaseline)) &&
      ["SAFE", "HIGH"].includes(String(formattingBaselineConfidence)));
  const protectedRangeOverlap = overlapsProtected(actionRange(proposedAction), [
    ...(footnote?.protectedRanges ?? []),
    ...additionalProtectedRanges,
  ]);
  const findingValid = rangeValid && originalTextMatches;
  const reasons: TechnicalEligibilityReason[] = [];
  addReason(reasons, "SOURCE_CHANGED", !sourceHashMatches);
  addReason(reasons, "INVALID_RANGE", !rangeValid);
  addReason(reasons, "ORIGINAL_TEXT_MISMATCH", rangeValid && !originalTextMatches);
  addReason(reasons, "PROTECTED_RANGE", protectedRangeOverlap);
  addReason(reasons, "MIXED_FORMATTING", !formattingStateKnown);
  addReason(reasons, "ACTION_NOT_BUILDABLE", !proposedActionBuildable);

  return {
    eligible: reasons.length === 0,
    reasons,
    findingValid,
    sourceHashMatches,
    rangeValid,
    originalTextMatches,
    protectedRangeOverlap,
    conflictingActionOverlap: false,
    formattingStateKnown,
    proposedActionBuildable,
  };
}

export function addTechnicalEligibilityReason(
  eligibility: TechnicalEligibility,
  reason: TechnicalEligibilityReason
): TechnicalEligibility {
  return {
    ...eligibility,
    eligible: false,
    reasons: eligibility.reasons.includes(reason)
      ? eligibility.reasons
      : [...eligibility.reasons, reason],
    ...(reason === "CONFLICTING_ACTION" ? { conflictingActionOverlap: true } : {}),
  };
}
