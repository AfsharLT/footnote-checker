import type { ProposedReviewAction, ReviewItem } from "@/review-engine";
import type { FootnoteSnapshot } from "@/taskpane/taskpane";
import type { AppliedMutationRecord, LocalRevalidationResult } from "./types";

const CONTEXT_WINDOW = 40;

interface RebasedTarget {
  start: number;
  end: number;
  matchedText: string;
  safelyTransformed: boolean;
}

export function rebaseResolvedRangeThroughMutations(
  target: { start: number; end: number; matchedText: string },
  mutations: readonly AppliedMutationRecord[]
): RebasedTarget {
  let { start, end, matchedText } = target;
  let safelyTransformed = true;
  for (const mutation of mutations) {
    if (mutation.actionKind === "FORMAT_CHANGE") continue;
    if (mutation.oldEnd <= start) {
      start += mutation.newTextLengthDelta;
      end += mutation.newTextLengthDelta;
      continue;
    }
    if (mutation.oldStart >= end) continue;
    if (mutation.newText === undefined) {
      safelyTransformed = false;
      continue;
    }
    const relativeStart = mutation.oldStart - start;
    const relativeEnd = mutation.oldEnd - start;
    if (relativeStart < 0 || relativeEnd > matchedText.length || relativeStart > relativeEnd) {
      safelyTransformed = false;
      continue;
    }
    matchedText =
      matchedText.slice(0, relativeStart) + mutation.newText + matchedText.slice(relativeEnd);
    end += mutation.newTextLengthDelta;
  }
  return { start, end, matchedText, safelyTransformed };
}

interface Candidate {
  start: number;
  end: number;
  matchedText: string;
  score: number;
}

function occurrences(text: string, query: string): number[] {
  if (!query) return [];
  const starts: number[] = [];
  let cursor = 0;
  while (cursor <= text.length - query.length) {
    const start = text.indexOf(query, cursor);
    if (start < 0) break;
    starts.push(start);
    cursor = start + Math.max(1, query.length);
  }
  return starts;
}

function matchingSuffix(expected: string, actualBefore: string): number {
  const maximum = Math.min(expected.length, actualBefore.length);
  let matched = 0;
  while (
    matched < maximum &&
    expected[expected.length - 1 - matched] === actualBefore[actualBefore.length - 1 - matched]
  ) {
    matched += 1;
  }
  return matched;
}

function matchingPrefix(expected: string, actualAfter: string): number {
  const maximum = Math.min(expected.length, actualAfter.length);
  let matched = 0;
  while (matched < maximum && expected[matched] === actualAfter[matched]) matched += 1;
  return matched;
}

function localContext(
  analyzedText: string,
  start: number,
  end: number
): { before: string; after: string } {
  return {
    before: analyzedText.slice(Math.max(0, start - CONTEXT_WINDOW), start),
    after: analyzedText.slice(end, Math.min(analyzedText.length, end + CONTEXT_WINDOW)),
  };
}

function contextScore(
  currentText: string,
  start: number,
  end: number,
  before: string,
  after: string
): number {
  return (
    matchingSuffix(before, currentText.slice(Math.max(0, start - CONTEXT_WINDOW), start)) +
    matchingPrefix(after, currentText.slice(end, end + CONTEXT_WINDOW))
  );
}

function selectCandidate(
  currentText: string,
  query: string,
  before: string,
  after: string
): Candidate | "AMBIGUOUS" | undefined {
  const candidates = occurrences(currentText, query).map((start) => ({
    start,
    end: start + query.length,
    matchedText: query,
    score: contextScore(currentText, start, start + query.length, before, after),
  }));
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  const bestScore = Math.max(...candidates.map((candidate) => candidate.score));
  const best = candidates.filter((candidate) => candidate.score === bestScore);
  return best.length === 1 && bestScore > 0 ? best[0] : "AMBIGUOUS";
}

function rebasedTarget(
  footnote: FootnoteSnapshot,
  item: ReviewItem,
  mutations: readonly AppliedMutationRecord[]
): RebasedTarget {
  return rebaseResolvedRangeThroughMutations(
    { start: item.finding.start, end: item.finding.end, matchedText: item.finding.originalText },
    mutations.filter(
      (mutation) =>
        mutation.footnoteId === footnote.id && mutation.reviewItemId !== item.reviewItemId
    )
  );
}

