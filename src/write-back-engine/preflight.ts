import type { ProposedReviewAction, ReviewItem } from "@/review-engine";
import type { FootnoteSnapshot } from "@/taskpane/taskpane";
import type {
  ResolvedFootnoteTarget,
  ResolvedWriteRange,
  LocalRevalidationResult,
  WriteBackBlockReason,
  WriteBackPreflightResult,
  WriteBackProtectedRange,
} from "./types";

export const SUPPORTED_FORMAT_PROPERTIES = [
  "fontName",
  "fontSize",
  "bold",
  "italic",
  "underline",
  "strikeThrough",
  "superscript",
  "subscript",
  "characterSpacing",
] as const;

export type SupportedFormatProperty = (typeof SUPPORTED_FORMAT_PROPERTIES)[number];

export function actionRange(action: ProposedReviewAction): ResolvedWriteRange {
  if (action.type === "TEXT_INSERT") {
    return { start: action.position, end: action.position, originalText: "" };
  }
  return {
    start: action.start,
    end: action.end,
    originalText: action.type === "TEXT_REPLACE" ? action.originalText : "",
  };
}

export function formatProperty(
  action: Extract<ProposedReviewAction, { type: "FORMAT_CHANGE" }>
): SupportedFormatProperty | undefined {
  const properties = Object.keys(action.changes);
  if (properties.length !== 1) return undefined;
  const property = properties[0];
  return SUPPORTED_FORMAT_PROPERTIES.includes(property as SupportedFormatProperty)
    ? (property as SupportedFormatProperty)
    : undefined;
}

export function isSupportedWriteBackAction(action: ProposedReviewAction): boolean {
  if (action.type === "TEXT_REPLACE") {
    return typeof action.originalText === "string" && typeof action.replacementText === "string";
  }
  if (action.type === "TEXT_INSERT")
    return typeof action.text === "string" && action.text.length > 0;
  const property = formatProperty(action);
  if (!property) return false;
  const value = action.changes[property];
  if (["fontName", "underline"].includes(property)) {
    return (
      (typeof value === "string" && value.length > 0) ||
      (property === "underline" && typeof value === "boolean")
    );
  }
  if (["fontSize", "characterSpacing"].includes(property)) {
    return (
      typeof value === "number" && Number.isFinite(value) && (property !== "fontSize" || value > 0)
    );
  }
  return typeof value === "boolean";
}

function failure(
  reasons: WriteBackBlockReason[],
  statusOnFailure: "FAILED" | "STALE"
): WriteBackPreflightResult {
  return { ok: false, reasons, statusOnFailure };
}

export function preflightReviewItem(
  reviewItem: ReviewItem,
  footnote: FootnoteSnapshot
): WriteBackPreflightResult {
  const reasons: WriteBackBlockReason[] = [];
  const action = reviewItem.proposedAction;
  if (reviewItem.decision.effectiveStatus !== "ACCEPTED") reasons.push("REVIEW_NOT_ACCEPTED");
  if (!action) reasons.push("ACTION_MISSING");
  if (!reviewItem.technicalEligibility.eligible || footnote.readStatus === "failed") {
    reasons.push("TECHNICALLY_INELIGIBLE");
  }
  if (reviewItem.conflicts.length > 0) reasons.push("UNRESOLVED_CONFLICT");
  if (action && !isSupportedWriteBackAction(action)) {
    if (action.type === "FORMAT_CHANGE" && Object.keys(action.changes).length !== 1) {
      reasons.push("FORMAT_CHANGE_NOT_ATOMIC");
    } else if (action.type === "FORMAT_CHANGE") {
      reasons.push("FORMAT_PROPERTY_UNSUPPORTED");
    } else {
      reasons.push("ACTION_UNSUPPORTED");
    }
  }
  if (
    reviewItem.finding.footnoteId !== footnote.id ||
    reviewItem.sourceTextHash !== footnote.originalTextHash ||
    reviewItem.finding.sourceTextHash !== footnote.originalTextHash
  ) {
    reasons.push("SOURCE_CHANGED");
  }
  if (action) {
    const range = actionRange(action);
    const actionEnd = action.type === "TEXT_INSERT" ? action.position : action.end;
    const actionStart = action.type === "TEXT_INSERT" ? action.position : action.start;
    if (
      !Number.isInteger(actionStart) ||
      !Number.isInteger(actionEnd) ||
      actionStart < 0 ||
      actionStart > actionEnd ||
      actionEnd > footnote.contentText.length ||
      actionStart !== reviewItem.finding.start ||
      actionEnd !== reviewItem.finding.end
    ) {
      reasons.push("INVALID_RANGE");
    } else if (
      action.type !== "TEXT_INSERT" &&
      (reviewItem.finding.originalText !== footnote.contentText.slice(range.start, range.end) ||
        (action.type === "TEXT_REPLACE" && action.originalText !== reviewItem.finding.originalText))
    ) {
      reasons.push("ORIGINAL_TEXT_MISMATCH");
    } else if (action.type === "TEXT_INSERT" && reviewItem.finding.originalText !== "") {
      reasons.push("ORIGINAL_TEXT_MISMATCH");
    }
  }

  return reasons.length === 0
    ? { ok: true, reasons: [] }
    : failure(
        Array.from(new Set(reasons)),
        reasons.some((reason) =>
          ["SOURCE_CHANGED", "INVALID_RANGE", "ORIGINAL_TEXT_MISMATCH"].includes(reason)
        )
          ? "STALE"
          : "FAILED"
      );
}

