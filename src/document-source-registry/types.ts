import type { CitationType } from "../footnote-engine/types";
import type { CitationSourceMappingData } from "../citation-mapping/types";

export type SourceFingerprintConfidence = "high" | "medium" | "low";

export interface SourceFingerprint {
  normalizedAuthors: string[];
  normalizedEditors: string[];
  normalizedWorkTitle?: string;
  shortTitle?: string;
  normalizedContainerTitle?: string;
  edition?: string;
  year?: string;
  sourceType: CitationType;
  publisher?: string;
  volume?: string;
  journalStartPage?: string;
  rawBibliographicCore: string;
  normalizedBibliographicCore: string;
  confidence: SourceFingerprintConfidence;
  warnings: string[];
}

export interface DocumentSourceOccurrence {
  footnoteId: string;
  footnoteOrdinal: number;
  citationItemId: string;
  start: number;
  end: number;
}

export interface DocumentSourceVariant {
  rawBibliographicCore: string;
  normalizedBibliographicCore: string;
  occurrenceCount: number;
  firstOccurrence: DocumentSourceOccurrence;
  eligibleForCanonical: boolean;
}

export interface DocumentSourceCanonicalVariantMetadata {
  normalizedBibliographicCore: string;
  occurrenceCount: number;
  firstOccurrence: DocumentSourceOccurrence;
  selectionReason: "MOST_FREQUENT_THEN_EARLIEST";
}

export type DocumentSourceStatus = "CANDIDATE" | "CONFIRMED_DOCUMENT_SOURCE" | "AMBIGUOUS";

export interface DocumentSource {
  documentSourceId: string;
  canonicalFingerprint: SourceFingerprint;
  canonicalDisplayCitation: string;
  observedVariants: DocumentSourceVariant[];
  citationItemIds: string[];
  occurrenceCount: number;
  trainingOccurrenceCount: number;
  status: DocumentSourceStatus;
  firstOccurrence: DocumentSourceOccurrence;
  canonicalVariant: DocumentSourceCanonicalVariantMetadata;
  persistentLiteratureEntryId?: string;
  warnings: string[];
}

export type SourceResolutionKind =
  | "PERSISTENT_MATCH"
  | "EXACT"
  | "NORMALIZED"
  | "FUZZY"
  | "AMBIGUOUS"
  | "NEW"
  | "UNRESOLVED"
  | "NON_SOURCE"
  | "FAILED_LOCAL";

export type FinalSourceResolutionState =
  | "PERSISTENT_MATCH"
  | "DOCUMENT_MATCH"
  | "AMBIGUOUS"
  | "UNRESOLVED"
  | "NON_SOURCE"
  | "FAILED_LOCAL";

export interface SourceResolution {
  citationItemId: string;
  documentSourceId?: string;
  persistentSourceId?: string;
  resolution: SourceResolutionKind;
  finalState: FinalSourceResolutionState;
  similarityScore?: number;
  fieldScores?: Record<string, number>;
  confidence: SourceFingerprintConfidence;
  canEstablishIdentity: boolean;
  warnings: string[];
  observedBibliographicCore?: string;
  normalizedBibliographicCore?: string;
  explanation: {
    strategy:
      | "PERSISTENT_INDEX"
      | "EXACT_CORE"
      | "NORMALIZED_CORE"
      | "STRUCTURED_SIMILARITY"
      | "NEW_SOURCE"
      | "ANM_REFERENCE"
      | "IMMEDIATE_CONTEXT"
      | "INSUFFICIENT_EVIDENCE";
    candidateDocumentSourceIds?: string[];
    hardConflictReasons?: string[];
  };
}

export interface SourceAccountingDiagnostics {
  citationItemsDetected: number;
  persistentMatched: number;
  documentMatched: number;
  ambiguous: number;
  unresolved: number;
  intentionallyIgnored: number;
  failedLocal: number;
  accountedTotal: number;
  invariantSatisfied: boolean;
}

export interface SourceAuditRecord {
  footnoteOrdinal: number;
  citationItemId: string;
  rawSourceText: string;
  sourceFamily: CitationType;
  persistentSourceId?: string;
  documentSourceId?: string;
  finalState: FinalSourceResolutionState;
  resolution: SourceResolutionKind;
  associatedFindingIds: string[];
  noFindingReason?: string;
  ignoredReason?: string;
}

export interface DocumentSourceRegistry {
  schemaVersion: 1;
  sources: DocumentSource[];
  resolutions: SourceResolution[];
  confirmedSourceCount: number;
  unpromotedConfirmedSourceCount: number;
  ambiguousResolutionCount: number;
  unresolvedResolutionCount: number;
  accounting: SourceAccountingDiagnostics;
  auditRecords: SourceAuditRecord[];
  durationMs: number;
}

export interface SourceSimilarityResult {
  score: number;
  fieldScores: Record<string, number>;
  hardConflicts: string[];
}

export interface LiteraturePromotionItemResult {
  documentSourceId: string;
  status: "CREATED" | "LINKED_EXISTING" | "AMBIGUOUS" | "SKIPPED" | "FAILED";
  persistentLiteratureEntryId?: string;
  message: string;
}

export interface LiteraturePromotionResult {
  registry: DocumentSourceRegistry;
  mapping: CitationSourceMappingData;
  mappingChanged: boolean;
  items: LiteraturePromotionItemResult[];
}
