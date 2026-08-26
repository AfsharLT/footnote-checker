import type { Finding } from "../../src/footnote-engine/types";
import type {
  ProposedReviewAction,
  ReviewClass,
  ReviewItem,
  ReviewMode,
  ReviewStatus,
  TechnicalEligibility,
} from "../../src/review-engine";
import type { CharacterFormat, FootnoteSnapshot } from "../../src/taskpane/taskpane";
import { hashFootnoteContentText } from "../../src/taskpane/taskpane";
import {
  createAppliedMutationRecord,
  createFootnoteWritePlan,
  createWriteBackPlan,
  getBatchRuntimeDiagnostics,
  preflightResolvedTarget,
  revalidateActionLocally,
  runWriteBackBatch,
  type ApplySingleReviewItemInput,
  type ApplyBatchReviewItemsInput,
  type BatchPerformanceMetrics,
  type BatchProgress,
  type ResolvedFootnoteTarget,
  type WriteBackBatchAdapterResult,
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
    id: `batch-footnote-${ordinal}-${hash}`,
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

function item(input: {
  id: string;
  footnote: FootnoteSnapshot;
  action?: ProposedReviewAction;
  mode?: ReviewMode;
  reviewClass?: ReviewClass;
  status?: ReviewStatus;
  explicit?: boolean;
  technicalEligibility?: TechnicalEligibility;
  conflict?: boolean;
}): ReviewItem {
  const action = input.action;
  const start = action?.type === "TEXT_INSERT" ? action.position : (action?.start ?? 0);
  const end = action?.type === "TEXT_INSERT" ? action.position : (action?.end ?? 0);
  const finding: Finding = {
    findingId: `finding-${input.id}`,
    footnoteId: input.footnote.id,
    footnoteOrdinal: input.footnote.ordinal,
    sourceTextHash: input.footnote.originalTextHash,
    ruleId: action?.type === "FORMAT_CHANGE" ? "FORMAT_FONT_SIZE" : "CASE_LAW_DECISION_TYPE",
    category: action?.type === "FORMAT_CHANGE" ? "formatting" : "citation",
    start,
    end,
    originalText:
      action?.type === "TEXT_INSERT" ? "" : input.footnote.contentText.slice(start, end),
    ...(action?.type === "TEXT_REPLACE" ? { suggestedText: action.replacementText } : {}),
    severity: "warning",
    message: `Finding ${input.id}`,
  };
  const status = input.status ?? (input.mode === "CORRECTION" ? "ACCEPTED" : "UNREVIEWED");
  return {
    reviewItemId: input.id,
    finding,
    reviewClass: input.reviewClass ?? "AUTO",
    classificationReason:
      action?.type === "FORMAT_CHANGE"
        ? "DETERMINISTIC_FORMAT_CHANGE"
        : action?.type === "TEXT_INSERT"
          ? "SAFE_INSERTION"
          : action
            ? "DETERMINISTIC_TEXT_CHANGE"
            : "NO_ACTION_AVAILABLE",
    ...(action ? { proposedAction: action } : {}),
    decision: {
      effectiveStatus: status,
      source: input.explicit ? "USER" : "MODE_DEFAULT",
      ...(input.explicit ? { explicitStatus: status } : {}),
    },
    technicalEligibility: input.technicalEligibility ?? eligible,
    conflicts: input.conflict
      ? [{ conflictId: `conflict-${input.id}`, reason: "overlap", reviewItemIds: [input.id] }]
      : [],
    canAccept: Boolean(action) && (input.technicalEligibility ?? eligible).eligible,
    sourceTextHash: input.footnote.originalTextHash,
  };
}

interface MemoryDocument {
  contentText: string;
  format: CharacterFormat;
  protectedRanges: WriteBackProtectedRange[];
}

class BatchMemoryAdapter implements WriteBackDocumentAdapter {
  calls: string[] = [];
  revalidations: string[] = [];

  constructor(
    readonly documents: Map<string, MemoryDocument>,
    readonly fatalReviewItemId?: string
  ) {}

  async applySingle(input: ApplySingleReviewItemInput): Promise<WriteBackResult> {
    this.calls.push(input.reviewItem.reviewItemId);
    if (input.reviewItem.reviewItemId === this.fatalReviewItemId) {
      return {
        reviewItemId: input.reviewItem.reviewItemId,
        status: "FAILED",
        reason: "WORD_API_ERROR",
        message: "Simulierter fataler Hostfehler",
        fatal: true,
      };
    }
    const document = this.documents.get(input.footnote.id);
    if (!document) {
      return {
        reviewItemId: input.reviewItem.reviewItemId,
        status: "STALE",
        reason: "FOOTNOTE_NOT_FOUND",
      };
    }
    const local = revalidateActionLocally({
      reviewItem: input.reviewItem,
      analyzedFootnote: input.footnote,
      currentContentText: document.contentText,
      appliedMutations: input.appliedMutations,
    });
    this.revalidations.push(local.status);
    const target: ResolvedFootnoteTarget = {
      ordinal: input.footnote.ordinal,
      displayLabel: input.footnote.displayLabel,
      contentText: document.contentText,
      contentTextHash: hashFootnoteContentText(document.contentText),
      contextBefore: "",
      contextAfter: "",
      protectedRanges: document.protectedRanges,
    };
    const preflight = preflightResolvedTarget({
      reviewItem: input.reviewItem,
      analyzedFootnote: input.footnote,
      resolvedFootnote: target,
      protectedStateComplete: true,
      localRevalidation: local,
    });
    if (!preflight.ok) {
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
    const range = preflight.resolvedRange;
    if (!range) throw new Error("Memory write-back needs a resolved range.");
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

class ChunkedBatchAdapter implements WriteBackDocumentAdapter {
  applySingleCalls = 0;
  batchCalls = 0;
  receivedEntries = 0;
  activeRuns = 0;
  retainedSnapshots = 0;

  constructor(
    readonly staleFootnoteId?: string,
    readonly fatalChunkIndex?: number
  ) {}

  async applySingle(input: ApplySingleReviewItemInput): Promise<WriteBackResult> {
    this.applySingleCalls += 1;
    return {
      reviewItemId: input.reviewItem.reviewItemId,
      status: "FAILED",
      reason: "WORD_API_ERROR",
    };
  }

  async applyBatch(input: ApplyBatchReviewItemsInput): Promise<WriteBackBatchAdapterResult> {
    this.batchCalls += 1;
    this.receivedEntries += input.entries.length;
    this.activeRuns += 1;
    const startedAt = performance.now();
    const groups = new Map<string, typeof input.entries>();
    for (const entry of input.entries) {
      groups.set(entry.footnote.id, [...(groups.get(entry.footnote.id) ?? []), entry]);
    }
    const footnoteGroups = [...groups.values()];
    const chunks: Array<typeof footnoteGroups> = [];
    for (let index = 0; index < footnoteGroups.length; index += input.chunkSize) {
      chunks.push(footnoteGroups.slice(index, index + input.chunkSize));
    }
    const results: WriteBackResult[] = [];
    const metrics: BatchPerformanceMetrics = {
      totalDurationMs: 0,
      planningDurationMs: input.planningDurationMs,
      readDurationMs: 0,
      localValidationDurationMs: 0,
      writeDurationMs: 0,
      finalizationDurationMs: 0,
      cleanupDurationMs: 0,
      affectedFootnotes: footnoteGroups.length,
      plannedActions: input.entries.length,
      appliedActions: 0,
      contextSyncCount: 0,
      wordRunCount: 0,
      readChunkCount: 0,
      writeChunkCount: 0,
    };
    let processed = 0;
    let fatalError: string | undefined;
    try {
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        const chunk = chunks[chunkIndex];
        this.retainedSnapshots = chunk.length;
        metrics.wordRunCount += 1;
        metrics.readChunkCount += 1;
        metrics.writeChunkCount += 1;
        metrics.contextSyncCount += 4;
        const chunkResults = chunk.flat().map((entry, index): WriteBackResult => {
          if (chunkIndex === this.fatalChunkIndex) {
            return {
              reviewItemId: entry.reviewItem.reviewItemId,
              status: "FAILED",
              reason: "WORD_API_ERROR",
              fatal: index === 0,
            };
          }
          if (entry.footnote.id === this.staleFootnoteId) {
            return {
              reviewItemId: entry.reviewItem.reviewItemId,
              status: "STALE",
              reason: "SOURCE_CHANGED",
            };
          }
          return {
            reviewItemId: entry.reviewItem.reviewItemId,
            status: "APPLIED",
            appliedAt: "2026-08-23T12:00:00.000Z",
          };
        });
        results.push(...chunkResults);
        processed += chunkResults.length;
        metrics.appliedActions = results.filter((result) => result.status === "APPLIED").length;
        input.onChunk?.({
          results: chunkResults,
          mutations: [],
          processed,
          currentFootnoteOrdinal: chunk[chunk.length - 1]?.[0].footnote.ordinal,
          performance: { ...metrics },
        });
        this.retainedSnapshots = 0;
        if (chunkIndex === this.fatalChunkIndex) {
          fatalError = "Simulierter fataler Chunkfehler";
          break;
        }
      }
      metrics.totalDurationMs = performance.now() - startedAt;
      return {
        results,
        mutations: [],
        performance: metrics,
        ...(fatalError ? { fatalError } : {}),
      };
    } finally {
      this.retainedSnapshots = 0;
      this.activeRuns -= 1;
    }
  }
}

async function run(): Promise<void> {
  const base = snapshot("BGH, Urteil vom 5.7.2025 – X", 1);
  const replace = (id: string, originalText: string, replacementText: string) => {
    const start = base.contentText.indexOf(originalText);
    return item({
      id,
      footnote: base,
      mode: "CORRECTION",
      action: {
        type: "TEXT_REPLACE",
        start,
        end: start + originalText.length,
        originalText,
        replacementText,
      },
    });
  };
  const sameFootnoteItems = [
    replace("replace-urteil", "Urteil", "Urt."),
    replace("replace-vom", "vom", "v."),
    replace("replace-date", "5.7.2025", "05.07.2025"),
    item({
      id: "insert-period",
      footnote: base,
      mode: "CORRECTION",
      action: { type: "TEXT_INSERT", position: base.contentText.length, text: "." },
    }),
    item({
      id: "format-size",
      footnote: base,
      mode: "CORRECTION",
      action: {
        type: "FORMAT_CHANGE",
        start: 0,
        end: base.contentText.length,
        changes: { fontSize: 8 },
      },
    }),
  ];
  const samePlan = createWriteBackPlan({
    mode: "CORRECTION",
    items: sameFootnoteItems,
    createdAt: "2026-08-23T12:00:00.000Z",
  });
  assert(samePlan.totals.eligible === 5, "All five safe same-footnote actions must be planned");
  assert(
    samePlan.items.map((entry) => entry.reviewItemId).join(",") ===
      "replace-date,replace-vom,replace-urteil,insert-period,format-size",
    "Text replacements must be start-descending before insertions and formatting"
  );
  assert(
    new Set(samePlan.items.map((entry) => entry.dependencyGroupId)).size === 1,
    "Same-footnote findings must share one dependency group"
  );
  const sameDocuments = new Map([
    [base.id, { contentText: base.contentText, format: { fontSize: 10 }, protectedRanges: [] }],
  ]);
  const sameAdapter = new BatchMemoryAdapter(sameDocuments);
  const progress: BatchProgress[] = [];
  const sameResult = await runWriteBackBatch(samePlan, {
    items: sameFootnoteItems,
    footnotes: [base],
    adapter: sameAdapter,
    now: () => "2026-08-23T12:00:00.000Z",
    onProgress: (value) => progress.push(value),
  });
  assert(sameResult.status === "COMPLETED", "Safe same-footnote batch must complete");
  assert(
    sameDocuments.get(base.id)?.contentText === "BGH, Urt. v. 05.07.2025 – X.",
    "All text actions must compose without reanalysis"
  );
  assert(sameDocuments.get(base.id)?.format.fontSize === 8, "Formatting must follow text actions");
  assert(
    sameAdapter.revalidations.length === 5 &&
      sameAdapter.revalidations.every((status) => status === "EXACT" || status === "RELOCATED"),
    "Every batch mutation must run local revalidation"
  );
  assert(
    progress.every(
      (value, index) =>
        value.processed <= value.total &&
        (index === 0 || value.processed >= progress[index - 1].processed)
    ) && progress[progress.length - 1].processed === progress[progress.length - 1].total,
    "Batch progress must be monotonic and finish at total"
  );

  const reviewCandidates = Array.from({ length: 10 }, (_, index) =>
    item({
      id: `review-${index}`,
      footnote: base,
      action: {
        type: "TEXT_REPLACE",
        start: 5,
        end: 11,
        originalText: "Urteil",
        replacementText: "Urt.",
      },
      reviewClass: index === 5 || index === 6 ? "MANUAL" : index === 7 ? "INFO" : "AUTO",
      status:
        index < 3 ? "ACCEPTED" : index === 3 ? "REJECTED" : index === 4 ? "DEFERRED" : "UNREVIEWED",
      explicit: index <= 4,
    })
  );
  const reviewPlan = createWriteBackPlan({ mode: "REVIEW", items: reviewCandidates });
  assert(reviewPlan.totals.eligible === 3, "Review mode must plan only three explicit accepts");
  assert(
    reviewPlan.items
      .filter((entry) => entry.planned)
      .every((entry) => ["review-0", "review-1", "review-2"].includes(entry.reviewItemId)),
    "Review batch selection must exclude defaults, rejected, deferred, manual and info items"
  );

  const technicalEligibility = {
    ...eligible,
    eligible: false,
    reasons: ["PROTECTED_RANGE" as const],
  };
  const exclusionItems: ReviewItem[] = [
    item({
      id: "rejected",
      footnote: base,
      action: sameFootnoteItems[0].proposedAction,
      status: "REJECTED",
      explicit: true,
    }),
    item({
      id: "deferred",
      footnote: base,
      action: sameFootnoteItems[0].proposedAction,
      status: "DEFERRED",
      explicit: true,
    }),
    item({
      id: "manual",
      footnote: base,
      action: sameFootnoteItems[0].proposedAction,
      reviewClass: "MANUAL",
    }),
    item({
      id: "technical",
      footnote: base,
      action: sameFootnoteItems[0].proposedAction,
      reviewClass: "TECHNICAL",
    }),
    item({
      id: "info",
      footnote: base,
      action: sameFootnoteItems[0].proposedAction,
      reviewClass: "INFO",
    }),
    item({
      id: "blocked",
      footnote: base,
      action: sameFootnoteItems[0].proposedAction,
      technicalEligibility,
    }),
    item({
      id: "conflict",
      footnote: base,
      action: sameFootnoteItems[0].proposedAction,
      conflict: true,
    }),
    item({ id: "no-action", footnote: base }),
    item({
      id: "unsupported",
      footnote: base,
      action: { type: "FORMAT_CHANGE", start: 0, end: 3, changes: { fontSize: 8, bold: true } },
    }),
    item({
      id: "applied",
      footnote: base,
      action: sameFootnoteItems[0].proposedAction,
      mode: "CORRECTION",
    }),
    item({
      id: "stale",
      footnote: base,
      action: sameFootnoteItems[0].proposedAction,
      mode: "CORRECTION",
    }),
  ];
  const exclusionPlan = createWriteBackPlan({
    mode: "CORRECTION",
    items: exclusionItems,
    state: {
      applied: { reviewItemId: "applied", status: "APPLIED" },
      stale: { reviewItemId: "stale", status: "STALE" },
    },
  });
  const reasons = new Set(exclusionPlan.items.map((entry) => entry.exclusionReason));
  for (const reason of [
    "USER_REJECTED",
    "USER_DEFERRED",
    "MANUAL_REVIEW_REQUIRED",
    "TECHNICAL_BLOCK",
    "INFORMATION_ONLY",
    "CONFLICT",
    "NO_ACTION",
    "UNSUPPORTED_ACTION",
    "ALREADY_APPLIED",
    "STALE_BEFORE_RUN",
  ]) {
    assert(reasons.has(reason as never), `Plan must retain exclusion reason ${reason}`);
  }

  const first = snapshot("Urteil", 2);
  const staleFootnote = snapshot("Urteil", 3);
  const third = snapshot("Urteil", 4);
  const isolatedItems = [first, staleFootnote, third].map((footnote, index) =>
    item({
      id: `isolated-${index + 1}`,
      footnote,
      mode: "CORRECTION",
      action: {
        type: "TEXT_REPLACE",
        start: 0,
        end: 6,
        originalText: "Urteil",
        replacementText: "Urt.",
      },
    })
  );
  const isolatedDocuments = new Map<string, MemoryDocument>([
    [first.id, { contentText: "Urteil", format: {}, protectedRanges: [] }],
    [staleFootnote.id, { contentText: "Entscheidung", format: {}, protectedRanges: [] }],
    [third.id, { contentText: "Urteil", format: {}, protectedRanges: [] }],
  ]);
  const isolatedAdapter = new BatchMemoryAdapter(isolatedDocuments);
  const isolatedPlan = createWriteBackPlan({ mode: "CORRECTION", items: isolatedItems });
  const isolatedResult = await runWriteBackBatch(isolatedPlan, {
    items: isolatedItems,
    footnotes: [first, staleFootnote, third],
    adapter: isolatedAdapter,
  });
  assert(isolatedResult.status === "COMPLETED_WITH_ISSUES", "One stale item must yield issues");
  assert(
    isolatedResult.summary.applied === 2 && isolatedResult.summary.stale === 1,
    "A stale middle footnote must not block later independent items"
  );
  assert(isolatedAdapter.calls.length === 3, "Error isolation must continue after a stale item");

  const alreadyDocuments = new Map<string, MemoryDocument>([
    [first.id, { contentText: "Urt.", format: {}, protectedRanges: [] }],
  ]);
  const alreadyAdapter = new BatchMemoryAdapter(alreadyDocuments);
  const alreadyPlan = createWriteBackPlan({
    mode: "CORRECTION",
    items: [isolatedItems[0]],
  });
  const alreadyResult = await runWriteBackBatch(alreadyPlan, {
    items: [isolatedItems[0]],
    footnotes: [first],
    adapter: alreadyAdapter,
  });
  assert(
    alreadyResult.status === "COMPLETED" &&
      alreadyResult.summary.alreadyResolved === 1 &&
      alreadyResult.summary.stale === 0 &&
      alreadyResult.itemResults[0].resultReason === "ALREADY_RESOLVED",
    "An already-resolved action must be APPLIED without a duplicate mutation"
  );

  const secondPlan = createWriteBackPlan({
    mode: "CORRECTION",
    items: isolatedItems,
    state: isolatedResult.state,
  });
  const callsBeforeSecondRun = isolatedAdapter.calls.length;
  const secondResult = await runWriteBackBatch(secondPlan, {
    items: isolatedItems,
    footnotes: [first, staleFootnote, third],
    initialState: isolatedResult.state,
    initialMutations: isolatedResult.mutations,
    adapter: isolatedAdapter,
  });
  assert(secondPlan.totals.eligible === 0, "Applied and stale items must not be replanned");
  assert(
    isolatedAdapter.calls.length === callsBeforeSecondRun && secondResult.summary.planned === 0,
    "A repeated batch must not mutate already handled items"
  );

  const fatalDocuments = new Map<string, MemoryDocument>([
    [first.id, { contentText: "Urteil", format: {}, protectedRanges: [] }],
    [staleFootnote.id, { contentText: "Urteil", format: {}, protectedRanges: [] }],
    [third.id, { contentText: "Urteil", format: {}, protectedRanges: [] }],
  ]);
  const fatalAdapter = new BatchMemoryAdapter(fatalDocuments, "isolated-2");
  const fatalResult = await runWriteBackBatch(isolatedPlan, {
    items: isolatedItems,
    footnotes: [first, staleFootnote, third],
    adapter: fatalAdapter,
  });
  assert(fatalResult.status === "FAILED", "A fatal host result must fail the batch");
  assert(
    fatalResult.summary.applied === 1 &&
      fatalResult.itemResults.find((entry) => entry.reviewItemId === "isolated-3")?.resultReason ===
        "BATCH_ABORTED",
    "Fatal result must retain successful prior mutations and document unprocessed items"
  );
  assert(
    Object.values(fatalResult.state).every((result) => result.status !== "PENDING"),
    "Fatal cleanup must not leave the UI in a pending mutation state"
  );

  const largeItems = Array.from({ length: 1_200 }, (_, index) => {
    const footnote = snapshot(`Text ${index}`, index + 10);
    return item({
      id: `large-${index}`,
      footnote,
      mode: "CORRECTION",
      action: { type: "TEXT_INSERT", position: footnote.contentText.length, text: "." },
    });
  });
  const started = performance.now();
  const largePlan = createWriteBackPlan({ mode: "CORRECTION", items: largeItems });
  const durationMs = performance.now() - started;
  assert(largePlan.totals.eligible === 1_200, "Large plan must retain every safe item");
  assert(durationMs < 2_000, `1,200-item planning must remain practical (${durationMs} ms)`);

  const sharedSnapshot = snapshot("MüKo-StGB, Urteil vom 5.7.2025", 1);
  const sharedActions: ReviewItem[] = [
    ["work", "MüKo-StGB", "MüKoStGB"],
    ["decision", "Urteil", "Urt."],
    ["date", "5.7.2025", "05.07.2025"],
  ].map(([id, originalText, replacementText]) => {
    const start = sharedSnapshot.contentText.indexOf(originalText);
    return item({
      id: `shared-${id}`,
      footnote: sharedSnapshot,
      mode: "CORRECTION",
      action: {
        type: "TEXT_REPLACE",
        start,
        end: start + originalText.length,
        originalText,
        replacementText,
      },
    });
  });
  sharedActions.push(
    item({
      id: "shared-font-name",
      footnote: sharedSnapshot,
      mode: "CORRECTION",
      action: {
        type: "FORMAT_CHANGE",
        start: 0,
        end: sharedSnapshot.contentText.length,
        changes: { fontName: "Arial" },
      },
    }),
    item({
      id: "shared-font-size",
      footnote: sharedSnapshot,
      mode: "CORRECTION",
      action: {
        type: "FORMAT_CHANGE",
        start: 0,
        end: sharedSnapshot.contentText.length,
        changes: { fontSize: 8 },
      },
    })
  );
  const currentSnapshot = {
    footnoteId: sharedSnapshot.id,
    ordinal: sharedSnapshot.ordinal,
    displayLabel: sharedSnapshot.displayLabel,
    rawWordText: sharedSnapshot.rawWordText,
    contentText: sharedSnapshot.contentText,
    contentHash: sharedSnapshot.originalTextHash,
    contextBefore: "",
    contextAfter: "",
    protectedRanges: [],
    protectedStateComplete: true,
    loadedAt: "2026-08-23T12:00:00.000Z",
  };
  const footnotePlan = createFootnoteWritePlan({
    entries: sharedActions.map((reviewItem) => ({ reviewItem, footnote: sharedSnapshot })),
    currentSnapshot,
    now: "2026-08-23T12:00:00.000Z",
  });
  assert(footnotePlan.currentSnapshot === currentSnapshot, "Five actions must share one snapshot");
  assert(
    footnotePlan.textActions.length === 3 && footnotePlan.formatActions.length === 2,
    "Text actions must be planned before both format actions"
  );
  assert(
    footnotePlan.simulatedContentText === "MüKoStGB, Urt. vom 05.07.2025",
    "The footnote plan must simulate the exact final text in memory"
  );
  assert(
    footnotePlan.formatActions.every(
      (action) =>
        action.resolvedStart === 0 &&
        action.resolvedEnd === footnotePlan.simulatedContentText.length &&
        action.matchedText === footnotePlan.simulatedContentText
    ),
    "Formatting ranges must be rebased against the simulated final text"
  );

  const tenActionSnapshot = snapshot(
    Array.from({ length: 10 }, (_, index) => `a${index}`).join("|"),
    2
  );
  const tenActions = Array.from({ length: 10 }, (_, index) => {
    const originalText = `a${index}`;
    const start = tenActionSnapshot.contentText.indexOf(originalText);
    return item({
      id: `ten-${index}`,
      footnote: tenActionSnapshot,
      mode: "CORRECTION",
      action: {
        type: "TEXT_REPLACE",
        start,
        end: start + originalText.length,
        originalText,
        replacementText: `b${index}`,
      },
    });
  });
  const tenActionPlan = createFootnoteWritePlan({
    entries: tenActions.map((reviewItem) => ({ reviewItem, footnote: tenActionSnapshot })),
    currentSnapshot: {
      ...currentSnapshot,
      footnoteId: tenActionSnapshot.id,
      ordinal: tenActionSnapshot.ordinal,
      displayLabel: tenActionSnapshot.displayLabel,
      rawWordText: tenActionSnapshot.rawWordText,
      contentText: tenActionSnapshot.contentText,
      contentHash: tenActionSnapshot.originalTextHash,
    },
  });
  assert(
    tenActionPlan.textActions.length === 10 &&
      tenActionPlan.simulatedContentText ===
        Array.from({ length: 10 }, (_, index) => `b${index}`).join("|"),
    "Ten independent actions must share one state and compose deterministically"
  );

  const protectedSnapshot = snapshot("AA BB", 3);
  const protectedItems = [
    item({
      id: "protected-aa",
      footnote: protectedSnapshot,
      mode: "CORRECTION",
      action: { type: "TEXT_REPLACE", start: 0, end: 2, originalText: "AA", replacementText: "X" },
    }),
    item({
      id: "safe-bb",
      footnote: protectedSnapshot,
      mode: "CORRECTION",
      action: { type: "TEXT_REPLACE", start: 3, end: 5, originalText: "BB", replacementText: "Y" },
    }),
  ];
  const protectedPlan = createFootnoteWritePlan({
    entries: protectedItems.map((reviewItem) => ({ reviewItem, footnote: protectedSnapshot })),
    currentSnapshot: {
      ...currentSnapshot,
      footnoteId: protectedSnapshot.id,
      ordinal: protectedSnapshot.ordinal,
      displayLabel: protectedSnapshot.displayLabel,
      rawWordText: protectedSnapshot.rawWordText,
      contentText: protectedSnapshot.contentText,
      contentHash: protectedSnapshot.originalTextHash,
      protectedRanges: [{ type: "hyperlink", start: 0, end: 2 }],
    },
  });
  assert(
    protectedPlan.status === "PARTIAL" &&
      protectedPlan.textActions.length === 1 &&
      protectedPlan.textActions[0].reviewItem.reviewItemId === "safe-bb" &&
      protectedPlan.preliminaryResults[0]?.reason === "PROTECTED_RANGE",
    "A protected action must be isolated while another action in the footnote remains ready"
  );

  const loadFootnotes = Array.from({ length: 1_000 }, (_, index) =>
    snapshot(`Footnote ${index}`, index + 1)
  );
  const loadItems = (count: number) =>
    loadFootnotes.slice(0, count).map((footnote, index) =>
      item({
        id: `load-${count}-${index}`,
        footnote,
        mode: "CORRECTION",
        action: { type: "TEXT_INSERT", position: footnote.contentText.length, text: "." },
      })
    );
  const matrix: Array<{ actions: number; chunks: number }> = [
    { actions: 50, chunks: 2 },
    { actions: 250, chunks: 9 },
    { actions: 500, chunks: 17 },
  ];
  const matrixMeasurements: string[] = [];
  for (const scenario of matrix) {
    const scenarioItems = loadItems(scenario.actions);
    const scenarioPlan = createWriteBackPlan({ mode: "CORRECTION", items: scenarioItems });
    const adapter = new ChunkedBatchAdapter();
    let resultUpdateCount = 0;
    const result = await runWriteBackBatch(scenarioPlan, {
      items: scenarioItems,
      footnotes: loadFootnotes,
      adapter,
      chunkSize: 30,
      onResults: () => {
        resultUpdateCount += 1;
      },
    });
    assert(adapter.receivedEntries === scenario.actions, "Only affected footnotes may be loaded");
    assert(adapter.applySingleCalls === 0, "Chunk batches must never use per-item applySingle");
    assert(result.performance.wordRunCount === scenario.chunks, "One Word.run per chunk expected");
    assert(result.performance.readChunkCount === scenario.chunks, "Read chunks must be bounded");
    assert(result.performance.writeChunkCount === scenario.chunks, "Write chunks must be bounded");
    assert(
      result.performance.contextSyncCount === scenario.chunks * 4,
      "Synthetic text-only host contract uses four sync rounds per chunk"
    );
    assert(
      resultUpdateCount === scenario.chunks + 1,
      "React-facing result updates must be one pending update plus one per chunk"
    );
    assert(result.summary.applied === scenario.actions, "Every synthetic safe action must apply");
    assert(adapter.activeRuns === 0 && adapter.retainedSnapshots === 0, "Adapter resources leak");
    assert(
      getBatchRuntimeDiagnostics().activeRuns === 0 &&
        getBatchRuntimeDiagnostics().pendingEntries === 0,
      "Batch runner resources must be clean after completion"
    );
    assert(result.performance.cleanupDurationMs >= 0, "Batch cleanup duration must be recorded");
    matrixMeasurements.push(
      `${scenario.actions}=${result.performance.totalDurationMs.toFixed(1)}ms/${result.performance.contextSyncCount}sync/${result.performance.wordRunCount}run`
    );
  }

  const analysisItems = loadItems(1_000);
  const analysisPlan = createWriteBackPlan({ mode: "ANALYSIS", items: analysisItems });
  const analysisAdapter = new ChunkedBatchAdapter();
  const analysisResult = await runWriteBackBatch(analysisPlan, {
    items: analysisItems,
    footnotes: loadFootnotes,
    adapter: analysisAdapter,
  });
  assert(
    analysisPlan.totals.eligible === 0 &&
      analysisAdapter.batchCalls === 0 &&
      analysisResult.performance.wordRunCount === 0,
    "Analysis mode with 1,000 footnotes must not activate the write pipeline"
  );

  const sixtyItems = loadItems(60);
  const sixtyPlan = createWriteBackPlan({ mode: "CORRECTION", items: sixtyItems });
  const staleAdapter = new ChunkedBatchAdapter(loadFootnotes[31].id);
  const sixtyResult = await runWriteBackBatch(sixtyPlan, {
    items: sixtyItems,
    footnotes: loadFootnotes,
    adapter: staleAdapter,
    chunkSize: 30,
  });
  assert(sixtyResult.performance.wordRunCount === 2, "60 footnotes must use two chunks, not 60");
  assert(
    sixtyResult.summary.applied === 59 && sixtyResult.summary.stale === 1,
    "A stale footnote within a chunk must not block the other 59"
  );

  const fatalChunkAdapter = new ChunkedBatchAdapter(undefined, 1);
  const fatalChunkResult = await runWriteBackBatch(sixtyPlan, {
    items: sixtyItems,
    footnotes: loadFootnotes,
    adapter: fatalChunkAdapter,
    chunkSize: 30,
  });
  assert(fatalChunkResult.status === "FAILED", "A fatal chunk must fail the global batch");
  assert(
    fatalChunkResult.summary.applied === 30 && fatalChunkResult.summary.failed === 30,
    "Only confirmed actions before the fatal chunk may be reported as applied"
  );

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const repeatedItems = loadItems(50).map((reviewItem) => ({
      ...reviewItem,
      reviewItemId: `${reviewItem.reviewItemId}-run-${iteration}`,
    }));
    const repeatedAdapter = new ChunkedBatchAdapter();
    await runWriteBackBatch(createWriteBackPlan({ mode: "CORRECTION", items: repeatedItems }), {
      items: repeatedItems,
      footnotes: loadFootnotes,
      adapter: repeatedAdapter,
    });
    assert(
      repeatedAdapter.activeRuns === 0 &&
        repeatedAdapter.retainedSnapshots === 0 &&
        getBatchRuntimeDiagnostics().activeRuns === 0,
      `Repeated run ${iteration + 1} must release all synthetic host resources`
    );
  }

  console.log(
    `POC 15.1 footnote plan/chunking/revalidation/fatal-cleanup tests passed; 1,200-item plan: ${durationMs.toFixed(1)} ms; synthetic analysis-1000=${analysisResult.performance.totalDurationMs.toFixed(1)}ms/0run; ${matrixMeasurements.join(", ")}.`
  );
}

void run();
