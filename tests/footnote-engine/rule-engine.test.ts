import type { CitationSourceMappingData } from "../../src/citation-mapping/types";
import { createDefaultCitationStyleProfile } from "../../src/citation-settings/defaults";
import { analyzeFootnotes } from "../../src/footnote-engine/engine";
import type { Finding } from "../../src/footnote-engine/types";
import type { FootnoteSnapshot, FormattingRun } from "../../src/taskpane/taskpane";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function snapshot(
  contentText: string,
  ordinal = 1,
  formattingRuns: FormattingRun[] = []
): FootnoteSnapshot {
  return {
    id: `rule-footnote-${ordinal}`,
    ordinal,
    contentText,
    originalTextHash: `rule-hash-${ordinal}-${contentText.length}`,
    protectedRanges: [],
    paragraphs: [],
    formattingRuns,
  } as FootnoteSnapshot;
}

function findingsFor(contentText: string, formattingRuns: FormattingRun[] = []): Finding[] {
  return analyzeFootnotes([snapshot(contentText, 1, formattingRuns)]).findings;
}

function byRule(findings: readonly Finding[], ruleId: string): Finding[] {
  return findings.filter((finding) => finding.ruleId === ruleId);
}

function assertReplacement(
  findings: readonly Finding[],
  ruleId: string,
  originalText: string,
  suggestedText: string
): void {
  const finding = byRule(findings, ruleId).find(
    (candidate) => candidate.originalText === originalText
  );
  assert(finding !== undefined, `Missing ${ruleId}`);
  assert(finding.originalText === originalText, `Unexpected ${ruleId} original text`);
  assert(finding.suggestedText === suggestedText, `Unexpected ${ruleId} suggestion`);
}

const mappingData: CitationSourceMappingData = {
  schemaVersion: 1,
  sources: [
    {
      schemaVersion: 1,
      canonicalSourceId: "commentary:mueko-stgb",
      kind: "COMMENTARY",
      preferredName: "MüKoStGB",
      legalArea: "STGB",
      applicableCitationTypes: ["COMMENTARY"],
      active: true,
      personStructureHint: "WORK_THEN_BEARBEITER",
    },
    {
      schemaVersion: 1,
      canonicalSourceId: "commentary:grueneberg",
      kind: "COMMENTARY",
      preferredName: "Grüneberg",
      legalArea: "BGB",
      applicableCitationTypes: ["COMMENTARY"],
      active: true,
    },
    {
      schemaVersion: 1,
      canonicalSourceId: "journal:jus-a",
      kind: "JOURNAL",
      preferredName: "JuS",
      legalArea: "GENERAL",
      applicableCitationTypes: ["JOURNAL_ARTICLE", "CASE_LAW"],
      active: true,
    },
  ],
  aliases: [
    {
      canonicalSourceId: "commentary:mueko-stgb",
      alias: "MüKo-StGB",
      matchMode: "CASE_INSENSITIVE_TEXT",
      wholeWord: true,
      active: true,
      legacySafetyLevel: "PROBABLE",
    },
    {
      canonicalSourceId: "commentary:grueneberg",
      alias: "Palandt",
      matchMode: "CASE_INSENSITIVE_TEXT",
      wholeWord: true,
      active: true,
      legacySafetyLevel: "UNCERTAIN",
    },
  ],
};

function runPunctuationAndStructureCases(): void {
  for (const value of ["", "  \t\n", "\u200b\ufeff"]) {
    const findings = findingsFor(value);
    const empty = byRule(findings, "EMPTY_FOOTNOTE");
    assert(empty.length === 1 && empty[0].severity === "error", "Empty footnote must be an error");
    assert(byRule(findings, "FINAL_PERIOD").length === 0, "Empty footnote must skip final period");
  }
  for (const value of ["Text", "Text...", "Text. ."]) {
    const findings = byRule(findingsFor(value), "FINAL_PERIOD");
    assert(
      findings.length === 1 && findings[0].severity === "error",
      "Final period must be an error"
    );
  }
  assert(byRule(findingsFor("Text."), "FINAL_PERIOD").length === 0, "Correct period must pass");
  const url = "https://example.com";
  assertReplacement(findingsFor(url), "FINAL_PERIOD", "", ".");

  const protectedStatute = snapshot("§ 264 I 1 BGB.");
  const romanStart = protectedStatute.contentText.indexOf("I");
  protectedStatute.protectedRanges = [{ type: "field", start: romanStart, end: romanStart + 1 }];
  assert(
    byRule(analyzeFootnotes([protectedStatute]).findings, "STATUTE_PARAGRAPH_STYLE").length === 0,
    "Citation replacements must not intersect protected ranges"
  );
}

