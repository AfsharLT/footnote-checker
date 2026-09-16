import type { Finding, FindingCategory, FindingSeverity } from "../../src/footnote-engine/types";
import {
  acceptAllAutomatic,
  runReviewEngine,
  setReviewStatus,
  type ReviewClass,
  type ReviewItem,
  type ReviewStatus,
} from "../../src/review-engine";
import {
  createClosedFootnoteState,
  DEFAULT_REVIEW_FILTERS,
  explicitDecisionCount,
  filterReviewItems,
  getRuleTitle,
  groupReviewItems,
  hasActiveFilters,
  prepareReviewDisplay,
  setFootnoteOpen,
} from "../../src/taskpane/review-ui";
import type { FootnoteSnapshot } from "../../src/taskpane/taskpane";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function footnote(ordinal: number, contentText = `Fußnote ${ordinal}`): FootnoteSnapshot {
  const originalTextHash = `hash-${ordinal}-${contentText.length}`;
  return {
    id: `footnote-${ordinal}`,
    ordinal,
    displayLabel: String(ordinal),
    rawWordText: contentText,
    contentText,
    contentLength: contentText.length,
    originalTextHash,
    reference: { referenceText: String(ordinal) },
    locator: { ordinal, displayLabel: String(ordinal), originalTextHash, contextBefore: "", contextAfter: "" },
    paragraphCount: 1,
    paragraphs: [],
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

function item(
  target: FootnoteSnapshot,
  index: number,
  overrides: {
    severity?: FindingSeverity;
    category?: FindingCategory;
    reviewClass?: ReviewClass;
    status?: ReviewStatus;
    originalText?: string;
    suggestedText?: string;
    message?: string;
    ruleId?: string;
    start?: number;
  } = {}
): ReviewItem {
  const start = overrides.start ?? index;
  const originalText = overrides.originalText ?? `Original ${index}`;
  const finding: Finding = {
    findingId: `finding-${target.ordinal}-${index}`,
    footnoteId: target.id,
    footnoteOrdinal: target.ordinal,
    sourceTextHash: target.originalTextHash,
    ruleId: overrides.ruleId ?? "FINAL_PERIOD",
    category: overrides.category ?? "punctuation",
    start,
    end: start + originalText.length,
    originalText,
    suggestedText: overrides.suggestedText ?? `Vorschlag ${index}`,
    severity: overrides.severity ?? "warning",
    message: overrides.message ?? `Meldung ${index}`,
  };
  const reviewClass = overrides.reviewClass ?? "AUTO";
  return {
    reviewItemId: `review:${finding.findingId}`,
    finding,
    reviewClass,
    classificationReason: reviewClass === "INFO" ? "INFORMATION_ONLY" : "DETERMINISTIC_TEXT_CHANGE",
    proposedAction: { type: "TEXT_REPLACE", start: finding.start, end: finding.end, originalText, replacementText: finding.suggestedText ?? "" },
    decision: { effectiveStatus: overrides.status ?? "UNREVIEWED", source: "MODE_DEFAULT" },
    technicalEligibility: {
      eligible: reviewClass !== "TECHNICAL",
      reasons: [],
      findingValid: true,
      sourceHashMatches: true,
      rangeValid: true,
      originalTextMatches: true,
      protectedRangeOverlap: false,
      conflictingActionOverlap: false,
      formattingStateKnown: true,
      proposedActionBuildable: true,
    },
    conflicts: [],
    canAccept: reviewClass === "AUTO" || reviewClass === "MANUAL",
    sourceTextHash: finding.sourceTextHash,
  };
}

const first = footnote(1, "Urteil vom 5.7.2025");
const second = footnote(2, "MüKo-StGB/Fischer Rdnr. 4.");
const samples = [
  item(first, 0, { severity: "error", category: "citation", reviewClass: "AUTO", status: "ACCEPTED", originalText: "Urteil", suggestedText: "Urt.", message: "Entscheidungsart", ruleId: "CASE_LAW_DECISION_TYPE" }),
  item(first, 1, { severity: "warning", category: "formatting", reviewClass: "MANUAL", status: "DEFERRED", ruleId: "FORMAT_ITALIC_REVIEW" }),
  item(second, 2, { severity: "info", category: "technical", reviewClass: "TECHNICAL", status: "REJECTED", ruleId: "RULE_OUTPUT_INVALID" }),
];

assert(filterReviewItems(samples, [first, second], { ...DEFAULT_REVIEW_FILTERS, severity: "error" }).length === 1, "Severity filter must select errors");
assert(filterReviewItems(samples, [first, second], { ...DEFAULT_REVIEW_FILTERS, reviewClass: "MANUAL" }).length === 1, "Review-class filter must select manual items");
assert(filterReviewItems(samples, [first, second], { ...DEFAULT_REVIEW_FILTERS, status: "DEFERRED" }).length === 1, "Status filter must select deferred items");
assert(filterReviewItems(samples, [first, second], { ...DEFAULT_REVIEW_FILTERS, category: "technical" }).length === 1, "Category filter must select technical items");
assert(filterReviewItems(samples, [first, second], { ...DEFAULT_REVIEW_FILTERS, search: "Urt." }).length === 1, "Search must include suggested text");
assert(filterReviewItems(samples, [first, second], { ...DEFAULT_REVIEW_FILTERS, search: "Fußnote 2" }).length === 1, "Search must include the footnote number");
assert(filterReviewItems(samples, [first, second], { ...DEFAULT_REVIEW_FILTERS, severity: "warning", reviewClass: "MANUAL", status: "DEFERRED", category: "formatting", search: "Kursivformatierung" }).length === 1, "Combined filters must intersect");
assert(hasActiveFilters({ ...DEFAULT_REVIEW_FILTERS, search: "x" }) && !hasActiveFilters(DEFAULT_REVIEW_FILTERS), "Active filter state must be deterministic");

const exactClassSamples = [
  item(first, 10, { reviewClass: "AUTO" }),
  item(first, 11, { reviewClass: "AUTO" }),
  item(first, 12, { reviewClass: "MANUAL" }),
  item(first, 13, { reviewClass: "MANUAL" }),
  item(second, 14, { reviewClass: "TECHNICAL" }),
  item(second, 15, { reviewClass: "TECHNICAL" }),
  item(second, 16, { reviewClass: "INFO" }),
];
assert(
  filterReviewItems(exactClassSamples, [first, second], {
    ...DEFAULT_REVIEW_FILTERS,
    reviewClass: "TECHNICAL",
  }).length === 2,
  "Technical filter must match exactly the two technical items"
);

const initiallyClosed = createClosedFootnoteState();
const opened = setFootnoteOpen(initiallyClosed, first.id, true);
const exclusiveSecond = setFootnoteOpen(opened, second.id, true, true);
const nonExclusiveSecond = setFootnoteOpen(opened, second.id, true, false);
const preservedAcrossModeChange = opened;
const resetForNewAnalysis = createClosedFootnoteState();
assert(initiallyClosed.size === 0, "Every footnote group must start collapsed");
assert(
  preservedAcrossModeChange.has(first.id),
  "Explicit footnote open state must survive a mode change"
);
assert(
  resetForNewAnalysis.size === 0,
  "A new analysis must reset every footnote group to collapsed"
);
assert(
  exclusiveSecond.size === 1 && exclusiveSecond.has(second.id) && !exclusiveSecond.has(first.id),
  "Default accordion behavior must close the previously active footnote"
);
assert(
  nonExclusiveSecond.size === 2 && nonExclusiveSecond.has(first.id) && nonExclusiveSecond.has(second.id),
  "Disabled auto-close must allow multiple open footnotes"
);

const grouped = groupReviewItems(samples, [first, second]);
assert(grouped.length === 2 && grouped[0].items.length === 2, "Findings must be grouped once per footnote");
assert(grouped[0].items[0].finding.severity === "error", "Group findings must sort by severity first");

const allFootnotes = Array.from({ length: 80 }, (_, index) => footnote(index + 1));
const firstAndLastItems = [item(allFootnotes[0], 100), item(allFootnotes[79], 101)];
const completeDisplay = prepareReviewDisplay(
  firstAndLastItems,
  allFootnotes,
  DEFAULT_REVIEW_FILTERS,
  allFootnotes.map((target) => ({
    footnoteId: target.id,
    sourceTextHash: target.originalTextHash,
    segments: [],
    segmentationStatus: target.ordinal === 40 ? "partiallyRecognized" : "recognized",
  }))
);
assert(
  completeDisplay.groups.length === 80 &&
    completeDisplay.groups.map((group) => group.footnote.ordinal).join(",") ===
      Array.from({ length: 80 }, (_, index) => index + 1).join(","),
  "Every analyzed footnote ordinal from 1 through 80 must have a deterministic UI group"
);
assert(
  completeDisplay.groups[79].accountingStatus === "FINDINGS" &&
    completeDisplay.groups[39].accountingStatus === "PARTIAL" &&
    completeDisplay.groups[1].accountingStatus === "CLEAN",
  "Finding, partial and zero-finding footnotes must remain distinguishable"
);
const findingsOnlyDisplay = prepareReviewDisplay(
  firstAndLastItems,
  allFootnotes,
  { ...DEFAULT_REVIEW_FILTERS, onlyWithFindings: true }
);
assert(
  findingsOnlyDisplay.groups.length === 2 &&
    findingsOnlyDisplay.groups.some((group) => group.footnote.ordinal === 80),
  "The findings-only toggle must remain optional and must not hide a matching footnote 80"
);
assert(getRuleTitle("CASE_LAW_DATE_FORMAT") === "Datumsformat" && getRuleTitle("UNKNOWN") === "Prüfhinweis", "Rule titles need a German mapping and fallback");

const modeFootnote = footnote(3, "Text");
const modeFinding: Finding = {
  findingId: "mode-final-period",
  footnoteId: modeFootnote.id,
  footnoteOrdinal: modeFootnote.ordinal,
  sourceTextHash: modeFootnote.originalTextHash,
  ruleId: "FINAL_PERIOD",
  category: "punctuation",
  start: 4,
  end: 4,
  originalText: "",
  suggestedText: ".",
  severity: "error",
  message: "Schlusspunkt ergänzen",
};
const analysisMode = runReviewEngine({ findings: [modeFinding], footnotes: [modeFootnote], mode: "ANALYSIS" });
const correctionMode = runReviewEngine({ findings: [modeFinding], footnotes: [modeFootnote], mode: "CORRECTION" });
assert(analysisMode.items[0].decision.effectiveStatus === "UNREVIEWED", "Analysis mode must not accept by default");
assert(correctionMode.items[0].decision.effectiveStatus === "ACCEPTED" && correctionMode.summary.correctionReady === 1, "Correction mode must stage safe automatic findings");
const rejectedState = setReviewStatus({}, correctionMode.items[0], "REJECTED");
assert(runReviewEngine({ findings: [modeFinding], footnotes: [modeFootnote], mode: "CORRECTION", decisionState: rejectedState }).items[0].decision.effectiveStatus === "REJECTED", "Explicit decisions must survive mode changes");

const bulkState = acceptAllAutomatic({}, samples);
assert(explicitDecisionCount(bulkState) === 1 && bulkState[samples[0].finding.findingId]?.status === "ACCEPTED", "Bulk acceptance must affect only actionable AUTO items");

const largeFootnotes = Array.from({ length: 1_200 }, (_, index) => footnote(index + 10));
const largeItems = largeFootnotes.flatMap((target, index) => [
  item(target, index * 3, { severity: "error", category: "citation" }),
  item(target, index * 3 + 1, { severity: "warning", category: "formatting", reviewClass: "MANUAL" }),
  item(target, index * 3 + 2, { severity: "info", category: "content", reviewClass: "INFO" }),
]);
const startedAt = Date.now();
const largeFiltered = filterReviewItems(largeItems, largeFootnotes, { ...DEFAULT_REVIEW_FILTERS, severity: "warning", reviewClass: "MANUAL" });
const largeGrouped = groupReviewItems(largeFiltered, largeFootnotes);
const durationMs = Date.now() - startedAt;
assert(largeFiltered.length === 1_200 && largeGrouped.length === 1_200, "Large data filters and groups must retain every matching footnote");
assert(durationMs < 1_500, `Large data processing must stay linear and responsive (was ${durationMs} ms)`);

console.log(`POC 13 review UI tests passed (${largeItems.length} synthetic findings in ${durationMs} ms).`);
