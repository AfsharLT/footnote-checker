import { createDefaultCitationSourceMapping } from "../../src/citation-mapping/default-mapping";
import { createDefaultCitationStyleProfile } from "../../src/citation-settings/defaults";
import { analyzeFootnotes } from "../../src/footnote-engine/engine";
import type {
  CitationExtractionResult,
  CitationLocator,
  CitationType,
  Finding,
} from "../../src/footnote-engine/types";
import { hashFootnoteContentText, type FootnoteSnapshot } from "../../src/taskpane/taskpane";
import {
  POC_17_3_CORPUS_TOTAL_OCCURRENCES,
  POC_17_3_UNRESOLVED_CORPUS,
} from "../fixtures/poc-17-3-unresolved-corpus";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function snapshot(contentText: string, ordinal = 1): FootnoteSnapshot {
  return {
    id: `coverage-17-3-${ordinal}`,
    ordinal,
    contentText,
    originalTextHash: hashFootnoteContentText(contentText),
    paragraphs: [{ index: 0, start: 0, end: contentText.length }],
    protectedRanges: [],
    formattingRuns: [],
  } as FootnoteSnapshot;
}

function firstExtraction(text: string): CitationExtractionResult {
  const result = analyzeFootnotes([snapshot(text)]);
  assert(result.parseResults[0]?.segments.length === 1, `Expected one segment for: ${text}`);
  return result.parseResults[0].segments[0].extraction;
}

function findingByRule(
  text: string,
  ruleId: string,
  profile = createDefaultCitationStyleProfile()
) {
  return analyzeFootnotes([snapshot(text)], { profile }).findings.find(
    (finding) => finding.ruleId === ruleId
  );
}

function assertFindingOffsets(textById: ReadonlyMap<string, string>, findings: readonly Finding[]) {
  for (const finding of findings) {
    const text = textById.get(finding.footnoteId);
    assert(text !== undefined, `Missing source text for finding ${finding.findingId}`);
    assert(
      Number.isInteger(finding.start) &&
        Number.isInteger(finding.end) &&
        0 <= finding.start &&
        finding.start <= finding.end &&
        finding.end <= text.length,
      `Invalid offsets for ${finding.ruleId}`
    );
    assert(
      finding.originalText === text.slice(finding.start, finding.end),
      `Original-text mismatch for ${finding.ruleId}`
    );
    assert(finding.start !== finding.end || finding.originalText === "", "Invalid insertion text");
  }
}

function locatorValues(locators: readonly CitationLocator[]): string[] {
  return locators.map((locator) => `${locator.type}:${locator.value ?? locator.rawText}`);
}

// Authoritative fixture contract.
assert(POC_17_3_UNRESOLVED_CORPUS.length === 128, "Corpus must retain 128 unique spans");
assert(POC_17_3_CORPUS_TOTAL_OCCURRENCES === 142, "Corpus must retain 142 occurrences");
assert(
  POC_17_3_UNRESOLVED_CORPUS.filter((item) => item.kind === "FRAGMENT").length === 3,
  "The three segmentation fragments must remain explicitly classified"
);

// Official decision reports use the existing setting-backed pinpoint rule.
for (const [raw, suggested] of [
  ["BGHSt. 5, 245, 248", " (248)"],
  ["BGHSt. 24, 356, 359", " (359)"],
  ["RGSt. 66, 397, 399 f.", " (399 f.)"],
] as const) {
  const extraction = firstExtraction(raw);
  assert(
    extraction.type === "CASE_LAW" && extraction.data.citationForm === "OFFICIAL_COLLECTION",
    `${raw} must be an official decision report`
  );
  const publication = extraction.data.parallelCitations.find(
    (candidate) => candidate.kind === "officialCollection"
  );
  assert(
    publication?.firstPage.value !== publication?.pinpointPages[0]?.value,
    "Pinpoint identity leak"
  );
  assert(
    findingByRule(raw, "CASE_LAW_OFFICIAL_COLLECTION_PINPOINT_STYLE")?.suggestedText === suggested,
    `${raw} must follow the configured parentheses style`
  );
}
assert(
  findingByRule("BGHSt. 5, 245 (248)", "CASE_LAW_OFFICIAL_COLLECTION_PINPOINT_STYLE") === undefined,
  "An already parenthesized decision pinpoint must remain unchanged"
);
const commaProfile = createDefaultCitationStyleProfile();
commaProfile.caseLaw.officialCollectionCitation.pinpointStyle = "comma";
assert(
  findingByRule(
    "BGHSt. 5, 245, 248",
    "CASE_LAW_OFFICIAL_COLLECTION_PINPOINT_STYLE",
    commaProfile
  ) === undefined &&
    findingByRule(
      "BGHSt. 5, 245 (248)",
      "CASE_LAW_OFFICIAL_COLLECTION_PINPOINT_STYLE",
      commaProfile
    )?.suggestedText === ", 248",
  "Alternate comma style must be driven by settings"
);
assert(firstExtraction("5, 245, 248").type !== "CASE_LAW", "Numeric comma series is not a report");