function runStatuteCases(): void {
  const shorthand = findingsFor("§ 264 I 1 BGB.");
  assertReplacement(shorthand, "STATUTE_PARAGRAPH_STYLE", "I", "Abs. 1");
  assertReplacement(shorthand, "STATUTE_SENTENCE_STYLE", "1", "S. 1");
  assert(
    byRule(findingsFor("§ 263 Abs. 1 StGB."), "STATUTE_PARAGRAPH_STYLE").length === 0,
    "Preferred paragraph style must pass"
  );
  assertReplacement(
    findingsFor("§ 263 Abs. 1 lit. a StGB."),
    "STATUTE_LETTER_STYLE",
    "lit. a",
    "Buchst. a"
  );
  assertReplacement(
    findingsFor("§ 263 Abs. 1 Alt. 1 StGB."),
    "STATUTE_ALTERNATIVE_STYLE",
    "Alt. 1",
    "1. Alt."
  );
  assertReplacement(
    findingsFor("§§ 263,263a StGB."),
    "STATUTE_MULTIPLE_SECTION_SEPARATOR",
    ",",
    ", "
  );
  const longForms = findingsFor(
    "§ 263 Absatz 1 Satz 2 Nummer 3 Buchstabe a Halbsatz 2 Alternative 1 StGB."
  );
  assertReplacement(longForms, "STATUTE_PARAGRAPH_STYLE", "Absatz 1", "Abs. 1");
  assertReplacement(longForms, "STATUTE_SENTENCE_STYLE", "Satz 2", "S. 2");
  assertReplacement(longForms, "STATUTE_ABBREVIATION_STYLE", "Nummer 3", "Nr. 3");
  assertReplacement(longForms, "STATUTE_LETTER_STYLE", "Buchstabe a", "Buchst. a");
  assertReplacement(longForms, "STATUTE_ABBREVIATION_STYLE", "Halbsatz 2", "Hs. 2");
  assertReplacement(longForms, "STATUTE_ALTERNATIVE_STYLE", "Alternative 1", "1. Alt.");
  const following = findingsFor("§ 263 ff. StGB.");
  assert(
    byRule(following, "STATUTE_FOLLOWING_SUFFIX_STYLE").every(
      (finding) => finding.suggestedText !== "f."
    ),
    "ff. must never be changed to f."
  );
  assertReplacement(findingsFor("§ 263 ff StGB."), "STATUTE_FOLLOWING_SUFFIX_STYLE", "ff", "ff.");
}

function runCaseLawCases(): void {
  const direct = findingsFor("BGH, Urteil vom 5.7.2025 - 3 StR 123/25.");
  assertReplacement(direct, "CASE_LAW_DECISION_TYPE", "Urteil", "Urt.");
  assertReplacement(direct, "CASE_LAW_DATE_INTRODUCER", "vom", "v.");
  assertReplacement(direct, "CASE_LAW_DATE_FORMAT", "5.7.2025", "05.07.2025");
  assertReplacement(direct, "CASE_LAW_DOCKET_SEPARATOR", " - ", " – ");

  const official = findingsFor("BGHSt 47, 45 (49).");
  for (const ruleId of [
    "CASE_LAW_DECISION_TYPE",
    "CASE_LAW_DATE_FORMAT",
    "CASE_LAW_DATE_INTRODUCER",
    "CASE_LAW_DOCKET_SEPARATOR",
  ]) {
    assert(byRule(official, ruleId).length === 0, `${ruleId} must not invent missing content`);
  }
  assertReplacement(
    findingsFor("BGHSt 47, 45, 49."),
    "CASE_LAW_OFFICIAL_COLLECTION_PINPOINT_STYLE",
    ", 49",
    " (49)"
  );
  assertReplacement(
    findingsFor("BGH, Urt. v. 05.07.2025 – 3 StR 123/25, NJW 2025, 1234."),
    "CASE_LAW_PARALLEL_SEPARATOR",
    ", ",
    " = "
  );
}

