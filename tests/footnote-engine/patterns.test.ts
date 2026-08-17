import { analyzeFootnotes, isRangeProtected } from "../../src/footnote-engine/engine";
import { findPlainTextUrls } from "../../src/footnote-engine/patterns";
import type { AnalysisProtectedRange } from "../../src/footnote-engine/types";
import type { FootnoteSnapshot, ProtectedRange } from "../../src/taskpane/taskpane";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertUrls(text: string, expectedUrls: string[]): void {
  const matches = findPlainTextUrls(text);
  assert(matches.length === expectedUrls.length, `Unexpected URL count for: ${text}`);

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    assert(match.text === expectedUrls[index], `Unexpected URL text for: ${text}`);
    assert(match.text === text.slice(match.start, match.end), `Invalid offsets for: ${text}`);
  }
}

function createSnapshot(
  contentText: string,
  protectedRanges: ProtectedRange[] = []
): FootnoteSnapshot {
  return {
    id: "test-footnote",
    ordinal: 1,
    contentText,
    originalTextHash: "test-hash",
    protectedRanges,
  } as FootnoteSnapshot;
}

function runPatternTests(): void {
  assertUrls("https://example.com", ["https://example.com"]);
  assertUrls("http://example.com/test", ["http://example.com/test"]);
  assertUrls("www.example.de/test", ["www.example.de/test"]);
  assertUrls("Siehe https://example.com/test.", ["https://example.com/test"]);
  assertUrls("Siehe https://example.com/test;", ["https://example.com/test"]);
  assertUrls("(https://example.com/test)", ["https://example.com/test"]);
  assertUrls("https://example.com/a_(b)", ["https://example.com/a_(b)"]);
  assertUrls("https://example.com/test?x=1&y=2", ["https://example.com/test?x=1&y=2"]);
  assertUrls("https://example.com/page#section", ["https://example.com/page#section"]);
  assertUrls("https://example.com/a%20b", ["https://example.com/a%20b"]);
  assertUrls("www.example.de", ["www.example.de"]);
  assertUrls("example.de", []);
  assertUrls("BGH NJW 2024, 123.", []);
  assertUrls("name@example.com", []);
  assertUrls("https://one.example/path und www.two.example/test", [
    "https://one.example/path",
    "www.two.example/test",
  ]);
  assertUrls(
    "https://www.youtube.com/howyoutubeworks/creator-economy/#:~:text=Creator%20economy",
    ["https://www.youtube.com/howyoutubeworks/creator-economy/#:~:text=Creator%20economy"]
  );
  assertUrls(
    "https://support.tiktok.com/de/business-and-creator/creator-rewards-program#4",
    ["https://support.tiktok.com/de/business-and-creator/creator-rewards-program#4"]
  );
  assertUrls("https://creators.instagram.com/earn-money/branded-content?locale=de_DE", [
    "https://creators.instagram.com/earn-money/branded-content?locale=de_DE",
  ]);
}

function runProtectionTests(): void {
  const url = "https://example.com/test";
  const result = analyzeFootnotes([
    createSnapshot(url, [{ type: "hyperlink", start: 0, end: url.length }]),
  ]);
  const analysis = result.footnoteAnalyses[0];

  assert(result.findings.length === 1, "The missing final period must create exactly one finding");
  assert(result.findings[0].ruleId === "FINAL_PERIOD", "URL detection must not create a finding");
  assert(result.plainTextUrlCount === 0, "Reader-covered URL must not be counted as plain text");
  assert(analysis.engineProtectedRanges.length === 0, "Reader-covered URL must be deduplicated");
  assert(analysis.protectedRanges.length === 1, "Reader protection must remain available");
  assert(analysis.protectedRanges[0].source === "reader", "Reader protection must take priority");

  const partiallyCovered = analyzeFootnotes([
    createSnapshot(url, [{ type: "hyperlink", start: 0, end: 8 }]),
  ]).footnoteAnalyses[0];
  assert(
    partiallyCovered.engineProtectedRanges.length === 1,
    "Partially covered URLs must retain conservative engine protection"
  );
  assert(
    partiallyCovered.protectedRanges.length === 2,
    "Partial overlap must retain both source ranges"
  );

  const ranges: AnalysisProtectedRange[] = [
    { source: "engine", type: "plainTextUrl", start: 5, end: 15 },
  ];
  assert(isRangeProtected(0, 6, ranges), "Intersecting range must be protected");
  assert(isRangeProtected(6, 8, ranges), "Contained range must be protected");
  assert(isRangeProtected(10, 10, ranges), "Contained position must be protected");
  assert(!isRangeProtected(0, 5, ranges), "Adjacent range must not be protected");
  assert(!isRangeProtected(15, 15, ranges), "End position must be outside half-open range");
}

runPatternTests();
runProtectionTests();
