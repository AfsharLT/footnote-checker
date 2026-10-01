import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDocumentSourceRegistry,
  compareSourceFingerprints,
  createSourceFingerprint,
  normalizeIdentityText,
  promoteDocumentSources,
  type BuildDocumentSourceRegistryInput,
  type SourceFingerprint,
} from "../../src/document-source-registry";
import { createDefaultCitationSourceMapping } from "../../src/citation-mapping/default-mapping";
import type {
  CitationItem,
  CitationSegment,
  FootnoteParseResult,
} from "../../src/footnote-engine/types";
import { hashFootnoteContentText, type FootnoteSnapshot } from "../../src/taskpane/taskpane";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function snapshot(ordinal: number, contentText: string): FootnoteSnapshot {
  return {
    id: `registry-footnote-${ordinal}`,
    ordinal,
    contentText,
    originalTextHash: hashFootnoteContentText(contentText),
    paragraphs: [{ index: 0, start: 0, end: contentText.length }],
    protectedRanges: [],
    formattingRuns: [],
  } as FootnoteSnapshot;
}

function parseFootnote(footnote: FootnoteSnapshot, texts: string[]): FootnoteParseResult {
  const items: CitationItem[] = [];
  const segments: CitationSegment[] = [];
  let cursor = 0;
  texts.forEach((rawText, index) => {
    const start = footnote.contentText.indexOf(rawText, cursor);
    const end = start + rawText.length;
    cursor = end;
    const segmentId = `segment-${footnote.ordinal}-${index}`;
    const item: CitationItem = {
      id: `item-${footnote.ordinal}-${index}`,
      footnoteId: footnote.id,
      ordinal: index + 1,
      sequenceId: `sequence-${footnote.ordinal}`,
      start,
      end,
      rawText,
      normalizedText: normalizeIdentityText(rawText),
      citationType: "BOOK",
      qualifiers: [],
      locators: [],
      internalReferences: [...rawText.matchAll(/\(\s*Anm\.\s*(\d+)\s*\)/giu)].map((match) => ({
        start: start + (match.index ?? 0),
        end: start + (match.index ?? 0) + match[0].length,
        rawText: match[0],
        referencedOrdinal: Number(match[1]),
        status: "unresolved" as const,
      })),
      sourceResolutionStatus: "notAttempted",
      canonicalSourceId: null,
      formattingEvidence: [],
      confidence: "high",
      status: "recognized",
      warnings: [],
    };
    items.push(item);
    segments.push({
      segmentId,
      footnoteId: footnote.id,
      ordinal: index + 1,
      start,
      end,
      originalText: rawText,
      modifiers: [],
      coreStart: start,
      coreEnd: end,
      coreText: rawText,
      embeddedStatuteReferences: [],
      classification: { type: "BOOK", certainty: "high", signals: [] },
    });
  });
  return {
    footnoteId: footnote.id,
    sourceTextHash: footnote.originalTextHash,
    segments,
    sequences: [
      {
        id: `sequence-${footnote.ordinal}`,
        footnoteId: footnote.id,
        ordinal: 1,
        start: 0,
        end: footnote.contentText.length,
        rawText: footnote.contentText,
        qualifiers: [],
        items,
        confidence: "high",
        status: "recognized",
        warnings: [],
      },
    ],
    narrativeText: [],
    segmentationWarnings: [],
    segmentationStatus: "recognized",
  };
}

function registryInput(
  groups: Array<{ ordinal: number; texts: string[] }>
): BuildDocumentSourceRegistryInput {
  const footnotes = groups.map((group) => snapshot(group.ordinal, group.texts.join("; ")));
  const parseResults = groups.map((group, index) => parseFootnote(footnotes[index], group.texts));
  return {
    footnotes,
    parseResults,
    segmentAnalyses: parseResults.flatMap((result) =>
      result.segments.map((segment) => ({
        footnoteId: result.footnoteId,
        segmentId: segment.segmentId,
        effectiveClassification: { effectiveType: "BOOK" as const },
      }))
    ),
  };
}

