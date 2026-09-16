import type { CitationSegmentSourceMapping } from "../citation-mapping/types";
import type { EffectiveCitationClassification } from "./effective-classification";

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

export type EngineProtectedRangeType = "plainTextUrl" | "uncertainCitation";

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
  suffix?: "f." | "ff.";
  referenceContext?: "statute" | "workSection" | "unknown";
}

export interface ExtractedComponent<T = string> {
  value: T;
  rawText: string;
  start: number;
  end: number;
  normalizedValue?: string;
}

export interface ExtractedTextSpan {
  rawText: string;
  start: number;
  end: number;
}

export interface DerivedComponent<T = string> {
  value: T;
  source: "officialCollectionMapping" | "workMapping" | "classification" | string;
}

export type ExtractionStatus = "complete" | "partial" | "unresolved";

export interface PersonReference {
  rawText: string;
  start: number;
  end: number;
  normalizedName?: string;
  role: "author" | "bearbeiter" | "editor" | "unknown";
  roleSignals?: string[];
}

export type CitationLocatorType =
  | "page"
  | "marginNumber"
  | "section"
  | "paragraph"
  | "sentence"
  | "number"
  | "letter"
  | "halfSentence"
  | "alternative"
  | "variant"
  | "case";

export interface CitationLocator {
  type: CitationLocatorType;
  rawText: string;
  start: number;
  end: number;
  value?: string;
  values?: string[];
  rangeEnd?: string;
  suffix?: "f." | "ff." | "f" | "ff";
}

export interface StatuteSectionReference {
  section: ExtractedComponent<string>;
  paragraph?: CitationLocator;
  sentence?: CitationLocator;
  number?: CitationLocator;
  letter?: CitationLocator;
  halfSentence?: CitationLocator;
  alternative?: CitationLocator;
  variant?: CitationLocator;
  case?: CitationLocator;
  suffix?: ExtractedComponent<"f." | "ff.">;
}

export interface StatuteExtraction {
  referenceContext: "statute" | "workSection" | "unknown";
  unitType?: ExtractedComponent<"§" | "§§" | "Art.">;
  sections: StatuteSectionReference[];
  law?: ExtractedComponent<string>;
}

export interface JournalCaseCitation {
  kind: "journal";
  journal: ExtractedComponent<string>;
  year?: ExtractedComponent<string>;
  firstPage?: CitationLocator;
  pinpointPages: CitationLocator[];
}

export interface OfficialCollectionCitation {
  kind: "officialCollection";
  collection: ExtractedComponent<string>;
  volume?: ExtractedComponent<string>;
  firstPage?: CitationLocator;
  pinpointPages: CitationLocator[];
}

export interface DatabaseCitation {
  kind: "database";
  database: ExtractedComponent<string>;
  year?: ExtractedComponent<string>;
  identifier?: ExtractedComponent<string>;
}

export type CaseLawPublicationReference =
  JournalCaseCitation | OfficialCollectionCitation | DatabaseCitation;

export interface CaseLawExtraction {
  court?: ExtractedComponent<string>;
  derivedCourt?: DerivedComponent<string>;
  decisionType?: ExtractedComponent<string>;
  decisionTypeNormalized?: "JUDGMENT" | "ORDER" | "DECISION" | "OTHER";
  date?: ExtractedComponent<string>;
  normalizedDate?: string;
  docketNumber?: ExtractedComponent<string>;
  panel?: ExtractedComponent<string>;
  ecli?: ExtractedComponent<string>;
  citationForm: CaseLawCitationForm;
  parallelCitations: CaseLawPublicationReference[];
  embeddedStatuteReferences: StatuteExtraction[];
}

export interface CommentaryPersonSequence {
  persons: PersonReference[];
  roleResolution: "resolved" | "ambiguous";
}

