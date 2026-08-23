import type { BatchProgress } from "./batch-types";

export function createBatchProgress(
  input: Omit<BatchProgress, "processed" | "total" | "applied" | "stale" | "failed"> &
    Partial<Pick<BatchProgress, "processed" | "total" | "applied" | "stale" | "failed">>
): BatchProgress {
  const total = Math.max(0, input.total ?? 0);
  return {
    phase: input.phase,
    total,
    processed: Math.min(Math.max(0, input.processed ?? 0), total),
    applied: Math.max(0, input.applied ?? 0),
    stale: Math.max(0, input.stale ?? 0),
    failed: Math.max(0, input.failed ?? 0),
    ...(input.currentFootnoteOrdinal !== undefined
      ? { currentFootnoteOrdinal: input.currentFootnoteOrdinal }
      : {}),
  };
}

export function batchProgressPercent(progress: BatchProgress): number {
  if (progress.total === 0) return progress.phase === "FINALIZING" ? 100 : 0;
  return Math.round((progress.processed / progress.total) * 100);
}
