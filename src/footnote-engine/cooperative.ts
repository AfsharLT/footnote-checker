/* global performance, setTimeout, AbortSignal */

export interface WorkProgress {
  phase: "analyzing" | "resolving" | "checking" | "finalizing";
  processed: number;
  total: number;
}

export function finishWork<T>(work: Generator<WorkProgress, T, void>): T {
  let step = work.next();
  while (!step.done) step = work.next();
  return step.value;
}

export const yieldToInterface = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export interface CooperativeOptions {
  onProgress?: (progress: WorkProgress) => void;
  signal?: AbortSignal;
}

// One ordered pipeline, no parallel Word calls or duplicated parser logic.
export async function finishWorkAsync<T>(
  work: Generator<WorkProgress, T, void>,
  options: CooperativeOptions = {}
): Promise<T> {
  let sliceStarted = performance.now();
  let lastPublished = -Infinity;
  let lastPhase: WorkProgress["phase"] | undefined;
  let units = 0;
  try {
    while (true) {
      if (options.signal?.aborted) throw new Error("Analysis cancelled");
      const step = work.next();
      if (step.done === true) return step.value;
      const now = performance.now();
      const phaseChanged = step.value.phase !== lastPhase;
      if (phaseChanged || now - lastPublished >= 80 || step.value.processed === step.value.total) {
        options.onProgress?.(step.value);
        lastPublished = now;
        lastPhase = step.value.phase;
      }
      units += 1;
      if (phaseChanged || now - sliceStarted >= 12 || units >= 100) {
        await yieldToInterface();
        sliceStarted = performance.now();
        units = 0;
      }
    }
  } finally {
    work.return(undefined as T);
  }
}
