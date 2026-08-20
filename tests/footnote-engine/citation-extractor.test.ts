import { isValidCitationExtraction } from "../../src/footnote-engine/citation-extractor";
import { analyzeFootnotes } from "../../src/footnote-engine/engine";
import type {
  CitationExtractionResult,
  CitationSegment,
  CitationType,
  StatuteExtraction,
} from "../../src/footnote-engine/types";
import type { FootnoteSnapshot, FormattingRun } from "../../src/taskpane/taskpane";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function createSnapshot(
  contentText: string,
  ordinal = 1,
  formattingRuns: FormattingRun[] = []
): FootnoteSnapshot {
  return {
    id: `extraction-footnote-${ordinal}`,
    ordinal,
    contentText,
    originalTextHash: `extraction-hash-${ordinal}-${contentText.length}`,
    protectedRanges: [],
    paragraphs: [],
    formattingRuns,
  } as FootnoteSnapshot;
}

function extract(
  text: string,
  expectedType: CitationType,
  formattingRuns: FormattingRun[] = []
): { segment: CitationSegment; extraction: CitationExtractionResult } {
  const result = analyzeFootnotes([createSnapshot(text, 1, formattingRuns)]);
  assert(result.parseResults[0].segments.length === 1, `Expected one segment for ${text}`);
  const segment = result.parseResults[0].segments[0];
  assert(segment.classification.type === expectedType, `Unexpected classification for ${text}`);
  assert(segment.extraction !== undefined, `Missing extraction for ${text}`);
  assert(segment.extraction?.type === expectedType, `Extraction type mismatch for ${text}`);
  assert(
    isValidCitationExtraction(segment.extraction!, text),
    `Invalid component offsets for ${text}`
  );
  assert(
    result.findings.every((finding) => finding.ruleId !== "RULE_OUTPUT_INVALID"),
    "Extraction must not lead to invalid rule output"
  );
  return { segment, extraction: segment.extraction! };
}

function statute(text: string): StatuteExtraction {
  const extraction = extract(text, "STATUTE").extraction;
  assert(extraction.type === "STATUTE", `Expected statute extraction for ${text}`);
  return extraction.data;
}

function runStatuteCases(): void {
  const simple = statute("§ 263 StGB");
  assert(simple.unitType?.value === "§", "Single-section unit missing");
  assert(simple.sections[0].section.value === "263", "Simple section missing");
  assert(simple.law?.value === "StGB", "Simple law missing");

  const paragraph = statute("§ 263 Abs. 1 StGB");
  assert(paragraph.sections[0].paragraph?.value === "1", "Paragraph missing");

  const shorthand = statute("§ 264 I 1 BGB");
  assert(shorthand.sections[0].paragraph?.rawText === "I", "Roman raw text missing");
  assert(shorthand.sections[0].paragraph?.value === "1", "Roman normalization missing");
  assert(shorthand.sections[0].sentence?.value === "1", "Shorthand sentence missing");
  assert(shorthand.law?.value === "BGB", "Shorthand law missing");

  const granular = statute("§ 264a Abs. 3 S. 2 Nr. 1 lit. b 2. Alt. StGB");
  const granularSection = granular.sections[0];
  assert(granularSection.section.value === "264a", "Alphanumeric section missing");
  assert(granularSection.paragraph?.value === "3", "Granular paragraph missing");
  assert(granularSection.sentence?.value === "2", "Granular sentence missing");
  assert(granularSection.number?.value === "1", "Granular number missing");
  assert(granularSection.letter?.value === "b", "Granular letter missing");
  assert(granularSection.alternative?.value === "2", "Granular alternative missing");

  const plural = statute("§§ 263, 263a StGB");
  assert(plural.unitType?.value === "§§", "Plural unit missing");
  assert(
    plural.sections.map((section) => section.section.value).join(",") === "263,263a",
    "Plural sections missing"
  );

  const pluralSuffixRead = extract("§§ 263, 263a ff. StGB", "STATUTE");
  const pluralSuffixResult = pluralSuffixRead.extraction;
  assert(pluralSuffixResult.type === "STATUTE", "Plural suffix extraction mismatch");
  assert(pluralSuffixResult.data.sections[0].section.value === "263", "First section missing");
  assert(pluralSuffixResult.data.sections[1].section.value === "263a", "Second section missing");
  assert(pluralSuffixResult.data.sections[1].suffix?.value === "ff.", "Plural suffix missing");
  assert(pluralSuffixResult.data.law?.value === "StGB", "Plural law missing");
  assert(pluralSuffixResult.status === "complete", "Plural suffix citation must be complete");
  assert(
    pluralSuffixRead.segment.modifiers.every((modifier) => modifier.text !== "ff."),
    "ff. must not become a citation modifier"
  );

  const paragraphSuffix = statute("§ 263 Abs. 1 ff. StGB");
  assert(paragraphSuffix.sections[0].paragraph?.value === "1", "Paragraph value missing");
  assert(
    paragraphSuffix.sections[0].paragraph?.suffix === "ff.",
    "Paragraph suffix must be bound to paragraph"
  );

  const complete = statute("§ 263 Abs. 1 S. 1 Nr. 2 Buchst. a Hs. 2 1. Alt. StGB");
  const completeSection = complete.sections[0];
  assert(completeSection.paragraph?.value === "1", "Complete paragraph missing");
  assert(completeSection.sentence?.value === "1", "Complete sentence missing");
  assert(completeSection.number?.value === "2", "Complete number missing");
  assert(completeSection.letter?.value === "a", "Complete letter missing");
  assert(completeSection.halfSentence?.value === "2", "Complete half sentence missing");
  assert(completeSection.alternative?.value === "1", "Complete alternative missing");

  const article = statute("Art. 5 Abs. 1 GG");
  assert(article.unitType?.value === "Art.", "Article unit missing");
  assert(article.sections[0].section.value === "5", "Article section missing");
}

