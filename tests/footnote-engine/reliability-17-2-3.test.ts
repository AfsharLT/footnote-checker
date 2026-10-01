import { createDefaultCitationSourceMapping } from "../../src/citation-mapping/default-mapping";
import { compileStructuredAlias } from "../../src/citation-mapping/structured-alias";
import type { CitationSourceMappingData } from "../../src/citation-mapping/types";
import { analyzeFootnotes } from "../../src/footnote-engine/engine";
import type { Finding } from "../../src/footnote-engine/types";
import type { FootnoteSnapshot } from "../../src/taskpane/taskpane";
import { hashFootnoteContentText } from "../../src/taskpane/taskpane";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function snapshot(contentText: string, ordinal = 1): FootnoteSnapshot {
  return {
    id: `poc-17-2-3-${ordinal}-${contentText.length}`,
    ordinal,
    displayLabel: String(ordinal),
    rawWordText: contentText,
    contentText,
    contentLength: contentText.length,
    originalTextHash: hashFootnoteContentText(contentText),
    reference: { referenceText: String(ordinal) },
    locator: {
      ordinal,
      displayLabel: String(ordinal),
      originalTextHash: hashFootnoteContentText(contentText),
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

function assertSafeOffsets(contentText: string, findings: readonly Finding[]): void {
  findings.forEach((finding) => {
    assert(finding.start >= 0, `${finding.ruleId} starts before contentText`);
    assert(finding.start <= finding.end, `${finding.ruleId} has a reversed range`);
    assert(finding.end <= contentText.length, `${finding.ruleId} ends after contentText`);
    assert(
      finding.originalText === contentText.slice(finding.start, finding.end),
      `${finding.ruleId} originalText does not match its absolute range`
    );
  });
}

const defaults = createDefaultCitationSourceMapping();
const lkSource = defaults.sources.find((source) => source.preferredName === "LK-StGB");
assert(lkSource !== undefined, "LK-StGB must exist in the default literature directory");
for (const alias of [
  "{Bearbeiter}, in: Leipziger Kommentar StGB",
  "{Bearbeiter}, in: LK-StGB",
  "{Bearbeiter}/LK-StGB",
]) {
  assert(
    defaults.aliases.some(
      (candidate) =>
        candidate.canonicalSourceId === lkSource.canonicalSourceId && candidate.alias === alias
    ),
    `Missing built-in structured alias: ${alias}`
  );
}

const commaAlias = compileStructuredAlias("{Bearbeiter}, in: LK-StGB")!;
assert(
  commaAlias.match("Zieschang, in: LK-StGB, § 35 Rn. 93")?.bearbeiterText === "Zieschang",
  "Single Bearbeiter placeholder failed"
);
assert(
  commaAlias.match("Rönnau/Hohn, in: LK-StGB, § 35 Rn. 93")?.bearbeiterText === "Rönnau/Hohn",
  "Slash-separated Bearbeiter placeholder failed"
);
const slashAlias = compileStructuredAlias("{Bearbeiter}/LK-StGB")!;
const slashMatch = slashAlias.match("Rönnau/Hohn/LK-StGB, § 35 Rn. 93");
assert(
  slashMatch?.bearbeiterText === "Rönnau/Hohn" && slashMatch.workText === "LK-StGB",
  "Slash alias must keep Bearbeiter and work identity separate"
);

const placeholderOnlyMapping: CitationSourceMappingData = {
  schemaVersion: 1,
  sources: [{ ...lkSource, personStructureHint: "BEARBEITER_THEN_WORK" }],
  aliases: [
    {
      canonicalSourceId: lkSource.canonicalSourceId,
      alias: "{Bearbeiter}, in: Leipziger Kommentar StGB",
      matchMode: "CASE_INSENSITIVE_TEXT",
      wholeWord: true,
      active: true,
    },
    {
      canonicalSourceId: lkSource.canonicalSourceId,
      alias: "{Bearbeiter}, in: LK-StGB",
      matchMode: "CASE_INSENSITIVE_TEXT",
      wholeWord: true,
      active: true,
    },
    {
      canonicalSourceId: lkSource.canonicalSourceId,
      alias: "{Bearbeiter}/LK-StGB",
      matchMode: "CASE_INSENSITIVE_TEXT",
      wholeWord: true,
      active: true,
    },
  ],
};

for (const citation of [
  "Zieschang, in: Leipziger Kommentar StGB, 13. Aufl. 2019, § 34 Rdn. 76.",
  "Zieschang, in: LK-StGB (Anm. 1), § 35 Rdn. 93.",
  "Rönnau/Hohn, in: LK-StGB, § 35 Rdn. 93.",
  "Rönnau/Hohn/LK-StGB, § 35 Rdn. 93.",
]) {
  const result = analyzeFootnotes([snapshot(citation)], { mappingData: placeholderOnlyMapping });
  const segment = result.parseResults[0].segments[0];
  const resolution = result.documentSourceRegistry!.resolutions[0];
  assert(resolution.finalState === "PERSISTENT_MATCH", `${citation} must resolve persistently`);
  assert(
    result.findings.some((finding) =>
      ["COMMENTARY_WORK_NAME", "COMMENTARY_MARGIN_NUMBER_ABBREVIATION"].includes(finding.ruleId)
    ),
    `${citation} must continue through commentary rules after its persistent match`
  );
  assert(
    !result.findings.some((finding) => finding.ruleId === "CITATION_OTHER_REVIEW"),
    `${citation} must not disappear into generic manual review`
  );
  assert(segment.coreStart >= 0, "Commentary segment needs an absolute core start");
  assertSafeOffsets(citation, result.findings);
}

const journalContexts = [
  "Erb, GA 2020, 605, 612.",
  "Vgl. Erb, GA 2020, 605, 612.",
  "Ähnlich: Erb, GA 2020, 605, 612.",
  "Zum Vorschulden des Gefährdeten ebenfalls für eine Entschuldigung in rechtfertigungsnahen Konstellationen: Erb, GA 2020, 605, 612.",
  "Fischer, StGB, § 35 Rn. 1; Erb, GA 2020, 605, 612.",
];

for (const [index, contentText] of journalContexts.entries()) {
  const result = analyzeFootnotes([snapshot(contentText, index + 1)], {
    mappingData: { schemaVersion: 1, sources: [], aliases: [] },
  });
  const erbStart = contentText.indexOf("Erb, GA");
  const segment = result.parseResults[0].segments.find((candidate) =>
    candidate.coreText.startsWith("Erb, GA")
  );
  assert(segment !== undefined, `Erb core missing for context ${index + 1}`);
  assert(
    segment.coreStart === erbStart,
    `Erb core start must remain absolute in context ${index + 1}`
  );
  assert(
    segment.classification.type === "JOURNAL_ARTICLE",
    `Erb must classify as JOURNAL_ARTICLE in context ${index + 1}`
  );
  assert(
    result.findings.some((finding) => finding.ruleId === "JOURNAL_PINPOINT_STYLE"),
    `Journal pinpoint rule missing in context ${index + 1}`
  );
  assertSafeOffsets(contentText, result.findings);
  if (contentText.startsWith("Zum Vorschulden")) {
    const item = result.parseResults[0].sequences?.flatMap((sequence) => sequence.items)[0];
    assert(item?.start === erbStart, "Long narrative must not be absorbed into the CitationItem");
    assert(
      result.parseResults[0].narrativeText?.some((narrative) =>
        narrative.rawText.startsWith("Zum Vorschulden")
      ),
      "Long prefix must remain explicit NarrativeText"
    );
  }
}

for (const contentText of [
  "Erb, GA 2020, 605, 607 f.",
  "Vgl. Erb, GA 2020, 605, 611.",
  "So auch zum Vorschulden des Gefährdeten: Erb, GA 2020, 605, 612.",
  "Zum Vorschulden des Gefährdeten ebenfalls für eine Entschuldigung in rechtfertigungsnahen Konstellationen: Erb, GA 2020, 605, 612.",
  "Ähnlich: Erb, GA 2020, 605, 610 f.",
]) {
  const result = analyzeFootnotes([snapshot(contentText)], {
    mappingData: { schemaVersion: 1, sources: [], aliases: [] },
  });
  assert(
    result.parseResults[0].segments.some(
      (segment) =>
        segment.coreText.startsWith("Erb, GA") && segment.classification.type === "JOURNAL_ARTICLE"
    ),
    `Real-document Erb pattern was not classified consistently: ${contentText}`
  );
  assert(
    result.findings.some((finding) => finding.ruleId === "JOURNAL_PINPOINT_STYLE"),
    `Real-document Erb pattern missed JOURNAL_PINPOINT_STYLE: ${contentText}`
  );
}

console.log("POC 17.2.3 citation reliability tests passed.");