// New contribution/unpublished families and their structured identity fields.
const festschrift = firstExtraction("Hassemer, Festschrift für Bockelmann, 1979, S. 225, 239 ff.");
assert(festschrift.type === "FESTSCHRIFT_CONTRIBUTION", "Festschrift family missing");
assert(
  festschrift.data.authors[0]?.rawText === "Hassemer" &&
    festschrift.data.honoree.value === "Bockelmann" &&
    festschrift.data.year?.value === "1979" &&
    festschrift.data.firstPage?.value === "225" &&
    festschrift.data.pinpointPages[0]?.value === "239",
  "Festschrift contribution fields must be separated"
);
for (const raw of [
  "Neumann, FS Roxin, 2001, S. 421, 437",
  "Neumann, Festschrift für Roxin, (Anm. 35), S. 421, 437",
  "ders., Festschrift für Sancinetti, S. 297, 309",
  "Festschrift für Schünemann, 2015, S. 583, 586",
]) {
  assert(firstExtraction(raw).type === "FESTSCHRIFT_CONTRIBUTION", `${raw} must be Festschrift`);
}
assert(
  firstExtraction("Die Festschrift für Roxin erschien 2001.").type !== "FESTSCHRIFT_CONTRIBUTION",
  "Ordinary Festschrift prose must not become a contribution"
);
assert(
  firstExtraction("Silva Sánchez, Jahrbuch für Recht und Ethik 2005, S. 681 ff").type ===
    "YEARBOOK_CONTRIBUTION",
  "Yearbook contributions need a dedicated family"
);
assert(firstExtraction("Jansen, (Manuskript)").type === "MANUSCRIPT", "Manuscript family missing");
assert(
  firstExtraction("MedR 2026 (im Erscheinen)").type === "FORTHCOMING" &&
    findingByRule("MedR 2026 (im Erscheinen)", "FORTHCOMING_PUBLICATION_REVIEW") !== undefined,
  "Forthcoming sources must remain recognized but manual-safe"
);

// Locator grammar: locators stay structured and outside source identity.
const locatorExtraction = firstExtraction("Frister, AT (Anm. 4), Kap. 16 Rdn. 20, Kap. 17 Rdn. 7");
assert(locatorExtraction.type === "BOOK", "Structural locator example must be a book");
const locatorSet = new Set([
  ...locatorValues(locatorExtraction.data.marginNumbers),
  ...locatorValues(locatorExtraction.data.structuralLocators ?? []),
]);
assert(
  [...locatorSet].some((value) => value === "chapter:16") &&
    [...locatorSet].some((value) => value === "chapter:17") &&
    [...locatorSet].some((value) => value === "marginNumber:20") &&
    [...locatorSet].some((value) => value === "marginNumber:7"),
  "Chapter and margin-number locators must be retained"
);
for (const raw of [
  "Schmidhäuser, Strafrecht Allgemeiner Teil, 2. Aufl. 1984, 6/80",
  "Jakobs, AT (Anm. 28), 20. Abschn. Rdn. 4",
  "Bernsmann, Notstand (Anm. 2), S. 98 Fn. 282",
  "von Hippel, Deutsches Strafrecht, Bd. 2, 1930, S. 231",
  "Engländer, Grund und Grenzen der Nothilfe, 2008, 9 ff., 67 ff.",
  "Bernsmann, Notstand (Anm. 2), S. 254 ff., 305 ff.",
]) {
  assert(firstExtraction(raw).type === "BOOK", `${raw} must retain book locator semantics`);
}

// Boundary repairs: narrative prefixes are separate; fragments rejoin; adjacent sources split.
const narrativeText =
  "die Ansicht, die nur auf ein kollektives Rechtsbewährungsinteresse abstellt: Bitzilekis, Die neue Tendenz zur Einschränkung des Notwehrrechts, 1984, S. 57 ff.";
