import type {
  CitationSegmentSourceMapping,
  CitationSourceMappingData,
  CitationSourceMappingResolution,
} from "../../citation-mapping/types";
import type {
  CitationStyleProfile,
  ResolvedCitationSettings,
  SettingsCitationType,
} from "../../citation-settings/types";
import type { FootnoteSnapshot } from "../../taskpane/taskpane";
import type {
  AnalysisProtectedRange,
  CitationExtractionResult,
  CitationSegment,
  CitationType,
  Finding,
  FindingCategory,
  FindingSeverity,
} from "../types";
import type { EffectiveCitationClassification } from "../effective-classification";

export type FormattingBaselineProperty =
  | "fontName"
  | "fontSize"
  | "bold"
  | "italic"
  | "underline"
  | "strikeThrough"
  | "superscript"
  | "subscript"
  | "characterSpacing";

export type FormattingBaselineValue = string | number | boolean;

export interface DocumentFormattingBaselineProperty {
  value: FormattingBaselineValue;
  confidence: "HIGH";
  characterCoverage: number;
  footnoteCoverage: number;
  knownCharacterCoverage: number;
  knownFootnoteCoverage: number;
}

export type DocumentFootnoteFormattingBaseline = Partial<
  Record<FormattingBaselineProperty, DocumentFormattingBaselineProperty>
>;

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

export interface RuleContext {
  footnote: FootnoteSnapshot;
  segment?: CitationSegment;
  extraction?: CitationExtractionResult;
  parserCitationType: CitationType;
  effectiveCitationType: CitationType;
  effectiveClassification: EffectiveCitationClassification;
  resolvedSettings: ResolvedCitationSettings<SettingsCitationType>;
  sourceMapping?: CitationSourceMappingResolution;
  sourceMappings: CitationSegmentSourceMapping[];
  protectedRanges: readonly AnalysisProtectedRange[];
  documentFormattingBaseline: DocumentFootnoteFormattingBaseline;
}

export interface FootnoteRule {
  ruleId: string;
  category: FindingCategory;
  priority: number;
  scope: "footnote" | "segment";
  supportedCitationTypes?: readonly CitationType[];
  evaluate(context: RuleContext): RuleFindingCandidate[];
}

export interface DocumentRuleContext {
  footnotes: readonly FootnoteSnapshot[];
  occurrences: readonly RuleContext[];
  findingsSoFar: readonly Finding[];
  profile: CitationStyleProfile;
  mappingData: CitationSourceMappingData;
}

export interface DocumentFindingCandidate {
  footnote: FootnoteSnapshot;
  ruleId: string;
  priority: number;
  candidate: RuleFindingCandidate;
}

export interface DocumentRule {
  ruleId: string;
  priority: number;
  evaluate(context: DocumentRuleContext): DocumentFindingCandidate[];
}

export interface PrioritizedFinding extends Finding {
  priority: number;
}
