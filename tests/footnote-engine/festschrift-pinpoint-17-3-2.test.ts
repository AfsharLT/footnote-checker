import { createDefaultCitationStyleProfile } from "../../src/citation-settings/defaults";
import { analyzeFootnotes } from "../../src/footnote-engine/engine";
import { runReviewEngine } from "../../src/review-engine";
import { hashFootnoteContentText, type FootnoteSnapshot } from "../../src/taskpane/taskpane";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function snapshot(contentText: string): FootnoteSnapshot {
  return {
    id: "festschrift-pinpoint-17-3-2",
    ordinal: 1,
    contentText,
    originalTextHash: hashFootnoteContentText(contentText),
    paragraphs: [{ index: 0, start: 0, end: contentText.length }],
    protectedRanges: [],
    formattingRuns: [],
  } as FootnoteSnapshot;
}

const base = "Hassemer, Festschrift für Bockelmann, 1979, S. 225";
const profile = createDefaultCitationStyleProfile();
profile.bookChapter.pinpointStyle = "parentheses";

function analyze(text: string) {
  const footnote = snapshot(text);
  return { footnote, result: analyzeFootnotes([footnote], { profile }) };
}

function pinpointFindings(text: string) {
  return analyze(text).result.findings.filter(
    (finding) => finding.ruleId === "CONTRIBUTION_PINPOINT_STYLE"
  );
}

for (const suffix of ["", " f.", " ff."]) {
  const original = `${base}, 239${suffix}`;
  const expected = `${base} (239${suffix})`;
  const { footnote, result } = analyze(original);
  const extraction = result.parseResults[0].segments[0].extraction;
  assert(extraction.type === "FESTSCHRIFT_CONTRIBUTION", "Contribution type must remain intact");
  assert(
    extraction.data.firstPage?.value === "225" &&
      extraction.data.pinpointPages[0]?.value === "239" &&
      extraction.data.pinpointPages[0]?.suffix === (suffix.trim() || undefined),
    "Start page, pinpoint and following suffix must stay separate"
  );
  const findings = pinpointFindings(original);
  assert(findings.length === 1, `Expected one bracket finding for ${original}`);
  const finding = findings[0];
  assert(
    finding.originalText === original.slice(finding.start, finding.end) &&
      original.slice(0, finding.start) + finding.suggestedText + original.slice(finding.end) ===
        expected,
    `The proposed replacement must produce exactly ${expected}`
  );
  const reviewed = runReviewEngine({
    findings: result.findings,
    footnotes: [footnote],
    mode: "REVIEW",
  });
  const action = reviewed.items.find(
    (item) => item.finding.findingId === finding.findingId
  )?.proposedAction;
  assert(
    action?.type === "TEXT_REPLACE" &&
      action.originalText === `, 239${suffix}` &&
      action.replacementText === ` (239${suffix})`,
    "The real review path must offer a buildable text replacement"
  );
  assert(pinpointFindings(expected).length === 0, "Reanalysis must not repeat the correction");
}

assert(
  pinpointFindings(`${base} (239 ff.)`).length === 0 && pinpointFindings(`${base}`).length === 0,
  "Already correct and single-page contributions must not get a pinpoint edit"
);
const commaProfile = createDefaultCitationStyleProfile();
commaProfile.bookChapter.pinpointStyle = "comma";
assert(
  analyzeFootnotes([snapshot(`${base}, 239 ff.`)], { profile: commaProfile }).findings.every(
    (finding) => finding.ruleId !== "CONTRIBUTION_PINPOINT_STYLE"
  ),
  "Comma preference must not offer parentheses"
);
assert(
  pinpointFindings(`${base}, 239x ff.`).length === 0,
  "Damaged page notation must not receive an automatic replacement"
);

const combined = `${base}, 239 ff.; Kasiske, Jura 2004, 832, 838.`;
const combinedResult = analyze(combined).result;
assert(
  combinedResult.parseResults[0].sequences.flatMap((sequence) => sequence.items).length === 2 &&
    combinedResult.parseResults[0].segments.length === 2,
  "Both adjacent citation items must survive segmentation"
);
const combinedFinding = combinedResult.findings.filter(
  (finding) => finding.ruleId === "CONTRIBUTION_PINPOINT_STYLE"
);
assert(
  combinedFinding.length === 1 &&
    combined.slice(0, combinedFinding[0].start) +
      combinedFinding[0].suggestedText +
      combined.slice(combinedFinding[0].end) ===
      `${base} (239 ff.); Kasiske, Jura 2004, 832, 838.`,
  "Only the Festschrift range may change"
);

console.log("POC 17.3.2 Festschrift pinpoint and review-action tests passed.");