function textAfterKnownMutations(
  footnote: FootnoteSnapshot,
  item: ReviewItem,
  mutations: readonly AppliedMutationRecord[]
): string {
  let text = footnote.contentText;
  for (const mutation of mutations) {
    if (
      mutation.footnoteId !== footnote.id ||
      mutation.reviewItemId === item.reviewItemId ||
      mutation.actionKind === "FORMAT_CHANGE" ||
      mutation.newText === undefined ||
      mutation.oldStart < 0 ||
      mutation.oldStart > mutation.oldEnd ||
      mutation.oldEnd > text.length
    ) {
      continue;
    }
    text = text.slice(0, mutation.oldStart) + mutation.newText + text.slice(mutation.oldEnd);
  }
  return text;
}

function textTargetRevalidation(input: {
  item: ReviewItem;
  footnote: FootnoteSnapshot;
  currentText: string;
  mutations: readonly AppliedMutationRecord[];
  action: Exclude<ProposedReviewAction, { type: "TEXT_INSERT" }>;
}): LocalRevalidationResult {
  const { item, footnote, currentText, mutations, action } = input;
  const originalText = item.finding.originalText;
  if (
    !originalText ||
    footnote.contentText.slice(item.finding.start, item.finding.end) !== originalText
  ) {
    return { status: "UNSAFE", reason: "The analyzed target text is invalid." };
  }
  const rebased = rebasedTarget(footnote, item, mutations);
  const expectedCurrentText = textAfterKnownMutations(footnote, item, mutations);
  const context = localContext(expectedCurrentText, rebased.start, rebased.end);
  const replacementText = action.type === "TEXT_REPLACE" ? action.replacementText : undefined;

  if (
    replacementText !== undefined &&
    currentText.slice(rebased.start, rebased.start + replacementText.length) === replacementText &&
    (contextScore(
      currentText,
      rebased.start,
      rebased.start + replacementText.length,
      context.before,
      context.after
    ) > 0 ||
      currentText === replacementText)
  ) {
    return {
      status: "ALREADY_RESOLVED",
      resolvedStart: rebased.start,
      resolvedEnd: rebased.start + replacementText.length,
      matchedText: replacementText,
      reason: "The replacement is already present at the locally validated target.",
    };
  }

  const rebasedText = action.type === "FORMAT_CHANGE" ? rebased.matchedText : originalText;
  if (
    rebased.safelyTransformed &&
    rebased.start >= 0 &&
    rebased.end <= currentText.length &&
    currentText.slice(rebased.start, rebased.end) === rebasedText
  ) {
    return {
      status:
        rebased.start === item.finding.start && rebased.end === item.finding.end
          ? "EXACT"
          : "RELOCATED",
      resolvedStart: rebased.start,
      resolvedEnd: rebased.end,
      matchedText: rebasedText,
    };
  }

  const candidate = selectCandidate(currentText, rebasedText, context.before, context.after);
  if (candidate === "AMBIGUOUS") {
    return { status: "AMBIGUOUS", reason: "Several equally plausible local targets remain." };
  }
  if (candidate) {
    return {
      status: "RELOCATED",
      resolvedStart: candidate.start,
      resolvedEnd: candidate.end,
      matchedText: candidate.matchedText,
    };
  }

  if (replacementText !== undefined) {
    const resolvedCandidate = selectCandidate(
      currentText,
      replacementText,
      context.before,
      context.after
    );
    if (resolvedCandidate === "AMBIGUOUS") {
      return { status: "AMBIGUOUS", reason: "The resolved replacement is ambiguous." };
    }
    if (resolvedCandidate && (resolvedCandidate.score > 0 || currentText === replacementText)) {
      return {
        status: "ALREADY_RESOLVED",
        resolvedStart: resolvedCandidate.start,
        resolvedEnd: resolvedCandidate.end,
        matchedText: replacementText,
        reason: "The replacement is already present in the validated local context.",
      };
    }
  }
  return { status: "MISSING", reason: "The original local target is no longer present." };
}

interface BoundaryCandidate {
  position: number;
  score: number;
  alreadyResolved: boolean;
}

