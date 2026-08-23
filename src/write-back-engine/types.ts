import type { ProposedReviewAction, ReviewItem } from "@/review-engine";
import type { FootnoteSnapshot, ProtectedRange } from "@/taskpane/taskpane";

export type WriteBackStatus = "PENDING" | "APPLIED" | "FAILED" | "STALE";

export type LocalRevalidationStatus =
  "EXACT" | "RELOCATED" | "ALREADY_RESOLVED" | "AMBIGUOUS" | "MISSING" | "UNSAFE";

export interface LocalRevalidationResult {
  status: LocalRevalidationStatus;
  resolvedStart?: number;
  resolvedEnd?: number;
  matchedText?: string;
  reason?: string;
  sourceChanged?: boolean;
}

export interface AppliedMutationRecord {
  reviewItemId: string;
  footnoteId: string;
  actionKind: ProposedReviewAction["type"];
  oldStart: number;
  oldEnd: number;
  newTextLengthDelta: number;
  newText?: string;
  appliedAt: string;
}

export type WriteBackBlockReason =
  | "REVIEW_NOT_ACCEPTED"
  | "ACTION_MISSING"
  | "TECHNICALLY_INELIGIBLE"
  | "UNRESOLVED_CONFLICT"
  | "FOOTNOTE_NOT_FOUND"
  | "FOOTNOTE_AMBIGUOUS"
  | "LOCATOR_CONTEXT_MISMATCH"
  | "SOURCE_CHANGED"
  | "INVALID_RANGE"
  | "ORIGINAL_TEXT_MISMATCH"
  | "PROTECTED_RANGE"
  | "PROTECTED_STATE_UNKNOWN"
  | "ACTION_UNSUPPORTED"
  | "FORMAT_PROPERTY_UNSUPPORTED"
  | "FORMAT_CHANGE_NOT_ATOMIC"
  | "RANGE_AMBIGUOUS"
  | "LOCAL_TARGET_MISSING"
  | "LOCAL_TARGET_UNSAFE"
  | "WORD_API_UNSUPPORTED"
  | "WORD_API_ERROR";

export interface ResolvedFootnoteTarget {
  ordinal: number;
  displayLabel: string;
  contentText: string;
  contentTextHash: string;
  contextBefore: string;
  contextAfter: string;
  protectedRanges: WriteBackProtectedRange[];
}

export type WriteBackProtectedRange =
  | ProtectedRange
  | {
      type: "plainTextUrl";
      start: number;
      end: number;
    };

export interface ResolvedWriteRange {
  start: number;
  end: number;
  originalText: string;
}

export interface WriteBackPreflightResult {
  ok: boolean;
  resolvedFootnote?: ResolvedFootnoteTarget;
  resolvedRange?: ResolvedWriteRange;
  reasons: WriteBackBlockReason[];
  statusOnFailure?: "FAILED" | "STALE";
  localRevalidation?: LocalRevalidationResult;
}

export type WriteBackResultReason = WriteBackBlockReason | "ALREADY_RESOLVED";

export interface WriteBackResult {
  reviewItemId: string;
  status: WriteBackStatus;
  actionKind?: ProposedReviewAction["type"];
  appliedAt?: string;
  reason?: WriteBackResultReason;
  reasons?: WriteBackBlockReason[];
  message?: string;
  fatal?: boolean;
  localRevalidation?: LocalRevalidationResult;
  mutation?: AppliedMutationRecord;
}

export type WriteBackState = Readonly<Record<string, WriteBackResult>>;

export interface ApplySingleReviewItemInput {
  reviewItem: ReviewItem;
  footnote: FootnoteSnapshot;
  appliedMutations?: readonly AppliedMutationRecord[];
}

export interface BatchPerformanceMetrics {
  totalDurationMs: number;
  planningDurationMs: number;
  readDurationMs: number;
  localValidationDurationMs: number;
  writeDurationMs: number;
  finalizationDurationMs: number;
  affectedFootnotes: number;
  plannedActions: number;
  appliedActions: number;
  contextSyncCount: number;
  wordRunCount: number;
  readChunkCount: number;
  writeChunkCount: number;
}

export interface ApplyBatchReviewItemEntry {
  reviewItem: ReviewItem;
  footnote: FootnoteSnapshot;
}

export interface WriteBackBatchChunkUpdate {
  results: WriteBackResult[];
  mutations: AppliedMutationRecord[];
  processed: number;
  currentFootnoteOrdinal?: number;
  performance: BatchPerformanceMetrics;
}

export interface ApplyBatchReviewItemsInput {
  entries: readonly ApplyBatchReviewItemEntry[];
  appliedMutations?: readonly AppliedMutationRecord[];
  chunkSize: number;
  planningDurationMs: number;
  onChunk?(update: WriteBackBatchChunkUpdate): void;
}

export interface WriteBackBatchAdapterResult {
  results: WriteBackResult[];
  mutations: AppliedMutationRecord[];
  performance: BatchPerformanceMetrics;
  fatalError?: string;
}

export interface WriteBackDocumentAdapter {
  applySingle(input: ApplySingleReviewItemInput): Promise<WriteBackResult>;
  applyBatch?(input: ApplyBatchReviewItemsInput): Promise<WriteBackBatchAdapterResult>;
}
