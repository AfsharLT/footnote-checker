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

export type CitationModifierType =
  | "comparison"
  | "reference"
  | "context"
  | "agreement"
  | "disagreement"
  | "additionalReferences"
  | "detail"
  | "approval"
  | "criticism"
  | "similarity";

export interface CitationModifier {
  type: CitationModifierType;
  start: number;
  end: number;
  text: string;
}

export interface StatuteReferenceCandidate {
  start: number;
  end: number;
  originalText: string;
  unitType?: "§" | "§§" | "Art.";
  section?: string;
  sections?: string[];
  paragraph?: string;
  sentence?: string;
  number?: string;
  letter?: string;
  halfSentence?: string;
  alternative?: string;
  variant?: string;
  case?: string;
  law?: string;
}

export type CitationType =
  | "STATUTE"
  | "CASE_LAW"
  | "COMMENTARY"
  | "BOOK"
  | "JOURNAL_ARTICLE"
  | "BOOK_CHAPTER"
  | "CASE_NOTE"
  | "LEGISLATIVE_MATERIAL"
  | "ONLINE_SOURCE"
  | "ADMINISTRATIVE_MATERIAL"
  | "OTHER";

export type CitationCertainty = "high" | "medium" | "low";

export type CaseLawCitationForm =
  "DIRECT" | "OFFICIAL_COLLECTION" | "JOURNAL" | "DATABASE" | "HYBRID" | "UNKNOWN";

export interface ClassificationSignal {
  code: string;
  text?: string;
  start?: number;
  end?: number;
}

export interface CitationClassification {
  type: CitationType;
  certainty: CitationCertainty;
  signals: ClassificationSignal[];
  caseLawForm?: CaseLawCitationForm;
}

export interface CitationSegment {
  segmentId: string;
  footnoteId: string;
  ordinal: number;
  start: number;
  end: number;
  originalText: string;
  separatorBefore?: string;
  separatorAfter?: string;
  modifiers: CitationModifier[];
  coreStart: number;
  coreEnd: number;
  coreText: string;
  embeddedStatuteReferences: StatuteReferenceCandidate[];
  classification: CitationClassification;
}

export interface FootnoteParseResult {
  footnoteId: string;
  sourceTextHash: string;
  segments: CitationSegment[];
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
  parseResults: FootnoteParseResult[];
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
