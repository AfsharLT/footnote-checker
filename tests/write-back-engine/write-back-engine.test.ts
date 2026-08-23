import type { Finding } from "../../src/footnote-engine/types";
import type {
  ProposedReviewAction,
  ReviewItem,
  TechnicalEligibility,
} from "../../src/review-engine";
import type { CharacterFormat, FootnoteSnapshot } from "../../src/taskpane/taskpane";
import { hashFootnoteContentText } from "../../src/taskpane/taskpane";
import { resolveInsertSearch, resolveTextSearch } from "../../src/write-back-engine/locator";
import {
  applySingleReviewItem,
  canApplySingleReviewItem,
  createAppliedMutationRecord,
  preflightResolvedTarget,
  revalidateActionLocally,
  type ApplySingleReviewItemInput,
  type AppliedMutationRecord,
  type ResolvedFootnoteTarget,
  type WriteBackDocumentAdapter,
  type WriteBackProtectedRange,
  type WriteBackResult,
} from "../../src/write-back-engine";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function footnote(contentText: string, ordinal: number): FootnoteSnapshot {
  const hash = hashFootnoteContentText(contentText);
  return {
    id: `footnote-${ordinal}-${hash}`,
    ordinal,
    displayLabel: String(ordinal),
    rawWordText: contentText,
    contentText,
    contentLength: contentText.length,
    originalTextHash: hash,
    reference: { referenceText: String(ordinal) },
    locator: {
      ordinal,
      displayLabel: String(ordinal),
      originalTextHash: hash,
      contextBefore: "",
      contextAfter: "",
    },
    paragraphCount: 1,
    paragraphs: [{ index: 0, start: 0, end: contentText.length }],
    hyperlinks: [],
    fields: [],
    bookmarks: [],
    contentControls: [],
    protectedRanges: [],
    readStatus: "complete",
    readWarnings: [],
    formattingRuns: [],
    paragraphFormats: [],
  };
}

const eligible: TechnicalEligibility = {
  eligible: true,
  reasons: [],
  findingValid: true,
  sourceHashMatches: true,
  rangeValid: true,
  originalTextMatches: true,
  protectedRangeOverlap: false,
  conflictingActionOverlap: false,
  formattingStateKnown: true,
  proposedActionBuildable: true,
};

function reviewItem(
  target: FootnoteSnapshot,
  action: ProposedReviewAction,
  id = `review-${target.ordinal}`
): ReviewItem {
  const start = action.type === "TEXT_INSERT" ? action.position : action.start;
  const end = action.type === "TEXT_INSERT" ? action.position : action.end;
  const originalText = action.type === "TEXT_INSERT" ? "" : target.contentText.slice(start, end);
  const finding: Finding = {
    findingId: `finding-${id}`,
    footnoteId: target.id,
    footnoteOrdinal: target.ordinal,
    sourceTextHash: target.originalTextHash,
    ruleId: action.type === "FORMAT_CHANGE" ? "FORMAT_FONT_SIZE" : "CASE_LAW_DECISION_TYPE",
    category: action.type === "FORMAT_CHANGE" ? "formatting" : "citation",
    start,
    end,
    originalText,
    ...(action.type === "TEXT_REPLACE" ? { suggestedText: action.replacementText } : {}),
    severity: "warning",
    message: "Teständerung",
  };
  return {
    reviewItemId: id,
    finding,
    reviewClass: "AUTO",
    classificationReason:
      action.type === "FORMAT_CHANGE"
        ? "DETERMINISTIC_FORMAT_CHANGE"
        : action.type === "TEXT_INSERT"
          ? "SAFE_INSERTION"
          : "DETERMINISTIC_TEXT_CHANGE",
    proposedAction: action,
    decision: { effectiveStatus: "ACCEPTED", source: "USER", explicitStatus: "ACCEPTED" },
    technicalEligibility: eligible,
    conflicts: [],
    canAccept: true,
    sourceTextHash: target.originalTextHash,
  };
}

interface MemoryFootnote {
  contentText: string;
  protectedRanges: WriteBackProtectedRange[];
  format: CharacterFormat;
}

class MemoryAdapter implements WriteBackDocumentAdapter {
  calls: string[] = [];

