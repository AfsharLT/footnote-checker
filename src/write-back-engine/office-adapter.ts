/* global Office, Word */

import type { ProposedReviewAction } from "@/review-engine";
import { findPlainTextUrls } from "@/footnote-engine/patterns";
import {
  normalizeFootnoteReferencesInContext,
  WORD_NOTE_REFERENCE_MARK,
} from "@/taskpane/locator-context";
import {
  contentTextFromRawWordText,
  extractCurrentProtectedRanges,
  hashFootnoteContentText,
} from "@/taskpane/taskpane";
import { applyFormattingChange } from "./formatting-writeback";
import { createAppliedMutationRecord, revalidateActionLocally } from "./local-revalidation";
import { resolveInsertSearch, resolveTextSearch, type TextRangeResolution } from "./locator";
import { formatProperty, preflightResolvedTarget, type SupportedFormatProperty } from "./preflight";
import { applyTextInsertion, applyTextReplacement } from "./text-writeback";
import type {
  ApplySingleReviewItemInput,
  LocalRevalidationResult,
  ResolvedFootnoteTarget,
  WriteBackBlockReason,
  WriteBackDocumentAdapter,
  WriteBackResult,
} from "./types";

const EXACT_SEARCH_OPTIONS = {
  ignorePunct: false,
  ignoreSpace: false,
  matchCase: true,
  matchPrefix: false,
  matchSuffix: false,
  matchWholeWord: false,
  matchWildcards: false,
};

function failed(
  input: ApplySingleReviewItemInput,
  status: "FAILED" | "STALE",
  reason: WriteBackBlockReason,
  reasons: WriteBackBlockReason[] = [reason],
  localRevalidation?: LocalRevalidationResult
): WriteBackResult {
  return {
    reviewItemId: input.reviewItem.reviewItemId,
    status,
    actionKind: input.reviewItem.proposedAction?.type,
    reason,
    reasons,
    ...(localRevalidation ? { localRevalidation } : {}),
    message:
      status === "STALE"
        ? "Die Fußnote wurde seit der Analyse verändert. Bitte prüfen Sie die Fußnote erneut."
        : "Die Änderung konnte technisch nicht sicher angewendet werden.",
  };
}

function displayLabel(referenceText: string, ordinal: number): string {
  return referenceText && referenceText !== WORD_NOTE_REFERENCE_MARK
    ? referenceText
    : String(ordinal);
}

function searchResolutionForAction(
  contentText: string,
  action: ProposedReviewAction,
  local: LocalRevalidationResult
): TextRangeResolution | undefined {
  if (local.resolvedStart === undefined || local.resolvedEnd === undefined) return undefined;
  return action.type === "TEXT_INSERT"
    ? resolveInsertSearch(contentText, local.resolvedStart)
    : resolveTextSearch(
        contentText,
        local.resolvedStart,
        local.resolvedEnd,
        local.matchedText ?? ""
      );
}

function applyMutation(target: Word.Range, action: ProposedReviewAction): void {
  if (action.type === "TEXT_REPLACE") applyTextReplacement(target, action);
  else if (action.type === "TEXT_INSERT") applyTextInsertion(target, action);
  else applyFormattingChange(target, action);
}

function loadFormattingProperty(target: Word.Range, property: SupportedFormatProperty): void {
  const wordProperty =
    property === "fontName"
      ? "name"
      : property === "fontSize"
        ? "size"
        : property === "characterSpacing"
          ? "spacing"
          : property;
  target.font.load(wordProperty);
}

function currentFormattingValue(target: Word.Range, property: SupportedFormatProperty): unknown {
  if (property === "fontName") return target.font.name;
  if (property === "fontSize") return target.font.size;
  if (property === "characterSpacing") return target.font.spacing;
  return target.font[property];
}

function expectedFormattingValue(
  action: Extract<ProposedReviewAction, { type: "FORMAT_CHANGE" }>,
  property: SupportedFormatProperty
): unknown {
  const value = action.changes[property];
  return property === "underline" && typeof value === "boolean"
    ? value
      ? "Single"
      : "None"
    : value;
}

function formattingValueIsUnavailable(value: unknown, property: SupportedFormatProperty): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && (value.length === 0 || value.toLowerCase() === "mixed")) ||
    (property === "fontSize" && typeof value === "number" && value <= 0)
  );
}

function appliedResult(
  input: ApplySingleReviewItemInput,
  local: LocalRevalidationResult,
  appliedAt: string,
  alreadyResolved = false
): WriteBackResult {
  return {
    reviewItemId: input.reviewItem.reviewItemId,
    status: "APPLIED",
    actionKind: input.reviewItem.proposedAction?.type,
    appliedAt,
    ...(alreadyResolved ? { reason: "ALREADY_RESOLVED" as const } : {}),
    localRevalidation: alreadyResolved ? { ...local, status: "ALREADY_RESOLVED" } : local,
    ...(alreadyResolved
      ? {}
      : {
          mutation: createAppliedMutationRecord({
            reviewItem: input.reviewItem,
            localRevalidation: local,
            appliedAt,
          }),
        }),
    message: alreadyResolved
      ? "Die Änderung war bereits erledigt."
      : "Die Änderung wurde in Word durchgeführt.",
  };
}

