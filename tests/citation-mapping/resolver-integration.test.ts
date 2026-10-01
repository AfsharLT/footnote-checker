import { createBuiltInCitationSourceMappingFixture } from "../../src/citation-mapping/fixture";
import { normalizeCitationSourceText } from "../../src/citation-mapping/normalization";
import {
  createCitationSourceMappingIndex,
  resolveCitationSegmentSources,
  resolveCitationSource,
} from "../../src/citation-mapping/resolver";
import type {
  CitationSourceMappingData,
  CitationSourceMaster,
} from "../../src/citation-mapping/types";
import { analyzeFootnotes } from "../../src/footnote-engine/engine";
import type { FootnoteSnapshot } from "../../src/taskpane/taskpane";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function snapshot(contentText: string): FootnoteSnapshot {
  return {
    id: `mapping-${contentText.length}`,
    ordinal: 1,
    contentText,
    originalTextHash: `hash-${contentText.length}`,
    protectedRanges: [],
    paragraphs: [],
    formattingRuns: [],
  } as FootnoteSnapshot;
}

const fixture = createBuiltInCitationSourceMappingFixture();
const index = createCitationSourceMappingIndex(fixture);
assert(fixture.sources.length === 15, "Starter fixture source count mismatch");
assert(
  fixture.sources.filter((source) => source.kind === "COMMENTARY").length === 11,
  "Fixture commentary count mismatch"
);
assert(
  fixture.sources.filter((source) => source.kind === "JOURNAL").length === 4,
  "Fixture journal count mismatch"
);
assert(fixture.aliases.length === 48, "Starter fixture alias count mismatch");
assert(
  fixture.aliases.filter((alias) => alias.legacySafetyLevel === "UNCERTAIN").length === 7,
  "Uncertain aliases must remain seven"
);

const commentaryCases: Array<[string, string]> = [
  ["Münchener Kommentar zum BGB", "MüKoBGB"],
  ["MünchKomm BGB", "MüKoBGB"],
  ["MüKo BGB", "MüKoBGB"],
  ["MüKo-BGB", "MüKoBGB"],
  ["MK-BGB", "MüKoBGB"],
  ["Münchener Kommentar zum StGB", "MüKoStGB"],
  ["MüKo-StGB", "MüKoStGB"],
  ["MüKo StGB", "MüKoStGB"],
  ["MK-StGB", "MüKoStGB"],
  ["Beck Online-Kommentar StGB", "BeckOK StGB"],
  ["BeckOK-StGB", "BeckOK StGB"],
  ["Beck OK StGB", "BeckOK StGB"],
  ["Leipziger Kommentar", "LK-StGB"],
  ["Leipziger Kommentar StGB", "LK-StGB"],
  ["LK StGB", "LK-StGB"],
  ["S/S", "Schönke/Schröder"],
  ["Schönke-Schröder", "Schönke/Schröder"],
  ["Schönke Schröder", "Schönke/Schröder"],
  ["Meyer-Gossner/Schmitt", "Meyer-Goßner/Schmitt"],
  ["M-G/S", "Meyer-Goßner/Schmitt"],
  ["Meyer-Goßner Schmitt", "Meyer-Goßner/Schmitt"],
  ["Löwe-Rosenberg", "LR-StPO"],
  ["Loewe-Rosenberg", "LR-StPO"],
  ["LR StPO", "LR-StPO"],
  ["Maunz-Dürig", "Maunz/Dürig"],
  ["Maunz Dürig", "Maunz/Dürig"],
  ["M/D", "Maunz/Dürig"],
];
commentaryCases.forEach(([text, expected]) => {
  const result = resolveCitationSource(index, { text, citationType: "COMMENTARY" });
  assert(
    result.status === "MATCHED" && result.preferredName === expected,
    `${text} mapping failed`
  );
});

