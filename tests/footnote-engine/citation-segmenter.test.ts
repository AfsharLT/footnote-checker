import { analyzeFootnotes } from "../../src/footnote-engine/engine";
import { isValidCitationSegment } from "../../src/footnote-engine/citation-segmenter";
import type { FootnoteParseResult, StatuteReferenceCandidate } from "../../src/footnote-engine/types";
import type { FootnoteSnapshot, ProtectedRange } from "../../src/taskpane/taskpane";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createSnapshot(
  contentText: string,
  options: {
    ordinal?: number;
    protectedRanges?: ProtectedRange[];
    paragraphs?: FootnoteSnapshot["paragraphs"];
  } = {}
): FootnoteSnapshot {
  const ordinal = options.ordinal ?? 1;
  return {
    id: `test-footnote-${ordinal}`,
    ordinal,
    contentText,
    originalTextHash: `hash-${ordinal}-${contentText.length}`,
    protectedRanges: options.protectedRanges ?? [],
    paragraphs: options.paragraphs ?? [],
  } as FootnoteSnapshot;
}

function parse(snapshot: FootnoteSnapshot): FootnoteParseResult {
  const result = analyzeFootnotes([snapshot]);
  assert(result.parseResults.length === 1, "One parse result must be created per footnote");
  const parseResult = result.parseResults[0];
  assert(parseResult.footnoteId === snapshot.id, "Parse result must retain the footnote ID");
  assert(
    parseResult.sourceTextHash === snapshot.originalTextHash,
    "Parse result must retain the source hash"
  );
  for (const segment of parseResult.segments) {
    assert(isValidCitationSegment(segment, snapshot.contentText), "Every segment must be valid");
  }
  return parseResult;
}

function onlyStatute(text: string): StatuteReferenceCandidate {
  const result = parse(createSnapshot(text));
  assert(result.segments.length === 1, `Expected one segment for ${text}`);
  assert(
    result.segments[0].embeddedStatuteReferences.length === 1,
    `Expected one statute reference for ${text}`
  );
  return result.segments[0].embeddedStatuteReferences[0];
}