function overlapsProtectedRange(
  range: ResolvedWriteRange,
  protectedRanges: readonly WriteBackProtectedRange[]
): boolean {
  if (range.start === range.end) {
    return protectedRanges.some(
      (protectedRange) => protectedRange.start <= range.start && range.start < protectedRange.end
    );
  }
  return protectedRanges.some(
    (protectedRange) => range.start < protectedRange.end && range.end > protectedRange.start
  );
}

export function preflightResolvedTarget(input: {
  reviewItem: ReviewItem;
  analyzedFootnote: FootnoteSnapshot;
  resolvedFootnote: ResolvedFootnoteTarget;
  protectedStateComplete: boolean;
  localRevalidation: LocalRevalidationResult;
}): WriteBackPreflightResult {
  const { reviewItem, analyzedFootnote, resolvedFootnote } = input;
  const action = reviewItem.proposedAction;
  if (!action) return failure(["ACTION_MISSING"], "FAILED");
  if (
    resolvedFootnote.ordinal !== analyzedFootnote.locator.ordinal ||
    resolvedFootnote.displayLabel !== analyzedFootnote.locator.displayLabel
  ) {
    return failure(["FOOTNOTE_AMBIGUOUS"], "STALE");
  }
  if (
    (analyzedFootnote.locator.contextBefore &&
      resolvedFootnote.contextBefore !== analyzedFootnote.locator.contextBefore) ||
    (analyzedFootnote.locator.contextAfter &&
      resolvedFootnote.contextAfter !== analyzedFootnote.locator.contextAfter)
  ) {
    return failure(["LOCATOR_CONTEXT_MISMATCH"], "STALE");
  }

  const local = input.localRevalidation;
  if (local.status === "AMBIGUOUS") {
    return {
      ...failure(["RANGE_AMBIGUOUS"], "STALE"),
      localRevalidation: local,
    };
  }
  if (local.status === "MISSING") {
    return {
      ...failure(["LOCAL_TARGET_MISSING"], "STALE"),
      localRevalidation: local,
    };
  }
  if (local.status === "UNSAFE") {
    return {
      ...failure(["LOCAL_TARGET_UNSAFE"], "FAILED"),
      localRevalidation: local,
    };
  }
  if (local.status === "ALREADY_RESOLVED") {
    return {
      ok: true,
      reasons: [],
      resolvedFootnote,
      resolvedRange:
        local.resolvedStart !== undefined && local.resolvedEnd !== undefined
          ? {
              start: local.resolvedStart,
              end: local.resolvedEnd,
              originalText: local.matchedText ?? "",
            }
          : undefined,
      localRevalidation: local,
    };
  }
  if (!input.protectedStateComplete) return failure(["PROTECTED_STATE_UNKNOWN"], "FAILED");

  if (local.resolvedStart === undefined || local.resolvedEnd === undefined) {
    return {
      ...failure(["LOCAL_TARGET_UNSAFE"], "FAILED"),
      localRevalidation: local,
    };
  }
  const actionBounds: ResolvedWriteRange = {
    start: local.resolvedStart,
    end: local.resolvedEnd,
    originalText: local.matchedText ?? "",
  };
  const resolvedRange: ResolvedWriteRange = {
    ...actionBounds,
    originalText:
      action.type === "TEXT_INSERT"
        ? ""
        : resolvedFootnote.contentText.slice(actionBounds.start, actionBounds.end),
  };
  if (
    actionBounds.start < 0 ||
    actionBounds.start > actionBounds.end ||
    actionBounds.end > resolvedFootnote.contentText.length
  ) {
    return failure(["INVALID_RANGE"], "STALE");
  }
  if (
    action.type !== "TEXT_INSERT" &&
    (resolvedRange.originalText !== local.matchedText ||
      (action.type === "TEXT_REPLACE" && action.originalText !== reviewItem.finding.originalText))
  ) {
    return failure(["ORIGINAL_TEXT_MISMATCH"], "STALE");
  }
  if (overlapsProtectedRange(actionBounds, resolvedFootnote.protectedRanges)) {
    return failure(["PROTECTED_RANGE"], "FAILED");
  }

  return {
    ok: true,
    reasons: [],
    resolvedFootnote,
    resolvedRange,
    localRevalidation: local,
  };
}
