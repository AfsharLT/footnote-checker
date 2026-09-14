import { analyzeFootnotes } from "../../src/footnote-engine/engine";
import { runReviewEngine } from "../../src/review-engine";
import {
  CONSERVATIVE_HYPERLINK_USER_MESSAGE,
  createReaderNotice,
  hashFootnoteContentText,
  isolateOptionalReaderFeature,
  mergePrimaryHyperlinks,
  PARTIAL_HYPERLINK_USER_MESSAGE,
  resolveHyperlinkFallback,
  type FootnoteReadWarning,
  type FootnoteSnapshot,
} from "../../src/taskpane/taskpane";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function snapshot(
  contentText: string,
  ordinal: number,
  hyperlinks: FootnoteSnapshot["hyperlinks"],
  warnings: FootnoteReadWarning[] = []
): FootnoteSnapshot {
  const originalTextHash = hashFootnoteContentText(contentText);
  return {
    id: `hyperlink-${ordinal}-${originalTextHash}`,
    ordinal,
    displayLabel: String(ordinal),
    rawWordText: contentText,
    contentText,
    contentLength: contentText.length,
    originalTextHash,
    reference: { referenceText: String(ordinal) },
    locator: {
      ordinal,
      displayLabel: String(ordinal),
      originalTextHash,
      contextBefore: "",
      contextAfter: "",
    },
    paragraphCount: 1,
    paragraphs: [{ index: 0, start: 0, end: contentText.length }],
    hyperlinks,
    fields: [],
    bookmarks: [],
    contentControls: [],
    protectedRanges: hyperlinks.flatMap((hyperlink) =>
      hyperlink.start !== undefined && hyperlink.end !== undefined
        ? [{ type: "hyperlink" as const, start: hyperlink.start, end: hyperlink.end }]
        : []
    ),
    readStatus: warnings.length > 0 ? "partial" : "complete",
    readWarnings: warnings,
    formattingRuns: [],
    paragraphFormats: [],
  };
}

