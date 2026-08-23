/* global performance */

import type { ProposedReviewAction, ReviewItem } from "@/review-engine";
import type { FootnoteSnapshot } from "@/taskpane/taskpane";
import { groupPlannedWriteBackItems } from "./batch-planner";
import { createBatchProgress } from "./batch-progress";
import { createBatchWriteBackSummary } from "./batch-summary";
import type {
  BatchItemResult,
  BatchProgress,
  BatchWriteBackResult,
  PlannedWriteBackItem,
  WriteBackPlan,
} from "./batch-types";
import { applySingleReviewItem } from "./runner";
import { createPendingWriteBackResult } from "./status";
import type {
  AppliedMutationRecord,
  BatchPerformanceMetrics,
  WriteBackDocumentAdapter,
  WriteBackResult,
  WriteBackState,
} from "./types";
import { DEFAULT_WRITEBACK_FOOTNOTE_CHUNK_SIZE, officeWriteBackAdapter } from "./office-adapter";

function suggestedText(action: ProposedReviewAction | undefined, item: ReviewItem): string {
  if (action?.type === "TEXT_REPLACE") return action.replacementText;
  if (action?.type === "TEXT_INSERT") return action.text;
  if (action?.type === "FORMAT_CHANGE") {
    const property = Object.keys(action.changes)[0] as keyof typeof action.changes | undefined;
    return property ? String(action.changes[property] ?? "") : "";
  }
  return item.finding.suggestedText ?? "";
}

function batchItemResult(
  planned: PlannedWriteBackItem,
  item: ReviewItem,
  result?: WriteBackResult
): BatchItemResult {
  const local = result?.localRevalidation;
  const status = result?.status ?? "PENDING";
  const reason =
    result?.reason ?? (result?.status === "APPLIED" ? "APPLIED" : planned.exclusionReason);
  return {
    reviewItemId: item.reviewItemId,
    footnoteId: item.finding.footnoteId,
    footnoteOrdinal: item.finding.footnoteOrdinal,
    ruleId: item.finding.ruleId,
    planned: planned.planned,
    actionKind: item.proposedAction?.type,
    writeBackStatus: status,
    ...(reason ? { resultReason: reason } : {}),
    originalText: item.finding.originalText,
    suggestedText: suggestedText(item.proposedAction, item),
    ...(local?.resolvedStart !== undefined ? { resolvedStart: local.resolvedStart } : {}),
    ...(local?.resolvedEnd !== undefined ? { resolvedEnd: local.resolvedEnd } : {}),
    ...(local ? { revalidationStatus: local.status } : {}),
    relocated: local?.status === "RELOCATED",
    alreadyResolved: result?.reason === "ALREADY_RESOLVED",
    ...(result?.appliedAt ? { appliedAt: result.appliedAt } : {}),
    ...((status === "FAILED" || status === "STALE") && result?.reason
      ? { errorCode: result.reason }
      : {}),
    ...(result?.message ? { message: result.message } : {}),
  };
}

function abortedItemResult(
  planned: PlannedWriteBackItem,
  item: ReviewItem,
  message: string
): BatchItemResult {
  return {
    ...batchItemResult(planned, item, {
      reviewItemId: item.reviewItemId,
      status: "FAILED",
      actionKind: item.proposedAction?.type,
      reason: "WORD_API_ERROR",
      reasons: ["WORD_API_ERROR"],
      message,
    }),
    resultReason: "BATCH_ABORTED",
    message,
  };
}