function runMappingAndCitationCases(): void {
  const commentary = analyzeFootnotes([snapshot("MüKo-StGB/Schneider, § 263 Rdnr. 4.")], {
    mappingData,
  }).findings;
  assertReplacement(commentary, "COMMENTARY_WORK_NAME", "MüKo-StGB", "MüKoStGB");
  assertReplacement(commentary, "COMMENTARY_MARGIN_NUMBER_ABBREVIATION", "Rdnr. 4", "Rn. 4");
  assert(
    byRule(commentary, "SOURCE_NAME_CONSISTENCY").length === 0,
    "A clear profile-based name finding must suppress consistency duplicates"
  );

  const separatorProfile = createDefaultCitationStyleProfile();
  separatorProfile.commentary.personSeparator = " / ";
  separatorProfile.book.personSeparator = " / ";
  const commentarySeparators = analyzeFootnotes(
    [snapshot("MüKo-StGB/Schneider/Pegel, § 263 Rn. 4.")],
    { profile: separatorProfile, mappingData }
  ).findings;
  assertReplacement(commentarySeparators, "COMMENTARY_PERSON_SEPARATOR", "/", " / ");
  assertReplacement(
    analyzeFootnotes([snapshot("Roxin/Greco, Strafrecht AT, 5. Aufl. 2020.")], {
      profile: separatorProfile,
    }).findings,
    "BOOK_PERSON_SEPARATOR",
    "/",
    " / "
  );

  const uncertainMappingData: CitationSourceMappingData = {
    ...mappingData,
    aliases: [
      {
        canonicalSourceId: "commentary:grueneberg",
        alias: "MüKo-StGB",
        matchMode: "CASE_INSENSITIVE_TEXT",
        wholeWord: true,
        active: true,
        legacySafetyLevel: "UNCERTAIN",
      },
    ],
  };
  const uncertain = analyzeFootnotes([snapshot("MüKo-StGB/Schneider, § 433 Rn. 1.")], {
    mappingData: uncertainMappingData,
  }).findings;
  const uncertainHints = uncertain.filter(
    (finding) =>
      finding.ruleId === "COMMENTARY_WORK_NAME" ||
      finding.ruleId === "SOURCE_MAPPING_LEGACY_UNCERTAIN"
  );
  assert(uncertainHints.length === 1, "Uncertain legacy mapping must create exactly one hint");
  assert(uncertainHints[0].severity === "info", "Uncertain legacy mapping must be informational");
  assert(
    uncertainHints[0].suggestedText === undefined,
    "Uncertain mapping must not force replacement"
  );

  const ambiguousMappingData: CitationSourceMappingData = {
    ...mappingData,
    sources: [
      ...mappingData.sources,
      {
        schemaVersion: 1,
        canonicalSourceId: "commentary:second",
        kind: "COMMENTARY",
        preferredName: "Zweitwerk",
        legalArea: "STGB",
        applicableCitationTypes: ["COMMENTARY"],
        active: true,
      },
    ],
    aliases: [
      ...mappingData.aliases,
      {
        canonicalSourceId: "commentary:second",
        alias: "MüKo-StGB",
        matchMode: "CASE_INSENSITIVE_TEXT",
        wholeWord: true,
        active: true,
      },
    ],
  };
  const ambiguous = analyzeFootnotes([snapshot("MüKo-StGB/Schneider, § 263 Rn. 4.")], {
    mappingData: ambiguousMappingData,
  }).findings;
  const ambiguousFinding = byRule(ambiguous, "SOURCE_MAPPING_AMBIGUOUS")[0];
  assert(ambiguousFinding?.severity === "info", "Ambiguous mapping must create an info finding");
  assert(
    Array.isArray(ambiguousFinding.metadata?.candidateCanonicalSourceIds),
    "Ambiguous mapping candidates must be included"
  );

  assertReplacement(
    findingsFor("Roxin/Greco, Strafrecht AT I, 5. Auflage 2020, § 10 Rdnr. 12."),
    "BOOK_EDITION_ABBREVIATION",
    "Auflage",
    "Aufl."
  );
  assertReplacement(
    findingsFor("Tenckhoff, JuS 1988, 787, 788."),
    "JOURNAL_PINPOINT_STYLE",
    ", 788",
    " (788)"
  );
  assert(
    byRule(findingsFor("Korte, NZWiSt 2018, 231 (233 f.)."), "JOURNAL_PINPOINT_STYLE").length === 0,
    "Preferred journal pinpoint style must pass"
  );
  assertReplacement(
    findingsFor("mwN BGH NJW 2025, 1234 (1236)."),
    "CITATION_MODIFIER_STYLE",
    "mwN",
    "m. w. N."
  );
  assertReplacement(
    findingsFor("a.A. BGH NJW 2025, 1234 (1236)."),
    "CITATION_MODIFIER_STYLE",
    "a.A.",
    "a. A."
  );
}

