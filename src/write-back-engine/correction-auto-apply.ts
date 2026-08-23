import type { ReviewItem } from "@/review-engine";
import type { FootnoteSnapshot } from "@/taskpane/taskpane";
import { createWriteBackPlan } from "./batch-planner";
import { runWriteBackBatch } from "./batch-runner";
import type {
  AppliedMutationRecord,
  WriteBackDocumentAdapter,
  WriteBackResult,
  WriteBackState,
} from "./types";

export interface CorrectionAutoApplyProgress {
  processed: number;
  total: number;
}

export interface CorrectionAutoApplySummary {
  total: number;
  applied: number;
  stale: number;
  failed: number;
}

export interface CorrectionAutoApplyResult {
  state: WriteBackState;
  mutations: AppliedMutationRecord[];
  summary: CorrectionAutoApplySummary;
}

function actionStart(item: ReviewItem): number {
  const action = item.proposedAction;
  if (!action) return item.finding.start;
  return action.type === "TEXT_INSERT" ? action.position : action.start;
}

function actionOrder(item: ReviewItem): number {
  return item.proposedAction?.type === "FORMAT_CHANGE" ? 1 : 0;
}

export function isCorrectionAutoApplyCandidate(
  item: ReviewItem,
  existing?: WriteBackResult
): boolean {
  return createWriteBackPlan({
    mode: "CORRECTION",
    items: [item],
    state: existing ? { [item.reviewItemId]: existing } : {},
    createdAt: "selection",
  }).items[0].planned;
}

export function selectCorrectionAutoApplyItems(
  items: readonly ReviewItem[],
  state: WriteBackState = {}
): ReviewItem[] {
  return items
    .filter((item) => isCorrectionAutoApplyCandidate(item, state[item.reviewItemId]))
    .sort((left, right) => {
      const ordinalDifference = left.finding.footnoteOrdinal - right.finding.footnoteOrdinal;
      if (ordinalDifference !== 0) return ordinalDifference;
      const kindDifference = actionOrder(left) - actionOrder(right);
      if (kindDifference !== 0) return kindDifference;
      if (kindDifference === 0 && actionOrder(left) === 0) {
        const startDifference = actionStart(right) - actionStart(left);
        if (startDifference !== 0) return startDifference;
      }
      return left.reviewItemId.localeCompare(right.reviewItemId);
    });
}

export async function runCorrectionAutoApply(input: {
  items: readonly ReviewItem[];
  footnotes: readonly FootnoteSnapshot[];
  initialState?: WriteBackState;
  initialMutations?: readonly AppliedMutationRecord[];
  adapter?: WriteBackDocumentAdapter;
  onProgress?(progress: CorrectionAutoApplyProgress): void;
  onResult?(result: WriteBackResult): void;
  onResults?(results: readonly WriteBackResult[]): void;
}): Promise<CorrectionAutoApplyResult> {
  const plan = createWriteBackPlan({
    mode: "CORRECTION",
    items: input.items,
    state: input.initialState,
  });
  const result = await runWriteBackBatch(plan, {
    items: input.items,
    footnotes: input.footnotes,
    initialState: input.initialState,
    initialMutations: input.initialMutations,
    adapter: input.adapter,
    onResult: input.onResult,
    onResults: input.onResults,
    onProgress: (progress) =>
      input.onProgress?.({ processed: progress.processed, total: progress.total }),
  });
  return {
    state: result.state,
    mutations: result.mutations,
    summary: {
      total: result.summary.planned,
      applied: result.summary.applied + result.summary.alreadyResolved,
      stale: result.summary.stale,
      failed: result.summary.failed,
    },
  };
}