function runCaseLawCases(): void {
  const direct = extract("BGH, Urt. v. 05.07.2025 – 3 StR 123/25", "CASE_LAW").extraction;
  assert(direct.type === "CASE_LAW", "Direct extraction mismatch");
  assert(direct.data.court?.value === "BGH", "Court missing");
  assert(direct.data.decisionTypeNormalized === "JUDGMENT", "Decision normalization missing");
  assert(direct.data.normalizedDate === "2025-07-05", "Date normalization missing");
  assert(direct.data.docketNumber?.value === "3 StR 123/25", "Docket missing");

  const official = extract("BGHSt 47, 45 (49)", "CASE_LAW").extraction;
  assert(official.type === "CASE_LAW", "Official extraction mismatch");
  const officialCitation = official.data.parallelCitations[0];
  assert(officialCitation.kind === "officialCollection", "Official collection kind missing");
  assert(
    officialCitation.kind === "officialCollection" &&
      officialCitation.collection.value === "BGHSt" &&
      officialCitation.volume?.value === "47" &&
      officialCitation.firstPage?.value === "45" &&
      officialCitation.pinpointPages[0]?.value === "49",
    "Official collection components missing"
  );
  assert(official.data.court === undefined, "Official collection must not invent court text");
  assert(official.data.decisionType === undefined, "Official collection must not invent type");
  assert(official.data.date === undefined, "Official collection must not invent date");
  assert(official.data.docketNumber === undefined, "Official collection must not invent docket");
  assert(official.data.derivedCourt?.value === "BGH", "Derived BGH court missing");
  assert(
    official.data.derivedCourt?.source === "officialCollectionMapping",
    "Derived-court source missing"
  );
  assert(official.status === "complete", "Official collection must be complete");

  const journal = extract("BGH NJW 2025, 1234 (1236)", "CASE_LAW").extraction;
  assert(journal.type === "CASE_LAW", "Journal case extraction mismatch");
  assert(journal.data.parallelCitations[0].kind === "journal", "Journal citation missing");

  const directJournal = extract(
    "BGH, Urt. v. 05.07.2025 – 3 StR 123/25 = NJW 2025, 1234",
    "CASE_LAW"
  ).extraction;
  assert(directJournal.type === "CASE_LAW", "Hybrid extraction mismatch");
  assert(directJournal.data.parallelCitations.length === 1, "Parallel journal missing");

  const hybrid = extract(
    "BGH, Urt. v. 05.07.2025 – 3 StR 123/25 = NJW 2025, 1234 (1236) = BeckRS 2025, 12345",
    "CASE_LAW"
  ).extraction;
  assert(hybrid.type === "CASE_LAW", "Full hybrid extraction mismatch");
  assert(hybrid.data.parallelCitations.length === 2, "Two parallel citations required");
  const hybridJournal = hybrid.data.parallelCitations[0];
  assert(hybridJournal.kind === "journal", "Hybrid journal citation missing");
  assert(hybridJournal.pinpointPages[0]?.value === "1236", "Hybrid pinpoint missing");
  assert(hybrid.data.parallelCitations[1].kind === "database", "Database citation missing");

  const officialSuffix = extract("BGHZ 100, 1 (5 f.)", "CASE_LAW").extraction;
  assert(officialSuffix.type === "CASE_LAW", "Official suffix extraction mismatch");
  const officialSuffixCitation = officialSuffix.data.parallelCitations[0];
  assert(officialSuffixCitation.kind === "officialCollection", "Official suffix kind missing");
  assert(officialSuffixCitation.pinpointPages[0]?.value === "5", "Official pinpoint missing");
  assert(officialSuffixCitation.pinpointPages[0]?.suffix === "f.", "Official suffix missing");

  const journalSuffix = extract("BGH NJW 2025, 1234 f.", "CASE_LAW").extraction;
  assert(journalSuffix.type === "CASE_LAW", "Journal suffix extraction mismatch");
  const journalSuffixCitation = journalSuffix.data.parallelCitations[0];
  assert(journalSuffixCitation.kind === "journal", "Journal suffix kind missing");
  assert(journalSuffixCitation.firstPage?.suffix === "f.", "Journal suffix missing");

  const constitutional = extract("BVerfGE 120, 274 (300 ff.)", "CASE_LAW").extraction;
  assert(constitutional.type === "CASE_LAW", "BVerfGE extraction mismatch");
  const constitutionalCitation = constitutional.data.parallelCitations[0];
  assert(
    constitutionalCitation.kind === "officialCollection" &&
      constitutionalCitation.pinpointPages[0]?.value === "300" &&
      constitutionalCitation.pinpointPages[0]?.suffix === "ff.",
    "BVerfGE pinpoint suffix missing"
  );
  assert(constitutional.data.derivedCourt?.value === "BVerfG", "Derived BVerfG missing");
}