function runFormattingAndReviewCases(): void {
  const text = "Roxin, Strafrecht AT, 5. Aufl. 2020.";
  const authorEnd = text.indexOf(",");
  const actualFalse = findingsFor(text, [
    { start: 0, end: text.length, italic: false, bold: false, underline: "None" },
  ]);
  const formatting = byRule(actualFalse, "BOOK_AUTHOR_FORMATTING").find(
    (finding) => finding.start === 0 && finding.end === authorEnd
  );
  assert(formatting?.metadata?.formattingProperty === "italic", "Missing italic author finding");
  assert(formatting?.metadata?.role === "author", "Formatting role metadata must be semantic");

  const protectedAuthor = snapshot(text, 1, [
    { start: 0, end: text.length, italic: false, bold: false, underline: "None" },
  ]);
  protectedAuthor.protectedRanges = [{ type: "field", start: 0, end: authorEnd }];
  assert(
    byRule(analyzeFootnotes([protectedAuthor]).findings, "BOOK_AUTHOR_FORMATTING").every(
      (finding) => finding.start !== 0 || finding.end !== authorEnd
    ),
    "Formatting findings must respect protected ranges"
  );

  const actualTrue = findingsFor(text, [
    { start: 0, end: text.length, italic: true, bold: false, underline: "None" },
  ]);
  assert(
    byRule(actualTrue, "BOOK_AUTHOR_FORMATTING").every(
      (finding) =>
        finding.start !== 0 ||
        finding.end !== authorEnd ||
        finding.metadata?.formattingProperty !== "italic"
    ),
    "Already italic author must pass"
  );
  const mixed = findingsFor(text, [
    { start: 0, end: 2, italic: true },
    { start: 2, end: authorEnd, italic: false },
  ]);
  assert(
    byRule(mixed, "BOOK_AUTHOR_FORMATTING").every(
      (finding) =>
        finding.start !== 0 ||
        finding.end !== authorEnd ||
        finding.metadata?.formattingProperty !== "italic"
    ),
    "Mixed formatting must be skipped"
  );

  const formattingConsistency = analyzeFootnotes([
    snapshot("Roxin, Strafrecht AT, 5. Aufl. 2020.", 1, [
      { start: 0, end: 5, italic: true, bold: false, underline: "None" },
    ]),
    snapshot("Greco, Strafrecht AT, 5. Aufl. 2020.", 2, [
      { start: 0, end: 5, italic: true, bold: true, underline: "None" },
    ]),
  ]).findings;
  assert(
    byRule(formattingConsistency, "FORMATTING_CONSISTENCY").length === 1,
    "Unspecified formatting properties should still be checked for consistency"
  );

  const other = findingsFor("Unbekannte Quelle XYZ.");
  assert(byRule(other, "CITATION_OTHER_REVIEW")[0]?.severity === "info", "OTHER needs info");
  assert(
    byRule(findingsFor("BT-Drs. 20/."), "CITATION_EXTRACTION_UNRESOLVED")[0]?.severity === "info",
    "Unresolved known citation types need an info finding"
  );

  const unknownRoleText = "MüKo-StGB/Regge/Pegel, § 185 Rn. 39.";
  const unknownRole = analyzeFootnotes(
    [snapshot(unknownRoleText, 1, [{ start: 0, end: unknownRoleText.length, italic: false }])],
    { mappingData: { ...mappingData, sources: [], aliases: [] } }
  ).findings;
  assert(
    byRule(unknownRole, "COMMENTARY_FORMATTING").length === 0,
    "Unknown commentary roles must not create formatting findings"
  );
}