export const officeWriteBackAdapter: WriteBackDocumentAdapter = {
  async applySingle(input) {
    if (!Office.context.requirements.isSetSupported("WordApi", "1.5")) {
      return failed(input, "FAILED", "WORD_API_UNSUPPORTED");
    }
    const action = input.reviewItem.proposedAction;
    if (!action) return failed(input, "FAILED", "ACTION_MISSING");
    if (
      action.type === "FORMAT_CHANGE" &&
      formatProperty(action) === "characterSpacing" &&
      !Office.context.requirements.isSetSupported("WordApiDesktop", "1.3")
    ) {
      return failed(input, "FAILED", "FORMAT_PROPERTY_UNSUPPORTED");
    }

    try {
      return await Word.run(async (context) => {
        const footnotes = context.document.body.footnotes;
        footnotes.load({ body: { text: true }, reference: { text: true } });
        await context.sync();

        const ordinal = input.footnote.locator.ordinal;
        if (ordinal < 1 || ordinal > footnotes.items.length) {
          return failed(input, "STALE", "FOOTNOTE_NOT_FOUND");
        }
        const candidate = footnotes.items[ordinal - 1];
        const currentContentText = contentTextFromRawWordText(candidate.body.text);
        let localRevalidation = revalidateActionLocally({
          reviewItem: input.reviewItem,
          analyzedFootnote: input.footnote,
          currentContentText,
          appliedMutations: input.appliedMutations,
        });
        let resolution =
          localRevalidation.status === "EXACT" || localRevalidation.status === "RELOCATED"
            ? searchResolutionForAction(currentContentText, action, localRevalidation)
            : undefined;
        if (
          (localRevalidation.status === "EXACT" || localRevalidation.status === "RELOCATED") &&
          !resolution
        ) {
          localRevalidation = {
            ...localRevalidation,
            status: "UNSAFE",
            reason: "The current target cannot be represented by a unique Word search anchor.",
          };
        }

        const reference = candidate.reference;
        const paragraph = reference.paragraphs.getFirst();
        const beforeRange = paragraph
          .getRange(Word.RangeLocation.start)
          .expandTo(reference.getRange(Word.RangeLocation.start));
        const afterRange = reference
          .getRange(Word.RangeLocation.end)
          .expandTo(paragraph.getRange(Word.RangeLocation.end));
        beforeRange.load("text");
        afterRange.load("text");
        const ooxml = resolution ? candidate.body.getOoxml() : undefined;
        const searchResults = resolution
          ? candidate.body
              .getRange(Word.RangeLocation.content)
              .search(resolution.query, EXACT_SEARCH_OPTIONS)
          : undefined;
        searchResults?.load("text");
        await context.sync();

        const searchMatches =
          resolution && searchResults
            ? searchResults.items.length === resolution.occurrenceCount &&
              Boolean(searchResults.items[resolution.occurrenceIndex]) &&
              searchResults.items[resolution.occurrenceIndex].text === resolution.query
            : localRevalidation.status === "ALREADY_RESOLVED";
        if (resolution && !searchMatches) {
          localRevalidation = {
            ...localRevalidation,
            status: "AMBIGUOUS",
            reason: "Word returned a different set of exact target occurrences.",
          };
          resolution = undefined;
        }
        const protectedState = ooxml
          ? (() => {
              // getOoxml() returns a ClientResult whose value is populated by the preceding sync.
              return extractCurrentProtectedRanges(ooxml.value, currentContentText);
            })()
          : { complete: true, ranges: [] };
        const protectedRanges = resolution
          ? [
              ...protectedState.ranges,
              ...findPlainTextUrls(currentContentText).map(({ start, end }) => ({
                type: "plainTextUrl" as const,
                start,
                end,
              })),
            ]
          : [];
        const resolvedFootnote: ResolvedFootnoteTarget = {
          ordinal,
          displayLabel: displayLabel(candidate.reference.text, ordinal),
          contentText: currentContentText,
          contentTextHash: hashFootnoteContentText(currentContentText),
          contextBefore: normalizeFootnoteReferencesInContext(beforeRange.text, "before").text,
          contextAfter: normalizeFootnoteReferencesInContext(afterRange.text, "after").text,
          protectedRanges,
        };
        const preflight = preflightResolvedTarget({
          reviewItem: input.reviewItem,
          analyzedFootnote: input.footnote,
          resolvedFootnote,
          protectedStateComplete: protectedState.complete,
          localRevalidation,
        });
        if (!preflight.ok) {
          return failed(
            input,
            preflight.statusOnFailure ?? "FAILED",
            preflight.reasons[0] ?? "WORD_API_ERROR",
            preflight.reasons,
            localRevalidation
          );
        }

        if (localRevalidation.status === "ALREADY_RESOLVED") {
          return appliedResult(input, localRevalidation, new Date().toISOString(), true);
        }
        if (!resolution || !searchResults) {
          return failed(input, "STALE", "LOCAL_TARGET_UNSAFE", undefined, localRevalidation);
        }

        const matchedRange = searchResults.items[resolution.occurrenceIndex];
        const target =
          resolution.boundary === "START"
            ? matchedRange.getRange(Word.RangeLocation.start)
            : resolution.boundary === "END"
              ? matchedRange.getRange(Word.RangeLocation.end)
              : matchedRange;
        if (action.type === "FORMAT_CHANGE") {
          const property = formatProperty(action);
          if (!property) return failed(input, "FAILED", "FORMAT_PROPERTY_UNSUPPORTED");
          loadFormattingProperty(target, property);
          await context.sync();
          const currentValue = currentFormattingValue(target, property);
          const expectedValue = expectedFormattingValue(action, property);
          if (formattingValueIsUnavailable(currentValue, property)) {
            return failed(input, "STALE", "LOCAL_TARGET_UNSAFE", undefined, {
              ...localRevalidation,
              status: "UNSAFE",
              reason: "The current format is mixed or unavailable.",
            });
          }
          if (currentValue === expectedValue) {
            return appliedResult(input, localRevalidation, new Date().toISOString(), true);
          }
        }
        applyMutation(target, action);
        await context.sync();
        return appliedResult(input, localRevalidation, new Date().toISOString());
      });
    } catch {
      return failed(input, "FAILED", "WORD_API_ERROR");
    }
  },
};