const journalCases: Array<[string, string]> = [
  ["NJW", "NJW"],
  ["NJW.", "NJW"],
  ["Neue Juristische Wochenschrift", "NJW"],
  ["Neue Zeitschrift für Strafrecht", "NStZ"],
  ["NStz", "NStZ"],
  ["NStZ.", "NStZ"],
  ["Juristische Schulung", "JuS"],
  ["Jus", "JuS"],
  ["JuS.", "JuS"],
  ["Wirtschaft und Steuerstrafrecht", "wistra"],
  ["Wistra", "wistra"],
  ["wistra.", "wistra"],
];
journalCases.forEach(([text, expected]) => {
  const result = resolveCitationSource(index, { text, citationType: "JOURNAL_ARTICLE" });
  assert(
    result.status === "MATCHED" && result.preferredName === expected,
    `${text} mapping failed`
  );
});

assert(
  resolveCitationSource(index, {
    text: "  neue   juristische WOCHENSCHRIFT ",
    citationType: "JOURNAL_ARTICLE",
  }).status === "MATCHED",
  "Case and whitespace normalization failed"
);
assert(
  normalizeCitationSourceText("  Maunz/Dürig ") === "maunz/dürig",
  "Unicode normalization mismatch"
);
assert(
  resolveCitationSource(index, { text: "SS", citationType: "COMMENTARY" }).status === "UNMATCHED",
  "Slash must not be removed"
);
assert(
  resolveCitationSource(index, { text: "MüKo--StGB", citationType: "COMMENTARY" }).status ===
    "UNMATCHED",
  "Hyphens must not be removed"
);
assert(
  resolveCitationSource(index, { text: "NJW..", citationType: "JOURNAL_ARTICLE" }).status ===
    "UNMATCHED",
  "Periods must not be removed"
);

for (const [text, expected] of [
  ["Palandt", "Grüneberg"],
  ["Staudinger BGB", "Staudinger"],
  ["Fischer StGB", "Fischer"],
] as Array<[string, string]>) {
  const result = resolveCitationSource(index, { text, citationType: "COMMENTARY" });
  assert(result.status === "MATCHED" && result.preferredName === expected, `${text} must match`);
  assert(result.legacySafetyLevel === "UNCERTAIN", `${text} safety must remain uncertain`);
}
const fischer = resolveCitationSource(index, { text: "Fischer StGB", citationType: "COMMENTARY" });
assert(fischer.personStructureHint === "WORK_WITHOUT_BEARBEITER", "Fischer hint missing");

const fallbackMatch = resolveCitationSource(index, {
  citationType: "CASE_LAW",
  fallbackCoreText: "BGH NJW 2025, 1234",
  allowCoreTextFallback: true,
});
assert(
  fallbackMatch.status === "MATCHED" && fallbackMatch.matchSource === "FALLBACK_CORE_TEXT",
  "Fallback mapping failed"
);
assert(
  resolveCitationSource(index, {
    citationType: "CASE_LAW",
    fallbackCoreText: "BGH XNJWToken 2025",
    allowCoreTextFallback: true,
  }).status === "UNMATCHED",
  "Whole-word fallback must reject token substrings"
);

function ambiguousSource(id: string, name: string): CitationSourceMaster {
  return {
    schemaVersion: 1,
    canonicalSourceId: id,
    kind: "JOURNAL",
    preferredName: name,
    legalArea: "SONSTIGE",
    applicableCitationTypes: ["JOURNAL_ARTICLE", "CASE_LAW", "CASE_NOTE"],
    active: true,
  };
}
const ambiguousData: CitationSourceMappingData = {
  schemaVersion: 1,
  sources: [
    ambiguousSource("journal-source-a", "Source A"),
    ambiguousSource("journal-source-b", "Source B"),
  ],
  aliases: [
    {
      canonicalSourceId: "journal-source-b",
      alias: "ABC",
      matchMode: "CASE_INSENSITIVE_TEXT",
      wholeWord: true,
      active: true,
    },
    {
      canonicalSourceId: "journal-source-a",
      alias: "ABC",
      matchMode: "CASE_INSENSITIVE_TEXT",
      wholeWord: true,
      active: true,
    },
  ],
};
const ambiguity = resolveCitationSource(createCitationSourceMappingIndex(ambiguousData), {
  text: "ABC",
  citationType: "JOURNAL_ARTICLE",
});
assert(ambiguity.status === "AMBIGUOUS", "Alias conflict must be ambiguous");
assert(
  ambiguity.candidateCanonicalSourceIds?.join(",") === "journal-source-a,journal-source-b",
  "Ambiguous candidates must be deterministic"
);

