import { analyzeFootnotes } from "../../src/footnote-engine/engine";
import type { Finding } from "../../src/footnote-engine/types";
import {
  runReviewEngine,
  setReviewStatus,
  type ProposedReviewAction,
  type ReviewItem,
  type TechnicalEligibility,
} from "../../src/review-engine";
import type { CharacterFormat, FootnoteSnapshot } from "../../src/taskpane/taskpane";
import { hashFootnoteContentText } from "../../src/taskpane/taskpane";
import {
  createAppliedMutationRecord,
  preflightResolvedTarget,
  revalidateActionLocally,
  runCorrectionAutoApply,
  selectCorrectionAutoApplyItems,
  type ApplySingleReviewItemInput,
  type ResolvedFootnoteTarget,
  type WriteBackDocumentAdapter,
  type WriteBackProtectedRange,
  type WriteBackResult,
} from "../../src/write-back-engine";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function snapshot(contentText: string, ordinal: number): FootnoteSnapshot {
  const hash = hashFootnoteContentText(contentText);
  return {
    id: `correction-${ordinal}-${hash}`,
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

function automaticItem(
  footnote: FootnoteSnapshot,
  action: ProposedReviewAction,
  id: string
): ReviewItem {
  const start = action.type === "TEXT_INSERT" ? action.position : action.start;
  const end = action.type === "TEXT_INSERT" ? action.position : action.end;
  const finding: Finding = {
    findingId: `finding-${id}`,
    footnoteId: footnote.id,
    footnoteOrdinal: footnote.ordinal,
    sourceTextHash: footnote.originalTextHash,
    ruleId: action.type === "FORMAT_CHANGE" ? "FORMAT_FONT_SIZE" : "FINAL_PERIOD",
    category: action.type === "FORMAT_CHANGE" ? "formatting" : "structure",
    start,
    end,
    originalText: action.type === "TEXT_INSERT" ? "" : footnote.contentText.slice(start, end),
    ...(action.type === "TEXT_REPLACE" ? { suggestedText: action.replacementText } : {}),
    severity: "error",
    message: "Test",
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
    decision: { effectiveStatus: "ACCEPTED", source: "MODE_DEFAULT" },
    technicalEligibility: eligible,
    conflicts: [],
    canAccept: true,
    sourceTextHash: footnote.originalTextHash,
  };
}

interface MemoryDocument {
  contentText: string;
  format: CharacterFormat;
  protectedRanges: WriteBackProtectedRange[];
}

class CorrectionMemoryAdapter implements WriteBackDocumentAdapter {
  calls: string[] = [];

  constructor(readonly documents: Map<number, MemoryDocument>) {}

  async applySingle(input: ApplySingleReviewItemInput): Promise<WriteBackResult> {
    this.calls.push(input.reviewItem.reviewItemId);
    const document = this.documents.get(input.footnote.ordinal);
    if (!document) {
      return { reviewItemId: input.reviewItem.reviewItemId, status: "STALE", reason: "FOOTNOTE_NOT_FOUND" };
    }
    const local = revalidateActionLocally({
      reviewItem: input.reviewItem,
      analyzedFootnote: input.footnote,
      currentContentText: document.contentText,
      appliedMutations: input.appliedMutations,
    });
    const resolved: ResolvedFootnoteTarget = {
      ordinal: input.footnote.ordinal,
      displayLabel: input.footnote.displayLabel,
      contentText: document.contentText,
      contentTextHash: hashFootnoteContentText(document.contentText),
      contextBefore: input.footnote.locator.contextBefore,
      contextAfter: input.footnote.locator.contextAfter,
      protectedRanges: document.protectedRanges,
    };
    const preflight = preflightResolvedTarget({
      reviewItem: input.reviewItem,
      analyzedFootnote: input.footnote,
      resolvedFootnote: resolved,
      protectedStateComplete: true,
      localRevalidation: local,
    });
    if (!preflight.ok || !preflight.resolvedRange) {
      return {
        reviewItemId: input.reviewItem.reviewItemId,
        status: preflight.statusOnFailure ?? "FAILED",
        reason: preflight.reasons[0],
        reasons: preflight.reasons,
        localRevalidation: local,
      };
    }
    if (local.status === "ALREADY_RESOLVED") {
      return {
        reviewItemId: input.reviewItem.reviewItemId,
        status: "APPLIED",
        reason: "ALREADY_RESOLVED",
        localRevalidation: local,
      };
    }
    const action = input.reviewItem.proposedAction as ProposedReviewAction;
    const { start, end } = preflight.resolvedRange;
    if (action.type === "TEXT_REPLACE") {
      document.contentText =
        document.contentText.slice(0, start) + action.replacementText + document.contentText.slice(end);
    } else if (action.type === "TEXT_INSERT") {
      document.contentText =
        document.contentText.slice(0, start) + action.text + document.contentText.slice(start);
    } else {
      const property = Object.keys(action.changes)[0] as keyof CharacterFormat;
      if (document.format[property] === action.changes[property]) {
        return {
          reviewItemId: input.reviewItem.reviewItemId,
          status: "APPLIED",
          reason: "ALREADY_RESOLVED",
          localRevalidation: { ...local, status: "ALREADY_RESOLVED" },
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
      localRevalidation: local,
      mutation: createAppliedMutationRecord({
        reviewItem: input.reviewItem,
        localRevalidation: local,
        appliedAt,
      }),
    };
  }
}

async function run(): Promise<void> {
  const finalPeriodFootnote = snapshot("Fußnote ohne Punkt", 1);
  const engine = analyzeFootnotes([finalPeriodFootnote]);
  const ranges = new Map(
    engine.footnoteAnalyses.map((analysis) => [analysis.footnoteId, analysis.protectedRanges])
  );
  const correctionReview = runReviewEngine({
    findings: engine.findings,
    footnotes: [finalPeriodFootnote],
    mode: "CORRECTION",
    protectedRangesByFootnoteId: ranges,
  });
  const analysisReview = runReviewEngine({
    findings: engine.findings,
    footnotes: [finalPeriodFootnote],
    mode: "ANALYSIS",
    protectedRangesByFootnoteId: ranges,
  });
  const reviewReview = runReviewEngine({
    findings: engine.findings,
    footnotes: [finalPeriodFootnote],
    mode: "REVIEW",
    protectedRangesByFootnoteId: ranges,
  });
  assert(
    selectCorrectionAutoApplyItems(analysisReview.items).length === 0 &&
      selectCorrectionAutoApplyItems(reviewReview.items).length === 0,
    "Analysis and review modes must never auto-apply unaccepted findings"
  );
  const finalDocuments = new Map([
    [1, { contentText: finalPeriodFootnote.contentText, format: {}, protectedRanges: [] }],
  ]);
  const finalAdapter = new CorrectionMemoryAdapter(finalDocuments);
  const progress: string[] = [];
  const finalResult = await runCorrectionAutoApply({
    items: correctionReview.items,
    footnotes: [finalPeriodFootnote],
    adapter: finalAdapter,
    onProgress: ({ processed, total }) => progress.push(`${processed}/${total}`),
  });
  assert(finalDocuments.get(1)?.contentText.endsWith("."), "Correction mode must apply FINAL_PERIOD");
  assert(
    finalResult.summary.applied === 1 &&
      progress[0] === "0/1" &&
      progress[progress.length - 1] === "1/1",
    "Correction progress must reflect actually processed automatic actions"
  );

  const finalItem = correctionReview.items.find((item) => item.finding.ruleId === "FINAL_PERIOD");
  assert(finalItem !== undefined, "FINAL_PERIOD review item must exist");
  const rejectedDecisions = setReviewStatus({}, finalItem, "REJECTED");
  const rejectedReview = runReviewEngine({
    findings: engine.findings,
    footnotes: [finalPeriodFootnote],
    mode: "CORRECTION",
    decisionState: rejectedDecisions,
    protectedRangesByFootnoteId: ranges,
  });
  assert(
    selectCorrectionAutoApplyItems(rejectedReview.items).length === 0,
    "An explicit user rejection must override correction-mode defaults"
  );

  for (const reviewClass of ["MANUAL", "TECHNICAL", "INFO"] as const) {
    assert(
      selectCorrectionAutoApplyItems([{ ...finalItem, reviewClass }]).length === 0,
      `${reviewClass} items must never be auto-applied`
    );
  }

  const footnoteA = snapshot("Text ohne Punkt", 2);
  const footnoteB = snapshot("BGH, Urteil vom 5.7.2025 – X.", 3);
  const finalInsert = automaticItem(
    footnoteA,
    { type: "TEXT_INSERT", position: footnoteA.contentText.length, text: "." },
    "auto-final-period"
  );
  const fontChange = automaticItem(
    footnoteA,
    { type: "FORMAT_CHANGE", start: 0, end: footnoteA.contentText.length, changes: { fontSize: 8 } },
    "auto-font-size"
  );
  const bghItems = [
    ["Urteil", "Urt."],
    ["vom", "v."],
    ["5.7.2025", "05.07.2025"],
  ].map(([originalText, replacementText], index) => {
    const start = footnoteB.contentText.indexOf(originalText);
    return automaticItem(
      footnoteB,
      {
        type: "TEXT_REPLACE",
        start,
        end: start + originalText.length,
        originalText,
        replacementText,
      },
      `auto-bgh-${index}`
    );
  });
  const manual = { ...bghItems[0], reviewItemId: "manual", reviewClass: "MANUAL" as const };
  const documents = new Map([
    [2, { contentText: footnoteA.contentText, format: { fontSize: 10, bold: true }, protectedRanges: [] }],
    [3, { contentText: footnoteB.contentText, format: {}, protectedRanges: [] }],
  ]);
  const adapter = new CorrectionMemoryAdapter(documents);
  const multiResult = await runCorrectionAutoApply({
    items: [manual, fontChange, ...bghItems, finalInsert],
    footnotes: [footnoteA, footnoteB],
    adapter,
  });
  assert(
    multiResult.summary.total === 5 && multiResult.summary.applied === 5,
    "All and only safe automatic findings must be applied"
  );
  assert(
    documents.get(2)?.contentText === "Text ohne Punkt." &&
      documents.get(2)?.format.fontSize === 8 &&
      documents.get(2)?.format.bold === true,
    "Footnote A must receive its insert and only the requested format property"
  );
  assert(
    documents.get(3)?.contentText === "BGH, Urt. v. 05.07.2025 – X.",
    "Footnote B must receive all sequential text corrections"
  );
  assert(!adapter.calls.includes("manual"), "Manual findings must remain untouched");

  const callsBeforeRepeat = adapter.calls.length;
  const repeated = await runCorrectionAutoApply({
    items: [fontChange, ...bghItems, finalInsert],
    footnotes: [footnoteA, footnoteB],
    adapter,
    initialState: multiResult.state,
    initialMutations: multiResult.mutations,
  });
  assert(
    repeated.summary.total === 0 && adapter.calls.length === callsBeforeRepeat,
    "Already applied session items must not be written twice"
  );

  const staleItem = automaticItem(
    footnoteB,
    {
      type: "TEXT_REPLACE",
      start: footnoteB.contentText.indexOf("Urteil"),
      end: footnoteB.contentText.indexOf("Urteil") + 6,
      originalText: "Urteil",
      replacementText: "Urt.",
    },
    "stale-independent"
  );
  const independentFootnote = snapshot("Urteil separat.", 4);
  const independentItem = automaticItem(
    independentFootnote,
    { type: "TEXT_REPLACE", start: 0, end: 6, originalText: "Urteil", replacementText: "Urt." },
    "independent-success"
  );
  const continuingDocuments = new Map([
    [3, { contentText: "BGH, Entscheidung vom 5.7.2025 – X.", format: {}, protectedRanges: [] }],
    [4, { contentText: independentFootnote.contentText, format: {}, protectedRanges: [] }],
  ]);
  const continuing = await runCorrectionAutoApply({
    items: [staleItem, independentItem],
    footnotes: [footnoteB, independentFootnote],
    adapter: new CorrectionMemoryAdapter(continuingDocuments),
  });
  assert(
    continuing.summary.stale === 1 &&
      continuing.summary.applied === 1 &&
      continuingDocuments.get(4)?.contentText === "Urt. separat.",
    "One stale action must not abort an independent safe correction"
  );

  console.log("POC 14.1 correction-mode auto-apply tests passed.");
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
