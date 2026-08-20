import { analyzeFootnotes } from "../../src/footnote-engine/engine";
import { describeTrailingCharacters } from "../../src/footnote-engine/rules/final-period";
import type { Finding } from "../../src/footnote-engine/types";
import type { FootnoteSnapshot, ProtectedRange } from "../../src/taskpane/taskpane";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createSnapshot(
  contentText: string,
  ordinal = 1,
  protectedRanges: ProtectedRange[] = []
): FootnoteSnapshot {
  return {
    id: `test-footnote-${ordinal}`,
    ordinal,
    contentText,
    originalTextHash: `test-hash-${ordinal}`,
    protectedRanges,
  } as FootnoteSnapshot;
}

function getFinalPeriodFindings(
  contentText: string,
  protectedRanges: ProtectedRange[] = []
): Finding[] {
  return analyzeFootnotes([createSnapshot(contentText, 1, protectedRanges)]).findings.filter(
    (finding) => finding.ruleId === "FINAL_PERIOD"
  );
}

function assertNoFinding(contentText: string): void {
  assert(
    getFinalPeriodFindings(contentText).length === 0,
    `Expected no FINAL_PERIOD finding for: ${JSON.stringify(contentText)}`
  );
}

function assertMissingFinding(contentText: string, expectedPosition: number): void {
  const findings = getFinalPeriodFindings(contentText);
  assert(findings.length === 1, `Expected one missing-period finding for: ${contentText}`);
  const finding = findings[0];
  assert(finding.start === expectedPosition, `Unexpected insertion start for: ${contentText}`);
  assert(finding.end === expectedPosition, `Unexpected insertion end for: ${contentText}`);
  assert(finding.originalText === "", `Insertion originalText must be empty for: ${contentText}`);
  assert(finding.suggestedText === ".", `Unexpected insertion suggestion for: ${contentText}`);
  assert(finding.category === "punctuation", `Unexpected category for: ${contentText}`);
  assert(finding.severity === "error", `Unexpected severity for: ${contentText}`);
  assert(
    finding.metadata?.violationType === "missing",
    `Unexpected violation type: ${contentText}`
  );
  assert(
    finding.originalText === contentText.slice(finding.start, finding.end),
    `Invalid insertion offsets for: ${contentText}`
  );
}

function assertMultipleFinding(
  contentText: string,
  expectedOriginalText: string,
  expectedViolationType: "multiple" | "spacedMultiple" | "ellipsis" | "mixedDotCluster" = "multiple"
): void {
  const findings = getFinalPeriodFindings(contentText);
  assert(findings.length === 1, `Expected one multiple-period finding for: ${contentText}`);
  const finding = findings[0];
  assert(finding.originalText === expectedOriginalText, `Unexpected originalText: ${contentText}`);
  assert(finding.suggestedText === ".", `Unexpected replacement suggestion for: ${contentText}`);
  assert(
    finding.metadata?.violationType === expectedViolationType,
    `Unexpected violation type for: ${contentText}`
  );
  assert(
    finding.originalText === contentText.slice(finding.start, finding.end),
    `Invalid replacement offsets for: ${contentText}`
  );
}

function runFinalPeriodCases(): void {
  assertNoFinding("BGH NJW 2024, 123.");
  assertMissingFinding("BGH NJW 2024, 123", "BGH NJW 2024, 123".length);
  assertMultipleFinding("BGH NJW 2024, 123..", "..");
  assertMultipleFinding("BGH NJW 2024, 123...", "...");
  assertMultipleFinding("BGH NJW 2024, 123....", "....");
  assertMultipleFinding("BGH NJW 2024, 123. .", ". .", "spacedMultiple");
  assertMultipleFinding("BGH NJW 2024, 123.   .", ".   .", "spacedMultiple");
  assertMultipleFinding("Text…", "…", "ellipsis");
  assertMultipleFinding("Text….", "….", "mixedDotCluster");
  assertMultipleFinding("Text.…", ".…", "mixedDotCluster");
  assertMultipleFinding("Text……", "……", "ellipsis");
  assertNoFinding("Text … Beispiel.");
  assertNoFinding("BGH NJW 2024, 123.   ");
  assertNoFinding("BGH NJW 2024, 123.\u200b\ufeff");
  assertMissingFinding("BGH NJW 2024, 123   ", "BGH NJW 2024, 123".length);
  assertMissingFinding("Text\u200b", "Text".length);

  const url = "https://example.com";
  const urlResult = analyzeFootnotes([createSnapshot(url)]);
  const urlFinding = urlResult.findings[0];
  assert(urlResult.footnoteAnalyses[0].engineProtectedRanges.length === 1, "URL must be protected");
  assert(urlResult.findings.length === 1, "URL without sentence period must create one finding");
  assert(urlFinding.start === url.length && urlFinding.end === url.length, "Insert after URL");
  assert(urlFinding.originalText === "", "URL content must remain outside the finding");

  assertNoFinding("https://example.com.");
  assertMultipleFinding("https://example.com..", "..");
  assertMultipleFinding("https://example.com...", "...");
  assertMissingFinding("Siehe https://example.com/test", "Siehe https://example.com/test".length);
  assertNoFinding("Siehe https://example.com/test.");
  assertNoFinding("");
  assertNoFinding("   \t\n");
  assertMissingFinding("Text?", "Text?".length);
  assertMissingFinding("Text)", "Text)".length);
  assertNoFinding("Siehe https://one.example/path und www.two.example/test.");
  assertNoFinding("Interne Punkte... und Abk. bleiben; Schluss korrekt.");

  const diagnostics = describeTrailingCharacters("Text.…", 3);
  assert(diagnostics[1].codePoint === "U+002E", "ASCII period diagnostic must be U+002E");
  assert(diagnostics[2].codePoint === "U+2026", "Ellipsis diagnostic must be U+2026");

  const protectedDots = "Text..";
  assert(
    getFinalPeriodFindings(protectedDots, [
      { type: "field", start: protectedDots.length - 2, end: protectedDots.length },
    ]).length === 0,
    "A replacement intersecting a protected range must be skipped"
  );
}

function runMassTest(): void {
  const snapshots = Array.from({ length: 1200 }, (_, index) => {
    const ordinal = index + 1;
    const contentText = index % 2 === 0 ? `Fußnote ${ordinal}.` : `Fußnote ${ordinal}`;
    return createSnapshot(contentText, ordinal);
  });
  const originalTexts = snapshots.map((snapshot) => snapshot.contentText);
  const result = analyzeFootnotes(snapshots);

  assert(result.analyzedFootnotes === 1200, "All mass-test snapshots must be analyzed");
  const finalPeriodFindings = result.findings.filter(
    (finding) => finding.ruleId === "FINAL_PERIOD"
  );
  assert(finalPeriodFindings.length === 600, "Exactly 600 final periods must be missing");
  assert(
    finalPeriodFindings.every((finding) => finding.severity === "error"),
    "All FINAL_PERIOD findings must be errors"
  );
  assert(
    snapshots.every((snapshot, index) => snapshot.contentText === originalTexts[index]),
    "Snapshots must remain unchanged"
  );
}

runFinalPeriodCases();
runMassTest();
