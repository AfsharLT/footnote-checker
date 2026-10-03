import type { WorkCitationOverride } from "../citation-settings/types";
import type { CitationType } from "../footnote-engine/types";

export const CURRENT_CITATION_SOURCE_MAPPING_SCHEMA_VERSION = 1 as const;

export type CitationSourceKind =
  "COMMENTARY" | "JOURNAL" | "BOOK" | "FESTSCHRIFT" | "REPORT" | "CUSTOM";
export type CitationSourceLegalArea =
  "ZIVILRECHT" | "STRAFRECHT" | "PROZESSRECHT" | "OEFFENTLICHES_RECHT" | "EUROPARECHT" | "SONSTIGE";
export type CommentaryPersonStructureHint =
  | "WORK_THEN_BEARBEITER"
  | "BEARBEITER_THEN_WORK"
  | "WORK_WITHOUT_BEARBEITER"
  | "EDITOR_STRUCTURE"
  | "AMBIGUOUS"
  | "UNKNOWN";
export type SourceMatchMode = "CASE_INSENSITIVE_TEXT" | "WHOLE_WORD_MARKER";
export type LegacySafetyLevel = "PROBABLE" | "UNCERTAIN";
export type CitationSourceOrigin = "DEFAULT" | "USER" | "IMPORTED";

export interface CitationSourceLegacyMetadata {
  legacyWorkType?: string;
  legacyLegalArea?: string;
  legacyVersions: string[];
  legacyDates: string[];
}

export interface CitationSourceMaster {
  schemaVersion: number;
  canonicalSourceId: string;
  sourceOrigin?: CitationSourceOrigin;
  kind: CitationSourceKind;
  preferredName: string;
  preferredCitationText?: string;
  legalArea: CitationSourceLegalArea;
  commentedLaw?: string;
  applicableCitationTypes: CitationType[];
  active: boolean;
  examplePattern?: string;
  notes?: string;
  personStructureHint?: CommentaryPersonStructureHint;
  workOverride?: WorkCitationOverride;
  legacyMetadata?: CitationSourceLegacyMetadata;
}

export interface CitationSourceAlias {
  legacyMappingId?: string;
  canonicalSourceId: string;
  alias: string;
  matchMode: SourceMatchMode;
  wholeWord: boolean;
  active: boolean;
  legacySafetyLevel?: LegacySafetyLevel;
  legacyAutoCorrectionAllowed?: boolean;
  legacyCommentCode?: string;
  legacyActions?: {
    analysis?: string;
    review?: string;
    correction?: string;
  };
  notes?: string;
  legacyVersion?: string;
  legacyDate?: string;
}

export interface CitationSourceMappingData {
  schemaVersion: 1;
  sources: CitationSourceMaster[];
  aliases: CitationSourceAlias[];
}

export interface LegacyWorkMappingRow {
  mappingId: string;
  workType: string;
  legalArea: string;
  canonicalCitation: string;
  searchVariant: string;
  searchMode: string;
  wholeWord: string;
  analysisAction: string;
  reviewAction: string;
  correctionAction: string;
  safetyLevel: string;
  automaticCorrectionAllowed: string;
  commentCode: string;
  examplePattern: string;
  notes: string;
  active: string;
  version: string;
  date: string;
}

export interface CsvParseResult {
  success: boolean;
  rows: string[][];
  errors: string[];
}

export interface LegacyMappingParseResult {
  success: boolean;
  rows: LegacyWorkMappingRow[];
  errors: string[];
}

export interface CitationSourceMappingValidationResult {
  success: boolean;
  data: CitationSourceMappingData;
  errors: string[];
  warnings?: string[];
}

export interface CitationSourceMigrationReport {
  legacyRows: number;
  canonicalSources: number;
  commentarySources: number;
  journalSources: number;
  aliases: number;
  uncertainAliases: number;
  expected: {
    legacyRows: number;
    canonicalSources: number;
    commentarySources: number;
    journalSources: number;
    aliases: number;
    uncertainAliases: number;
  };
  differsFromKnownLegacyStatistics: boolean;
}

export interface CitationSourceMigrationResult extends CitationSourceMappingValidationResult {
  report: CitationSourceMigrationReport;
}

export type MappingResolutionStatus = "MATCHED" | "AMBIGUOUS" | "UNMATCHED";
export type CitationSourceMatchSource =
  | "PREFERRED_NAME"
  | "ALIAS"
  | "STRUCTURED_ALIAS"
  | "FALLBACK_CORE_TEXT"
  | "COMMENTARY_PREFIX"
  | "WHOLE_WORD_MARKER";

export interface CitationSourceMappingResolution {
  status: MappingResolutionStatus;
  canonicalSourceId?: string;
  kind?: CitationSourceKind;
  preferredName?: string;
  preferredCitationText?: string;
  matchedText?: string;
  matchedRange?: {
    start: number;
    end: number;
  };
  matchedAlias?: string;
  matchedBearbeiter?: string;
  matchedBearbeiterRange?: {
    start: number;
    end: number;
  };
  matchedWorkText?: string;
  matchedWorkRange?: {
    start: number;
    end: number;
  };
  matchSource?: CitationSourceMatchSource;
  legalArea?: CitationSourceLegalArea;
  commentedLaw?: string;
  legacySafetyLevel?: LegacySafetyLevel;
  personStructureHint?: CommentaryPersonStructureHint;
  examplePattern?: string;
  notes?: string;
  workOverride?: WorkCitationOverride;
  candidateCanonicalSourceIds?: string[];
}

export interface CitationSegmentSourceMapping {
  target: "PRIMARY_SOURCE" | "JOURNAL_PUBLICATION";
  publicationIndex?: number;
  resolution: CitationSourceMappingResolution;
}

export interface CitationSourceMappingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CitationSourceMappingStorageResult {
  success: boolean;
  usedMemoryFallback: boolean;
  error?: string;
}
