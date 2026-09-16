import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isValidCitationSequenceResult,
  segmentCitationSequences,
} from "../../src/footnote-engine/citation-sequence-segmenter";
import { hashFootnoteContentText, type FootnoteSnapshot } from "../../src/taskpane/taskpane";

interface CorpusFootnote {
  ordinal: number;
  sourceNoteId: number;
  contentText: string;
  paragraphs: FootnoteSnapshot["paragraphs"];
}

interface ExpectedSpan {
  start: number;
  end: number;
  status: string;
  rawText?: string;
}

interface CorpusExpectation {
  ordinal: number;
  id: string;
  boundaryStatus: "specified" | "uncertain";
  expectedSequences: ExpectedSpan[];
  expectedItems: ExpectedSpan[];
  expectedNarrativeText: ExpectedSpan[];
  expectedQualifiers: ExpectedSpan[];
  uncertaintyReason: string | null;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function loadJson<T>(name: string): T {
  return JSON.parse(
    readFileSync(join(process.cwd(), "tests/fixtures/citation-regression-corpus/v1", name), "utf8")
  ) as T;
}

const footnotes = loadJson<CorpusFootnote[]>("footnotes.json");
const contract = loadJson<{ version: number; footnotes: CorpusExpectation[] }>("expectations.json");

assert(contract.version === 1, "The regression contract must be explicitly versioned");
assert(footnotes.length === 80, "All 80 real footnotes must exist in the corpus");
assert(contract.footnotes.length === 80, "Every corpus footnote needs an expectation record");
assert(
  footnotes.every((footnote, index) => footnote.ordinal === index + 1),
  "No corpus footnote may silently disappear or be reordered"
);
assert(
  footnotes.reduce((sum, footnote) => sum + footnote.contentText.length, 0) === 20_569,
  "The v1 corpus character count is part of the immutable fixture contract"
);
const lengths = footnotes.map((footnote) => footnote.contentText.length).sort((a, b) => a - b);
const corpusText = footnotes.map((footnote) => footnote.contentText).join("\n");
assert((lengths[39] + lengths[40]) / 2 === 158, "The corpus median must remain stable");
assert(Math.max(...lengths) === 1_327, "The longest corpus footnote must remain stable");
assert(
  lengths.filter((length) => length > 1_200).length === 3,
  "Three notes must exceed 1,200 characters"
);
assert(
  lengths.filter((length) => length > 500).length === 9,
  "Nine notes must exceed 500 characters"
);
assert(
  (corpusText.match(/\(Anm\.\s*\d+\)/g) ?? []).length === 169,
  "Internal references must remain intact"
);
assert((corpusText.match(/\bff?\./g) ?? []).length === 91, "f./ff. locators must remain intact");
assert(
  (corpusText.match(/\b(?:Rn\.|Rdn\.?|Rdnr\.)/g) ?? []).length === 158,
  "Margin-number locators must remain intact"
);
assert(
  footnotes.reduce(
    (sum, footnote) =>
      sum + [...footnote.contentText].filter((character) => character === ";").length,
    0
  ) === 244,
  "The real corpus must retain all 244 semicolons"
);
assert(
  contract.footnotes.every(
    (expectation) =>
      expectation.boundaryStatus === "specified" || Boolean(expectation.uncertaintyReason)
  ),
  "Unsafely precise boundaries must be replaced by an explicit uncertainty reason"
);

const results = footnotes.map((fixture) => {
  const snapshot = {
    id: `test-add-inn-fn-${fixture.ordinal}`,
    ordinal: fixture.ordinal,
    contentText: fixture.contentText,
    originalTextHash: hashFootnoteContentText(fixture.contentText),
    paragraphs: fixture.paragraphs,
    protectedRanges: [],
    formattingRuns: [],
  } as FootnoteSnapshot;
  const result = segmentCitationSequences(snapshot, []);
  assert(
    isValidCitationSequenceResult(result, fixture.contentText),
    `All emitted offsets for footnote ${fixture.ordinal} must map to the unchanged contentText`
  );
  return result;
});

assert(results.length === 80, "Every fixture must produce a segmentation result");
const fn1Items = results[0].sequences.flatMap((sequence) => sequence.items);
assert(results[0].sequences.length === 2, "Fn. 1 must contain two thematic sequences");
assert(fn1Items.length === 20, "Fn. 1 must expose all 20 individual citations");
assert(
  fn1Items.some(
    (item) => item.start === 10 && item.end === 28 && item.rawText === "BGHSt. 5, 245, 248"
  ) &&
    fn1Items.some(
      (item) => item.start === 30 && item.end === 46 && item.rawText === "BGH StV 1987, 59"
    ) &&
    fn1Items.some(
      (item) =>
        item.start === 48 &&
        item.end === 95 &&
        item.rawText === "Fischer, StGB, 73. Aufl. 2026, § 32 Rdn. 11, 48"
    ),
  "Fn. 1 reference citations need independently addressable original ranges"
);
assert(
  fn1Items.every(
    (item) => !item.rawText.startsWith("Zu § 32:") && !item.rawText.startsWith("Zum ")
  ),
  "Fn. 1 group labels must stay outside CitationItem rawText"
);
const fn2Items = results[1].sequences.flatMap((sequence) => sequence.items);
assert(
  results[1].sequences.length >= 2 && results[1].narrativeText.length >= 1,
  "Fn. 2 must keep narrative prose outside its citation clusters"
);
assert(
  fn2Items.some(
    (item) =>
      item.start === 25 &&
      item.end === 78 &&
      item.rawText === "Bernsmann, Entschuldigung durch Notstand, 1989, S. 96"
  ),
  "Fn. 2 must exclude the leading qualifier from the Bernsmann source"
);
assert(
  results[48].sequences.length >= 1 && results[48].narrativeText.length >= 1,
  "Fn. 49 must stop its initial citation before argumentative prose"
);
assert(
  results[64].sequences.flatMap((sequence) => sequence.items).length === 17,
  "Fn. 65 must complete as a 17-item mixed cluster"
);
assert(
  results[65].narrativeText.length >= 3,
  "Fn. 66 must preserve paragraph-aware narrative text"
);
assert(
  results[79].sequences.length >= 2,
  "Fn. 80 must support multiple sequences in one paragraph"
);

for (const expectation of contract.footnotes) {
  const fixture = footnotes[expectation.ordinal - 1];
  const result = results[expectation.ordinal - 1];
  const allItems = result.sequences.flatMap((sequence) => sequence.items);
  const allQualifiers = result.sequences.flatMap((sequence) => [
    ...sequence.qualifiers,
    ...sequence.items.flatMap((item) => item.qualifiers),
  ]);
  const assertSpans = (
    expected: ExpectedSpan[],
    actual: Array<{ start: number; end: number; rawText: string }>,
    label: string
  ) => {
    for (const span of expected) {
      assert(
        fixture.contentText.slice(span.start, span.end) ===
          (span.rawText ?? fixture.contentText.slice(span.start, span.end)),
        `Fn. ${expectation.ordinal} ${label} expectation must map to original text`
      );
      assert(
        actual.some((candidate) => candidate.start === span.start && candidate.end === span.end),
        `Fn. ${expectation.ordinal} is missing expected ${label} ${span.start}:${span.end}`
      );
    }
  };
  assertSpans(expectation.expectedSequences, result.sequences, "sequence");
  assertSpans(expectation.expectedItems, allItems, "item");
  assertSpans(expectation.expectedNarrativeText, result.narrativeText, "narrative span");
  assertSpans(expectation.expectedQualifiers, allQualifiers, "qualifier");
}

const fn1 = footnotes[0];
assert(fn1.contentText.includes("Engländer"), "Combining-character spelling must remain unchanged");
assert(fn1.contentText.length === 1_327, "The longest original footnote must retain its length");
