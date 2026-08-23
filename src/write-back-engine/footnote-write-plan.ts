import type { ProposedReviewAction, ReviewItem } from "@/review-engine";
import type { FormattingRun } from "@/taskpane/taskpane";
import { hashFootnoteContentText } from "@/taskpane/taskpane";
import {
  createAppliedMutationRecord,
  rebaseResolvedRangeThroughMutations,
  revalidateActionLocally,
} from "./local-revalidation";
import { preflightResolvedTarget, preflightReviewItem } from "./preflight";
import type {
  AppliedMutationRecord,
  ApplyBatchReviewItemEntry,
  LocalRevalidationResult,
  ResolvedFootnoteTarget,
  WriteBackBlockReason,
  WriteBackProtectedRange,
  WriteBackResult,
} from "./types";

export type FootnoteWritePlanStatus =
  "PLANNED" | "READY" | "SKIPPED" | "PARTIAL" | "APPLIED" | "FAILED";

export interface CurrentFootnoteWriteSnapshot {
  footnoteId: string;
  ordinal: number;
  displayLabel: string;
  rawWordText: string;
  contentText: string;
  contentHash: string;
  contextBefore: string;
  contextAfter: string;
  formattingRuns?: FormattingRun[];
  protectedRanges: WriteBackProtectedRange[];
  protectedStateComplete: boolean;
  loadedAt: string;
}

export interface PlannedFootnoteAction {
  reviewItem: ReviewItem;
  action: ProposedReviewAction;
  localRevalidation: LocalRevalidationResult;
  resolvedStart: number;
  resolvedEnd: number;
  matchedText: string;
  mutation?: AppliedMutationRecord;
}

export interface FootnoteWritePlan {
  footnoteId: string;
  footnoteOrdinal: number;
  reviewItemIds: string[];
  textActions: PlannedFootnoteAction[];
  formatActions: PlannedFootnoteAction[];
  currentSnapshot?: CurrentFootnoteWriteSnapshot;
  simulatedContentText: string;
  simulatedMutations: AppliedMutationRecord[];
  preliminaryResults: WriteBackResult[];
  status: FootnoteWritePlanStatus;
}

function failedResult(
  item: ReviewItem,
  status: "FAILED" | "STALE",
  reason: WriteBackBlockReason,
  localRevalidation?: LocalRevalidationResult
): WriteBackResult {
  return {
    reviewItemId: item.reviewItemId,
    status,
    actionKind: item.proposedAction?.type,
    ...(reason ? { reason, reasons: [reason] } : {}),
    ...(localRevalidation ? { localRevalidation } : {}),
    message:
      status === "STALE"
        ? "Die Fußnote wurde seit der Analyse verändert. Bitte prüfen Sie die Fußnote erneut."
        : "Die Änderung konnte technisch nicht sicher angewendet werden.",
  };
}

function appliedAlreadyResult(
  item: ReviewItem,
  localRevalidation: LocalRevalidationResult
): WriteBackResult {
  return {
    reviewItemId: item.reviewItemId,
    status: "APPLIED",
    actionKind: item.proposedAction?.type,
    reason: "ALREADY_RESOLVED",
    localRevalidation: { ...localRevalidation, status: "ALREADY_RESOLVED" },
    appliedAt: new Date().toISOString(),
    message: "Die Änderung war bereits erledigt.",
  };
}

function resolvedTarget(
  snapshot: CurrentFootnoteWriteSnapshot,
  contentText = snapshot.contentText,
  protectedRanges = snapshot.protectedRanges
): ResolvedFootnoteTarget {
  return {
    ordinal: snapshot.ordinal,
    displayLabel: snapshot.displayLabel,
    contentText,
    contentTextHash: hashFootnoteContentText(contentText),
    contextBefore: snapshot.contextBefore,
    contextAfter: snapshot.contextAfter,
    protectedRanges,
  };
}

function rangesOverlap(left: PlannedFootnoteAction, right: PlannedFootnoteAction): boolean {
  if (left.resolvedStart === left.resolvedEnd && right.resolvedStart === right.resolvedEnd) {
    return left.resolvedStart === right.resolvedStart;
  }
  if (left.resolvedStart === left.resolvedEnd) {
    return right.resolvedStart <= left.resolvedStart && left.resolvedStart < right.resolvedEnd;
  }
  if (right.resolvedStart === right.resolvedEnd) {
    return left.resolvedStart <= right.resolvedStart && right.resolvedStart < left.resolvedEnd;
  }
  return left.resolvedStart < right.resolvedEnd && left.resolvedEnd > right.resolvedStart;
}

