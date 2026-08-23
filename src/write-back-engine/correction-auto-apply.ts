import type { ReviewItem } from "@/review-engine";
import type { FootnoteSnapshot } from "@/taskpane/taskpane";
import { applySingleReviewItem } from "./runner";
import { canApplySingleReviewItem, createPendingWriteBackResult } from "./status";
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
  return (
    item.reviewClass === "AUTO" &&
    item.decision.effectiveStatus === "ACCEPTED" &&
    item.decision.explicitStatus !== "REJECTED" &&
    item.decision.explicitStatus !== "DEFERRED" &&
    canApplySingleReviewItem(item, existing)
  );
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
}): Promise<CorrectionAutoApplyResult> {
  const footnotes = new Map(input.footnotes.map((footnote) => [footnote.id, footnote]));
  const state: Record<string, WriteBackResult> = { ...(input.initialState ?? {}) };
  const mutations = [...(input.initialMutations ?? [])];
  const selected = selectCorrectionAutoApplyItems(input.items, state);
  const summary: CorrectionAutoApplySummary = {
    total: selected.length,
    applied: 0,
    stale: 0,
    failed: 0,
  };
  input.onProgress?.({ processed: 0, total: selected.length });

  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index];
    const pending = createPendingWriteBackResult(item, "Wird durchgeführt …");
    state[item.reviewItemId] = pending;
    input.onResult?.(pending);
    const footnote = footnotes.get(item.finding.footnoteId);
    let result: WriteBackResult;
    if (!footnote) {
      result = {
        reviewItemId: item.reviewItemId,
        status: "STALE",
        actionKind: item.proposedAction?.type,
        reason: "FOOTNOTE_NOT_FOUND",
        reasons: ["FOOTNOTE_NOT_FOUND"],
        message:
          "Die Fußnote wurde seit der Analyse verändert. Bitte prüfen Sie die Fußnote erneut.",
      };
    } else {
      result = await applySingleReviewItem(
        { reviewItem: item, footnote, appliedMutations: mutations },
        input.adapter
      );
    }
    state[item.reviewItemId] = result;
    if (
      result.mutation &&
      !mutations.some((record) => record.reviewItemId === result.reviewItemId)
    ) {
      mutations.push(result.mutation);
    }
    if (result.status === "APPLIED") summary.applied += 1;
    else if (result.status === "STALE") summary.stale += 1;
    else summary.failed += 1;
    input.onResult?.(result);
    input.onProgress?.({ processed: index + 1, total: selected.length });
  }

  return { state, mutations, summary };
}