const fischerCitations = [
  "Fischer, StGB, 73. Aufl. 2026, § 32 Rdnr. 11",
  "Fischer, StGB, 73. Aufl. 2026, § 32 Rdnr. 48",
  "Fischer, StGB, 73. Aufl. 2026, § 34 Rdnr. 7",
];
const one = buildDocumentSourceRegistry(
  registryInput([{ ordinal: 1, texts: [fischerCitations[0]] }])
);
const two = buildDocumentSourceRegistry(
  registryInput(
    fischerCitations.slice(0, 2).map((text, index) => ({ ordinal: index + 1, texts: [text] }))
  )
);
const three = buildDocumentSourceRegistry(
  registryInput(fischerCitations.map((text, index) => ({ ordinal: index + 1, texts: [text] })))
);
assert(
  one.sources.length === 1 && one.sources[0].status === "CANDIDATE",
  "First occurrence must create a candidate"
);
assert(
  two.sources.length === 1 && two.sources[0].status === "CANDIDATE",
  "Second occurrence must remain a candidate"
);
assert(
  three.sources.length === 1 &&
    three.sources[0].status === "CONFIRMED_DOCUMENT_SOURCE" &&
    three.sources[0].occurrenceCount === 3,
  "Three locator-independent occurrences must confirm one document source"
);
assert(
  three.sources[0].canonicalFingerprint.normalizedBibliographicCore.includes("2026") &&
    !three.sources[0].canonicalFingerprint.normalizedBibliographicCore.includes("32") &&
    !three.sources[0].canonicalFingerprint.normalizedBibliographicCore.includes("rdnr"),
  "Locator stripping must retain year and edition while excluding sections and margin numbers"
);

const normalized = buildDocumentSourceRegistry(
  registryInput([
    { ordinal: 1, texts: ["Fischer, StGB, 73. Aufl. 2026, § 32 Rn. 1"] },
    { ordinal: 2, texts: ["Fischer, StGB, 73. Auflage 2026, § 32 Rn. 2"] },
    { ordinal: 3, texts: ["Fischer, StGB, 73. Aufl 2026, § 32 Rn. 3"] },
  ])
);
assert(
  normalized.sources.length === 1 && normalized.sources[0].status === "CONFIRMED_DOCUMENT_SOURCE",
  "Safe edition abbreviation variants must normalize to one source"
);

const majority = buildDocumentSourceRegistry(
  registryInput([
    { ordinal: 1, texts: ["Fischer, StGB, 73. Aufl. 2026, § 32 Rn. 1"] },
    { ordinal: 2, texts: ["Fischer, Strafgesetzbuch, 73. Auflage 2026, § 32 Rn. 2"] },
    { ordinal: 3, texts: ["Fischer, StGB, 73. Aufl. 2026, § 32 Rn. 3"] },
    { ordinal: 4, texts: ["Fischer, StGB, 73. Aufl. 2026, § 32 Rn. 4"] },
  ])
);
assert(
  majority.sources.length === 1 &&
    majority.sources[0].canonicalDisplayCitation === "Fischer, StGB, 73. Aufl. 2026",
  "Canonical form must use the most frequent variant with deterministic tie-breaking"
);

const baseFingerprint = createSourceFingerprint(
  parseFootnote(snapshot(1, fischerCitations[0]), [fischerCitations[0]]).sequences![0].items[0],
  parseFootnote(snapshot(1, fischerCitations[0]), [fischerCitations[0]]).segments[0],
  "BOOK"
)!;
const typoFingerprint: SourceFingerprint = {
  ...baseFingerprint,
  normalizedAuthors: ["fiscer"],
  rawBibliographicCore: "Fiscer, StGB, 73. Aufl. 2026",
  normalizedBibliographicCore: "fiscer stgb 73 aufl 2026",
};
assert(
  compareSourceFingerprints(baseFingerprint, typoFingerprint).score >= 0.87,
  "Minor spelling variants must pass structured local similarity"
);
assert(
  compareSourceFingerprints(baseFingerprint, {
    ...typoFingerprint,
    year: "2025",
  }).hardConflicts.includes("CONFLICTING_YEAR"),
  "A conflicting identity-relevant year must block similarity"
);