const narrative = analyzeFootnotes([snapshot(narrativeText)]).parseResults[0];
assert(
  narrative.segments[0]?.coreText.startsWith("Bitzilekis,") &&
    narrative.narrativeText.some((span) => span.rawText.startsWith("die Ansicht")),
  "Long narrative prefixes must not enter source identity"
);
for (const raw of [
  "auch Bernsmann, Notstand (Anm. 2), S. 98 f.",
  "auch: Ingelfinger, Grundlagen und Grenzbereiche des Tötungsverbots, 2004, S. 225 ff.",
  "S. eingehend auch Jansen, (Manuskript), ebenda auch zum Folgenden.",
]) {
  const parsed = analyzeFootnotes([snapshot(raw)]).parseResults[0];
  assert(parsed.segments[0]?.coreStart > 0, `${raw} must expose a narrative prefix`);
}
const perron = analyzeFootnotes([
  snapshot("auch Perron, in: Tübinger Kommentar StGB, 31. Aufl 2025, § 34 Rdn. 1."),
]).parseResults[0];
assert(
  perron.segments.length === 1 && perron.segments[0].classification.type === "COMMENTARY",
  "The Perron edition fragment must rejoin its commentary citation"
);
const adjacent = analyzeFootnotes([
  snapshot("Heller, Die aufgedrängte Nothilfe, 2004, S. 244 f. Kasiske, Jura 2004, 832, 838"),
]).parseResults[0];
assert(
  adjacent.segments.length === 2 &&
    adjacent.segments[0].classification.type === "BOOK" &&
    adjacent.segments[1].classification.type === "JOURNAL_ARTICLE",
  "Two adjacent strong sources must split safely"
);
assert(
  analyzeFootnotes([snapshot("Die Frage bleibt offen. Eine weitere Prüfung ist erforderlich.")])
    .parseResults[0].segments.length <= 1,
  "Ordinary prose must not be split into two sources"
);

// Full real-corpus accounting (fragments are reconstructed, never persisted as fake works).
const analyzedRows = POC_17_3_UNRESOLVED_CORPUS.filter((item) => item.kind !== "FRAGMENT").map(
  (item) => item.raw
);
const perronIndex = analyzedRows.findIndex((raw) => raw.startsWith("auch Perron,"));
assert(perronIndex >= 0, "Perron corpus row missing");
analyzedRows[perronIndex] = `${analyzedRows[perronIndex]} Aufl 2025, § 34 Rdn. 1.`;
const corpusSnapshots = analyzedRows.map((raw, index) => snapshot(raw, index + 1));
const corpusResult = analyzeFootnotes(corpusSnapshots, {
  mappingData: createDefaultCitationSourceMapping(),
});
const segments = corpusResult.parseResults.flatMap((result) => result.segments);
const effectiveTypeBySegment = new Map(
  corpusResult.segmentAnalyses.map((analysis) => [
    `${analysis.footnoteId}:${analysis.segmentId}`,
    analysis.effectiveClassification.effectiveType,
  ])
);
assert(
  segments.every(
    (segment) =>
      effectiveTypeBySegment.get(`${segment.footnoteId}:${segment.segmentId}`) !== "OTHER"
  ),
  "Every reconstructed real-corpus segment must have a supported family"
);
assert(
  corpusResult.findings.every((finding) => finding.ruleId !== "CITATION_OTHER_REVIEW"),
  "The supported corpus must not fall back to generic OTHER review"
);
assert(
  corpusResult.documentSourceRegistry?.accounting.invariantSatisfied === true &&
    corpusResult.documentSourceRegistry.accounting.accountedTotal ===
      corpusResult.documentSourceRegistry.accounting.citationItemsDetected,
  "Every CitationItem must have exactly one explicit source state"
);
assert(
  corpusResult.documentSourceRegistry?.accounting.persistentMatched === segments.length - 1 &&
    corpusResult.documentSourceRegistry.accounting.ambiguous === 1,
  "Every source must resolve canonically except the one context-ambiguous anaphor"
);
const unresolvedResolutions =
  corpusResult.documentSourceRegistry?.resolutions.filter((resolution) =>
    ["FAILED_LOCAL", "UNRESOLVED"].includes(resolution.finalState)
  ) ?? [];
