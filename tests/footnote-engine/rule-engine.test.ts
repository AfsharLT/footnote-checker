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

  const multiFinding = findingsFor(
    "BGH, Urteil vom 5.7.2025 – 3 StR 123/25 = NJW 2025, 1234 = BeckRS 2025, 12345."
  );
  for (const ruleId of [
    "CASE_LAW_DECISION_TYPE",
    "CASE_LAW_DATE_INTRODUCER",
    "CASE_LAW_DATE_FORMAT",
  ]) {
    assert(byRule(multiFinding, ruleId).length === 1, `${ruleId} must run independently`);
  }
  assert(
    byRule(multiFinding, "RULE_OUTPUT_INVALID").length === 0,
    "Independent case-law findings must remain valid"
  );

  const shortYear = findingsFor("BGH, Urteil vom 5.7.25 – 3 StR 123/25.");
  assertReplacement(shortYear, "CASE_LAW_DECISION_TYPE", "Urteil", "Urt.");
  assertReplacement(shortYear, "CASE_LAW_DATE_INTRODUCER", "vom", "v.");
  const shortYearDate = byRule(shortYear, "CASE_LAW_DATE_FORMAT")[0];
  assert(
    shortYearDate?.originalText === "5.7.25" &&
      shortYearDate.suggestedText === undefined &&
      shortYearDate.metadata?.requiresManualReview === true &&
      shortYearDate.message ===
        "Das Jahr „25“ ist nur zweistellig angegeben. Bitte prüfen Sie, welches vierstellige Jahr gemeint ist.",
    "A two-digit year must be found but never expanded by assumption"
  );

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

  const technicalText = "0123456789abcdefghij-rest.";
  const technicalFootnote = snapshot(technicalText, 20, [
    { start: 10, end: 20, fontName: "Arial", fontSize: 10, bold: true },
  ]);
  technicalFootnote.baseCharacterFormat = {
    fontName: "Aptos Serif",
    fontSize: 8,
    bold: false,
  };
  const technicalFindings = analyzeFootnotes([technicalFootnote]).findings;
  const fontName = byRule(technicalFindings, "FORMAT_FONT_NAME")[0];
  const fontSize = byRule(technicalFindings, "FORMAT_FONT_SIZE")[0];
  const boldReview = byRule(technicalFindings, "FORMAT_BOLD")[0];
  assert(
    fontName?.start === 10 &&
      fontName.end === 20 &&
      fontName.metadata?.actual === "Arial" &&
      fontName.metadata?.expected === "Aptos Serif",
    "A safe local font-name outlier needs an exact finding"
  );
  assert(
    fontSize?.start === 10 &&
      fontSize.end === 20 &&
      fontSize.metadata?.actual === 10 &&
      fontSize.metadata?.expected === 8,
    "A safe local font-size outlier needs an independent finding"
  );
  assert(
    boldReview?.start === 10 &&
      boldReview.end === 20 &&
      boldReview.metadata?.actual === true &&
      boldReview.metadata?.expected === false,
    "A semantically unclear bold outlier must remain an independent finding"
  );

  const unknownItalicFootnote = snapshot("Unbekannte Quelle XYZ.", 21, [
    { start: 11, end: 17, italic: true },
  ]);
  unknownItalicFootnote.baseCharacterFormat = { italic: false };
  const italicReview = byRule(
    analyzeFootnotes([unknownItalicFootnote]).findings,
    "FORMAT_ITALIC_REVIEW"
  )[0];
  assert(
    italicReview?.start === 11 &&
      italicReview.end === 17 &&
      italicReview.metadata?.role === "unknown",
    "Unknown italic semantics must remain visible as a conservative finding"
  );

  const bearbeiterText = "MüKo-StGB/Fischer, § 263 Rn. 4.";
  const unformattedBearbeiter = snapshot(bearbeiterText, 22, [
    { start: 0, end: bearbeiterText.length, italic: false },
  ]);
  unformattedBearbeiter.baseCharacterFormat = { italic: false };
  assert(
    byRule(analyzeFootnotes([unformattedBearbeiter]).findings, "COMMENTARY_FORMATTING").some(
      (finding) =>
        finding.metadata?.role === "bearbeiter" &&
        finding.metadata?.formattingProperty === "italic" &&
        finding.metadata?.expected === true
    ),
    "A safely identified bearbeiter must use the role-specific italic rule"
  );

  const formattedBearbeiter = snapshot(bearbeiterText, 23, [
    { start: bearbeiterText.indexOf("Fischer"), end: bearbeiterText.indexOf("Fischer") + 7, italic: true },
  ]);
  formattedBearbeiter.baseCharacterFormat = { italic: false };
  const legitimateFindings = analyzeFootnotes([formattedBearbeiter]).findings;
  assert(
    byRule(legitimateFindings, "COMMENTARY_FORMATTING").every(
      (finding) => finding.metadata?.formattingProperty !== "italic"
    ) && byRule(legitimateFindings, "FORMAT_ITALIC_REVIEW").length === 0,
    "A legitimate role-specific italic run must not become a generic outlier"
  );

  const ambiguousBaseline = snapshot("Uneinheitlich.", 24, [
    { start: 0, end: 3, fontName: "Arial" },
  ]);
  ambiguousBaseline.baseCharacterFormat = { fontName: null };
  assert(
    byRule(analyzeFootnotes([ambiguousBaseline]).findings, "FORMAT_FONT_NAME").length === 0,
    "An incompletely covered mixed baseline must not create an automatic finding"
  );

  const normalOne = snapshot("Erste Fußnote.", 30);
  normalOne.baseCharacterFormat = {
    fontName: "Aptos Serif",
    fontSize: 8,
    bold: false,
    italic: false,
    underline: "None",
  };
  normalOne.paragraphs = [{ index: 0, start: 0, end: normalOne.contentText.length }];
  const normalTwo = snapshot("Zweite Fußnote.", 31);
  normalTwo.baseCharacterFormat = { ...normalOne.baseCharacterFormat };
  normalTwo.paragraphs = [{ index: 0, start: 0, end: normalTwo.contentText.length }];
  const wholeOutlier = snapshot("Falsch formatierte Fußnote.", 32);
  wholeOutlier.baseCharacterFormat = {
    ...normalOne.baseCharacterFormat,
    fontName: "Arial",
    fontSize: 10,
  };
  wholeOutlier.paragraphs = [{ index: 0, start: 0, end: wholeOutlier.contentText.length }];
  const documentFindings = analyzeFootnotes([normalOne, normalTwo, wholeOutlier]).findings.filter(
    (finding) => finding.footnoteId === wholeOutlier.id && finding.category === "formatting"
  );
  assert(
    byRule(documentFindings, "FORMAT_FONT_NAME").length === 1 &&
      byRule(documentFindings, "FORMAT_FONT_SIZE").length === 1 &&
      documentFindings.every(
        (finding) =>
          finding.start === 0 &&
          finding.end === wholeOutlier.contentText.length &&
          finding.originalText === wholeOutlier.contentText &&
          finding.metadata?.baselineSource === "DOCUMENT_FOOTNOTE_FORMAT"
      ),
    "A complete wrong-font footnote must be compared with the document baseline"
  );

  const mixedPropertyTarget = snapshot("0123456789abcdefghij-rest.", 33, [
    { start: 10, end: 20, fontName: "Arial", fontSize: 10, italic: true },
  ]);
  mixedPropertyTarget.baseCharacterFormat = {
    fontName: "Aptos Serif",
    fontSize: 8,
    italic: null,
  };
  const mixedPropertyFindings = analyzeFootnotes([
    normalOne,
    normalTwo,
    mixedPropertyTarget,
  ]).findings.filter((finding) => finding.footnoteId === mixedPropertyTarget.id);
  assert(
    byRule(mixedPropertyFindings, "FORMAT_FONT_NAME").length === 1 &&
      byRule(mixedPropertyFindings, "FORMAT_FONT_SIZE").length === 1 &&
      byRule(mixedPropertyFindings, "FORMAT_ITALIC_REVIEW").length === 1,
    "A mixed italic base must not block concrete font and size findings"
  );

  const mappedText = "MüKo-StGB/Fischer Rn. 4.";
  const mappedFootnote = snapshot(mappedText, 34);
  mappedFootnote.baseCharacterFormat = { italic: null };
  const mappedResult = analyzeFootnotes([normalOne, normalTwo, mappedFootnote], {
    mappingData,
  });
  const mappedFormatting = mappedResult.findings.find(
    (finding) =>
      finding.ruleId === "COMMENTARY_FORMATTING" &&
      finding.metadata?.roleResolutionSource === "SOURCE_MAPPING_HINT"
  );
  assert(
    mappedFormatting?.originalText === "Fischer" &&
      mappedFormatting.start === mappedText.indexOf("Fischer") &&
      mappedFormatting.metadata?.requiresManualReview === true,
    "A mapped MüKo bearbeiter candidate must create an exact conservative formatting finding"
  );

  const multiBearbeiterText = "MüKo-StGB/Regge/Pegel, § 185 Rn. 39.";
  const multiBearbeiter = snapshot(multiBearbeiterText, 35);
  multiBearbeiter.baseCharacterFormat = { italic: false };
  const multiBearbeiterFindings = analyzeFootnotes([multiBearbeiter], { mappingData }).findings.filter(
    (finding) =>
      finding.ruleId === "COMMENTARY_FORMATTING" &&
      finding.metadata?.roleResolutionSource === "SOURCE_MAPPING_HINT"
  );
  assert(
    multiBearbeiterFindings.length === 2 &&
      multiBearbeiterFindings.map((finding) => finding.originalText).join("/") === "Regge/Pegel",
    "Every safely delimited mapping-hint bearbeiter must receive an independent finding"
  );

  const partlyFormattedBearbeiter = snapshot(multiBearbeiterText, 36, [
    {
      start: multiBearbeiterText.indexOf("Regge"),
      end: multiBearbeiterText.indexOf("Regge") + "Regge".length,
      italic: true,
    },
  ]);
  partlyFormattedBearbeiter.baseCharacterFormat = { italic: false };
  const partlyFormattedFindings = analyzeFootnotes([partlyFormattedBearbeiter], {
    mappingData,
  }).findings.filter(
    (finding) =>
      finding.ruleId === "COMMENTARY_FORMATTING" &&
      finding.metadata?.roleResolutionSource === "SOURCE_MAPPING_HINT"
  );
  assert(
    partlyFormattedFindings.length === 1 && partlyFormattedFindings[0].originalText === "Pegel",
    "A correctly italic mapping candidate must pass while the second candidate remains visible"
  );

  const journalText = "Tenckhoff, JuS 1988, 787 (788).";
  const journalExpectedPlain = createDefaultCitationStyleProfile();
  journalExpectedPlain.journalArticle.authorFormatting.italic = false;
  const italicJournalAuthor = snapshot(journalText, 37, [
    { start: 0, end: "Tenckhoff".length, italic: true },
  ]);
  italicJournalAuthor.baseCharacterFormat = { italic: false };
  const unexpectedJournalItalic = analyzeFootnotes([italicJournalAuthor], {
    profile: journalExpectedPlain,
  }).findings.filter((finding) => finding.ruleId === "JOURNAL_AUTHOR_FORMATTING");
  assert(
    unexpectedJournalItalic.length === 1 &&
      unexpectedJournalItalic[0].originalText === "Tenckhoff" &&
      unexpectedJournalItalic[0].metadata?.expected === false,
    "An author italicized against the active journal setting must create one finding"
  );

  const correctJournalItalic = analyzeFootnotes([italicJournalAuthor]).findings.filter(
    (finding) => finding.ruleId === "JOURNAL_AUTHOR_FORMATTING"
  );
  assert(
    correctJournalItalic.length === 0,
    "An italic author matching the active journal setting must not create a finding"
  );

  const plainJournalAuthor = snapshot(journalText, 38);
  plainJournalAuthor.baseCharacterFormat = { italic: false };
  const missingJournalItalic = analyzeFootnotes([plainJournalAuthor]).findings.filter(
    (finding) => finding.ruleId === "JOURNAL_AUTHOR_FORMATTING"
  );
  assert(
    missingJournalItalic.length === 1 &&
      missingJournalItalic[0].originalText === "Tenckhoff" &&
      missingJournalItalic[0].metadata?.expected === true,
    "A non-italic author against an italic journal setting must create one finding"
  );

  const journalAuthorsText = "Müller/Meier, NJW 2025, 100 (105).";
  const journalAuthors = snapshot(journalAuthorsText, 39);
  journalAuthors.baseCharacterFormat = { italic: false };
  const journalAuthorFindings = analyzeFootnotes([journalAuthors]).findings.filter(
    (finding) => finding.ruleId === "JOURNAL_AUTHOR_FORMATTING"
  );
  assert(
    journalAuthorFindings.length === 2 &&
      journalAuthorFindings.map((finding) => finding.originalText).join("/") === "Müller/Meier",
    "All safely extracted journal authors must be checked independently"
  );

  const formattingOwners = [
    technicalFootnote,
    normalOne,
    normalTwo,
    wholeOutlier,
    mixedPropertyTarget,
    mappedFootnote,
    multiBearbeiter,
    partlyFormattedBearbeiter,
    italicJournalAuthor,
    plainJournalAuthor,
    journalAuthors,
  ];
  const formattingIntegrity = [
    ...technicalFindings,
    ...documentFindings,
    ...mixedPropertyFindings,
    ...mappedResult.findings,
    ...multiBearbeiterFindings,
    ...partlyFormattedFindings,
    ...unexpectedJournalItalic,
    ...missingJournalItalic,
    ...journalAuthorFindings,
  ].filter((finding) => finding.category === "formatting");
  assert(
    formattingIntegrity.every((finding) => {
      const owner = formattingOwners.find((footnote) => footnote.id === finding.footnoteId);
      return (
        owner !== undefined &&
        finding.start >= 0 &&
        finding.start < finding.end &&
        finding.end <= owner.contentText.length &&
        finding.originalText === owner.contentText.slice(finding.start, finding.end)
      );
    }) && !mappedResult.findings.some((finding) => finding.ruleId === "RULE_OUTPUT_INVALID"),
    "Every formatting finding must retain absolute valid contentText offsets"
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

  const formattingMass = Array.from({ length: 1200 }, (_, index) => {
    const footnote = snapshot("0123456789abcdefghij-rest.", index + 2000, [
      { start: 10, end: 20, fontName: "Arial", fontSize: 10 },
    ]);
    footnote.baseCharacterFormat = { fontName: "Aptos Serif", fontSize: 8 };
    return footnote;
  });
  const formattingStartedAt = Date.now();
  const formattingResult = analyzeFootnotes(formattingMass);
  const formattingElapsed = Date.now() - formattingStartedAt;
  assert(
    byRule(formattingResult.findings, "FORMAT_FONT_NAME").length === 1200 &&
      byRule(formattingResult.findings, "FORMAT_FONT_SIZE").length === 1200,
    "Formatting mass test must preserve both independent findings per footnote"
  );
  assert(
    formattingElapsed < 10_000,
    `Formatting mass test too slow: ${formattingElapsed} ms`
  );
  console.log(`POC 12.3 formatting performance: 1200 footnotes in ${formattingElapsed} ms`);

  const multiPersonMass = Array.from({ length: 1200 }, (_, index) => {
    const footnote = snapshot(
      `MüKo-StGB/Regge/Pegel, § 185 Rn. ${index + 1}.`,
      index + 4000
    );
    footnote.baseCharacterFormat = { italic: false };
    return footnote;
  });
  const multiPersonStartedAt = Date.now();
  const multiPersonResult = analyzeFootnotes(multiPersonMass, { mappingData });
  const multiPersonElapsed = Date.now() - multiPersonStartedAt;
  assert(
    multiPersonResult.findings.filter(
      (finding) =>
        finding.ruleId === "COMMENTARY_FORMATTING" &&
        finding.metadata?.roleResolutionSource === "SOURCE_MAPPING_HINT"
    ).length === 2400,
    "Formatting mass test must retain both mapping-hint persons per footnote"
  );
  assert(
    multiPersonElapsed < 10_000,
    `Multi-person formatting mass test too slow: ${multiPersonElapsed} ms`
  );
  console.log(
    `POC 12.3 multi-person performance: 1200 footnotes in ${multiPersonElapsed} ms`
  );
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

  const longJournalPinpoint = analyzeFootnotes([
    snapshot("Pawlik, Jahrbuch für Recht und Ethik 2003, 287, 310.", 3),
  ]).findings;
  assertReplacement(longJournalPinpoint, "JOURNAL_PINPOINT_STYLE", ", 310", " (310)");
  const qualifiedLongJournalPinpoint = analyzeFootnotes([
    snapshot(
      "enger: Pawlik, Jahrbuch für Recht und Ethik 2003, 287, 310: keine Entschuldigung bei deutlichem Übergewicht.",
      4
    ),
  ]).findings;
  assertReplacement(
    qualifiedLongJournalPinpoint,
    "JOURNAL_PINPOINT_STYLE",
    ", 310",
    " (310)"
  );

  const followingPinpoint = analyzeFootnotes([
    snapshot("Korte, NZWiSt 2018, 231, 233 ff.", 5),
  ]).findings;
  assertReplacement(
    followingPinpoint,
    "JOURNAL_PINPOINT_STYLE",
    ", 233 ff.",
    " (233 ff.)"
  );

  for (const text of [
    "Korte, NZWiSt 2018, 231 (233).",
    "Korte, NZWiSt 2018, 231.",
    "MüKo-StGB/Fischer, § 32 Rn. 11, 48.",
    "BGH, Urt. v. 05.07.2025 – 3 StR 123/25.",
  ]) {
    assert(
      byRule(analyzeFootnotes([snapshot(text)]).findings, "JOURNAL_PINPOINT_STYLE").length ===
        0,
      `Pinpoint parentheses must not be proposed without a safe journal start-page/pinpoint pair: ${text}`
    );
  }
}

runPunctuationAndStructureCases();
runStatuteCases();
runCaseLawCases();
runMappingAndCitationCases();
runFormattingAndReviewCases();
runAdditionalCitationTypeCases();
runProfilePrecedenceCase();
runDeterminismAndPerformanceCases();
