import type { WorkCitationOverride } from "../citation-settings/types";
import type { CitationType } from "../footnote-engine/types";

export const CURRENT_CITATION_SOURCE_MAPPING_SCHEMA_VERSION = 1 as const;

export type CitationSourceKind = "COMMENTARY" | "JOURNAL";
export type CitationSourceLegalArea =
  "BGB" | "STGB" | "STPO" | "ZPO" | "GG" | "GENERAL" | "UNKNOWN";
export type CommentaryPersonStructureHint =
  "WORK_THEN_BEARBEITER" | "WORK_WITHOUT_BEARBEITER" | "AMBIGUOUS" | "UNKNOWN";
export type SourceMatchMode = "CASE_INSENSITIVE_TEXT";
export type LegacySafetyLevel = "PROBABLE" | "UNCERTAIN";

export interface CitationSourceLegacyMetadata {
  legacyWorkType?: string;
  legacyLegalArea?: string;
  legacyVersions: string[];
  legacyDates: string[];
}

export interface CitationSourceMaster {
  schemaVersion: number;
  canonicalSourceId: string;
  kind: CitationSourceKind;
  preferredName: string;
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
export type CitationSourceMatchSource = "PREFERRED_NAME" | "ALIAS" | "FALLBACK_CORE_TEXT";

export interface CitationSourceMappingResolution {
  status: MappingResolutionStatus;
  canonicalSourceId?: string;
  kind?: CitationSourceKind;
  preferredName?: string;
  matchedText?: string;
  matchedAlias?: string;
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