function runAdditionalCitationTypeCases(): void {
  const caseNote = findingsFor("Korte, Anmerkung BGH NJW 2025, 1234, 1236.");
  assertReplacement(caseNote, "CASE_NOTE_STYLE", "Anmerkung", "Anm.");
  assertReplacement(caseNote, "CASE_NOTE_STYLE", ", 1236", " (1236)");

  assertReplacement(
    findingsFor("Müller, Kapitel, in : Handbuch 2020, Seite 10."),
    "BOOK_CHAPTER_STYLE",
    "in :",
    "in:"
  );
  assertReplacement(
    findingsFor("Müller, Kapitel, in: Handbuch 2020, Seite 10."),
    "GENERIC_ABBREVIATION_STYLE",
    "Seite 10",
    "S. 10"
  );
  assertReplacement(
    findingsFor("BT-Drucks. 20/123, Seite 4."),
    "LEGISLATIVE_MATERIAL_PREFIX",
    "BT-Drucks.",
    "BT-Drs."
  );
  assertReplacement(
    findingsFor("BT-Drs. 20/123, Seite 4."),
    "GENERIC_ABBREVIATION_STYLE",
    "Seite 4",
    "S. 4"
  );
  assertReplacement(
    findingsFor("Onlinequelle https://example.com, letzter Aufruf am 5.7.2025."),
    "ONLINE_SOURCE_ACCESS_DATE",
    "5.7.2025",
    "05.07.2025"
  );
  const administrative = findingsFor("BMF-Schreiben vom 5.7.2025, IV A 1.");
  assertReplacement(administrative, "ADMINISTRATIVE_MATERIAL_DATE", "vom", "v.");
  assertReplacement(administrative, "ADMINISTRATIVE_MATERIAL_DATE", "5.7.2025", "05.07.2025");
}

function runDeterminismAndPerformanceCases(): void {
  const input = [snapshot("BGH, Urteil vom 5.7.2025 - 3 StR 123/25.")];
  const first = analyzeFootnotes(input).findings.map((finding) => finding.findingId);
  const second = analyzeFootnotes(input).findings.map((finding) => finding.findingId);
  assert(JSON.stringify(first) === JSON.stringify(second), "Finding IDs must be deterministic");
  assert(new Set(first).size === first.length, "Findings must be deduplicated");

  const mass = Array.from({ length: 1200 }, (_, index) =>
    snapshot(`BGH, Urteil vom 5.7.2025 - 3 StR ${100 + index}/25.`, index + 1)
  );
  const startedAt = Date.now();
  const result = analyzeFootnotes(mass);
  const elapsed = Date.now() - startedAt;
  assert(result.analyzedFootnotes === 1200, "All synthetic footnotes must be processed");
  assert(
    result.findings.every((finding) => finding.ruleId !== "RULE_OUTPUT_INVALID"),
    "No invalid output"
  );
  assert(elapsed < 10_000, `Rule Engine mass test too slow: ${elapsed} ms`);
  console.log(`POC 11 performance: 1200 footnotes in ${elapsed} ms`);
}

function runProfilePrecedenceCase(): void {
  const profile = createDefaultCitationStyleProfile();
  profile.caseLaw.decisionTypeOutput.JUDGMENT = "U.";
  const findings = analyzeFootnotes([snapshot("BGH, Urteil v. 05.07.2025 – 3 StR 123/25.")], {
    profile,
  }).findings;
  assertReplacement(findings, "CASE_LAW_DECISION_TYPE", "Urteil", "U.");
  assert(
    byRule(findings, "CITATION_STYLE_CONSISTENCY").length === 0,
    "Document majority must not override the active profile"
  );

  profile.book.personSeparator = " / ";
  const localPersonRuleIsPrimary = analyzeFootnotes(
    [
      snapshot("Roxin/Greco, Strafrecht AT, 5. Aufl. 2020.", 1),
      snapshot("Wessels/Beulke, Strafrecht AT, 5. Aufl. 2020.", 2),
    ],
    { profile }
  ).findings;
  assert(
    byRule(localPersonRuleIsPrimary, "BOOK_PERSON_SEPARATOR").length === 2 &&
      byRule(localPersonRuleIsPrimary, "CITATION_STYLE_CONSISTENCY").length === 0,
    "The profile-based person-separator rule must suppress duplicate consistency advice"
  );

  const localPinpointRuleIsPrimary = analyzeFootnotes([
    snapshot("Korte, NZWiSt 2018, 231 (233).", 1),
    snapshot("Korte, NZWiSt 2018, 231, 233.", 2),
  ]).findings;
  assert(
    byRule(localPinpointRuleIsPrimary, "JOURNAL_PINPOINT_STYLE").length === 1 &&
      byRule(localPinpointRuleIsPrimary, "CITATION_STYLE_CONSISTENCY").length === 0,
    "The profile-based pinpoint rule must suppress duplicate consistency advice"
  );
}

runPunctuationAndStructureCases();
runStatuteCases();
runCaseLawCases();
runMappingAndCitationCases();
runFormattingAndReviewCases();
runAdditionalCitationTypeCases();
runProfilePrecedenceCase();
runDeterminismAndPerformanceCases();