const commentaryResult = analyzeFootnotes([snapshot("MüKo-StGB/Regge/Pegel, § 185 Rn. 39.")]);
const commentarySegment = commentaryResult.parseResults[0].segments[0];
const commentaryMapping = resolveCitationSegmentSources(commentarySegment, index)[0].resolution;
assert(
  commentaryMapping.status === "MATCHED" && commentaryMapping.preferredName === "MüKoStGB",
  "COMMENTARY enrichment failed"
);
assert(commentarySegment.extraction?.type === "COMMENTARY", "COMMENTARY extraction changed");
assert(
  commentarySegment.extraction.data.persons.every((person) => person.role === "unknown"),
  "Mapping must not rewrite person roles"
);

const journalResult = analyzeFootnotes([snapshot("Tenckhoff, JuS 1988, 787 (788).")]);
const journalMapping = resolveCitationSegmentSources(
  journalResult.parseResults[0].segments[0],
  index
)[0].resolution;
assert(
  journalMapping.status === "MATCHED" && journalMapping.preferredName === "JuS",
  "JOURNAL_ARTICLE enrichment failed"
);

const caseLawResult = analyzeFootnotes([snapshot("BGH NJW 2025, 1234 (1236).")]);
const caseLawMappings = resolveCitationSegmentSources(
  caseLawResult.parseResults[0].segments[0],
  index
);
assert(
  caseLawMappings.length === 1 && caseLawMappings[0].target === "JOURNAL_PUBLICATION",
  "CASE_LAW journal target missing"
);
assert(caseLawMappings[0].resolution.preferredName === "NJW", "CASE_LAW journal enrichment failed");
assert(
  caseLawResult.parseResults[0].segments[0].classification.type === "CASE_LAW",
  "CASE_LAW classification changed"
);

const caseNoteResult = analyzeFootnotes([
  snapshot("Müller, Anm. zu BGH, Urt. v. 01.01.2025 – 1 StR 1/25, NJW 2025, 100."),
]);
const caseNoteSegment = caseNoteResult.parseResults[0].segments[0];
const caseNoteMappings = resolveCitationSegmentSources(caseNoteSegment, index);
assert(caseNoteSegment.extraction?.type === "CASE_NOTE", "CASE_NOTE extraction missing");
assert(
  caseNoteMappings.length === 1 && caseNoteMappings[0].target === "PRIMARY_SOURCE",
  "CASE_NOTE journal target missing"
);
assert(
  caseNoteMappings[0].resolution.status === "MATCHED" &&
    caseNoteMappings[0].resolution.preferredName === "NJW",
  "CASE_NOTE journal enrichment failed"
);

assert(
  resolveCitationSource(index, { text: "ZJS", citationType: "JOURNAL_ARTICLE" }).status ===
    "UNMATCHED",
  "Unknown journal must remain unmatched"
);

const syntheticFootnotes = Array.from({ length: 1_200 }, (_, syntheticIndex) => {
  const examples = [
    "MüKo-StGB/Regge/Pegel, § 185 Rn. 39.",
    "Tenckhoff, JuS 1988, 787 (788).",
    "BGH NJW 2025, 1234 (1236).",
  ];
  return {
    ...snapshot(examples[syntheticIndex % examples.length]),
    id: `mapping-performance-${syntheticIndex + 1}`,
    ordinal: syntheticIndex + 1,
  };
});
const performanceStart = Date.now();
const syntheticResult = analyzeFootnotes(syntheticFootnotes);
const syntheticMappings = syntheticResult.parseResults.flatMap((parseResult) =>
  parseResult.segments.flatMap((segment) => resolveCitationSegmentSources(segment, index))
);
const performanceDuration = Date.now() - performanceStart;
assert(syntheticResult.parseResults.length === 1_200, "Synthetic footnote count mismatch");
assert(syntheticMappings.length === 1_200, "Synthetic mapping count mismatch");
assert(
  syntheticMappings.every((mapping) => mapping.resolution.status === "MATCHED"),
  "Every known source in the synthetic mapping run must match"
);
console.log(
  `Citation mapping performance: 1,200 footnotes / 1,200 mappings in ${performanceDuration} ms`
);