export interface CommentaryExtraction {
  work?: ExtractedComponent<string>;
  commentedLaw?: ExtractedComponent<string>;
  persons: PersonReference[];
  editors: PersonReference[];
  bearbeiters: PersonReference[];
  personSequence?: CommentaryPersonSequence;
  volume?: ExtractedComponent<string>;
  edition?: ExtractedComponent<string>;
  year?: ExtractedComponent<string>;
  asOfDate?: ExtractedComponent<string>;
  statuteReference?: StatuteExtraction;
  marginNumbers: CitationLocator[];
}

export interface BookExtraction {
  authors: PersonReference[];
  title?: ExtractedComponent<string>;
  shortTitle?: ExtractedComponent<string>;
  bookType?: "monograph" | "textbook" | "handbook" | "unknown";
  volume?: ExtractedComponent<string>;
  edition?: ExtractedComponent<string>;
  year?: ExtractedComponent<string>;
  place?: ExtractedComponent<string>;
  publisher?: ExtractedComponent<string>;
  workSection?: ExtractedComponent<string>;
  marginNumbers: CitationLocator[];
  pages: CitationLocator[];
}

export interface JournalArticleExtraction {
  authors: PersonReference[];
  title?: ExtractedComponent<string>;
  journal?: ExtractedComponent<string>;
  year?: ExtractedComponent<string>;
  volume?: ExtractedComponent<string>;
  issue?: ExtractedComponent<string>;
  firstPage?: CitationLocator;
  pinpointPages: CitationLocator[];
}

export interface BookChapterExtraction {
  authors: PersonReference[];
  chapterTitle?: ExtractedComponent<string>;
  containerTitle?: ExtractedComponent<string>;
  editors: PersonReference[];
  edition?: ExtractedComponent<string>;
  volume?: ExtractedComponent<string>;
  year?: ExtractedComponent<string>;
  firstPage?: ExtractedComponent<string>;
  pinpointPages: CitationLocator[];
  workSection?: ExtractedComponent<string>;
  marginNumbers: CitationLocator[];
}

export interface CaseNoteExtraction {
  authors: PersonReference[];
  noteMarker?: ExtractedComponent<string>;
  annotatedCase?: CaseLawExtraction;
  journal?: ExtractedComponent<string>;
  year?: ExtractedComponent<string>;
  firstPage?: CitationLocator;
  pinpointPages: CitationLocator[];
}

export interface LegislativeMaterialExtraction {
  body?: ExtractedComponent<string>;
  documentType?: ExtractedComponent<string>;
  legislativeTerm?: ExtractedComponent<string>;
  documentNumber?: ExtractedComponent<string>;
  date?: ExtractedComponent<string>;
  title?: ExtractedComponent<string>;
  pages: CitationLocator[];
}

export interface OnlineSourceExtraction {
  authors: PersonReference[];
  organization?: ExtractedComponent<string>;
  title?: ExtractedComponent<string>;
  siteName?: ExtractedComponent<string>;
  url?: ExtractedComponent<string>;
  publicationDate?: ExtractedComponent<string>;
  lastUpdatedDate?: ExtractedComponent<string>;
  accessDate?: ExtractedComponent<string>;
}

export interface AdministrativeMaterialExtraction {
  authority?: ExtractedComponent<string>;
  documentType?: ExtractedComponent<string>;
  date?: ExtractedComponent<string>;
  fileNumber?: ExtractedComponent<string>;
  title?: ExtractedComponent<string>;
  publicationSource?: ExtractedComponent<string>;
  year?: ExtractedComponent<string>;
  page?: ExtractedComponent<string>;
  url?: ExtractedComponent<string>;
}

export interface OtherExtraction {
  urls: ExtractedComponent<string>[];
  referenceCandidates: StatuteExtraction[];
}

interface CitationExtractionEnvelope<TType extends CitationType, TData> {
  type: TType;
  status: ExtractionStatus;
  data: TData;
  unparsedRemainder: ExtractedTextSpan[];
}

