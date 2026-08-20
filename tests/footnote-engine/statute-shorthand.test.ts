import { analyzeFootnotes } from "../../src/footnote-engine/engine";
import type {
  CitationSegment,
  CitationType,
  StatuteReferenceCandidate,
} from "../../src/footnote-engine/types";
import type { FootnoteSnapshot } from "../../src/taskpane/taskpane";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createSnapshot(contentText: string, ordinal = 1): FootnoteSnapshot {
  return {
    id: `shorthand-footnote-${ordinal}`,
    ordinal,
    contentText,
    originalTextHash: `shorthand-hash-${ordinal}-${contentText.length}`,
    protectedRanges: [],
    paragraphs: [],
  } as FootnoteSnapshot;
}

function parseOne(text: string): CitationSegment {
  const result = analyzeFootnotes([createSnapshot(text)]);
  assert(result.parseResults[0].segments.length === 1, `Expected one segment for ${text}`);
  assert(
    result.findings.every((finding) => finding.ruleId !== "RULE_OUTPUT_INVALID"),
    "Shorthand parsing must not lead to invalid rule output"
  );
  return result.parseResults[0].segments[0];
}

function assertReference(
  text: string,
  expected: {
    type: CitationType;
    section: string;
    paragraph?: string;
    sentence?: string;
    law?: string;
    context: "statute" | "workSection" | "unknown";
  }
): StatuteReferenceCandidate {
  const segment = parseOne(text);
  assert(segment.classification.type === expected.type, `Unexpected type for ${text}`);
  assert(segment.embeddedStatuteReferences.length === 1, `Expected one reference for ${text}`);
  const reference = segment.embeddedStatuteReferences[0];
  assert(reference.section === expected.section, `Unexpected section for ${text}`);
  assert(reference.paragraph === expected.paragraph, `Unexpected paragraph for ${text}`);
  assert(reference.sentence === expected.sentence, `Unexpected sentence for ${text}`);
  assert(reference.law === expected.law, `Unexpected law for ${text}`);
  assert(reference.referenceContext === expected.context, `Unexpected context for ${text}`);
  assert(
    reference.originalText === text.slice(reference.start, reference.end),
    `Invalid reference offsets for ${text}`
  );
  return reference;
}

function runShorthandCases(): void {
  const shorthand = assertReference("§ 264 I 1 BGB", {
    type: "STATUTE",
    section: "264",
    paragraph: "1",
    sentence: "1",
    law: "BGB",
    context: "statute",
  });
  assert(shorthand.originalText === "§ 264 I 1 BGB", "Complete shorthand must be covered");
  assert(parseOne("§ 264 I 1 BGB.").classification.certainty === "high", "STATUTE must be high");

  assertReference("§ 263 I StGB", {
    type: "STATUTE",
    section: "263",
    paragraph: "1",
    law: "StGB",
    context: "statute",
  });
  assertReference("§ 263 II 3 StGB", {
    type: "STATUTE",
    section: "263",
    paragraph: "2",
    sentence: "3",
    law: "StGB",
    context: "statute",
  });
  assertReference("§ 264a IV 1 StGB", {
    type: "STATUTE",
    section: "264a",
    paragraph: "4",
    sentence: "1",
    law: "StGB",
    context: "statute",
  });
  assertReference("Art. 5 I 1 GG", {
    type: "STATUTE",
    section: "5",
    paragraph: "1",
    sentence: "1",
    law: "GG",
    context: "statute",
  });
  assertReference("§ 263 Abs. 1 S. 1 StGB", {
    type: "STATUTE",
    section: "263",
    paragraph: "1",
    sentence: "1",
    law: "StGB",
    context: "statute",
  });
  assertReference("§ 263 I 1", {
    type: "STATUTE",
    section: "263",
    paragraph: "1",
    sentence: "1",
    context: "statute",
  });
  assertReference("vgl. § 263 I 1 StGB", {
    type: "STATUTE",
    section: "263",
    paragraph: "1",
    sentence: "1",
    law: "StGB",
    context: "statute",
  });
}

function runReferenceContextCases(): void {
  assertReference("Roxin/Greco, Strafrecht AT I, 5. Aufl. 2020, § 10 Rn. 12", {
    type: "BOOK",
    section: "10",
    context: "workSection",
  });
  assertReference("Wessels/Beulke/Satzger, Strafrecht AT, § 5 Rn. 10", {
    type: "BOOK",
    section: "5",
    context: "workSection",
  });
  assertReference("MüKo-StGB/Schneider, § 263 Rn. 4", {
    type: "COMMENTARY",
    section: "263",
    context: "statute",
  });
  assertReference("NK-StGB/Kargl, § 185 Rn. 3", {
    type: "COMMENTARY",
    section: "185",
    context: "statute",
  });
}

function runLongFormRegressions(): void {
  const cases = [
    "§ 263 Abs. 1 StGB",
    "§ 264a Abs. 3 S. 2 Nr. 1 lit. b StGB",
    "Art. 5 Abs. 1 GG",
    "§ 73b Abs. 1 Nr. 2 Buchst. a Hs. 2 StGB",
    "§ 45a Abs. 2 S. 1 2. Alt. StGB",
  ];
  for (const text of cases) {
    const segment = parseOne(text);
    assert(segment.classification.type === "STATUTE", `Long form regressed for ${text}`);
    assert(
      segment.embeddedStatuteReferences[0].referenceContext === "statute",
      `Long-form context regressed for ${text}`
    );
  }
}

runShorthandCases();
runReferenceContextCases();
runLongFormRegressions();