  constructor(readonly documents: Map<number, MemoryFootnote>) {}

  async applySingle(input: ApplySingleReviewItemInput): Promise<WriteBackResult> {
    this.calls.push(input.reviewItem.reviewItemId);
    const document = this.documents.get(input.footnote.ordinal);
    if (!document) {
      return {
        reviewItemId: input.reviewItem.reviewItemId,
        status: "STALE",
        reason: "FOOTNOTE_NOT_FOUND",
      };
    }
    const resolved: ResolvedFootnoteTarget = {
      ordinal: input.footnote.ordinal,
      displayLabel: input.footnote.displayLabel,
      contentText: document.contentText,
      contentTextHash: hashFootnoteContentText(document.contentText),
      contextBefore: input.footnote.locator.contextBefore,
      contextAfter: input.footnote.locator.contextAfter,
      protectedRanges: document.protectedRanges,
    };
    const localRevalidation = revalidateActionLocally({
      reviewItem: input.reviewItem,
      analyzedFootnote: input.footnote,
      currentContentText: document.contentText,
      appliedMutations: input.appliedMutations,
    });
    const preflight = preflightResolvedTarget({
      reviewItem: input.reviewItem,
      analyzedFootnote: input.footnote,
      resolvedFootnote: resolved,
      protectedStateComplete: true,
      localRevalidation,
    });
    if (!preflight.ok) {
      return {
        reviewItemId: input.reviewItem.reviewItemId,
        status: preflight.statusOnFailure ?? "FAILED",
        reason: preflight.reasons[0],
        reasons: preflight.reasons,
        localRevalidation,
      };
    }
    if (localRevalidation.status === "ALREADY_RESOLVED") {
      return {
        reviewItemId: input.reviewItem.reviewItemId,
        status: "APPLIED",
        actionKind: input.reviewItem.proposedAction?.type,
        reason: "ALREADY_RESOLVED",
        localRevalidation,
      };
    }
    const action = input.reviewItem.proposedAction as ProposedReviewAction;
    const range = preflight.resolvedRange;
    if (!range) throw new Error("The memory adapter requires a resolved range.");
    if (action.type === "TEXT_REPLACE") {
      document.contentText =
        document.contentText.slice(0, range.start) +
        action.replacementText +
        document.contentText.slice(range.end);
    } else if (action.type === "TEXT_INSERT") {
      document.contentText =
        document.contentText.slice(0, range.start) +
        action.text +
        document.contentText.slice(range.start);
    } else {
      const property = Object.keys(action.changes)[0] as keyof CharacterFormat;
      if (document.format[property] === action.changes[property]) {
        return {
          reviewItemId: input.reviewItem.reviewItemId,
          status: "APPLIED",
          actionKind: action.type,
          reason: "ALREADY_RESOLVED",
          localRevalidation: { ...localRevalidation, status: "ALREADY_RESOLVED" },
        };
      }
      document.format = { ...document.format, [property]: action.changes[property] };
    }
    const appliedAt = "2026-08-23T12:00:00.000Z";
    return {
      reviewItemId: input.reviewItem.reviewItemId,
      status: "APPLIED",
      actionKind: action.type,
      appliedAt,
      localRevalidation,
      mutation: createAppliedMutationRecord({
        reviewItem: input.reviewItem,
        localRevalidation,
        appliedAt,
      }),
    };
  }
}

