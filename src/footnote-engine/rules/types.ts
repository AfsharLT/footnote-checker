import type { FootnoteSnapshot } from "../../taskpane/taskpane";
import type { AnalysisProtectedRange, FindingCategory, FindingSeverity } from "../types";

export interface RuleFindingCandidate {
  category: FindingCategory;
  start: number;
  end: number;
  originalText: string;
  suggestedText?: string;
  severity: FindingSeverity;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface FootnoteRule {
  ruleId: string;
  analyze(
    snapshot: FootnoteSnapshot,
    protectedRanges: readonly AnalysisProtectedRange[]
  ): RuleFindingCandidate[];
}
