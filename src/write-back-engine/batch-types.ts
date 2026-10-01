import type { ProposedReviewAction, ReviewMode } from "@/review-engine";
import type {
  AppliedMutationRecord,
  BatchPerformanceMetrics,
  LocalRevalidationStatus,
  WriteBackResultReason,
  WriteBackState,
  WriteBackStatus,
} from "./types";

export type BatchExclusionReason =
  | "NOT_ACCEPTED"
  | "USER_REJECTED"
  | "USER_DEFERRED"
  | "USER_MANUALLY_CHECKED"
  | "MANUAL_REVIEW_REQUIRED"
  | "TECHNICAL_BLOCK"
  | "INFORMATION_ONLY"
  | "NO_ACTION"
  | "CONFLICT"
  | "ALREADY_APPLIED"
  | "UNSUPPORTED_ACTION"
  | "STALE_BEFORE_RUN";

export interface WriteBackPlanTotals {
  totalReviewItems: number;
  eligible: number;
  excluded: number;
  manual: number;
  technical: number;
  info: number;
  rejected: number;
  deferred: number;
  manuallyChecked: number;
  alreadyApplied: number;
}

export interface PlannedWriteBackItem {
  reviewItemId: string;
  footnoteId: string;
  footnoteOrdinal: number;
  ruleId: string;
  actionKind?: ProposedReviewAction["type"];
  planned: boolean;
  exclusionReason?: BatchExclusionReason;
  originalStart?: number;
  originalEnd?: number;
  dependencyGroupId?: string;
}

export interface WriteBackPlan {
  planId: string;
  mode: ReviewMode;
  createdAt: string;
  items: PlannedWriteBackItem[];
  totals: WriteBackPlanTotals;
  planningDurationMs: number;
}

export type BatchRunStatus =
  "IDLE" | "PLANNING" | "RUNNING" | "FINALIZING" | "COMPLETED" | "COMPLETED_WITH_ISSUES" | "FAILED";

export type BatchProgressPhase = "PLANNING" | "WRITING" | "FINALIZING";

export interface BatchProgress {
  total: number;
  processed: number;
  applied: number;
  stale: number;
  failed: number;
  currentFootnoteOrdinal?: number;
  phase: BatchProgressPhase;
}

export interface BatchItemResult {
  reviewItemId: string;
  footnoteId: string;
  footnoteOrdinal: number;
  ruleId: string;
  planned: boolean;
  actionKind?: ProposedReviewAction["type"];
  writeBackStatus: WriteBackStatus;
  resultReason?: WriteBackResultReason | BatchExclusionReason | "BATCH_ABORTED" | "APPLIED";
  originalText: string;
  suggestedText: string;
  resolvedStart?: number;
  resolvedEnd?: number;
  revalidationStatus?: LocalRevalidationStatus;
  relocated: boolean;
  alreadyResolved: boolean;
  appliedAt?: string;
  errorCode?: string;
  message?: string;
}

export interface BatchWriteBackSummary {
  totalFindings: number;
  planned: number;
  applied: number;
  alreadyResolved: number;
  stale: number;
  failed: number;
  manualReview: number;
  technical: number;
  info: number;
  rejected: number;
  deferred: number;
  manuallyChecked: number;
  notActionable: number;
}

export interface BatchWriteBackResult {
  batchId: string;
  planId: string;
  startedAt: string;
  finishedAt: string;
  status: Extract<BatchRunStatus, "COMPLETED" | "COMPLETED_WITH_ISSUES" | "FAILED">;
  itemResults: BatchItemResult[];
  summary: BatchWriteBackSummary;
  state: WriteBackState;
  mutations: AppliedMutationRecord[];
  performance: BatchPerformanceMetrics;
  fatalError?: string;
}
