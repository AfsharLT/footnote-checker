export type HostWorkState = "IDLE" | "ANALYZING" | "WRITING" | "FINALIZING";

export interface AnalysisPerformanceMetrics {
  readerDurationMs: number;
  engineDurationMs: number;
  totalAnalysisDurationMs: number;
  contextSyncCount: number;
  footnoteCount: number;
}

export function hostWorkStateForBatchPhase(
  phase: "PLANNING" | "WRITING" | "FINALIZING"
): HostWorkState {
  return phase === "FINALIZING" ? "FINALIZING" : "WRITING";
}

export function isHostWorkIdle(state: HostWorkState): boolean {
  return state === "IDLE";
}