async function run(): Promise<void> {
  const linkedText = "Siehe Quelle.";
  const ooxmlFallback = resolveHyperlinkFallback(linkedText, [
    { start: 6, end: 12, target: "https://example.test/source" },
  ]);
  assert(ooxmlFallback.length === 1, "OOXML must create one exact hyperlink fallback");
  assert(
    ooxmlFallback[0].source === "ooxml" &&
      ooxmlFallback[0].displayText === "Quelle" &&
      ooxmlFallback[0].target === "https://example.test/source",
    "OOXML fallback must retain exact range, display text, and relationship target"
  );

  const primary = mergePrimaryHyperlinks(linkedText, ooxmlFallback, [
    { displayText: "Quelle", target: "https://example.test/primary" },
  ]);
  assert(
    primary.length === 1 &&
      primary[0].source === "wordApi" &&
      primary[0].start === 6 &&
      primary[0].end === 12 &&
      primary[0].target === "https://example.test/primary",
    "Working Range.hyperlinks data must remain the preferred normal path"
  );
  const mismatchedPrimary = mergePrimaryHyperlinks(linkedText, ooxmlFallback, [
    { displayText: "Anderer Text", target: "https://example.test/changed" },
  ]);
  assert(
    mismatchedPrimary.some(
      (hyperlink) => hyperlink.start === 6 && hyperlink.end === 12 && hyperlink.source === "ooxml"
    ),
    "Ambiguous primary metadata must never discard a safe OOXML protection range"
  );

  const featureFailure = await isolateOptionalReaderFeature(async () => {
    const hostRange = {
      get hyperlinks(): never {
        const error = new Error("Error code: 0x80004001");
        error.name = "NotImplemented";
        throw error;
      },
    };
    return hostRange.hyperlinks;
  });
  assert(
    featureFailure.status === "unavailable",
    "A synchronous optional hyperlink property failure must be isolated"
  );

  const textUrl = "Abrufbar unter https://example.test/path?q=1.";
  const textFallback = resolveHyperlinkFallback(textUrl, []);
  assert(
    textFallback.length === 1 &&
      textFallback[0].source === "text" &&
      textFallback[0].displayText === "https://example.test/path?q=1",
    "Text fallback must recognize and safely trim an exact http(s) URL"
  );

  const wwwFallback = resolveHyperlinkFallback("Siehe www.example.test/quelle.", []);
  assert(
    wwwFallback.length === 1 && wwwFallback[0].displayText === "www.example.test/quelle",
    "Text fallback must recognize www. URLs"
  );

  const ambiguousWarnings: FootnoteReadWarning[] = [];
  const ambiguousFallback = resolveHyperlinkFallback(
    "Unvollständiger Link: https://",
    [],
    ambiguousWarnings
  );
  assert(
    ambiguousFallback.length === 1 &&
      ambiguousFallback[0].source === "conservative" &&
      ambiguousFallback[0].displayText === "https://",
    "An ambiguous possible URL must retain a conservative protected span"
  );
  assert(
    ambiguousWarnings.some(
      (warning) =>
        warning.code === "HYPERLINK_RANGE_CONSERVATIVE" &&
        warning.message === CONSERVATIVE_HYPERLINK_USER_MESSAGE
    ),
    "Conservative URL protection must create the plain-language INFO notice"
  );

  const unresolvedWarnings: FootnoteReadWarning[] = [];
  resolveHyperlinkFallback("Verlinkte Quelle", [{ target: "https://example.test" }], unresolvedWarnings);
  assert(
    unresolvedWarnings.some(
      (warning) =>
        warning.code === "HYPERLINK_METADATA_PARTIAL" &&
        warning.message === PARTIAL_HYPERLINK_USER_MESSAGE
    ),
    "An unmappable OOXML hyperlink must be marked partial without aborting the footnote"
  );

  const batch = Array.from({ length: 1_000 }, (_, index) => {
    const contentText =
      index === 166
        ? "Quelle https://example.test/beta"
        : `MüKo-StGB/Fischer Rdnr. ${index + 1}.`;
    return snapshot(contentText, index + 1, resolveHyperlinkFallback(contentText, []));
  });
  assert(batch.length === 1_000, "All snapshots must remain available after feature degradation");
  const batchAnalysis = analyzeFootnotes(batch);
  assert(batchAnalysis.analyzedFootnotes === 1_000, "All 1000 footnotes must still be analyzed");

  const protectedUrlText = "https://example.test/path..";
  const protectedUrl = snapshot(
    protectedUrlText,
    1,
    resolveHyperlinkFallback(protectedUrlText, [
      { start: 0, end: protectedUrlText.length, target: protectedUrlText },
    ])
  );
  assert(
    !analyzeFootnotes([protectedUrl]).findings.some((finding) => finding.ruleId === "FINAL_PERIOD"),
    "FINAL_PERIOD must not rewrite punctuation inside a protected hyperlink range"
  );

  const unrelated = snapshot(
    "MüKo-StGB/Fischer Rdnr. 4. https://example.test/source",
    2,
    resolveHyperlinkFallback("MüKo-StGB/Fischer Rdnr. 4. https://example.test/source", [])
  );
  const unrelatedAnalysis = analyzeFootnotes([unrelated]);
  const analysisReview = runReviewEngine({
    findings: unrelatedAnalysis.findings,
    footnotes: [unrelated],
    mode: "ANALYSIS",
  });
  const correctionReview = runReviewEngine({
    findings: unrelatedAnalysis.findings,
    footnotes: [unrelated],
    mode: "CORRECTION",
  });
  assert(
    analysisReview.items.some((item) => item.finding.ruleId === "COMMENTARY_WORK_NAME") &&
      correctionReview.items.some((item) => item.finding.ruleId === "COMMENTARY_WORK_NAME"),
    "Review and Correction modes must retain unrelated findings"
  );

  const ambiguousSnapshot = snapshot(
    "Unvollständiger Link: https://",
    3,
    ambiguousFallback,
    ambiguousWarnings
  );
  const notice = createReaderNotice({
    footnotes: [ambiguousSnapshot],
    documentFormatting: {},
    readerMetrics: {
      durationMs: 1,
      footnoteCount: 1,
      completeCount: 0,
      partialCount: 1,
      failedCount: 0,
      syncCount: 1,
    },
  });
  assert(notice === CONSERVATIVE_HYPERLINK_USER_MESSAGE, "The user must receive the INFO notice");
  assert(
    !/(RichApi|Office\.js|Range\.hyperlinks|NotImplemented)/i.test(notice),
    "User-facing warnings must not expose implementation jargon"
  );
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
