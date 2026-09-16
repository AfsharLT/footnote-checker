import { readFileSync } from "node:fs";
import { createDefaultCitationStyleProfile } from "../../src/citation-settings/defaults";
import { analyzeFootnotes } from "../../src/footnote-engine/engine";
import type { Finding } from "../../src/footnote-engine/types";
import { canMarkManuallyChecked, runReviewEngine, setReviewStatus } from "../../src/review-engine";
import {
  citationPreviewForFinding,
  DEFAULT_REVIEW_FILTERS,
  filterReviewItems,
  prepareReviewDisplay,
} from "../../src/taskpane/review-ui";
import { hashFootnoteContentText, type FootnoteSnapshot } from "../../src/taskpane/taskpane";
import {
  buildWriteBackReportRows,
  canApplySingleReviewItem,
  createWriteBackPlan,
} from "../../src/write-back-engine";

interface CorpusFootnote {
  ordinal: number;
  contentText: string;
  paragraphs: FootnoteSnapshot["paragraphs"];
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const corpus = JSON.parse(
  readFileSync("tests/fixtures/citation-regression-corpus/v1/footnotes.json", "utf8")
) as CorpusFootnote[];

function snapshot(ordinal: number): FootnoteSnapshot {
  const fixture = corpus[ordinal - 1];
  return {
    id: `citation-review-fn-${ordinal}`,
    ordinal,
    contentText: fixture.contentText,
    originalTextHash: hashFootnoteContentText(fixture.contentText),
    paragraphs: fixture.paragraphs,
    protectedRanges: [],
    formattingRuns: [],
  } as FootnoteSnapshot;
}

function inlineSnapshot(contentText: string): FootnoteSnapshot {
  return {
    id: "configured-separator-footnote",
    ordinal: 1,
    contentText,
    originalTextHash: hashFootnoteContentText(contentText),
    paragraphs: [{ index: 0, start: 0, end: contentText.length }],
    protectedRanges: [],
    formattingRuns: [],
  } as FootnoteSnapshot;
}

const fn1 = snapshot(1);
const fn1Engine = analyzeFootnotes([fn1]);
const fn1Items = fn1Engine.parseResults[0].sequences?.flatMap((sequence) => sequence.items) ?? [];
assert(fn1Items.length === 20, "Footnote 1 must expose exactly 20 source items");

const alternativeProfile = createDefaultCitationStyleProfile();
alternativeProfile.global.citationSeparator = " | ";
const configuredSeparatorResult = analyzeFootnotes(
  [inlineSnapshot("BGH NJW 2024, 1 | BGH NJW 2024, 2")],
  { profile: alternativeProfile }
);
assert(
  configuredSeparatorResult.parseResults[0].sequences?.flatMap((sequence) => sequence.items)
    .length === 2,
  "The active citation profile separator must reach the production segmenter"
);

const unresolved = fn1Engine.findings.filter(
  (finding) => finding.ruleId === "CITATION_OTHER_REVIEW"
);
assert(unresolved.length > 1, "Distinct unresolved sources need distinct review findings");
assert(
  new Set(unresolved.map((finding) => finding.citationItemId)).size === unresolved.length,
  "Every unresolved-source finding needs its own CitationItem identity"
);
for (const finding of unresolved) {
  const preview = citationPreviewForFinding(finding, fn1Engine);
  assert(preview !== undefined, "Every item-bound finding needs an exact source preview");
  assert(
    preview === fn1.contentText.slice(finding.citationStart, finding.citationEnd),
    "Source previews must resolve through original offsets"
  );
  assert(
    !preview.startsWith("Zu § 32:") && !preview.startsWith("Zum rechtfertigenden Notstand:"),
    "Source previews must exclude thematic group labels"
  );
}

const corpusSnapshots = corpus.map((fixture) => snapshot(fixture.ordinal));
const corpusEngine = analyzeFootnotes(corpusSnapshots);
assert(
  corpusEngine.findings.every(
    (finding) => !finding.citationSegmentId || finding.citationItemId !== undefined
  ),
  "Every citation-bound corpus finding must resolve to an exact CitationItem"
);
const corpusGenericFindings = corpusEngine.findings.filter(
  (finding) => finding.ruleId === "CITATION_OTHER_REVIEW" && finding.citationItemId
);
assert(
  new Set(
    corpusGenericFindings.map(
      (finding) => `${finding.footnoteId}:${finding.ruleId}:${finding.citationItemId}`
    )
  ).size === corpusGenericFindings.length,
  "One citation item must not receive duplicate generic review cards"
);
const corpusReview = runReviewEngine({
  findings: corpusEngine.findings,
  footnotes: corpusSnapshots,
  mode: "REVIEW",
});
const corpusDisplay = prepareReviewDisplay(
  corpusReview.items,
  corpusSnapshots,
  DEFAULT_REVIEW_FILTERS,
  corpusEngine.parseResults
);
assert(
  corpusDisplay.groups.length === 80 &&
    corpusDisplay.groups[79].footnote.ordinal === 80,
  "All 80 real corpus footnotes, including footnote 80, must be accounted for in the UI model"
);
const silvaItem = corpusEngine.parseResults[64].sequences
  ?.flatMap((sequence) => sequence.items)
  .find((item) => item.rawText.startsWith("Silva Sánchez,"));
assert(
  silvaItem?.rawText ===
    "Silva Sánchez, Jahrbuch für Recht und Ethik 2005, S. 681 ff",
  "The Silva Sánchez source model must exclude post-colon explanatory prose"
);
const pawlikItem = corpusEngine.parseResults[65].sequences
  ?.flatMap((sequence) => sequence.items)
  .find((item) => item.rawText.startsWith("Pawlik,"));
const pawlikFinding = corpusEngine.findings.find(
  (finding) => finding.footnoteOrdinal === 66 && finding.citationItemId === pawlikItem?.id
);
assert(
  pawlikItem?.rawText === "Pawlik, Jahrbuch für Recht und Ethik 2003, 287, 310" &&
    pawlikFinding !== undefined &&
    citationPreviewForFinding(pawlikFinding, corpusEngine) === pawlikItem.rawText,
  "The Pawlik finding card must resolve the exact pre-colon CitationItem preview"
);

const fn2 = snapshot(2);
const fn2Engine = analyzeFootnotes([fn2]);
const bernsmann = fn2Engine.parseResults[0].sequences
  ?.flatMap((sequence) => sequence.items)
  .find((item) => item.rawText.startsWith("Bernsmann,"));
assert(bernsmann !== undefined, "Bernsmann must be independently addressable in footnote 2");
assert(
  bernsmann.rawText === "Bernsmann, Entschuldigung durch Notstand, 1989, S. 96" &&
    bernsmann.start === 25 &&
    bernsmann.end === 78,
  "The Bernsmann source preview must exclude ‘Mit diesem Befund auch:’"
);

const manualFinding = unresolved[0];
const initialReview = runReviewEngine({
  findings: [manualFinding],
  footnotes: [fn1],
  mode: "REVIEW",
});
const manualItem = initialReview.items[0];
assert(canMarkManuallyChecked(manualItem), "A manual-only source finding must be checkable");
const manuallyCheckedState = setReviewStatus({}, manualItem, "MANUALLY_CHECKED");
const checkedReview = runReviewEngine({
  findings: [manualFinding],
  footnotes: [fn1],
  mode: "REVIEW",
  decisionState: manuallyCheckedState,
});
assert(
  checkedReview.items[0].decision.effectiveStatus === "MANUALLY_CHECKED" &&
    checkedReview.summary.byStatus.manuallyChecked === 1 &&
    checkedReview.summary.byStatus.open === 0,
  "MANUALLY_CHECKED must resolve the review item as a distinct auditable status"
);
assert(
  filterReviewItems(checkedReview.items, [fn1], {
    ...DEFAULT_REVIEW_FILTERS,
    status: "MANUALLY_CHECKED",
  }).length === 1,
  "The status filter must expose manually checked review items"
);

const plan = createWriteBackPlan({ mode: "REVIEW", items: checkedReview.items });
assert(
  plan.totals.eligible === 0 &&
    plan.totals.manuallyChecked === 1 &&
    plan.items[0].exclusionReason === "USER_MANUALLY_CHECKED" &&
    !canApplySingleReviewItem(checkedReview.items[0]),
  "MANUALLY_CHECKED must never create a write-back mutation"
);
const report = buildWriteBackReportRows({
  items: checkedReview.items,
  footnotes: [fn1],
  analysisTimestamp: "2026-09-15T00:00:00.000Z",
  plan,
  engineResult: fn1Engine,
});
assert(
  report[0].ReviewStatus === "MANUALLY_CHECKED" &&
    report[0].BatchExclusionReason === "USER_MANUALLY_CHECKED",
  "CSV/report data must preserve the manually checked decision"
);

const executableFinding: Finding = {
  ...manualFinding,
  findingId: "executable-finding",
  suggestedText: "BGHSt 5, 245, 248",
};
const executableReview = runReviewEngine({
  findings: [executableFinding],
  footnotes: [fn1],
  mode: "REVIEW",
});
assert(
  !canMarkManuallyChecked(executableReview.items[0]) &&
    setReviewStatus({}, executableReview.items[0], "MANUALLY_CHECKED")[
      executableFinding.findingId
    ] === undefined,
  "Executable findings must use accept/reject/defer instead of MANUALLY_CHECKED"
);

const footnoteLevelFinding = fn1Engine.findings.find(
  (finding) => finding.citationItemId === undefined
);
if (footnoteLevelFinding) {
  assert(
    citationPreviewForFinding(footnoteLevelFinding, fn1Engine) === undefined,
    "Footnote-level findings must not invent source previews"
  );
}

const workspaceSource = readFileSync("src/taskpane/components/ReviewWorkspace.tsx", "utf8");
const workspaceStyles = readFileSync("src/taskpane/styles.css", "utf8");
assert(
  workspaceSource.includes("citationPreviewForFinding") &&
    workspaceSource.includes("Manuell geprüft") &&
    workspaceSource.includes('onSetStatus(item, "MANUALLY_CHECKED")'),
  "Review cards must render exact source previews and the manual-check action"
);
assert(
  workspaceStyles.includes(".fc-source-preview") &&
    workspaceStyles.includes(".fc-review-action") &&
    workspaceStyles.includes("min-height: 30px"),
  "Source previews and compact accessible action buttons need explicit styling"
);
