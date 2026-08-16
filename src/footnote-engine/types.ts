export type FindingCategory =
  "punctuation" | "formatting" | "citation" | "structure" | "content" | "technical";

export type FindingSeverity = "info" | "warning" | "error";

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
  analyzedFootnotes: number;
  findingsBySeverity: {
    info: number;
    warning: number;
    error: number;
  };
  durationMs?: number;
}
