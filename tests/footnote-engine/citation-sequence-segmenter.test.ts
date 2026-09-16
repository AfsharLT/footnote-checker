import { readFileSync } from "node:fs";
import { analyzeFootnotes } from "../../src/footnote-engine/engine";
import {
  isValidCitationSequenceResult,
  SEGMENTATION_USER_MESSAGE,
  segmentCitationSequences,
} from "../../src/footnote-engine/citation-sequence-segmenter";
import { hashFootnoteContentText, type FootnoteSnapshot } from "../../src/taskpane/taskpane";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function snapshot(
  contentText: string,
  ordinal = 1,
  paragraphs: FootnoteSnapshot["paragraphs"] = [{ index: 0, start: 0, end: contentText.length }]
): FootnoteSnapshot {
  return {
    id: `sequence-${ordinal}`,
    ordinal,
    contentText,
    originalTextHash: hashFootnoteContentText(contentText),
    paragraphs,
    protectedRanges: [],
    formattingRuns: [],
  } as FootnoteSnapshot;
}

function segment(footnote: FootnoteSnapshot) {
  const result = segmentCitationSequences(footnote, []);
  assert(
    isValidCitationSequenceResult(result, footnote.contentText),
    "All sequence-model spans must retain exact original offsets"
  );
  return result;
}

const thematicText =
  "Zu § 32: BGHSt 5, 245; Fischer, StGB, § 32 Rdnr. 4. Zum § 34: MüKo-StGB/Erb, § 34 Rn. 2.";
const thematic = segment(snapshot(thematicText));
assert(thematic.sequences.length >= 2, "Thematic blocks must create multiple sequences");
assert(
  thematic.sequences[0].groupLabel === "Zu § 32:" &&
    thematic.sequences[1].groupLabel === "Zum § 34:",
  "Thematic group labels must remain separate from citation items"
);

const narrativeText =
  "BGH NJW 2024, 123. Diese Ansicht überzeugt aus systematischen Gründen nicht.";
const narrative = segment(snapshot(narrativeText));
assert(narrative.sequences.length === 1, "The initial citation must be recognized");
assert(narrative.narrativeText.length === 1, "Argumentative prose must remain NarrativeText");
assert(
  narrative.narrativeText[0].rawText.startsWith("Diese Ansicht"),
  "Narrative prose must not be swallowed as source metadata"
);

const qualifierSignals = [
  "vgl.",
  "s.",
  "s. auch",
  "dagegen",
  "kritisch",
  "abweichend",
  "ähnlich",
  "weniger restriktiv",
  "im Ergebnis ebenso",
  "mit diesem Befund auch",
  "dafür",
  "enger",
  "weiter",
  "pars pro toto",
  "hierzu",
  "näher",
  "so",
];
for (const qualifier of qualifierSignals) {
  const text = `${qualifier} BGH NJW 2024, 123.`;
  const result = segment(snapshot(text));
  const qualifiedItem = result.sequences.flatMap((sequence) => sequence.items)[0];
  assert(
    qualifiedItem?.qualifiers.length > 0,
    `Qualifier ${qualifier} must be represented separately`
  );
  assert(
    qualifiedItem.rawText === "BGH NJW 2024, 123.",
    `Qualifier ${qualifier} must stay outside source-preview rawText`
  );
}

const silvaText =
  "Silva Sánchez, Jahrbuch für Recht und Ethik 2005, S. 681 ff.: „Verhältnismäßigkeit“, zur Berücksichtigung von Wertverhältnis.";
const silva = segment(snapshot(silvaText));
assert(
  silva.sequences.flatMap((sequence) => sequence.items)[0]?.rawText ===
    "Silva Sánchez, Jahrbuch für Recht und Ethik 2005, S. 681 ff.",
  "A completed page citation must end before colon-led explanatory prose"
);
assert(
  silva.narrativeText.some((narrative) => narrative.rawText.startsWith(":")),
  "Text after a completed citation colon must remain NarrativeText"
);