function adjustedProtectedRanges(
  ranges: readonly WriteBackProtectedRange[],
  mutation: AppliedMutationRecord
): WriteBackProtectedRange[] {
  return ranges.map((range) => {
    if (mutation.oldEnd <= range.start) {
      return {
        ...range,
        start: range.start + mutation.newTextLengthDelta,
        end: range.end + mutation.newTextLengthDelta,
      };
    }
    return { ...range };
  });
}

function preliminaryAction(
  entry: ApplyBatchReviewItemEntry,
  snapshot: CurrentFootnoteWriteSnapshot,
  appliedMutations: readonly AppliedMutationRecord[]
): PlannedFootnoteAction | WriteBackResult {
  const staticPreflight = preflightReviewItem(entry.reviewItem, entry.footnote);
  if (!staticPreflight.ok) {
    return failedResult(
      entry.reviewItem,
      staticPreflight.statusOnFailure ?? "FAILED",
      staticPreflight.reasons[0]
    );
  }
  const action = entry.reviewItem.proposedAction;
  if (!action) return failedResult(entry.reviewItem, "FAILED", "ACTION_MISSING");
  const localRevalidation = revalidateActionLocally({
    reviewItem: entry.reviewItem,
    analyzedFootnote: entry.footnote,
    currentContentText: snapshot.contentText,
    appliedMutations,
  });
  const preflight = preflightResolvedTarget({
    reviewItem: entry.reviewItem,
    analyzedFootnote: entry.footnote,
    resolvedFootnote: resolvedTarget(snapshot),
    protectedStateComplete: snapshot.protectedStateComplete,
    localRevalidation,
  });
  if (!preflight.ok) {
    return failedResult(
      entry.reviewItem,
      preflight.statusOnFailure ?? "FAILED",
      preflight.reasons[0],
      localRevalidation
    );
  }
  if (localRevalidation.status === "ALREADY_RESOLVED" && action.type !== "FORMAT_CHANGE") {
    return appliedAlreadyResult(entry.reviewItem, localRevalidation);
  }
  if (
    localRevalidation.resolvedStart === undefined ||
    localRevalidation.resolvedEnd === undefined
  ) {
    return failedResult(entry.reviewItem, "FAILED", "LOCAL_TARGET_UNSAFE", localRevalidation);
  }
  return {
    reviewItem: entry.reviewItem,
    action,
    localRevalidation,
    resolvedStart: localRevalidation.resolvedStart,
    resolvedEnd: localRevalidation.resolvedEnd,
    matchedText: localRevalidation.matchedText ?? "",
  };
}

function simulateTextAction(text: string, action: PlannedFootnoteAction): string {
  if (action.action.type === "TEXT_REPLACE") {
    return (
      text.slice(0, action.resolvedStart) +
      action.action.replacementText +
      text.slice(action.resolvedEnd)
    );
  }
  if (action.action.type === "TEXT_INSERT") {
    return (
      text.slice(0, action.resolvedStart) + action.action.text + text.slice(action.resolvedStart)
    );
  }
  return text;
}