const replacementFootnote = footnote("Urteil des BGH.", 1);
const replacement = reviewItem(replacementFootnote, {
  type: "TEXT_REPLACE",
  start: 0,
  end: 6,
  originalText: "Urteil",
  replacementText: "Urt.",
});
const replacementDocuments = new Map([
  [1, { contentText: replacementFootnote.contentText, protectedRanges: [], format: {} }],
]);
async function run(): Promise<void> {
  const replacementResult = await applySingleReviewItem(
    { reviewItem: replacement, footnote: replacementFootnote },
    new MemoryAdapter(replacementDocuments)
  );
  assert(replacementResult.status === "APPLIED", "Safe text replacement must be applied");
  assert(
    replacementDocuments.get(1)?.contentText === "Urt. des BGH.",
    "Text replacement must change only the exact target"
  );

  const insertFootnote = footnote("BGHSt 47, 45 (49.", 2);
  const insertion = reviewItem(insertFootnote, {
    type: "TEXT_INSERT",
    position: insertFootnote.contentText.length,
    text: ")",
  });
  const insertDocuments = new Map([
    [2, { contentText: insertFootnote.contentText, protectedRanges: [], format: {} }],
  ]);
  const insertResult = await applySingleReviewItem(
    { reviewItem: insertion, footnote: insertFootnote },
    new MemoryAdapter(insertDocuments)
  );
  assert(insertResult.status === "APPLIED", "Safe insertion must be applied");
  assert(
    insertDocuments.get(2)?.contentText === "BGHSt 47, 45 (49.)",
    "Insertion must add one exact character"
  );

  for (const [property, expected] of [
    ["fontSize", 8],
    ["fontName", "Aptos Serif"],
  ] as const) {
    const formatFootnote = footnote("Format", property === "fontSize" ? 3 : 4);
    const formatAction = {
      type: "FORMAT_CHANGE" as const,
      start: 0,
      end: 6,
      changes: { [property]: expected },
    };
    const formatItem = reviewItem(formatFootnote, formatAction, `review-${property}`);
    const originalFormat = { fontSize: 10, fontName: "Arial", bold: true };
    const formatDocuments = new Map([
      [
        formatFootnote.ordinal,
        { contentText: formatFootnote.contentText, protectedRanges: [], format: originalFormat },
      ],
    ]);
    const formatResult = await applySingleReviewItem(
      { reviewItem: formatItem, footnote: formatFootnote },
      new MemoryAdapter(formatDocuments)
    );
    const changed = formatDocuments.get(formatFootnote.ordinal)?.format;
    assert(formatResult.status === "APPLIED", `${property} change must be applied`);
    assert(changed?.[property] === expected, `${property} must receive only its expected value`);
    assert(changed?.bold === true, `${property} must not change unrelated bold formatting`);
  }

  const staleDocuments = new Map([
    [1, { contentText: "Entscheidung des BGH.", protectedRanges: [], format: {} }],
  ]);
  const staleResult = await applySingleReviewItem(
    { reviewItem: replacement, footnote: replacementFootnote },
    new MemoryAdapter(staleDocuments)
  );
  assert(
    staleResult.status === "STALE" && staleResult.reason === "LOCAL_TARGET_MISSING",
    "A change at the concrete target must be stale"
  );
  assert(
    staleDocuments.get(1)?.contentText === "Entscheidung des BGH.",
    "Stale preflight must perform zero mutations"
  );

  const protectedDocuments = new Map([
    [
      1,
      {
        contentText: replacementFootnote.contentText,
        protectedRanges: [{ type: "field" as const, start: 0, end: 6 }],
        format: {},
      },
    ],
  ]);
  const protectedResult = await applySingleReviewItem(
    { reviewItem: replacement, footnote: replacementFootnote },
    new MemoryAdapter(protectedDocuments)
  );
  assert(
    protectedResult.status === "FAILED" && protectedResult.reason === "PROTECTED_RANGE",
    "Protected target must fail without mutation"
  );

  const urlFootnote = footnote("Siehe https://example.org/test.", 7);
  const urlItem = reviewItem(urlFootnote, {
    type: "TEXT_REPLACE",
    start: 6,
    end: 11,
    originalText: "https",
    replacementText: "HTTP",
  });
  const urlDocuments = new Map([
    [
      7,
      {
        contentText: urlFootnote.contentText,
        protectedRanges: [{ type: "plainTextUrl" as const, start: 6, end: 30 }],
        format: {},
      },
    ],
  ]);
  const urlResult = await applySingleReviewItem(
    { reviewItem: urlItem, footnote: urlFootnote },
    new MemoryAdapter(urlDocuments)
  );
  assert(
    urlResult.status === "FAILED" && urlResult.reason === "PROTECTED_RANGE",
    "A current plain-text URL range must remain protected immediately before write-back"
  );

  const mismatchingAction = reviewItem(
    replacementFootnote,
    {
      type: "TEXT_REPLACE",
      start: 0,
      end: 6,
      originalText: "Andere",
      replacementText: "Urt.",
    },
    "original-mismatch"
  );
  const mismatchAdapter = new MemoryAdapter(replacementDocuments);
  const mismatchResult = await applySingleReviewItem(
    { reviewItem: mismatchingAction, footnote: replacementFootnote },
    mismatchAdapter
  );
  assert(
    mismatchResult.status === "STALE" && mismatchResult.reason === "ORIGINAL_TEXT_MISMATCH",
    "Action originalText must match both the finding and the analyzed content"
  );
  assert(mismatchAdapter.calls.length === 0, "Original-text mismatch must cause zero mutations");

  const multiFormatFootnote = footnote("Format", 8);
  const multiFormatItem = reviewItem(multiFormatFootnote, {
    type: "FORMAT_CHANGE",
    start: 0,
    end: 6,
    changes: { fontName: "Aptos Serif", fontSize: 8 },
  });
  const multiFormatAdapter = new MemoryAdapter(
    new Map([[8, { contentText: "Format", protectedRanges: [], format: {} }]])
  );
  const multiFormatResult = await applySingleReviewItem(
    { reviewItem: multiFormatItem, footnote: multiFormatFootnote },
    multiFormatAdapter
  );
  assert(
    multiFormatResult.status === "FAILED" &&
      multiFormatResult.reason === "FORMAT_CHANGE_NOT_ATOMIC",
    "One FORMAT_CHANGE must never write more than one property"
  );
  assert(
    multiFormatAdapter.calls.length === 0,
    "Non-atomic formatting must stop before Word access"
  );

  const conflicted: ReviewItem = {
    ...replacement,
    conflicts: [
      { conflictId: "conflict", reason: "Test", reviewItemIds: [replacement.reviewItemId] },
    ],
  };
  const conflictAdapter = new MemoryAdapter(replacementDocuments);
  const conflictResult = await applySingleReviewItem(
    { reviewItem: conflicted, footnote: replacementFootnote },
    conflictAdapter
  );
  assert(
    conflictResult.status === "FAILED" && conflictResult.reason === "UNRESOLVED_CONFLICT",
    "Conflict must be blocked engine-side"
  );
  assert(conflictAdapter.calls.length === 0, "Conflict must stop before the document adapter runs");
  assert(!canApplySingleReviewItem(conflicted), "Conflict must hide the apply action in the UI");

  const repeatedResolution = resolveTextSearch("Urteil X Urteil", 9, 15, "Urteil");
  assert(
    repeatedResolution?.occurrenceIndex === 1 && repeatedResolution.occurrenceCount === 2,
    "Range re-resolution must select the exact occurrence represented by the analyzed offsets"
  );
  const insertionText = "BGHSt 47, 45 (49.";
  const insertionResolution = resolveInsertSearch(insertionText, insertionText.length);
  assert(
    insertionResolution?.start === insertionText.length &&
      insertionResolution.end === insertionText.length &&
      insertionResolution.occurrenceCount === 1,
    "Insertion re-resolution must use a unique anchor for the exact analyzed boundary"
  );

  const sequentialFootnote = footnote(
    "BGH, Urteil vom 5.7.2025 – 3 StR 123/25.",
    20
  );
  const sequentialItems = [
    ["Urteil", "Urt."],
    ["vom", "v."],
    ["5.7.2025", "05.07.2025"],
  ].map(([originalText, replacementText], index) => {
    const start = sequentialFootnote.contentText.indexOf(originalText);
    return reviewItem(
      sequentialFootnote,
      {
        type: "TEXT_REPLACE",
        start,
        end: start + originalText.length,
        originalText,
        replacementText,
      },
      `sequential-${index}`
    );
  });
  const sequentialDocuments = new Map([
    [
      20,
      {
        contentText: sequentialFootnote.contentText,
        protectedRanges: [],
        format: {},
      },
    ],
  ]);
  const sequentialAdapter = new MemoryAdapter(sequentialDocuments);
  const sequentialMutations: AppliedMutationRecord[] = [];
  const sequentialStatuses: string[] = [];
  for (const item of sequentialItems) {
    const result = await applySingleReviewItem(
      {
        reviewItem: item,
        footnote: sequentialFootnote,
        appliedMutations: sequentialMutations,
      },
      sequentialAdapter
    );
    assert(result.status === "APPLIED", `${item.reviewItemId} must apply sequentially`);
    sequentialStatuses.push(result.localRevalidation?.status ?? "NONE");
    if (result.mutation) sequentialMutations.push(result.mutation);
  }
  assert(
    sequentialDocuments.get(20)?.contentText ===
      "BGH, Urt. v. 05.07.2025 – 3 StR 123/25.",
    "Three independent same-footnote findings must apply without reanalysis"
  );
  assert(
    sequentialStatuses[0] === "EXACT" &&
      sequentialStatuses[1] === "RELOCATED" &&
      sequentialStatuses[2] === "RELOCATED",
    "Known text deltas must rebase subsequent same-footnote targets before local validation"
  );

  const mixedFootnote = footnote("MüKo-StGB/Fischer Rn. 4.", 21);
  const workEnd = "MüKo-StGB".length;
  const workReplacement = reviewItem(
    mixedFootnote,
    {
      type: "TEXT_REPLACE",
      start: 0,
      end: workEnd,
      originalText: "MüKo-StGB",
      replacementText: "MüKoStGB",
    },
    "mixed-work-name"
  );
  const mixedFormatSpecs: Array<[keyof CharacterFormat, string | number | boolean]> = [
    ["fontName", "Aptos Serif"],
    ["fontSize", 8],
    ["italic", true],
  ];
  const mixedFormatItems = mixedFormatSpecs.map(([property, value], index) =>
    reviewItem(
      mixedFootnote,
      {
        type: "FORMAT_CHANGE",
        start: 0,
        end: workEnd,
        changes: { [property]: value },
      } as ProposedReviewAction,
      `mixed-format-${index}`
    )
  );
  const mixedDocuments = new Map([
    [
      21,
      {
        contentText: mixedFootnote.contentText,
        protectedRanges: [],
        format: { fontName: "Arial", fontSize: 10, italic: false, bold: true },
      },
    ],
  ]);
  const mixedAdapter = new MemoryAdapter(mixedDocuments);
  const mixedMutations: AppliedMutationRecord[] = [];
  for (const item of [workReplacement, ...mixedFormatItems]) {
    const result = await applySingleReviewItem(
      { reviewItem: item, footnote: mixedFootnote, appliedMutations: mixedMutations },
      mixedAdapter
    );
    assert(result.status === "APPLIED", `${item.reviewItemId} must survive local text rebasing`);
    if (result.mutation) mixedMutations.push(result.mutation);
  }
  const mixedDocument = mixedDocuments.get(21);
  assert(mixedDocument?.contentText === "MüKoStGB/Fischer Rn. 4.", "Work name must change once");
  assert(
    mixedDocument?.format.fontName === "Aptos Serif" &&
      mixedDocument.format.fontSize === 8 &&
      mixedDocument.format.italic === true &&
      mixedDocument.format.bold === true,
    "Sequential formatting must relocate the changed work-name range and change only requested properties"
  );

  const externalFootnote = footnote("Kommentar Rdnr. 4.", 22);
  const externalStart = externalFootnote.contentText.indexOf("Rdnr.");
  const externalItem = reviewItem(
    externalFootnote,
    {
      type: "TEXT_REPLACE",
      start: externalStart,
      end: externalStart + 5,
      originalText: "Rdnr.",
      replacementText: "Rn.",
    },
    "external-relocation"
  );
  const externalDocuments = new Map([
    [
      22,
      { contentText: "Zusatz: Kommentar Rdnr. 4.", protectedRanges: [], format: {} },
    ],
  ]);
  const externalResult = await applySingleReviewItem(
    { reviewItem: externalItem, footnote: externalFootnote },
    new MemoryAdapter(externalDocuments)
  );
  assert(
    externalResult.status === "APPLIED" &&
      externalResult.localRevalidation?.status === "RELOCATED" &&
      externalResult.localRevalidation.sourceChanged === true &&
      externalDocuments.get(22)?.contentText === "Zusatz: Kommentar Rn. 4.",
    "An external insertion outside the target must allow unique local relocation"
  );

  const relocatedInsertFootnote = footnote("Text ohne Punkt", 24);
  const relocatedInsert = reviewItem(
    relocatedInsertFootnote,
    {
      type: "TEXT_INSERT",
      position: relocatedInsertFootnote.contentText.length,
      text: ".",
    },
    "relocated-insert"
  );
  const relocatedInsertDocuments = new Map([
    [24, { contentText: "Zusatz: Text ohne Punkt", protectedRanges: [], format: {} }],
  ]);
  const relocatedInsertResult = await applySingleReviewItem(
    { reviewItem: relocatedInsert, footnote: relocatedInsertFootnote },
    new MemoryAdapter(relocatedInsertDocuments)
  );
  assert(
    relocatedInsertResult.status === "APPLIED" &&
      relocatedInsertResult.localRevalidation?.status === "RELOCATED" &&
      relocatedInsertDocuments.get(24)?.contentText === "Zusatz: Text ohne Punkt.",
    "An insertion must relocate through its validated local boundary anchor"
  );

  const externalTargetDocuments = new Map([
    [
      22,
      { contentText: "Kommentar Randnr. 4.", protectedRanges: [], format: {} },
    ],
  ]);
  const externalTargetResult = await applySingleReviewItem(
    { reviewItem: externalItem, footnote: externalFootnote },
    new MemoryAdapter(externalTargetDocuments)
  );
  assert(
    externalTargetResult.status === "STALE" &&
      externalTargetResult.localRevalidation?.status === "MISSING",
    "An external edit at the target must remain stale"
  );

  const ambiguousFootnote = footnote("Rdnr.", 23);
  const ambiguousItem = reviewItem(
    ambiguousFootnote,
    {
      type: "TEXT_REPLACE",
      start: 0,
      end: 5,
      originalText: "Rdnr.",
      replacementText: "Rn.",
    },
    "ambiguous-duplicate"
  );
  const ambiguousDocuments = new Map([
    [23, { contentText: "X Rdnr. Rdnr.", protectedRanges: [], format: {} }],
  ]);
  const ambiguousResult = await applySingleReviewItem(
    { reviewItem: ambiguousItem, footnote: ambiguousFootnote },
    new MemoryAdapter(ambiguousDocuments)
  );
  assert(
    ambiguousResult.status === "STALE" &&
      ambiguousResult.localRevalidation?.status === "AMBIGUOUS" &&
      ambiguousDocuments.get(23)?.contentText === "X Rdnr. Rdnr.",
    "Equally plausible duplicate anchors must never use the first occurrence blindly"
  );

  const alreadyDocuments = new Map([
    [1, { contentText: "Urt. des BGH.", protectedRanges: [], format: {} }],
  ]);
  const alreadyResult = await applySingleReviewItem(
    { reviewItem: replacement, footnote: replacementFootnote },
    new MemoryAdapter(alreadyDocuments)
  );
  assert(
    alreadyResult.status === "APPLIED" && alreadyResult.reason === "ALREADY_RESOLVED",
    "An already resolved local target must be idempotently treated as applied"
  );

  const manyFootnotes = Array.from({ length: 10 }, (_, index) =>
    footnote(`Urteil ${index + 1}`, index + 10)
  );
  const manyItems = manyFootnotes.map((target, index) =>
    reviewItem(
      target,
      {
        type: "TEXT_REPLACE",
        start: 0,
        end: 6,
        originalText: "Urteil",
        replacementText: "Urt.",
      },
      `many-${index}`
    )
  );
  const manyDocuments = new Map(
    manyFootnotes.map((target) => [
      target.ordinal,
      { contentText: target.contentText, protectedRanges: [], format: {} },
    ])
  );
  const singleAdapter = new MemoryAdapter(manyDocuments);
  await applySingleReviewItem(
    { reviewItem: manyItems[2], footnote: manyFootnotes[2] },
    singleAdapter
  );
  assert(
    singleAdapter.calls.length === 1 && singleAdapter.calls[0] === "many-2",
    "One click must invoke exactly one item"
  );
  assert(manyDocuments.get(12)?.contentText === "Urt. 3", "Selected item must be changed");
  assert(
    manyFootnotes.every(
      (target, index) =>
        index === 2 || manyDocuments.get(target.ordinal)?.contentText === target.contentText
    ),
    "Single write-back must not mutate any other accepted item"
  );

  console.log("POC 14 safe single write-back tests passed.");
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