const pawlikText =
  "enger: Pawlik, Jahrbuch für Recht und Ethik 2003, 287, 310: keine Entschuldigung, wenn der Eingriffsadressat stärker betroffen ist.";
const pawlik = segment(snapshot(pawlikText));
const pawlikItem = pawlik.sequences.flatMap((sequence) => sequence.items)[0];
assert(
  pawlikItem?.rawText === "Pawlik, Jahrbuch für Recht und Ethik 2003, 287, 310",
  "A year/start-page/pinpoint citation must stop before argumentative prose"
);
assert(
  pawlikItem.qualifiers.some(
    (qualifier) => qualifier.signal === "narrower" && qualifier.rawText === "enger:"
  ),
  "A pre-colon qualifier must be stored separately from the source text"
);

const legitimateTitleColon = segment(
  snapshot("Müller, Verantwortung: Grundlagen des Strafrechts, 2020, S. 93.")
);
assert(
  legitimateTitleColon.sequences.flatMap((sequence) => sequence.items)[0]?.rawText.includes(
    "Verantwortung: Grundlagen"
  ),
  "A colon inside a title must not be split blindly"
);

for (const pageText of [
  "Müller, Werk, 2020, S. 93.",
  "Müller, Werk, 2020, S. 681 ff.",
]) {
  const pageItem = segment(snapshot(pageText)).sequences.flatMap((sequence) => sequence.items)[0];
  assert(pageItem?.rawText === pageText, `Uppercase page locator must be preserved: ${pageText}`);
  assert(
    !pageItem.qualifiers.some((qualifier) => qualifier.signal === "reference"),
    `Uppercase S. must not be classified as lowercase siehe: ${pageText}`
  );
}
for (const referenceText of ["s. Perron, GA 2020, 10.", "s. auch Perron, GA 2020, 10."]) {
  const referenceItem = segment(snapshot(referenceText)).sequences.flatMap(
    (sequence) => sequence.items
  )[0];
  assert(
    referenceItem?.rawText === "Perron, GA 2020, 10." &&
      referenceItem.qualifiers.some((qualifier) => qualifier.signal === "reference" || qualifier.signal === "seeAlso"),
    `Lowercase s. must remain a context-sensitive reference qualifier: ${referenceText}`
  );
}
const ambiguousSentenceStart = segment(snapshot("S. 93 ist für die weitere Prüfung maßgeblich."));
assert(
  ambiguousSentenceStart.sequences
    .flatMap((sequence) => sequence.items)
    .every((item) => !item.qualifiers.some((qualifier) => qualifier.signal === "reference")),
  "Sentence-start uppercase S. must never be rewritten as a lowercase reference qualifier"
);

const defaultDelimiter = segment(snapshot("BGH NJW 2024, 1; BGH NJW 2024, 2"));
assert(
  defaultDelimiter.sequences.flatMap((sequence) => sequence.items).length === 2,
  "The default semicolon must create two citation-item candidates"
);
const alternativeDelimiter = segmentCitationSequences(
  snapshot("BGH NJW 2024, 1 | BGH NJW 2024, 2"),
  [],
  { citationSeparators: [" | "] }
);
assert(
  alternativeDelimiter.sequences.flatMap((sequence) => sequence.items).length === 2,
  "A configured alternative citation separator must participate in segmentation"
);

for (const malformed of [
  "MüKo-StGB/Fischer § 32 Rdnr. 4.",
  "BGH NJW 2024 123.",
  "Fischer, StGB § 32 Rn.4.",
]) {
  assert(
    segment(snapshot(malformed)).sequences.length > 0,
    `Malformed punctuation must not erase citation evidence: ${malformed}`
  );
}