assert(
  unresolvedResolutions.length === 0,
  "No reconstructed corpus source may silently fail resolution"
);
const manualAnaphora = corpusResult.findings.filter(
  (finding) => finding.ruleId === "ANAPHORIC_REFERENCE_REVIEW"
);
assert(
  manualAnaphora.length > 0,
  "Anaphors in the unique-span export without deterministic document context must stay manual"
);
assert(
  findingByRule(
    "ders., Jahrbuch für Recht und Ethik, 2014, S. 137, 152 ff.",
    "ANAPHORIC_REFERENCE_REVIEW"
  ) !== undefined,
  "A standalone ambiguous anaphor must remain manual"
);
const contextualAnaphor = analyzeFootnotes(
  [
    snapshot("Hruschka, Strafrecht nach logisch-analytischer Methode, 1988, S. 112.", 1),
    snapshot("ders., Jahrbuch für Recht und Ethik, 2014, S. 137, 152 ff.", 2),
  ],
  { mappingData: createDefaultCitationSourceMapping() }
);
assert(
  contextualAnaphor.findings.every((finding) => finding.ruleId !== "ANAPHORIC_REFERENCE_REVIEW") &&
    contextualAnaphor.documentSourceRegistry?.resolutions.some(
      (resolution) =>
        resolution.citationItemId.includes("coverage-17-3-2") &&
        resolution.explanation.strategy === "IMMEDIATE_CONTEXT"
    ),
  "A deterministic immediately preceding author must resolve ders./dies."
);
assertFindingOffsets(
  new Map(corpusSnapshots.map((footnote) => [footnote.id, footnote.contentText])),
  corpusResult.findings
);
assert(
  corpusResult.findings.every((finding) => finding.ruleId !== "RULE_OUTPUT_INVALID"),
  "Corpus rules must never emit invalid output"
);
const firstIds = corpusResult.findings.map((finding) => finding.findingId).join("|");
const secondIds = analyzeFootnotes(corpusSnapshots, {
  mappingData: createDefaultCitationSourceMapping(),
})
  .findings.map((finding) => finding.findingId)
  .join("|");
assert(firstIds === secondIds, "Corpus finding IDs must remain deterministic");

const defaultMapping = createDefaultCitationSourceMapping();
const canonicalIds = new Set(defaultMapping.sources.map((source) => source.canonicalSourceId));
assert(canonicalIds.size === defaultMapping.sources.length, "Canonical source IDs must be unique");
for (const requiredId of [
  "book-renzikowski-notstand-und-notwehr",
  "book-hruschka-strafrecht-logisch-analytisch",
  "book-bernsmann-entschuldigung-notstand",
  "commentary-stgb-tuebinger-kommentar",
  "commentary-stgb-sk-stgb",
  "festschrift-hassemer-bockelmann-1979-225",
  "yearbook-silva-sanchez-recht-und-ethik-2005-681",
  "manuscript-jansen",
  "decision-report-rgst-66-397",
]) {
  assert(canonicalIds.has(requiredId), `Missing canonical corpus source ${requiredId}`);
}
assert(
  defaultMapping.aliases.some((alias) => alias.alias === "Neumann, FS Roxin") &&
    defaultMapping.aliases.some((alias) => alias.alias === "Bernsmann, Notstand") &&
    defaultMapping.aliases.some((alias) => alias.alias === "{Bearbeiter}, in: SK-StGB"),
  "Required full/short/structured aliases must be present"
);
assert(
  !defaultMapping.sources.some((source) =>
    /^(?:218 ff\.|S\. 421, 437|Aufl 2025)/u.test(source.preferredName)
  ) &&
    !defaultMapping.aliases.some((alias) =>
      /^(?:218 ff\.|S\. 421, 437|Aufl 2025)/u.test(alias.alias)
    ),
  "Segmentation fragments must never become literature records"
);

const familyDistribution = segments.reduce<Record<CitationType, number>>(
  (counts, segment) => {
    const type = effectiveTypeBySegment.get(`${segment.footnoteId}:${segment.segmentId}`)!;
    counts[type] += 1;
    return counts;
  },
  {
    STATUTE: 0,
    CASE_LAW: 0,
    COMMENTARY: 0,
    BOOK: 0,
    JOURNAL_ARTICLE: 0,
    BOOK_CHAPTER: 0,
    FESTSCHRIFT_CONTRIBUTION: 0,
    YEARBOOK_CONTRIBUTION: 0,
    MANUSCRIPT: 0,
    FORTHCOMING: 0,
    CASE_NOTE: 0,
    LEGISLATIVE_MATERIAL: 0,
    ONLINE_SOURCE: 0,
    ADMINISTRATIVE_MATERIAL: 0,
    OTHER: 0,
  }
);
console.log(
  `POC 17.3 corpus: 142 occurrences / 128 unique spans; ${segments.length} reconstructed citation items; ` +
    `${corpusResult.documentSourceRegistry?.accounting.persistentMatched ?? 0} persistent matches; ` +
    `${new Set(corpusResult.documentSourceRegistry?.resolutions.map((resolution) => resolution.persistentSourceId).filter(Boolean)).size} canonical sources; ` +
    `${manualAnaphora.length + corpusResult.findings.filter((finding) => finding.ruleId === "FORTHCOMING_PUBLICATION_REVIEW").length} manual-safe findings; ` +
    `${JSON.stringify(familyDistribution)}`
);