function batchId(planId: string, startedAt: string): string {
  let hash = 0x811c9dc5;
  const value = `${planId}:${startedAt}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `writeback-batch-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function notify<T>(callback: ((value: T) => void) | undefined, value: T): void {
  try {
    callback?.(value);
  } catch {
    // Observers must never affect document mutation semantics.
  }
}

function notifyResults(
  context: {
    onResult?(result: WriteBackResult): void;
    onResults?(results: readonly WriteBackResult[]): void;
  },
  results: readonly WriteBackResult[]
): void {
  if (results.length === 0) return;
  notify(context.onResults, results);
  for (const result of results) notify(context.onResult, result);
}

function fallbackPerformance(
  plan: WriteBackPlan,
  ordered: readonly PlannedWriteBackItem[],
  startedAt: number
): BatchPerformanceMetrics {
  return {
    totalDurationMs: performance.now() - startedAt,
    planningDurationMs: plan.planningDurationMs,
    readDurationMs: 0,
    localValidationDurationMs: 0,
    writeDurationMs: 0,
    finalizationDurationMs: 0,
    affectedFootnotes: new Set(ordered.map((item) => item.footnoteId)).size,
    plannedActions: ordered.length,
    appliedActions: 0,
    contextSyncCount: 0,
    wordRunCount: 0,
    readChunkCount: 0,
    writeChunkCount: 0,
  };
}

const batchRuntime = { activeRuns: 0, pendingEntries: 0 };

function cleanupBatchResources(): void {
  batchRuntime.pendingEntries = 0;
  batchRuntime.activeRuns = Math.max(0, batchRuntime.activeRuns - 1);
}

export function getBatchRuntimeDiagnostics(): Readonly<typeof batchRuntime> {
  return { ...batchRuntime };
}

export async function runWriteBackBatch(
  plan: WriteBackPlan,
  context: {
    items: readonly ReviewItem[];
    footnotes: readonly FootnoteSnapshot[];
    initialState?: WriteBackState;
    initialMutations?: readonly AppliedMutationRecord[];
    adapter?: WriteBackDocumentAdapter;
    now?(): string;
    onProgress?(progress: BatchProgress): void;
    onResult?(result: WriteBackResult): void;
    onResults?(results: readonly WriteBackResult[]): void;
    chunkSize?: number;
  }
): Promise<BatchWriteBackResult> {
  batchRuntime.activeRuns += 1;
  const executionStartedAt = performance.now();
  const now = context.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const reviewItems = new Map(context.items.map((item) => [item.reviewItemId, item]));
  const footnotes = new Map(context.footnotes.map((footnote) => [footnote.id, footnote]));
  const state: Record<string, WriteBackResult> = { ...(context.initialState ?? {}) };
  const mutations = [...(context.initialMutations ?? [])];
  const mutationReviewItemIds = new Set(mutations.map((mutation) => mutation.reviewItemId));
  const itemResults = new Map<string, BatchItemResult>();
  let applied = 0;
  let stale = 0;
  let failed = 0;
  let processed = 0;
  let fatalError: string | undefined;
  let performanceMetrics: BatchPerformanceMetrics | undefined;

  try {
    notify(
      context.onProgress,
      createBatchProgress({ phase: "PLANNING", total: plan.totals.eligible })
    );

    for (const planned of plan.items) {
      const item = reviewItems.get(planned.reviewItemId);
      if (!item) {
        fatalError = `ReviewItem ${planned.reviewItemId} fehlt im Batch-Kontext.`;
        continue;
      }
      if (!planned.planned) {
        itemResults.set(
          planned.reviewItemId,
          batchItemResult(planned, item, state[planned.reviewItemId])
        );
      }
    }

    const grouped = groupPlannedWriteBackItems(plan.items.filter((item) => item.planned));
    const ordered = [...grouped.values()].flat();
    const plannedById = new Map(ordered.map((item) => [item.reviewItemId, item]));
    batchRuntime.pendingEntries = ordered.length;
    notify(context.onProgress, createBatchProgress({ phase: "WRITING", total: ordered.length }));

    const entries: Array<{ reviewItem: ReviewItem; footnote: FootnoteSnapshot }> = [];
    const pendingResults: WriteBackResult[] = [];
    const missingResults: WriteBackResult[] = [];
    for (const planned of ordered) {
      const item = reviewItems.get(planned.reviewItemId);
      if (!item) {
        fatalError = `ReviewItem ${planned.reviewItemId} fehlt im Batch-Kontext.`;
        break;
      }
      const pending = createPendingWriteBackResult(item, "Wird durchgeführt …");
      state[item.reviewItemId] = pending;
      pendingResults.push(pending);
      const footnote = footnotes.get(planned.footnoteId);
      if (!footnote) {
        const missing: WriteBackResult = {
          reviewItemId: item.reviewItemId,
          status: "STALE",
          actionKind: item.proposedAction?.type,
          reason: "FOOTNOTE_NOT_FOUND",
          reasons: ["FOOTNOTE_NOT_FOUND"],
          message:
            "Die Fußnote wurde seit der Analyse verändert. Bitte prüfen Sie die Fußnote erneut.",
        };
        state[item.reviewItemId] = missing;
        itemResults.set(item.reviewItemId, batchItemResult(planned, item, missing));
        missingResults.push(missing);
        stale += 1;
        processed += 1;
      } else {
        entries.push({ reviewItem: item, footnote });
      }
    }
    notifyResults(context, pendingResults);
    notifyResults(context, missingResults);

    const acceptResults = (results: readonly WriteBackResult[]) => {
      for (const result of results) {
        const planned = plannedById.get(result.reviewItemId);
        const item = reviewItems.get(result.reviewItemId);
        if (!planned || !item || itemResults.has(result.reviewItemId)) continue;
        state[result.reviewItemId] = result;
        if (result.mutation && !mutationReviewItemIds.has(result.reviewItemId)) {
          mutations.push(result.mutation);
          mutationReviewItemIds.add(result.reviewItemId);
        }
        if (result.status === "APPLIED") applied += 1;
        else if (result.status === "STALE") stale += 1;
        else failed += 1;
        itemResults.set(result.reviewItemId, batchItemResult(planned, item, result));
      }
      notifyResults(context, results);
    };

    const adapter = context.adapter ?? officeWriteBackAdapter;
    if (!fatalError && adapter.applyBatch && entries.length > 0) {
      try {
        const batchAdapterResult = await adapter.applyBatch({
          entries,
          appliedMutations: mutations,
          chunkSize: context.chunkSize ?? DEFAULT_WRITEBACK_FOOTNOTE_CHUNK_SIZE,
          planningDurationMs: plan.planningDurationMs,
          onChunk: (update) => {
            acceptResults(update.results);
            processed += update.results.length;
            batchRuntime.pendingEntries = Math.max(0, ordered.length - processed);
            notify(
              context.onProgress,
              createBatchProgress({
                phase: "WRITING",
                total: ordered.length,
                processed,
                applied,
                stale,
                failed,
                currentFootnoteOrdinal: update.currentFootnoteOrdinal,
              })
            );
          },
        });
        performanceMetrics = batchAdapterResult.performance;
        fatalError = batchAdapterResult.fatalError;
        const finalOnlyResults = batchAdapterResult.results.filter(
          (result) => !itemResults.has(result.reviewItemId)
        );
        acceptResults(finalOnlyResults);
        processed += finalOnlyResults.length;
        for (const mutation of batchAdapterResult.mutations) {
          if (!mutationReviewItemIds.has(mutation.reviewItemId)) {
            mutations.push(mutation);
            mutationReviewItemIds.add(mutation.reviewItemId);
          }
        }
      } catch {
        fatalError = "Der Batch-Adapter konnte nicht abgeschlossen werden.";
        performanceMetrics = fallbackPerformance(plan, ordered, executionStartedAt);
      }
    } else if (!fatalError) {
      performanceMetrics = fallbackPerformance(plan, ordered, executionStartedAt);
      for (const entry of entries) {
        const result = await applySingleReviewItem(
          { ...entry, appliedMutations: mutations },
          adapter
        );
        acceptResults([result]);
        processed += 1;
        batchRuntime.pendingEntries = Math.max(0, ordered.length - processed);
        notify(
          context.onProgress,
          createBatchProgress({
            phase: "WRITING",
            total: ordered.length,
            processed,
            applied,
            stale,
            failed,
            currentFootnoteOrdinal: entry.footnote.ordinal,
          })
        );
        if (result.fatal) {
          fatalError = result.message ?? result.reason ?? "Fataler Word-Host-Fehler";
          break;
        }
      }
      performanceMetrics.totalDurationMs = performance.now() - executionStartedAt;
      performanceMetrics.appliedActions = applied;
    }

    if (fatalError) {
      const abortedResults: WriteBackResult[] = [];
      for (const planned of ordered) {
        if (itemResults.has(planned.reviewItemId)) continue;
        const item = reviewItems.get(planned.reviewItemId);
        if (item) {
          const message = "Der Batch wurde nach einem fatalen Fehler beendet.";
          const aborted: WriteBackResult = {
            reviewItemId: item.reviewItemId,
            status: "FAILED",
            actionKind: item.proposedAction?.type,
            reason: "WORD_API_ERROR",
            reasons: ["WORD_API_ERROR"],
            message,
          };
          state[item.reviewItemId] = aborted;
          abortedResults.push(aborted);
          failed += 1;
          itemResults.set(planned.reviewItemId, abortedItemResult(planned, item, message));
        }
      }
      notifyResults(context, abortedResults);
    }

    notify(
      context.onProgress,
      createBatchProgress({
        phase: "FINALIZING",
        total: ordered.length,
        processed: fatalError ? ordered.length : processed,
        applied,
        stale,
        failed,
      })
    );
    const finalizationStartedAt = performance.now();
    const orderedResults = plan.items
      .map((item) => itemResults.get(item.reviewItemId))
      .filter((item): item is BatchItemResult => item !== undefined);
    const summary = createBatchWriteBackSummary(plan, orderedResults);
    const status = fatalError
      ? "FAILED"
      : summary.stale > 0 || summary.failed > 0
        ? "COMPLETED_WITH_ISSUES"
        : "COMPLETED";
    const finalPerformance =
      performanceMetrics ?? fallbackPerformance(plan, ordered, executionStartedAt);
    finalPerformance.finalizationDurationMs += performance.now() - finalizationStartedAt;
    finalPerformance.totalDurationMs =
      plan.planningDurationMs + (performance.now() - executionStartedAt);
    finalPerformance.appliedActions = summary.applied + summary.alreadyResolved;
    return {
      batchId: batchId(plan.planId, startedAt),
      planId: plan.planId,
      startedAt,
      finishedAt: now(),
      status,
      itemResults: orderedResults,
      summary,
      state,
      mutations,
      performance: finalPerformance,
      ...(fatalError ? { fatalError } : {}),
    };
  } finally {
    cleanupBatchResources();
  }
}