function runCommentaryCases(): void {
  const single = extract("MüKo-StGB/Schneider, § 263 Rn. 4", "COMMENTARY").extraction;
  assert(single.type === "COMMENTARY", "Single commentary extraction mismatch");
  assert(single.data.work?.value === "MüKo-StGB", "Commentary work missing");
  assert(single.data.persons[0].rawText === "Schneider", "Commentary person missing");
  assert(single.data.persons[0].role === "unknown", "Commentary role must remain unknown");
  assert(single.data.statuteReference?.referenceContext === "statute", "Commented statute missing");
  assert(single.data.marginNumbers[0].value === "4", "Commentary margin missing");
  assert(single.status === "partial", "Ambiguous commentary role must be partial");

  const multiText = "MüKo-StGB/Regge/Pegel, § 185 Rn. 39";
  const reggeStart = multiText.indexOf("Regge");
  const multi = extract(multiText, "COMMENTARY", [
    { start: reggeStart, end: reggeStart + "Regge".length, italic: true },
  ]).extraction;
  assert(multi.type === "COMMENTARY", "Multi commentary extraction mismatch");
  assert(multi.data.persons.length === 2, "Slash persons must remain separate");
  assert(
    multi.data.persons[0].roleSignals?.includes("ITALIC_FORMATTING") === true,
    "Formatting signal missing"
  );
  assert(
    multi.data.persons.every((person) => person.role === "unknown"),
    "Formatting must not decide roles"
  );

  const ambiguous = extract("MüKo-StGB/Herausgeber/Bearbeiter, § 1 Rn. 2", "COMMENTARY").extraction;
  assert(ambiguous.type === "COMMENTARY", "Ambiguous commentary extraction mismatch");
  assert(ambiguous.data.personSequence?.roleResolution === "ambiguous", "Role ambiguity missing");

  const beck = extract("BeckOK-StGB/Heuchemer, § 73 Rn. 7", "COMMENTARY").extraction;
  assert(
    beck.type === "COMMENTARY" && beck.data.work?.value === "BeckOK-StGB",
    "BeckOK work missing"
  );
}