function insertionRevalidation(input: {
  item: ReviewItem;
  footnote: FootnoteSnapshot;
  currentText: string;
  mutations: readonly AppliedMutationRecord[];
  action: Extract<ProposedReviewAction, { type: "TEXT_INSERT" }>;
}): LocalRevalidationResult {
  const { item, footnote, currentText, mutations, action } = input;
  const rebased = rebasedTarget(footnote, item, mutations);
  const expectedCurrentText = textAfterKnownMutations(footnote, item, mutations);
  const context = localContext(expectedCurrentText, rebased.start, rebased.start);
  const availableContext = context.before.length + context.after.length;
  if (availableContext === 0) {
    return { status: "UNSAFE", reason: "An insertion without a local anchor is unsafe." };
  }

  const candidates: BoundaryCandidate[] = [];
  for (let position = 0; position <= currentText.length; position += 1) {
    const score = contextScore(currentText, position, position, context.before, context.after);
    candidates.push({ position, score, alreadyResolved: false });
    if (currentText.slice(position, position + action.text.length) === action.text) {
      const alreadyScore = contextScore(
        currentText,
        position,
        position + action.text.length,
        context.before,
        context.after
      );
      candidates.push({ position, score: alreadyScore, alreadyResolved: true });
    }
  }
  const bestScore = Math.max(...candidates.map((candidate) => candidate.score));
  const minimumScore = Math.min(8, availableContext);
  if (bestScore < minimumScore) {
    return { status: "MISSING", reason: "The insertion anchor is no longer present." };
  }
  const best = candidates.filter((candidate) => candidate.score === bestScore);
  const uniquePositions = new Set(best.map((candidate) => candidate.position));
  if (uniquePositions.size !== 1) {
    return { status: "AMBIGUOUS", reason: "Several insertion boundaries are equally plausible." };
  }
  const selected = best.find((candidate) => candidate.alreadyResolved) ?? best[0];
  if (selected.alreadyResolved) {
    return {
      status: "ALREADY_RESOLVED",
      resolvedStart: selected.position,
      resolvedEnd: selected.position,
      matchedText: "",
      reason: "The insertion text is already present at the validated boundary.",
    };
  }
  return {
    status:
      selected.position === action.position && selected.position === rebased.start
        ? "EXACT"
        : "RELOCATED",
    resolvedStart: selected.position,
    resolvedEnd: selected.position,
    matchedText: "",
  };
}

export function revalidateActionLocally(input: {
  reviewItem: ReviewItem;
  analyzedFootnote: FootnoteSnapshot;
  currentContentText: string;
  appliedMutations?: readonly AppliedMutationRecord[];
}): LocalRevalidationResult {
  const action = input.reviewItem.proposedAction;
  const sourceChanged = input.currentContentText !== input.analyzedFootnote.contentText;
  if (!action) {
    return { status: "UNSAFE", reason: "No write-back action exists.", sourceChanged };
  }
  const mutations = input.appliedMutations ?? [];
  const result =
    action.type === "TEXT_INSERT"
      ? insertionRevalidation({
          item: input.reviewItem,
          footnote: input.analyzedFootnote,
          currentText: input.currentContentText,
          mutations,
          action,
        })
      : textTargetRevalidation({
          item: input.reviewItem,
          footnote: input.analyzedFootnote,
          currentText: input.currentContentText,
          mutations,
          action,
        });
  return { ...result, sourceChanged };
}

export function createAppliedMutationRecord(input: {
  reviewItem: ReviewItem;
  localRevalidation: LocalRevalidationResult;
  appliedAt: string;
}): AppliedMutationRecord | undefined {
  const action = input.reviewItem.proposedAction;
  const start = input.localRevalidation.resolvedStart;
  const end = input.localRevalidation.resolvedEnd;
  if (!action || start === undefined || end === undefined) return undefined;
  const newText =
    action.type === "TEXT_REPLACE"
      ? action.replacementText
      : action.type === "TEXT_INSERT"
        ? action.text
        : undefined;
  return {
    reviewItemId: input.reviewItem.reviewItemId,
    footnoteId: input.reviewItem.finding.footnoteId,
    actionKind: action.type,
    oldStart: start,
    oldEnd: end,
    newTextLengthDelta:
      action.type === "TEXT_REPLACE"
        ? action.replacementText.length - (end - start)
        : action.type === "TEXT_INSERT"
          ? action.text.length
          : 0,
    ...(newText !== undefined ? { newText } : {}),
    appliedAt: input.appliedAt,
  };
}
