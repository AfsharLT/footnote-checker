import type { Finding } from "../footnote-engine/types";
import type { FootnoteSnapshot } from "../taskpane/taskpane";
import type { AnalysisProtectedRange } from "../footnote-engine/types";

export type ReviewClass = "AUTO" | "MANUAL" | "TECHNICAL" | "INFO";
export type ReviewStatus = "UNREVIEWED" | "ACCEPTED" | "MANUALLY_CHECKED" | "REJECTED" | "DEFERRED";
export type ReviewMode = "ANALYSIS" | "REVIEW" | "CORRECTION";
export type ReviewDecisionSource = "USER" | "MODE_DEFAULT";

export type ReviewReason =
  | "DETERMINISTIC_TEXT_CHANGE"
  | "DETERMINISTIC_FORMAT_CHANGE"
  | "SAFE_INSERTION"
  | "SAFE_MAPPING_NORMALIZATION"
  | "SEMANTIC_UNCERTAINTY"
  | "UNKNOWN_ROLE"
  | "AMBIGUOUS_MAPPING"
  | "LEGACY_MAPPING_UNCERTAIN"
  | "CONSISTENCY_DECISION_REQUIRED"
  | "UNKNOWN_CITATION_TYPE"
  | "PROTECTED_RANGE"
  | "SOURCE_CHANGED"
  | "INVALID_RANGE"
  | "CONFLICTING_ACTION"
  | "MIXED_FORMATTING"
  | "ACTION_NOT_BUILDABLE"
  | "INFORMATION_ONLY"
  | "NO_ACTION_AVAILABLE";

export type TechnicalEligibilityReason =
  | "SOURCE_CHANGED"
  | "INVALID_RANGE"
  | "ORIGINAL_TEXT_MISMATCH"
  | "PROTECTED_RANGE"
  | "CONFLICTING_ACTION"
  | "MIXED_FORMATTING"
  | "ACTION_NOT_BUILDABLE";

export interface TextReplaceAction {
  type: "TEXT_REPLACE";
  start: number;
  end: number;
  originalText: string;
  replacementText: string;
}

export interface TextInsertAction {
  type: "TEXT_INSERT";
  position: number;
  text: string;
}

export interface FormattingChangeSet {
  italic?: boolean;
  bold?: boolean;
  underline?: string | boolean;
  fontName?: string;
  fontSize?: number;
  strikeThrough?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  characterSpacing?: number;
}

export interface FormatChangeAction {
  type: "FORMAT_CHANGE";
  start: number;
  end: number;
  changes: FormattingChangeSet;
}

export type ProposedReviewAction = TextReplaceAction | TextInsertAction | FormatChangeAction;

export interface TechnicalEligibility {
  eligible: boolean;
  reasons: TechnicalEligibilityReason[];
  findingValid: boolean;
  sourceHashMatches: boolean;
  rangeValid: boolean;
  originalTextMatches: boolean;
  protectedRangeOverlap: boolean;
  conflictingActionOverlap: boolean;
  formattingStateKnown: boolean;
  proposedActionBuildable: boolean;
}

export interface ReviewConflictReference {
  conflictId: string;
  reason: string;
  reviewItemIds: string[];
}

export interface ReviewConflict {
  conflictId: string;
  reviewItemIds: string[];
  reason: string;
}

export interface ReviewDecision {
  explicitStatus?: ReviewStatus;
  effectiveStatus: ReviewStatus;
  source: ReviewDecisionSource;
}

export interface StoredReviewDecision {
  findingId: string;
  sourceTextHash: string;
  ruleId: string;
  start: number;
  end: number;
  status: ReviewStatus;
}

export type ReviewDecisionState = Readonly<Record<string, StoredReviewDecision>>;

export interface ReviewItem {
  reviewItemId: string;
  finding: Finding;
  reviewClass: ReviewClass;
  classificationReason: ReviewReason;
  proposedAction?: ProposedReviewAction;
  decision: ReviewDecision;
  technicalEligibility: TechnicalEligibility;
  conflicts: ReviewConflictReference[];
  canAccept: boolean;
  sourceTextHash: string;
}

export interface ReviewSummary {
  total: number;
  byClass: {
    automatic: number;
    manual: number;
    technical: number;
    info: number;
  };
  byStatus: {
    open: number;
    accepted: number;
    manuallyChecked: number;
    rejected: number;
    deferred: number;
  };
  actionable: number;
  correctionReady: number;
  conflicts: number;
}

export interface ReviewEngineResult {
  items: ReviewItem[];
  conflicts: ReviewConflict[];
  summary: ReviewSummary;
  decisionState: ReviewDecisionState;
  durationMs: number;
}

export interface ReviewPolicy {
  reviewClass: ReviewClass;
  reason: ReviewReason;
}

export interface ReviewEngineInput {
  findings: readonly Finding[];
  footnotes: readonly FootnoteSnapshot[];
  mode: ReviewMode;
  decisionState?: ReviewDecisionState;
  protectedRangesByFootnoteId?: ReadonlyMap<string, readonly AnalysisProtectedRange[]>;
}