export function createFootnoteWritePlan(input: {
  entries: readonly ApplyBatchReviewItemEntry[];
  currentSnapshot: CurrentFootnoteWriteSnapshot;
  appliedMutations?: readonly AppliedMutationRecord[];
  now?: string;
}): FootnoteWritePlan {
  const { entries, currentSnapshot } = input;
  const preliminaryResults: WriteBackResult[] = [];
  const candidates = entries.map((entry) =>
    preliminaryAction(entry, currentSnapshot, input.appliedMutations ?? [])
  );
  const textCandidates = candidates.filter(
    (candidate): candidate is PlannedFootnoteAction =>
      "action" in candidate && candidate.action.type !== "FORMAT_CHANGE"
  );
  const formatCandidates = candidates.filter(
    (candidate): candidate is PlannedFootnoteAction =>
      "action" in candidate && candidate.action.type === "FORMAT_CHANGE"
  );
  candidates.forEach((candidate) => {
    if (!("action" in candidate)) preliminaryResults.push(candidate);
  });

  const conflictingIds = new Set<string>();
  for (let left = 0; left < textCandidates.length; left += 1) {
    for (let right = left + 1; right < textCandidates.length; right += 1) {
      if (rangesOverlap(textCandidates[left], textCandidates[right])) {
        conflictingIds.add(textCandidates[left].reviewItem.reviewItemId);
        conflictingIds.add(textCandidates[right].reviewItem.reviewItemId);
      }
    }
  }
  const textActions = textCandidates
    .filter((candidate) => {
      if (!conflictingIds.has(candidate.reviewItem.reviewItemId)) return true;
      preliminaryResults.push(
        failedResult(candidate.reviewItem, "STALE", "RANGE_AMBIGUOUS", {
          ...candidate.localRevalidation,
          status: "AMBIGUOUS",
          reason: "Locally relocated batch actions overlap.",
        })
      );
      return false;
    })
    .sort(
      (left, right) =>
        right.resolvedStart - left.resolvedStart ||
        right.resolvedEnd - left.resolvedEnd ||
        left.reviewItem.reviewItemId.localeCompare(right.reviewItem.reviewItemId)
    );

  let simulatedContentText = currentSnapshot.contentText;
  let protectedRanges = currentSnapshot.protectedRanges.map((range) => ({ ...range }));
  const simulatedMutations: AppliedMutationRecord[] = [];
  for (const planned of textActions) {
    simulatedContentText = simulateTextAction(simulatedContentText, planned);
    const mutation = createAppliedMutationRecord({
      reviewItem: planned.reviewItem,
      localRevalidation: planned.localRevalidation,
      appliedAt: input.now ?? new Date().toISOString(),
    });
    if (mutation) {
      planned.mutation = mutation;
      simulatedMutations.push(mutation);
      protectedRanges = adjustedProtectedRanges(protectedRanges, mutation);
    }
  }

  const formatActions: PlannedFootnoteAction[] = [];
  for (const candidate of formatCandidates) {
    const transformed = rebaseResolvedRangeThroughMutations(
      {
        start: candidate.resolvedStart,
        end: candidate.resolvedEnd,
        matchedText: candidate.matchedText,
      },
      simulatedMutations
    );
    const localRevalidation: LocalRevalidationResult = {
      ...candidate.localRevalidation,
      status:
        transformed.start === candidate.resolvedStart && transformed.end === candidate.resolvedEnd
          ? candidate.localRevalidation.status
          : "RELOCATED",
      resolvedStart: transformed.start,
      resolvedEnd: transformed.end,
      matchedText: transformed.matchedText,
      sourceChanged: simulatedContentText !== entries[0]?.footnote.contentText,
      ...(!transformed.safelyTransformed
        ? { status: "UNSAFE" as const, reason: "Text mutations cannot safely rebase formatting." }
        : {}),
    };
    const preflight = preflightResolvedTarget({
      reviewItem: candidate.reviewItem,
      analyzedFootnote: entries.find(
        (entry) => entry.reviewItem.reviewItemId === candidate.reviewItem.reviewItemId
      )!.footnote,
      resolvedFootnote: resolvedTarget(currentSnapshot, simulatedContentText, protectedRanges),
      protectedStateComplete: currentSnapshot.protectedStateComplete,
      localRevalidation,
    });
    if (!preflight.ok) {
      preliminaryResults.push(
        failedResult(
          candidate.reviewItem,
          preflight.statusOnFailure ?? "FAILED",
          preflight.reasons[0],
          localRevalidation
        )
      );
      continue;
    }
    formatActions.push({
      ...candidate,
      localRevalidation,
      resolvedStart: transformed.start,
      resolvedEnd: transformed.end,
      matchedText: transformed.matchedText,
    });
  }

  const actionable = textActions.length + formatActions.length;
  const failures = preliminaryResults.filter((result) => result.status !== "APPLIED").length;
  const status: FootnoteWritePlanStatus =
    actionable === 0
      ? preliminaryResults.every((result) => result.status === "APPLIED")
        ? "APPLIED"
        : "SKIPPED"
      : failures > 0
        ? "PARTIAL"
        : "READY";
  return {
    footnoteId: currentSnapshot.footnoteId,
    footnoteOrdinal: currentSnapshot.ordinal,
    reviewItemIds: entries.map((entry) => entry.reviewItem.reviewItemId),
    textActions,
    formatActions,
    currentSnapshot,
    simulatedContentText,
    simulatedMutations,
    preliminaryResults,
    status,
  };
}