const suspicious = buildDocumentSourceRegistry(
  registryInput([
    {
      ordinal: 1,
      texts: [
        "nur generalpräventiv auf Grundlage des funktionalen Schuldbegriffs: Jakobs, AT, 2. Aufl. 1991, S. 10",
      ],
    },
    {
      ordinal: 2,
      texts: [
        "nur generalpräventiv auf Grundlage des funktionalen Schuldbegriffs: Jakobs, AT, 2. Aufl. 1991, S. 11",
      ],
    },
    {
      ordinal: 3,
      texts: [
        "nur generalpräventiv auf Grundlage des funktionalen Schuldbegriffs: Jakobs, AT, 2. Aufl. 1991, S. 12",
      ],
    },
  ])
);
assert(
  suspicious.confirmedSourceCount === 0 && suspicious.sources.length === 0,
  "Suspicious narrative prefixes must never train or confirm a source"
);

const uniqueAnm = buildDocumentSourceRegistry(
  registryInput([
    { ordinal: 2, texts: ["Bernsmann, Notstand, 1989, S. 96"] },
    { ordinal: 3, texts: ["Andere, Werk, 2020, S. 2"] },
    { ordinal: 4, texts: ["Bernsmann, Notstand (Anm. 2), S. 406 ff."] },
  ])
);
assert(
  uniqueAnm.resolutions.find((resolution) => resolution.citationItemId === "item-4-0")
    ?.documentSourceId !== undefined,
  "Anm. references must resolve when the referenced footnote and identity evidence are unique"
);
const ambiguousAnm = buildDocumentSourceRegistry(
  registryInput([
    {
      ordinal: 2,
      texts: ["Fischer, Werk A, 2020, S. 1", "Fischer, Werk B, 2020, S. 2"],
    },
    { ordinal: 3, texts: ["Fischer (Anm. 2), S. 5"] },
  ])
);
assert(
  ambiguousAnm.resolutions.find((resolution) => resolution.citationItemId === "item-3-0")
    ?.resolution === "AMBIGUOUS",
  "Anm. references with multiple plausible candidates must remain ambiguous"
);
const missingAnm = buildDocumentSourceRegistry(
  registryInput([{ ordinal: 3, texts: ["Fischer (Anm. 99), S. 5"] }])
);
assert(
  missingAnm.resolutions[0].resolution === "UNRESOLVED",
  "Anm. references to a missing footnote must remain unresolved"
);

const immediate = buildDocumentSourceRegistry(
  registryInput([
    {
      ordinal: 1,
      texts: ["Fischer, StGB, 73. Aufl. 2026, § 32 Rn. 1", "ebd., § 32 Rn. 2"],
    },
  ])
);
assert(
  immediate.resolutions.find((resolution) => resolution.citationItemId === "item-1-1")
    ?.documentSourceId === immediate.sources[0].documentSourceId,
  "Ebenda with locator-only remainder must use clear immediate context"
);
const unresolvedDers = buildDocumentSourceRegistry(
  registryInput([{ ordinal: 1, texts: ["ders., völlig anderes Werk, 2024, S. 2"] }])
);
assert(
  unresolvedDers.resolutions[0].resolution === "UNRESOLVED",
  "Ders./dies. without a clear previous source must not guess"
);