function runOtherCitationTypes(): void {
  const book = extract(
    "Roxin/Greco, Strafrecht AT I, 5. Aufl. 2020, § 10 Rn. 12",
    "BOOK"
  ).extraction;
  assert(book.type === "BOOK", "Book extraction mismatch");
  assert(book.data.authors.length === 2, "Book authors missing");
  assert(book.data.title?.value === "Strafrecht AT I", "Book title missing");
  assert(book.data.workSection?.value === "10", "Work section missing");
  assert(book.data.marginNumbers[0].value === "12", "Book margin missing");

  const bookSuffix = extract(
    "Wessels/Beulke/Satzger, Strafrecht AT, 53. Aufl. 2023, Rn. 100 ff.",
    "BOOK"
  ).extraction;
  assert(bookSuffix.type === "BOOK", "Book suffix extraction mismatch");
  assert(bookSuffix.data.authors.length === 3, "Three book authors required");
  assert(bookSuffix.data.marginNumbers[0].suffix === "ff.", "Margin suffix missing");

  const pageSuffix = extract("Roxin, Strafrecht AT, 2020, S. 123 f.", "BOOK").extraction;
  assert(pageSuffix.type === "BOOK", "Book page-locator extraction mismatch");
  assert(pageSuffix.data.pages[0].value === "123", "Page locator missing");
  assert(pageSuffix.data.pages[0].suffix === "f.", "Page suffix missing");

  const article = extract("Tenckhoff, JuS 1988, 787 (788)", "JOURNAL_ARTICLE").extraction;
  assert(article.type === "JOURNAL_ARTICLE", "Journal article extraction mismatch");
  assert(article.data.authors[0].rawText === "Tenckhoff", "Article author missing");
  assert(article.data.journal?.value === "JuS", "Journal missing");
  assert(article.data.year?.value === "1988", "Article year missing");
  assert(article.data.firstPage?.value === "787", "Article first page missing");
  assert(article.data.pinpointPages[0].value === "788", "Article pinpoint missing");
  assert(article.status === "complete", "Article pinpoint citation must be complete");
  assert(article.unparsedRemainder.length === 0, "Parsed pinpoint must leave no remainder");

  const articleSuffix = extract("Korte, NZWiSt 2018, 231 (233 f.)", "JOURNAL_ARTICLE").extraction;
  assert(articleSuffix.type === "JOURNAL_ARTICLE", "Article suffix extraction mismatch");
  assert(articleSuffix.data.firstPage?.value === "231", "Article first page missing");
  assert(articleSuffix.data.pinpointPages[0].value === "233", "Article pinpoint missing");
  assert(articleSuffix.data.pinpointPages[0].suffix === "f.", "Pinpoint suffix missing");
  assert(articleSuffix.status === "complete", "Article suffix citation must be complete");

  const articleFollowingPages = extract(
    "Müller, NJW 2025, 100 (105 ff.)",
    "JOURNAL_ARTICLE"
  ).extraction;
  assert(articleFollowingPages.type === "JOURNAL_ARTICLE", "Article ff. mismatch");
  assert(articleFollowingPages.data.pinpointPages[0].value === "105", "Article ff. page missing");
  assert(articleFollowingPages.data.pinpointPages[0].suffix === "ff.", "Article ff. missing");

  const multiplePinpoints = extract(
    "Müller, NJW 2025, 100 (105 f., 110)",
    "JOURNAL_ARTICLE"
  ).extraction;
  assert(multiplePinpoints.type === "JOURNAL_ARTICLE", "Multiple pinpoints mismatch");
  assert(multiplePinpoints.data.pinpointPages.length === 2, "Two pinpoints required");
  assert(multiplePinpoints.data.pinpointPages[0].value === "105", "First pinpoint missing");
  assert(multiplePinpoints.data.pinpointPages[0].suffix === "f.", "First pinpoint suffix missing");
  assert(multiplePinpoints.data.pinpointPages[1].value === "110", "Second pinpoint missing");
  assert(multiplePinpoints.status === "complete", "Multiple pinpoints must be complete");

  const compactPinpoint = extract("Tenckhoff, JuS 1988, 787(788)", "JOURNAL_ARTICLE").extraction;
  assert(compactPinpoint.type === "JOURNAL_ARTICLE", "Compact pinpoint mismatch");
  assert(compactPinpoint.data.pinpointPages[0].value === "788", "Compact pinpoint missing");

  const unknownPinpoint = extract(
    "Tenckhoff, JuS 1988, 787 (Seite 788)",
    "JOURNAL_ARTICLE"
  ).extraction;
  assert(unknownPinpoint.type === "JOURNAL_ARTICLE", "Unknown pinpoint mismatch");
  assert(unknownPinpoint.status === "partial", "Unknown pinpoint text must prevent complete");
  assert(
    unknownPinpoint.unparsedRemainder.some((remainder) => remainder.rawText === "Seite"),
    "Unknown pinpoint text must remain unparsed"
  );

  const chapter = extract(
    "Müller, in: Festschrift für X, 2025, S. 123 ff.",
    "BOOK_CHAPTER"
  ).extraction;
  assert(chapter.type === "BOOK_CHAPTER", "Book chapter extraction mismatch");
  assert(chapter.data.containerTitle?.value === "Festschrift für X", "Container title missing");
  assert(chapter.data.firstPage?.value === "123", "Chapter first page missing");
  assert(chapter.data.pinpointPages[0].suffix === "ff.", "Chapter page suffix missing");

  const legislative = extract("BT-Drs. 20/1234, S. 15 f.", "LEGISLATIVE_MATERIAL").extraction;
  assert(legislative.type === "LEGISLATIVE_MATERIAL", "Legislative extraction mismatch");
  assert(legislative.data.body?.normalizedValue === "Bundestag", "Legislative body missing");
  assert(legislative.data.legislativeTerm?.value === "20", "Legislative term missing");
  assert(legislative.data.documentNumber?.value === "1234", "Document number missing");
  assert(legislative.data.pages[0].suffix === "f.", "Legislative page suffix missing");

  const online = extract(
    "Onlinequelle https://example.com (letzter Aufruf am 31.03.2026)",
    "ONLINE_SOURCE"
  ).extraction;
  assert(online.type === "ONLINE_SOURCE", "Online extraction mismatch");
  assert(online.data.url?.value === "https://example.com", "Online URL missing");
  assert(online.data.accessDate?.normalizedValue === "2026-03-31", "Access date missing");

  const administrative = extract(
    "BMF-Schreiben v. 01.01.2025, IV A 1 – ...",
    "ADMINISTRATIVE_MATERIAL"
  ).extraction;
  assert(administrative.type === "ADMINISTRATIVE_MATERIAL", "Administrative extraction mismatch");
  assert(administrative.data.authority?.value === "BMF", "Authority missing");
  assert(administrative.data.documentType?.value === "Schreiben", "Document type missing");
  assert(administrative.data.date?.normalizedValue === "2025-01-01", "Administrative date missing");
  assert(administrative.data.fileNumber?.value === "IV A 1", "File number missing");

  const caseNote = extract(
    "Müller, Anm. zu BGH, Urt. v. 01.01.2025 – 1 StR 1/25, NJW 2025, 100",
    "CASE_NOTE"
  ).extraction;
  assert(caseNote.type === "CASE_NOTE", "Case-note extraction mismatch");
  assert(caseNote.data.authors[0].rawText === "Müller", "Case-note author missing");
  assert(caseNote.data.noteMarker?.rawText === "Anm.", "Case-note marker missing");
  assert(caseNote.data.annotatedCase?.court?.value === "BGH", "Annotated court missing");

  const other = extract("Unklare Quelle ABC 2025, 17", "OTHER").extraction;
  assert(other.type === "OTHER", "OTHER extraction mismatch");
  assert(other.status === "unresolved", "OTHER must be unresolved");
  assert(other.data.urls.length === 0, "OTHER must not invent URLs");
  assert(
    other.unparsedRemainder[0].rawText === "Unklare Quelle ABC 2025, 17",
    "OTHER remainder missing"
  );
}

function runMassTest(): void {
  const templates = [
    "§§ 263, 263a ff. StGB",
    "BGH, Urt. v. 05.07.2025 – 3 StR 123/25 = NJW 2025, 1234",
    "MüKo-StGB/Regge/Pegel, § 185 Rn. 39",
    "Roxin/Greco, Strafrecht AT I, 5. Aufl. 2020, § 10 Rn. 12",
    "Tenckhoff, JuS 1988, 787 (788)",
  ];
  const snapshots = Array.from({ length: 1200 }, (_, index) =>
    createSnapshot(templates[index % templates.length], index + 1)
  );
  const result = analyzeFootnotes(snapshots);
  assert(result.parseResults.length === 1200, "Mass test must extract every footnote");
  assert(
    result.parseResults.every((parseResult) => parseResult.segments[0].extraction !== undefined),
    "Mass-test extraction missing"
  );
}

runStatuteCases();
runCaseLawCases();
runCommentaryCases();
runOtherCitationTypes();
runMassTest();