function runSegmentationCases(): void {
  const single = parse(createSnapshot("BGH NJW 2024, 123."));
  assert(single.segments.length === 1, "A single citation must remain one segment");

  const twoText = "BGH NJW 2024, 123; MüKo-StGB/Schneider, § 263 Rn. 4.";
  const two = parse(createSnapshot(twoText));
  assert(two.segments.length === 2, "One semicolon must create two segments");
  assert(two.segments[0].separatorAfter === ";", "First separatorAfter must be retained");
  assert(two.segments[1].separatorBefore === ";", "Second separatorBefore must be retained");
  assert(
    two.segments[1].originalText === "MüKo-StGB/Schneider, § 263 Rn. 4.",
    "Separator whitespace must not become segment text"
  );

  const three = parse(
    createSnapshot(
      "BGH NJW 2024, 123; MüKo-StGB/Schneider, § 263 Rn. 4; Fischer, StGB, § 263 Rn. 5."
    )
  );
  assert(three.segments.length === 3, "Two semicolons must create three segments");
  assert(three.segments[1].separatorBefore === ";", "Middle segment needs separatorBefore");
  assert(three.segments[1].separatorAfter === ";", "Middle segment needs separatorAfter");

  const comparison = parse(createSnapshot("vgl. BGH NJW 2024, 123."));
  assert(comparison.segments[0].modifiers[0].text === "vgl.", "vgl. must be a modifier");
  assert(
    comparison.segments[0].coreText === "BGH NJW 2024, 123.",
    "Leading modifier must be outside coreText"
  );

  const disagreement = parse(createSnapshot("a. A. BGH NJW 2024, 123."));
  assert(disagreement.segments[0].modifiers[0].text === "a. A.", "a. A. must be recognized");
  assert(
    disagreement.segments[0].coreText === "BGH NJW 2024, 123.",
    "a. A. must be outside coreText"
  );

  const parallelReports = parse(
    createSnapshot(
      "BGH, Urt. v. 07.08.2025 – 3 StR 123/25 = NJW 2025, 1234 = BeckRS 2025, 12345."
    )
  );
  assert(parallelReports.segments.length === 1, "Parallel reports must remain one segment");

  const commentary = parse(createSnapshot("MüKo-StGB/Schneider, § 263 Rn. 4."));
  assert(commentary.segments.length === 1, "A commentary citation must remain one segment");
  assert(
    commentary.segments[0].embeddedStatuteReferences[0].originalText === "§ 263",
    "Embedded section must be detected without swallowing Rn."
  );

  const statuteWithModifier = parse(createSnapshot("vgl. § 263 Abs. 1 S. 1 Nr. 1 StGB."));
  const statuteSegment = statuteWithModifier.segments[0];
  const statute = statuteSegment.embeddedStatuteReferences[0];
  assert(statuteSegment.modifiers[0].text === "vgl.", "Statute modifier must be detected");
  assert(statute.section === "263", "Section must be parsed");
  assert(statute.paragraph === "1", "Paragraph must be parsed");
  assert(statute.sentence === "1", "Sentence must be parsed");
  assert(statute.number === "1", "Number must be parsed");
  assert(statute.law === "StGB", "Law must be parsed");

  const granular = onlyStatute("§ 264a Abs. 3 S. 2 Nr. 1 lit. b 2. Alt. StGB.");
  assert(granular.section === "264a", "Alphanumeric section must be parsed");
  assert(granular.paragraph === "3", "Granular paragraph must be parsed");
  assert(granular.sentence === "2", "Granular sentence must be parsed");
  assert(granular.number === "1", "Granular number must be parsed");
  assert(granular.letter === "b", "Granular letter must be parsed");
  assert(granular.alternative === "2", "Explicit alternative must be parsed");
  assert(granular.law === "StGB", "Granular law must be parsed");

  const article = onlyStatute("Art. 5 Abs. 1 GG.");
  assert(article.unitType === "Art.", "Article unit must be retained");
  assert(article.section === "5", "Article number must use section field");
  assert(article.paragraph === "1", "Article paragraph must be parsed");
  assert(article.law === "GG", "Article law must be parsed");

  const protectedUrlText = "https://example.com/a;b";
  const protectedUrl = parse(createSnapshot(protectedUrlText));
  assert(protectedUrl.segments.length === 1, "Semicolon inside URL must not split");

  const urlThenCitation = parse(
    createSnapshot("Onlinequelle https://example.com/test; BGH NJW 2024, 123.")
  );
  assert(urlThenCitation.segments.length === 2, "Semicolon after URL must split");

  const paragraphText = "BGH NJW 2024, 123.MüKo-StGB/Schneider, § 263 Rn. 4.";
  const paragraphBoundary = "BGH NJW 2024, 123.".length;
  const paragraphs = parse(
    createSnapshot(paragraphText, {
      paragraphs: [
        { index: 0, start: 0, end: paragraphBoundary },
        { index: 1, start: paragraphBoundary, end: paragraphText.length },
      ],
    })
  );
  assert(paragraphs.segments.length === 2, "Real paragraph offsets must split segments");

  const visualLineBreak = parse(
    createSnapshot("BGH NJW 2024, 123\vMüKo-StGB/Schneider, § 263 Rn. 4.")
  );
  assert(visualLineBreak.segments.length === 1, "A visual line break alone must not split");

  const book = parse(
    createSnapshot("Roxin/Greco, Strafrecht AT I, 5. Aufl. 2020, § 10 Rn. 12.")
  );
  assert(book.segments.length === 1, "Slash and commas must not split book citation");
  assert(
    book.segments[0].embeddedStatuteReferences[0].originalText === "§ 10",
    "Book section reference must be embedded"
  );

  assert(
    parse(createSnapshot("BT-Drs. 20/1234, S. 15; BGH NJW 2024, 123.")).segments.length === 2,
    "Legislative material and case citation must split at semicolon"
  );
  assert(
    parse(createSnapshot("BGHSt 47, 45 (49); BGH NJW 2024, 123.")).segments.length === 2,
    "Two case citations must split only at semicolon"
  );
  assert(
    parse(
      createSnapshot("vgl. BGH, Beschl. v. 01.02.2025 – 1 StR 10/25, NJW 2025, 1000.")
    ).segments.length === 1,
    "Hybrid case citation must remain one segment"
  );
  assert(parse(createSnapshot("")).segments.length === 0, "Empty footnote must have no segments");

  const stableSnapshot = createSnapshot(twoText);
  const firstIds = parse(stableSnapshot).segments.map((segment) => segment.segmentId);
  const secondIds = parse(stableSnapshot).segments.map((segment) => segment.segmentId);
  assert(firstIds.join("|") === secondIds.join("|"), "Segment IDs must be deterministic");
}

