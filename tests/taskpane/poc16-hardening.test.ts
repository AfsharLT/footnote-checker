import { readFileSync } from "node:fs";
import { analyzeFootnotes } from "../../src/footnote-engine/engine";
import { runReviewEngine } from "../../src/review-engine";
import {
  detectHostCapabilities,
  HOST_REQUIREMENT_SETS,
  unsupportedCapabilityTechnicalDetails,
} from "../../src/taskpane/host-capabilities";
import {
  hostWorkStateForBatchPhase,
  isHostWorkIdle,
} from "../../src/taskpane/performance";
import {
  deduplicateMessages,
  DEFAULT_REVIEW_FILTERS,
  prepareReviewDisplay,
} from "../../src/taskpane/review-ui";
import {
  hashFootnoteContentText,
  type FootnoteSnapshot,
} from "../../src/taskpane/taskpane";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function snapshot(index: number): FootnoteSnapshot {
  const contentText =
    index % 3 === 0
      ? `BGH, Urteil vom 5.7.2025 – X ZR ${index}/25.`
      : index % 3 === 1
        ? `MüKo-StGB/Fischer § 185 Rdnr. ${index + 1}.`
        : `Palandt/Reiter § 464 BGB Rn. ${index + 1}.`;
  const hash = hashFootnoteContentText(contentText);
  return {
    id: `poc16-${index}-${hash}`,
    ordinal: index + 1,
    displayLabel: String(index + 1),
    rawWordText: contentText,
    contentText,
    contentLength: contentText.length,
    originalTextHash: hash,
    reference: { referenceText: String(index + 1) },
    locator: {
      ordinal: index + 1,
      displayLabel: String(index + 1),
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

const allCapabilities = detectHostCapabilities({
  host: "Word",
  platform: "Mac",
  version: "16.99",
  isSetSupported: () => true,
});
assert(allCapabilities.supported, "WordApi 1.5-capable Word must be supported");
assert(allCapabilities.platform === "Mac", "Platform must come from Office diagnostics");
assert(
  Object.keys(allCapabilities.requirementSets).length === HOST_REQUIREMENT_SETS.length,
  "Every relevant requirement set must be reported"
);

const missingWordApi = detectHostCapabilities({
  host: "Word",
  platform: "PC",
  isSetSupported: (name, version) => !(name === "WordApi" && version === "1.5"),
});
assert(!missingWordApi.supported, "Missing required WordApi must block safely");
assert(
  missingWordApi.missingRequiredCapabilities.join() === "WordApi 1.5",
  "Only required missing capabilities may block the core reader"
);
assert(
  unsupportedCapabilityTechnicalDetails(missingWordApi).includes("Plattform: PC") &&
    unsupportedCapabilityTechnicalDetails(missingWordApi).includes("WordApi 1.5"),
  "Unsupported diagnostics must include platform and requirement set"
);

const detectorFailure = detectHostCapabilities({
  isSetSupported: () => {
    throw new Error("host unavailable");
  },
});
assert(!detectorFailure.supported, "Capability detection errors must fail closed without throwing");

assert(hostWorkStateForBatchPhase("PLANNING") === "WRITING", "Planning is host work");
assert(hostWorkStateForBatchPhase("WRITING") === "WRITING", "Writing remains host work");
assert(
  hostWorkStateForBatchPhase("FINALIZING") === "FINALIZING",
  "Finalization needs an explicit state"
);
assert(isHostWorkIdle("IDLE") && !isHostWorkIdle("FINALIZING"), "Only IDLE is fully finished");

assert(
  deduplicateMessages(" Gleiche Meldung ", "gleiche   meldung", "Zusatz").join("|") ===
    "Gleiche Meldung|Zusatz",
  "Whitespace- and case-normalized duplicate messages must render only once"
);

const performanceRows: string[] = [];
for (const count of [10, 100, 500, 1_200]) {
  const footnotes = Array.from({ length: count }, (_, index) => snapshot(index));
  const startedAt = performance.now();
  const analysis = analyzeFootnotes(footnotes);
  const review = runReviewEngine({ findings: analysis.findings, footnotes, mode: "ANALYSIS" });
  const prepared = prepareReviewDisplay(review.items, footnotes, DEFAULT_REVIEW_FILTERS);
  const totalDurationMs = performance.now() - startedAt;
  assert(analysis.analyzedFootnotes === count, `All ${count} footnotes must be analyzed`);
  assert(prepared.groups.length <= count, "Review grouping cannot create phantom footnotes");
  assert(totalDurationMs < 10_000, `${count}-footnote synthetic analysis must remain bounded`);
  performanceRows.push(
    `${count}=${totalDurationMs.toFixed(1)}ms(engine ${analysis.durationMs?.toFixed(1) ?? "–"}ms/ui ${prepared.durationMs.toFixed(1)}ms)`
  );
}

const repeatedFootnotes = Array.from({ length: 1_200 }, (_, index) => snapshot(index));
const repeatedRunRows: string[] = [];
let expectedRepeatedFindingCount: number | undefined;
for (let run = 1; run <= 5; run += 1) {
  const startedAt = performance.now();
  const analysis = analyzeFootnotes(repeatedFootnotes);
  const review = runReviewEngine({
    findings: analysis.findings,
    footnotes: repeatedFootnotes,
    mode: "ANALYSIS",
  });
  const prepared = prepareReviewDisplay(review.items, repeatedFootnotes, DEFAULT_REVIEW_FILTERS);
  const totalDurationMs = performance.now() - startedAt;
  expectedRepeatedFindingCount ??= analysis.findings.length;
  assert(
    analysis.findings.length === expectedRepeatedFindingCount,
    `Repeated run ${run} must not retain or lose findings`
  );
  assert(
    prepared.filteredItems.length === review.items.length,
    `Repeated run ${run} must not retain an earlier UI filter state`
  );
  assert(totalDurationMs < 10_000, `Repeated run ${run} must remain bounded`);
  repeatedRunRows.push(`${run}=${totalDurationMs.toFixed(1)}ms`);
}

const appSource = readFileSync("src/taskpane/components/App.tsx", "utf8");
const boundarySource = readFileSync(
  "src/taskpane/components/TaskpaneErrorBoundary.tsx",
  "utf8"
);
const adapterSource = readFileSync("src/write-back-engine/office-adapter.ts", "utf8");
const platformMatrix = readFileSync("docs/POC16_PLATFORM_TEST_MATRIX.md", "utf8");
const finalChecklist = readFileSync("docs/POC16_FINAL_TEST_CHECKLIST.md", "utf8");

assert(appSource.includes('addEventListener("pagehide"'), "App needs one best-effort unload hook");
assert(appSource.includes('removeEventListener("pagehide"'), "Unload hook must be removed");
assert(
  !appSource.includes("beforeDocumentCloseNotification") &&
    !appSource.includes("Word wird geschlossen"),
  "Word must not use the Excel-only close hook or a fake close spinner"
);
assert(
  boundarySource.includes("getDerivedStateFromError") &&
    boundarySource.includes('role="alert"') &&
    boundarySource.includes("Technische Details"),
  "Error boundary must prevent a white pane and keep stack details collapsed"
);
assert(
  adapterSource.includes("FORMAT_WRITE_VERIFICATION_FAILED") &&
    adapterSource.includes("Word konnte die gewünschte Formatierung nicht zuverlässig übernehmen"),
  "Format writes must not silently claim success when Word rejects/substitutes a value"
);
assert(
  platformMatrix.includes("Mac Result") && platformMatrix.includes("Windows Result"),
  "Platform matrix must contain separate Mac and Windows results"
);
assert(
  finalChecklist.includes("Mac Quick Test") && finalChecklist.includes("Windows Quick Test"),
  "Final checklist must keep both real-host runs explicit"
);

console.log(
  `POC 16 capability/state/dedup/error-boundary/performance checks passed: ${performanceRows.join(", ")}; repeated 1,200-footnote runs: ${repeatedRunRows.join(", ")}.`
);
