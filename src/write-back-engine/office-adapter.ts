/* global OfficeExtension, Word, performance */

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
import { getOfficeHostCapabilities } from "@/taskpane/host-capabilities";
import { applyFormattingChange } from "./formatting-writeback";
import {
  createFootnoteWritePlan,
  type CurrentFootnoteWriteSnapshot,
  type FootnoteWritePlan,
  type PlannedFootnoteAction,
} from "./footnote-write-plan";
import { createAppliedMutationRecord, revalidateActionLocally } from "./local-revalidation";
import { resolveInsertSearch, resolveTextSearch, type TextRangeResolution } from "./locator";
import { formatProperty, preflightResolvedTarget, type SupportedFormatProperty } from "./preflight";
import { applyTextInsertion, applyTextReplacement } from "./text-writeback";
import type {
  ApplySingleReviewItemInput,
  ApplyBatchReviewItemsInput,
  ApplyBatchReviewItemEntry,
  AppliedMutationRecord,
  BatchPerformanceMetrics,
  LocalRevalidationResult,
  ResolvedFootnoteTarget,
  WriteBackBlockReason,
  WriteBackDocumentAdapter,
  WriteBackBatchAdapterResult,
  WriteBackProtectedRange,
  WriteBackResult,
} from "./types";

export const DEFAULT_WRITEBACK_FOOTNOTE_CHUNK_SIZE = 30;

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
  localRevalidation?: LocalRevalidationResult,
  fatal = false
): WriteBackResult {
  return {
    reviewItemId: input.reviewItem.reviewItemId,
    status,
    actionKind: input.reviewItem.proposedAction?.type,
    reason,
    reasons,
    ...(localRevalidation ? { localRevalidation } : {}),
    ...(fatal ? { fatal: true } : {}),
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

function emptyBatchPerformanceMetrics(input: ApplyBatchReviewItemsInput): BatchPerformanceMetrics {
  return {
    totalDurationMs: 0,
    planningDurationMs: input.planningDurationMs,
    readDurationMs: 0,
    localValidationDurationMs: 0,
    writeDurationMs: 0,
    finalizationDurationMs: 0,
    cleanupDurationMs: 0,
    affectedFootnotes: new Set(input.entries.map((entry) => entry.footnote.id)).size,
    plannedActions: input.entries.length,
    appliedActions: 0,
    contextSyncCount: 0,
    wordRunCount: 0,
    readChunkCount: 0,
    writeChunkCount: 0,
  };
}

function chunked<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function groupBatchEntries(
  entries: readonly ApplyBatchReviewItemEntry[]
): ApplyBatchReviewItemEntry[][] {
  const groups = new Map<string, ApplyBatchReviewItemEntry[]>();
  for (const entry of entries) {
    const current = groups.get(entry.footnote.id);
    if (current) current.push(entry);
    else groups.set(entry.footnote.id, [entry]);
  }
  return [...groups.values()];
}

function batchFailure(
  entry: ApplyBatchReviewItemEntry,
  status: "FAILED" | "STALE",
  reason: WriteBackBlockReason,
  localRevalidation?: LocalRevalidationResult,
  fatal = false
): WriteBackResult {
  return failed(
    { reviewItem: entry.reviewItem, footnote: entry.footnote },
    status,
    reason,
    [reason],
    localRevalidation,
    fatal
  );
}

function exactSearchMatches(
  searchResults: Word.RangeCollection,
  resolution: TextRangeResolution
): boolean {
  return (
    searchResults.items.length === resolution.occurrenceCount &&
    Boolean(searchResults.items[resolution.occurrenceIndex]) &&
    searchResults.items[resolution.occurrenceIndex].text === resolution.query
  );
}

function wordTarget(
  searchResults: Word.RangeCollection,
  resolution: TextRangeResolution
): Word.Range {
  const matchedRange = searchResults.items[resolution.occurrenceIndex];
  return resolution.boundary === "START"
    ? matchedRange.getRange(Word.RangeLocation.start)
    : resolution.boundary === "END"
      ? matchedRange.getRange(Word.RangeLocation.end)
      : matchedRange;
}

function snapshotResolvedTarget(snapshot: CurrentFootnoteWriteSnapshot): ResolvedFootnoteTarget {
  return {
    ordinal: snapshot.ordinal,
    displayLabel: snapshot.displayLabel,
    contentText: snapshot.contentText,
    contentTextHash: snapshot.contentHash,
    contextBefore: snapshot.contextBefore,
    contextAfter: snapshot.contextAfter,
    protectedRanges: snapshot.protectedRanges,
  };
}

async function applyOfficeBatch(
  input: ApplyBatchReviewItemsInput
): Promise<WriteBackBatchAdapterResult> {
  const startedAt = performance.now();
  const performanceMetrics = emptyBatchPerformanceMetrics(input);
  const results: WriteBackResult[] = [];
  const mutations = [...(input.appliedMutations ?? [])];
  const capabilities = getOfficeHostCapabilities();
  if (!capabilities.supported) {
    const unsupported = input.entries.map((entry, index) =>
      batchFailure(entry, "FAILED", "WORD_API_UNSUPPORTED", undefined, index === 0)
    );
    performanceMetrics.totalDurationMs = performance.now() - startedAt;
    return {
      results: unsupported,
      mutations,
      performance: performanceMetrics,
      fatalError: "WordApi 1.5 wird von diesem Host nicht unterstützt.",
    };
  }
  const supportsCharacterSpacing = capabilities.requirementSets.wordApiDesktop13;

  const footnoteChunks = chunked(groupBatchEntries(input.entries), Math.max(1, input.chunkSize));
  let processed = 0;
  let appliedActions = 0;
  let fatalError: string | undefined;

  for (const footnoteGroups of footnoteChunks) {
    if (fatalError) break;
    performanceMetrics.wordRunCount += 1;
    performanceMetrics.readChunkCount += 1;
    const chunkEntries = footnoteGroups.flat();
    const chunkResults: WriteBackResult[] = [];
    const chunkMutations: AppliedMutationRecord[] = [];
    let chunkWrote = false;
    try {
      await Word.run(async (context) => {
        const sync = async () => {
          performanceMetrics.contextSyncCount += 1;
          // Chunks are deliberately sequential; sync rounds are shared by all findings in a chunk.
          // eslint-disable-next-line office-addins/no-context-sync-in-loop
          await context.sync();
        };
        const readStartedAt = performance.now();
        const footnotes = context.document.body.footnotes;
        footnotes.load("items");
        await sync();

        const loaded = new Map<
          string,
          {
            entries: ApplyBatchReviewItemEntry[];
            candidate: Word.NoteItem;
            beforeRange: Word.Range;
            afterRange: Word.Range;
            ooxml: OfficeExtension.ClientResult<string>;
          }
        >();
        for (const entries of footnoteGroups) {
          const analyzed = entries[0].footnote;
          const ordinal = analyzed.locator.ordinal;
          if (ordinal < 1 || ordinal > footnotes.items.length) {
            entries.forEach((entry) =>
              chunkResults.push(batchFailure(entry, "STALE", "FOOTNOTE_NOT_FOUND"))
            );
            continue;
          }
          const candidate = footnotes.items[ordinal - 1];
          const reference = candidate.reference;
          const paragraph = reference.paragraphs.getFirst();
          const beforeRange = paragraph
            .getRange(Word.RangeLocation.start)
            .expandTo(reference.getRange(Word.RangeLocation.start));
          const afterRange = reference
            .getRange(Word.RangeLocation.end)
            .expandTo(paragraph.getRange(Word.RangeLocation.end));
          candidate.body.load("text");
          reference.load("text");
          beforeRange.load("text");
          afterRange.load("text");
          loaded.set(analyzed.id, {
            entries,
            candidate,
            beforeRange,
            afterRange,
            ooxml: candidate.body.getOoxml(),
          });
        }
        if (loaded.size > 0) await sync();
        performanceMetrics.readDurationMs += performance.now() - readStartedAt;

        const validationStartedAt = performance.now();
        const plans: Array<{
          plan: FootnoteWritePlan;
          candidate: Word.NoteItem;
          entries: ApplyBatchReviewItemEntry[];
        }> = [];
        for (const [footnoteId, item] of loaded) {
          const compatibleEntries = item.entries.filter((entry) => {
            const action = entry.reviewItem.proposedAction;
            const supported =
              action?.type !== "FORMAT_CHANGE" ||
              formatProperty(action) !== "characterSpacing" ||
              supportsCharacterSpacing;
            if (!supported) {
              chunkResults.push(batchFailure(entry, "FAILED", "FORMAT_PROPERTY_UNSUPPORTED"));
            }
            return supported;
          });
          if (compatibleEntries.length === 0) continue;
          const analyzed = compatibleEntries[0].footnote;
          const contentText = contentTextFromRawWordText(item.candidate.body.text);
          const protectedState = extractCurrentProtectedRanges(item.ooxml.value, contentText);
          const snapshot: CurrentFootnoteWriteSnapshot = {
            footnoteId,
            ordinal: analyzed.locator.ordinal,
            displayLabel: displayLabel(item.candidate.reference.text, analyzed.locator.ordinal),
            rawWordText: item.candidate.body.text,
            contentText,
            contentHash: hashFootnoteContentText(contentText),
            contextBefore: normalizeFootnoteReferencesInContext(item.beforeRange.text, "before")
              .text,
            contextAfter: normalizeFootnoteReferencesInContext(item.afterRange.text, "after").text,
            protectedRanges: [
              ...protectedState.ranges,
              ...findPlainTextUrls(contentText).map(({ start, end }) => ({
                type: "plainTextUrl" as const,
                start,
                end,
              })),
            ],
            protectedStateComplete: protectedState.complete,
            loadedAt: new Date().toISOString(),
          };
          const plan = createFootnoteWritePlan({
            entries: compatibleEntries,
            currentSnapshot: snapshot,
            appliedMutations: mutations,
          });
          chunkResults.push(...plan.preliminaryResults);
          plans.push({ plan, candidate: item.candidate, entries: compatibleEntries });
        }
        performanceMetrics.localValidationDurationMs += performance.now() - validationStartedAt;

        const writeStartedAt = performance.now();
        const textSearches: Array<{
          action: PlannedFootnoteAction;
          entry: ApplyBatchReviewItemEntry;
          results: Word.RangeCollection;
          resolution: TextRangeResolution;
        }> = [];
        for (const { plan, candidate, entries } of plans) {
          for (const action of plan.textActions) {
            const resolution = searchResolutionForAction(
              plan.currentSnapshot!.contentText,
              action.action,
              action.localRevalidation
            );
            const entry = entries.find(
              (candidateEntry) =>
                candidateEntry.reviewItem.reviewItemId === action.reviewItem.reviewItemId
            )!;
            if (!resolution) {
              chunkResults.push(
                batchFailure(entry, "STALE", "LOCAL_TARGET_UNSAFE", action.localRevalidation)
              );
              continue;
            }
            const searchResults = candidate.body
              .getRange(Word.RangeLocation.content)
              .search(resolution.query, EXACT_SEARCH_OPTIONS);
            searchResults.load("text");
            textSearches.push({ action, entry, results: searchResults, resolution });
          }
        }
        if (textSearches.length > 0) await sync();

        const queuedTextActions: Array<{
          action: PlannedFootnoteAction;
          entry: ApplyBatchReviewItemEntry;
        }> = [];
        for (const search of textSearches) {
          if (!exactSearchMatches(search.results, search.resolution)) {
            chunkResults.push(
              batchFailure(
                search.entry,
                "STALE",
                "RANGE_AMBIGUOUS",
                search.action.localRevalidation
              )
            );
            continue;
          }
          applyMutation(wordTarget(search.results, search.resolution), search.action.action);
          queuedTextActions.push({ action: search.action, entry: search.entry });
        }
        if (queuedTextActions.length > 0) {
          await sync();
          chunkWrote = true;
          const appliedAt = new Date().toISOString();
          for (const queued of queuedTextActions) {
            const result = appliedResult(
              { reviewItem: queued.entry.reviewItem, footnote: queued.entry.footnote },
              queued.action.localRevalidation,
              appliedAt
            );
            chunkResults.push(result);
            if (result.mutation) chunkMutations.push(result.mutation);
          }
        }

        const plansWithFormatting = plans.filter(({ plan }) => plan.formatActions.length > 0);
        const postTextStates = new Map<
          string,
          { contentText: string; protectedRanges: WriteBackProtectedRange[]; complete: boolean }
        >();
        const postTextOoxml = new Map<string, OfficeExtension.ClientResult<string>>();
        if (plansWithFormatting.length > 0) {
          const plansNeedingPostTextRead = plansWithFormatting.filter(
            ({ plan }) => plan.textActions.length > 0
          );
          for (const { plan } of plansWithFormatting) {
            if (plan.textActions.length > 0) continue;
            const snapshot = plan.currentSnapshot!;
            postTextStates.set(plan.footnoteId, {
              contentText: snapshot.contentText,
              protectedRanges: snapshot.protectedRanges,
              complete: snapshot.protectedStateComplete,
            });
          }
          for (const { plan, candidate } of plansNeedingPostTextRead) {
            candidate.body.load("text");
            postTextOoxml.set(plan.footnoteId, candidate.body.getOoxml());
          }
          if (plansNeedingPostTextRead.length > 0) await sync();
          for (const { plan, candidate } of plansNeedingPostTextRead) {
            const contentText = contentTextFromRawWordText(candidate.body.text);
            const protectedState = extractCurrentProtectedRanges(
              postTextOoxml.get(plan.footnoteId)!.value,
              contentText
            );
            postTextStates.set(plan.footnoteId, {
              contentText,
              protectedRanges: [
                ...protectedState.ranges,
                ...findPlainTextUrls(contentText).map(({ start, end }) => ({
                  type: "plainTextUrl" as const,
                  start,
                  end,
                })),
              ],
              complete: protectedState.complete,
            });
          }
        }

        const formatSearches: Array<{
          action: PlannedFootnoteAction;
          entry: ApplyBatchReviewItemEntry;
          results: Word.RangeCollection;
          resolution: TextRangeResolution;
        }> = [];
        for (const { plan, candidate, entries } of plansWithFormatting) {
          const postState = postTextStates.get(plan.footnoteId)!;
          for (const action of plan.formatActions) {
            const entry = entries.find(
              (candidateEntry) =>
                candidateEntry.reviewItem.reviewItemId === action.reviewItem.reviewItemId
            )!;
            if (postState.contentText !== plan.simulatedContentText) {
              chunkResults.push(
                batchFailure(entry, "STALE", "SOURCE_CHANGED", action.localRevalidation)
              );
              continue;
            }
            const preflight = preflightResolvedTarget({
              reviewItem: entry.reviewItem,
              analyzedFootnote: entry.footnote,
              resolvedFootnote: {
                ...snapshotResolvedTarget(plan.currentSnapshot!),
                contentText: postState.contentText,
                contentTextHash: hashFootnoteContentText(postState.contentText),
                protectedRanges: postState.protectedRanges,
              },
              protectedStateComplete: postState.complete,
              localRevalidation: action.localRevalidation,
            });
            if (!preflight.ok) {
              chunkResults.push(
                batchFailure(
                  entry,
                  preflight.statusOnFailure ?? "FAILED",
                  preflight.reasons[0] ?? "LOCAL_TARGET_UNSAFE",
                  action.localRevalidation
                )
              );
              continue;
            }
            const resolution = searchResolutionForAction(
              postState.contentText,
              action.action,
              action.localRevalidation
            );
            if (!resolution) {
              chunkResults.push(
                batchFailure(entry, "STALE", "LOCAL_TARGET_UNSAFE", action.localRevalidation)
              );
              continue;
            }
            const searchResults = candidate.body
              .getRange(Word.RangeLocation.content)
              .search(resolution.query, EXACT_SEARCH_OPTIONS);
            searchResults.load("text");
            formatSearches.push({ action, entry, results: searchResults, resolution });
          }
        }
        if (formatSearches.length > 0) await sync();

        const formatTargets: Array<{
          action: PlannedFootnoteAction;
          entry: ApplyBatchReviewItemEntry;
          target: Word.Range;
          property: SupportedFormatProperty;
        }> = [];
        for (const search of formatSearches) {
          if (!exactSearchMatches(search.results, search.resolution)) {
            chunkResults.push(
              batchFailure(
                search.entry,
                "STALE",
                "RANGE_AMBIGUOUS",
                search.action.localRevalidation
              )
            );
            continue;
          }
          const action = search.action.action;
          const property = action.type === "FORMAT_CHANGE" ? formatProperty(action) : undefined;
          if (!property) {
            chunkResults.push(batchFailure(search.entry, "FAILED", "FORMAT_PROPERTY_UNSUPPORTED"));
            continue;
          }
          const target = wordTarget(search.results, search.resolution);
          loadFormattingProperty(target, property);
          formatTargets.push({ action: search.action, entry: search.entry, target, property });
        }
        if (formatTargets.length > 0) await sync();

        const queuedFormatActions: typeof formatTargets = [];
        for (const item of formatTargets) {
          const action = item.action.action;
          if (action.type !== "FORMAT_CHANGE") continue;
          const currentValue = currentFormattingValue(item.target, item.property);
          const expectedValue = expectedFormattingValue(action, item.property);
          if (formattingValueIsUnavailable(currentValue, item.property)) {
            chunkResults.push(
              batchFailure(
                item.entry,
                "STALE",
                "LOCAL_TARGET_UNSAFE",
                item.action.localRevalidation
              )
            );
          } else if (currentValue === expectedValue) {
            chunkResults.push(
              appliedResult(
                { reviewItem: item.entry.reviewItem, footnote: item.entry.footnote },
                item.action.localRevalidation,
                new Date().toISOString(),
                true
              )
            );
          } else {
            applyFormattingChange(item.target, action);
            queuedFormatActions.push(item);
          }
        }
        if (queuedFormatActions.length > 0) {
          await sync();
          chunkWrote = true;
          for (const item of queuedFormatActions) {
            loadFormattingProperty(item.target, item.property);
          }
          await sync();
          const appliedAt = new Date().toISOString();
          for (const item of queuedFormatActions) {
            const action = item.action.action;
            const verified =
              action.type === "FORMAT_CHANGE" &&
              currentFormattingValue(item.target, item.property) ===
                expectedFormattingValue(action, item.property);
            const result = verified
              ? appliedResult(
                  { reviewItem: item.entry.reviewItem, footnote: item.entry.footnote },
                  item.action.localRevalidation,
                  appliedAt
                )
              : {
                  ...batchFailure(
                    item.entry,
                    "FAILED",
                    "FORMAT_WRITE_VERIFICATION_FAILED",
                    item.action.localRevalidation
                  ),
                  message: "Word konnte die gewünschte Formatierung nicht zuverlässig übernehmen.",
                };
            chunkResults.push(result);
            if (result.mutation) chunkMutations.push(result.mutation);
          }
        }
        performanceMetrics.writeDurationMs += performance.now() - writeStartedAt;
      });
    } catch {
      const confirmed = new Set(chunkResults.map((result) => result.reviewItemId));
      const unresolved = chunkEntries.filter(
        (entry) => !confirmed.has(entry.reviewItem.reviewItemId)
      );
      unresolved.forEach((entry, index) =>
        chunkResults.push(batchFailure(entry, "FAILED", "WORD_API_ERROR", undefined, index === 0))
      );
      fatalError = "Der Word-Host konnte einen Write-back-Chunk nicht abschließen.";
    }

    if (chunkWrote) performanceMetrics.writeChunkCount += 1;
    results.push(...chunkResults);
    mutations.push(...chunkMutations);
    processed += chunkEntries.length;
    appliedActions += chunkResults.filter((result) => result.status === "APPLIED").length;
    performanceMetrics.appliedActions = appliedActions;
    input.onChunk?.({
      results: chunkResults,
      mutations: chunkMutations,
      processed,
      currentFootnoteOrdinal: footnoteGroups[footnoteGroups.length - 1]?.[0].footnote.ordinal,
      performance: { ...performanceMetrics },
    });
  }

  const finalizationStartedAt = performance.now();
  performanceMetrics.finalizationDurationMs = performance.now() - finalizationStartedAt;
  performanceMetrics.totalDurationMs = performance.now() - startedAt;
  return {
    results,
    mutations,
    performance: performanceMetrics,
    ...(fatalError ? { fatalError } : {}),
  };
}

export const officeWriteBackAdapter: WriteBackDocumentAdapter = {
  applyBatch: applyOfficeBatch,
  async applySingle(input) {
    const capabilities = getOfficeHostCapabilities();
    if (!capabilities.supported) {
      return failed(input, "FAILED", "WORD_API_UNSUPPORTED", undefined, undefined, true);
    }
    const action = input.reviewItem.proposedAction;
    if (!action) return failed(input, "FAILED", "ACTION_MISSING");
    if (
      action.type === "FORMAT_CHANGE" &&
      formatProperty(action) === "characterSpacing" &&
      !capabilities.requirementSets.wordApiDesktop13
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
          applyMutation(target, action);
          await context.sync();
          loadFormattingProperty(target, property);
          await context.sync();
          if (currentFormattingValue(target, property) !== expectedValue) {
            return {
              ...failed(
                input,
                "FAILED",
                "FORMAT_WRITE_VERIFICATION_FAILED",
                undefined,
                localRevalidation
              ),
              message: "Word konnte die gewünschte Formatierung nicht zuverlässig übernehmen.",
            };
          }
          return appliedResult(input, localRevalidation, new Date().toISOString());
        }
        applyMutation(target, action);
        await context.sync();
        return appliedResult(input, localRevalidation, new Date().toISOString());
      });
    } catch {
      return failed(input, "FAILED", "WORD_API_ERROR", undefined, undefined, true);
    }
  },
};