export type CitationExtractionResult =
  | CitationExtractionEnvelope<"STATUTE", StatuteExtraction>
  | CitationExtractionEnvelope<"CASE_LAW", CaseLawExtraction>
  | CitationExtractionEnvelope<"COMMENTARY", CommentaryExtraction>
  | CitationExtractionEnvelope<"BOOK", BookExtraction>
  | CitationExtractionEnvelope<"JOURNAL_ARTICLE", JournalArticleExtraction>
  | CitationExtractionEnvelope<"BOOK_CHAPTER", BookChapterExtraction>
  | CitationExtractionEnvelope<"CASE_NOTE", CaseNoteExtraction>
  | CitationExtractionEnvelope<"LEGISLATIVE_MATERIAL", LegislativeMaterialExtraction>
  | CitationExtractionEnvelope<"ONLINE_SOURCE", OnlineSourceExtraction>
  | CitationExtractionEnvelope<"ADMINISTRATIVE_MATERIAL", AdministrativeMaterialExtraction>
  | CitationExtractionEnvelope<"OTHER", OtherExtraction>;

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

export type CitationStructureStatus = "recognized" | "partiallyRecognized" | "uncertain" | "failed";

export interface CitationStructureWarning {
  code: string;
  message: string;
  stage: "footnote" | "sequence" | "item";
  start?: number;
  end?: number;
}

export interface CitationQualifier {
  signal: string;
  start: number;
  end: number;
  rawText: string;
}

export interface NarrativeText {
  id: string;
  footnoteId: string;
  ordinal: number;
  start: number;
  end: number;
  rawText: string;
  reason?: "narrative" | "uncertain" | "itemFailure" | "sequenceFailure" | "footnoteFailure";
  status: "recognized" | "uncertain" | "failed";
  warnings: CitationStructureWarning[];
}

export interface CitationInternalReference {
  start: number;
  end: number;
  rawText: string;
  referencedOrdinal?: number;
  status: "unresolved";
}

export interface CitationFormattingEvidence {
  start: number;
  end: number;
  properties: string[];
}

export interface CitationItem {
  id: string;
  footnoteId: string;
  ordinal: number;
  sequenceId: string;
  start: number;
  end: number;
  rawText: string;
  normalizedText?: string;
  citationType?: CitationType;
  qualifiers: CitationQualifier[];
  locators: CitationLocator[];
  internalReferences: CitationInternalReference[];
  sourceResolutionStatus: "notAttempted";
  canonicalSourceId?: string | null;
  formattingEvidence: CitationFormattingEvidence[];
  confidence: CitationCertainty;
  status: CitationStructureStatus;
  warnings: CitationStructureWarning[];
}

export interface CitationSequence {
  id: string;
  footnoteId: string;
  ordinal: number;
  start: number;
  end: number;
  rawText: string;
  qualifiers: CitationQualifier[];
  groupLabel?: string;
  items: CitationItem[];
  confidence: CitationCertainty;
  status: CitationStructureStatus;
  warnings: CitationStructureWarning[];
}

export interface CitationSequenceResult {
  footnoteId: string;
  sourceTextHash: string;
  sequences: CitationSequence[];
  narrativeText: NarrativeText[];
  warnings: CitationStructureWarning[];
  status: CitationStructureStatus;
}

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
  extraction?: CitationExtractionResult;
}

export interface FootnoteParseResult {
  footnoteId: string;
  sourceTextHash: string;
  segments: CitationSegment[];
  sequences?: CitationSequence[];
  narrativeText?: NarrativeText[];
  segmentationWarnings?: CitationStructureWarning[];
  segmentationStatus?: CitationStructureStatus;
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
  citationSegmentId?: string;
  citationSequenceId?: string;
  citationItemId?: string;
  citationStart?: number;
  citationEnd?: number;
  metadata?: Record<string, unknown>;
}

export interface FootnoteEngineResult {
  findings: Finding[];
  footnoteAnalyses: FootnoteAnalysisResult[];
  parseResults: FootnoteParseResult[];
  segmentAnalyses: Array<{
    footnoteId: string;
    segmentId: string;
    sourceMappings: CitationSegmentSourceMapping[];
    effectiveClassification: EffectiveCitationClassification;
  }>;
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