const promotable = three.sources[0];
const emptyMapping = { schemaVersion: 1 as const, sources: [], aliases: [] };
const promoted = promoteDocumentSources(three, emptyMapping, [promotable.documentSourceId]);
assert(
  promoted.items[0].status === "CREATED" &&
    promoted.mapping.sources.length === 1 &&
    promoted.registry.sources[0].persistentLiteratureEntryId !== undefined,
  "Confirmed sources must be explicitly promotable into the persistent literature mapping"
);
const promotedAgain = promoteDocumentSources(three, promoted.mapping, [
  promotable.documentSourceId,
]);
assert(
  promotedAgain.items[0].status === "LINKED_EXISTING" && promotedAgain.mapping.sources.length === 1,
  "Promotion must link a clear existing equivalent instead of creating a duplicate"
);
const defaultMappingPromotion = promoteDocumentSources(
  { ...three, sources: [{ ...three.sources[0], persistentLiteratureEntryId: undefined }] },
  createDefaultCitationSourceMapping(),
  [promotable.documentSourceId]
);
assert(
  defaultMappingPromotion.items.length === 1,
  "Promotion must remain compatible with default mapping data"
);

const repeatedInput = registryInput(
  Array.from({ length: 1200 }, (_, index) => ({
    ordinal: index + 1,
    texts: [`Autor, Wiederholtes Werk, 2. Aufl. 2024, S. ${index + 1}`],
  }))
);
const repeatedStart = performance.now();
const repeatedRegistry = buildDocumentSourceRegistry(repeatedInput);
const repeatedDuration = performance.now() - repeatedStart;
assert(
  repeatedRegistry.sources.length === 1 && repeatedRegistry.sources[0].occurrenceCount === 1200,
  "A 1000+ repeated-source corpus must remain one source"
);

const uniqueInput = registryInput(
  Array.from({ length: 1200 }, (_, index) => ({
    ordinal: index + 1,
    texts: [
      `${String.fromCharCode(65 + (index % 26))}autor${index}, Eigenständiges Werk ${index}, ${2000 + (index % 25)}, S. 1`,
    ],
  }))
);
const uniqueStart = performance.now();
const uniqueRegistry = buildDocumentSourceRegistry(uniqueInput);
const uniqueDuration = performance.now() - uniqueStart;
assert(uniqueRegistry.sources.length === 1200, "Many unique sources must not be merged");
assert(
  repeatedDuration < 2500 && uniqueDuration < 2500,
  `Registry matching must remain practical (repeated=${repeatedDuration.toFixed(1)}ms, unique=${uniqueDuration.toFixed(1)}ms)`
);

const appSource = readFileSync(join(process.cwd(), "src/taskpane/components/App.tsx"), "utf8");
const workspaceSource = readFileSync(
  join(process.cwd(), "src/taskpane/components/ReviewWorkspace.tsx"),
  "utf8"
);
const dialogSource = readFileSync(
  join(process.cwd(), "src/taskpane/components/DocumentSourceReview.tsx"),
  "utf8"
);
const styles = readFileSync(join(process.cwd(), "src/taskpane/styles.css"), "utf8");
assert(
  workspaceSource.includes("Dokumenteigene Quelle") &&
    workspaceSource.includes("dokumenteigene") &&
    workspaceSource.includes("Quellen prüfen"),
  "Confirmed document sources must have a badge and persistent review callout"
);
for (const label of [
  "Neue Quellen erkannt",
  "Quellen prüfen",
  "Alle geeigneten übernehmen",
  "Später",
  "Ins Literaturverzeichnis übernehmen",
]) {
  assert(dialogSource.includes(label), `The source review dialog must render ${label}`);
}
assert(
  appSource.includes("promoteDocumentSources") &&
    appSource.includes("updateMapping(promotion.mapping)"),
  "Promotion must use the existing persistent literature mapping hook"
);
assert(
  appSource.includes("setShowSourceReview") &&
    !appSource.includes("beforeunload") &&
    !appSource.includes("unload"),
  "Source review must use an app-controlled lifecycle rather than native Word close interception"
);
assert(
  styles.includes(".fc-source-review-modal") &&
    styles.includes(".fc-document-sources-callout") &&
    styles.includes("@media (max-width: 399px)"),
  "Source review must remain responsive in narrow task panes"
);

console.log(
  `Document source registry tests passed; 1,200 repeated=${repeatedDuration.toFixed(1)}ms, 1,200 unique=${uniqueDuration.toFixed(1)}ms.`
);