function runBoundaryExceptionCases(): void {
  assert(
    parse(createSnapshot("Quelle (technisch; zusammen); BGH NJW 2024, 123.")).segments.length === 2,
    "Semicolon in a matched bracket must not split"
  );
  assert(
    parse(createSnapshot('Quelle "technisch; zusammen"; BGH NJW 2024, 123.')).segments.length === 2,
    "Semicolon in matched quotes must not split"
  );

  const protectedText = "Field;Inhalt; BGH NJW 2024, 123.";
  const firstSemicolon = protectedText.indexOf(";");
  const secondSemicolon = protectedText.indexOf(";", firstSemicolon + 1);
  const protectedResult = parse(
    createSnapshot(protectedText, {
      protectedRanges: [{ type: "field", start: 0, end: secondSemicolon }],
    })
  );
  assert(protectedResult.segments.length === 2, "Only unprotected semicolon may split field text");

  const sentenceBoundary = parse(
    createSnapshot("BGH NJW 2024, 123. MüKo-StGB/Schneider, § 263 Rn. 4.")
  );
  assert(sentenceBoundary.segments.length === 2, "Clear sentence plus citation start may split");
}

function runAdditionalStatuteCases(): void {
  const detailed = onlyStatute("§ 73b Abs. 1 Nr. 2 Buchst. a Hs. 2 StGB.");
  assert(detailed.section === "73b", "73b must remain alphanumeric");
  assert(detailed.letter === "a", "Buchst. must map to letter");
  assert(detailed.halfSentence === "2", "Half sentence must be parsed");

  const alternative = onlyStatute("§ 45a Abs. 2 S. 1 2. Alt. StGB.");
  assert(alternative.section === "45a", "45a must remain alphanumeric");
  assert(alternative.alternative === "2", "Alternative must only follow explicit Alt.");

  const variant = onlyStatute("§ 45a 3. Var. StGB.");
  assert(variant.variant === "3", "Variant must only follow explicit Var.");

  const multiple = onlyStatute("§§ 263, 264 StGB.");
  assert(multiple.unitType === "§§", "Plural section unit must be retained");
  assert(multiple.sections?.join(",") === "263,264", "Plural sections must be granular");
}

function runMassTest(): void {
  const snapshots = Array.from({ length: 1200 }, (_, index) =>
    createSnapshot(
      `vgl. BGH NJW 2024, ${index + 1}; MüKo-StGB/Schneider, § 263 Abs. 1 StGB.`,
      { ordinal: index + 1 }
    )
  );
  const result = analyzeFootnotes(snapshots);
  assert(result.parseResults.length === 1200, "All mass-test footnotes must be parsed");
  assert(
    result.parseResults.every((parseResult) => parseResult.segments.length === 2),
    "Each mass-test footnote must contain two segments"
  );
}

runSegmentationCases();
runBoundaryExceptionCases();
runAdditionalStatuteCases();
runMassTest();