for (const offsetText of [
  "Engländer, Strafrecht AT, 2020, S. 4.",
  "MüKo-StGB/Fischer,\u00a0§ 32\u2009Rn. 4.",
  "BGH   NJW 2024, 123.",
]) {
  const result = segment(snapshot(offsetText));
  for (const item of result.sequences.flatMap((sequence) => sequence.items)) {
    assert(
      item.rawText === offsetText.slice(item.start, item.end),
      "Original offsets are authoritative"
    );
    assert(
      item.normalizedText === undefined || typeof item.normalizedText === "string",
      "Normalized text is auxiliary only"
    );
  }
}

const twoParagraphText = "BGH NJW 2024, 123.MüKo-StGB/Fischer, § 32 Rn. 4.";
const paragraphBoundary = "BGH NJW 2024, 123.".length;
const itemFailure = segmentCitationSequences(
  snapshot(twoParagraphText, 2, [
    { index: 0, start: 0, end: paragraphBoundary },
    { index: 1, start: paragraphBoundary, end: twoParagraphText.length },
  ]),
  [],
  {
    faultInjector(stage, context) {
      if (stage === "item" && context.paragraphIndex === 0) throw new Error("synthetic item fault");
    },
  }
);
assert(itemFailure.sequences.length === 1, "An item failure must not stop later items");
assert(
  itemFailure.narrativeText.some((span) => span.reason === "itemFailure"),
  "The affected item range must retain an explicit failure state"
);

const sequenceFailure = segmentCitationSequences(
  snapshot(twoParagraphText, 3, [
    { index: 0, start: 0, end: paragraphBoundary },
    { index: 1, start: paragraphBoundary, end: twoParagraphText.length },
  ]),
  [],
  {
    faultInjector(stage, context) {
      if (stage === "sequence" && context.paragraphIndex === 0) {
        throw new Error("synthetic sequence fault");
      }
    },
  }
);
assert(sequenceFailure.sequences.length === 1, "A sequence failure must not stop later paragraphs");
assert(
  sequenceFailure.narrativeText.some((span) => span.reason === "sequenceFailure"),
  "The affected sequence range must remain explicitly uncertain"
);

const broken = snapshot("BGH NJW 2024, 123.", 4);
Object.defineProperty(broken, "paragraphs", {
  get() {
    throw new Error("synthetic footnote fault");
  },
});
const afterBroken = snapshot("MüKo-StGB/Fischer, § 32 Rn. 4.", 5);
const isolated = analyzeFootnotes([broken, afterBroken]);
assert(isolated.parseResults.length === 2, "One footnote failure must not abort later footnotes");
assert(
  isolated.parseResults[0].segmentationStatus === "failed",
  "Failed footnote needs explicit state"
);
assert(
  isolated.footnoteAnalyses[0].protectedRanges.some(
    (range) => range.type === "uncertainCitation" && range.start === 0 && range.end === 18
  ),
  "A failed footnote range must be protected from automatic correction"
);
assert(
  (isolated.parseResults[1].sequences?.length ?? 0) > 0,
  "The later footnote must still be segmented"
);

assert(
  !/(RichApi|Office\.js|Range\.hyperlinks|NotImplemented|stack)/i.test(SEGMENTATION_USER_MESSAGE),
  "The user-facing segmentation warning must contain no implementation jargon"
);

const mass = Array.from({ length: 1_200 }, (_, index) =>
  snapshot(`vgl. BGH NJW 2024, ${index + 1}; MüKo-StGB/Fischer, § 32 Rn. 4.`, index + 10)
);
const startedAt = performance.now();
const massResult = mass.map((footnote) => segmentCitationSequences(footnote, []));
const duration = performance.now() - startedAt;
assert(massResult.length === 1_200, "The synthetic large batch must complete");
assert(duration < 10_000, "In-memory segmentation must remain practically linear");
console.log(`POC 17.1 segmentation performance: 1,200 footnotes in ${duration.toFixed(1)} ms`);

const segmenterSource = readFileSync("src/footnote-engine/citation-sequence-segmenter.ts", "utf8");
assert(
  !/\b(?:Word\.run|context\.sync)\s*\(/.test(segmenterSource),
  "The in-memory segmenter must not introduce Office API synchronization"
);
