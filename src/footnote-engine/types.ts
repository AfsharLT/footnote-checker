export type FindingCategory =
  "punctuation" | "formatting" | "citation" | "structure" | "content" | "technical";

export type FindingSeverity = "info" | "warning" | "error";

export type TextPatternMatchType = "plainTextUrl";

export interface TextPatternMatch {
  type: TextPatternMatchType;
  start: number;
  end: number;
  text: string;
}

export type EngineProtectedRangeType = "plainTextUrl";

export interface EngineProtectedRange {
  type: EngineProtectedRangeType;
  start: number;
  end: number;
  text: string;
}

export type ReaderProtectedRangeType = "hyperlink" | "field" | "bookmark" | "contentControl";

export interface AnalysisProtectedRange {
  source: "reader" | "engine";
  type: ReaderProtectedRangeType | EngineProtectedRangeType;
  start: number;
  end: number;
}

export interface FootnoteAnalysisResult {
  footnoteId: string;
  engineProtectedRanges: EngineProtectedRange[];
  protectedRanges: AnalysisProtectedRange[];
}

export interface Finding {
  findingId: string;
  footnoteId: string;
  footnoteOrdinal: number;
  sourceTextHash: string;
  ruleId: string;
  category: FindingCategory;
  start: number;
  end: number;
  originalText: string;
  suggestedText?: string;
  severity: FindingSeverity;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface FootnoteEngineResult {
  findings: Finding[];
  footnoteAnalyses: FootnoteAnalysisResult[];
  analyzedFootnotes: number;
  plainTextUrlCount: number;
  engineProtectedRangeCount: number;
  findingsBySeverity: {
    info: number;
    warning: number;
    error: number;
  };
  durationMs?: number;
}
