import type { FootnoteSnapshot } from "../taskpane/taskpane";
import { findPlainTextUrls } from "./patterns";
import type {
  AdministrativeMaterialExtraction,
  AnalysisProtectedRange,
  BookChapterExtraction,
  BookExtraction,
  CaseLawExtraction,
  CaseLawPublicationReference,
  CaseNoteExtraction,
  CitationExtractionResult,
  CitationLocator,
  CitationSegment,
  CommentaryExtraction,
  DatabaseCitation,
  ExtractedComponent,
  ExtractedTextSpan,
  FootnoteParseResult,
  JournalArticleExtraction,
  JournalCaseCitation,
  LegislativeMaterialExtraction,
  OfficialCollectionCitation,
  OnlineSourceExtraction,
  OtherExtraction,
  PersonReference,
  StatuteExtraction,
  StatuteReferenceCandidate,
  StatuteSectionReference,
} from "./types";

interface TextRange {
  start: number;
  end: number;
}

interface CaseLawBuild {
  data: CaseLawExtraction;
  consumed: TextRange[];
}

const COURT_PATTERN =
  /\b(?:BVerfG|BGH|BAG|BFH|BVerwG|BSG|OLG(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]+)?|KG|LG|AG)\b/;
const DECISION_TYPE_PATTERN =
  /(?:\b(?:Urteil|Beschluss)\b|\b(?:Urt|U|Beschl|B|Entsch)\.(?=$|[\s,;:–—-]))/i;
const DATE_WITH_MARKER_PATTERN = /\b(?:v\.|vom)\s*(\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2}))\b/i;
const DATE_PATTERN = /\b(\d{1,2}\.\d{1,2}\.\d{4})\b/;
const DOCKET_NUMBER_PATTERN =
  /\b(?:(?:\d+|[IVXLCDM]+)\s+)?(?:StR|BvR|BvL|ZR|ZB|AZR|ABR|R|C|U|K|L|B|A)\s+\d+\/\d{2,4}\b/i;
const PANEL_PATTERN = /\b\d+\.\s*(?:Strafsenat|Zivilsenat|Senat)\b/i;
const ECLI_PATTERN = /\bECLI:[A-Z]{2}:[A-Z0-9.:-]+\b/i;
const JOURNAL_PUBLICATION_PATTERN =
  /\b(NJW|NStZ(?:-RR)?|JZ|JuS|JA|JR|StV|wistra|ZfIStW|KriPoZ|ZStW|GA|MDR|ZIP|NZG|GmbHR|DStR|DStZ|BB|NZWiSt)\s+(\d{4}),\s*(\d+)(?:\s*(?:\(([^)]*)\)|,\s*(\d+(?:\s*ff?\.)?)|(ff?\.)))?/gi;
const OFFICIAL_PUBLICATION_PATTERN =
  /\b(BVerfGE|BGHSt|BGHZ|BAGE|BFHE|BVerwGE|BSGE)\s+(\d+),\s*(\d+)(?:\s*(?:\(([^)]*)\)|,\s*(\d+(?:\s*ff?\.)?)|(ff?\.)))?/g;
const DATABASE_PUBLICATION_PATTERN = /\b(BeckRS)\s+(\d{4}),\s*(\d+)\b|\b(juris|openJur)\b/gi;
const PINPOINT_ITEM_PATTERN = /(\d+)(?:\s*(ff?\.?))?/g;
const MARGIN_LOCATOR_PATTERN = /\b(?:Rn\.|Rdnr\.|Randnummer)\s*(\d+[A-Za-z]?)(?:\s*(ff?\.?))?/gi;
const PAGE_LOCATOR_PATTERN = /\b(?:S\.|Seite)\s*(\d+)(?:\s*(ff?\.?))?/gi;
const EDITION_PATTERN = /\b(\d+)\.\s*(?:Aufl\.|Auflage\b)/i;
const YEAR_PATTERN = /\b(?:19|20)\d{2}\b/;
const VOLUME_PATTERN = /\b(?:Bd\.|Band)\s*([A-Za-z0-9.-]+)\b/i;
const ACCESS_DATE_PATTERN =
  /\b(?:letzter|letzten|zuletzt(?:er)?)\s+(?:Aufruf|Abruf|abgerufen)\s*(?:am)?\s*(\d{1,2}\.\d{1,2}\.\d{4})\b/i;
const CASE_NOTE_PATTERN = /(?:\b(?:Anmerkung|Besprechung)\b|\b(?:Anm|Bespr)\.)/i;
const OFFICIAL_COLLECTION_COURTS: Readonly<Record<string, string>> = {
  BGHSt: "BGH",
  BGHZ: "BGH",
  BVerfGE: "BVerfG",
  BAGE: "BAG",
  BFHE: "BFH",
  BVerwGE: "BVerwG",
  BSGE: "BSG",
};

function createComponent<T>(
  contentText: string,
  start: number,
  end: number,
  value: T,
  normalizedValue?: string
): ExtractedComponent<T> | undefined {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start >= end ||
    end > contentText.length
  ) {
    return undefined;
  }
  return {
    value,
    rawText: contentText.slice(start, end),
    start,
    end,
    ...(normalizedValue ? { normalizedValue } : {}),
  };
}

function componentFromMatch(
  contentText: string,
  absoluteBase: number,
  match: RegExpExecArray,
  value = match[0],
  normalizedValue?: string
): ExtractedComponent<string> | undefined {
  const start = absoluteBase + match.index;
  return createComponent(contentText, start, start + match[0].length, value, normalizedValue);
}

function componentFromGroup(
  contentText: string,
  absoluteBase: number,
  match: RegExpExecArray,
  groupIndex: number,
  value = match[groupIndex],
  normalizedValue?: string,
  searchFrom = 0
): ExtractedComponent<string> | undefined {
  const rawText = match[groupIndex];
  if (!rawText) return undefined;
  const groupOffset = match[0].indexOf(rawText, searchFrom);
  if (groupOffset < 0) return undefined;
  const start = absoluteBase + match.index + groupOffset;
  return createComponent(contentText, start, start + rawText.length, value, normalizedValue);
}

function rangeOf(component: { start: number; end: number } | undefined): TextRange[] {
  return component ? [{ start: component.start, end: component.end }] : [];
}

function normalizeDate(rawDate: string): string | undefined {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(rawDate);
  if (!match) return undefined;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return undefined;
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function normalizeDecisionType(rawText: string): CaseLawExtraction["decisionTypeNormalized"] {
  if (/^(?:Urt\.|Urteil|U\.)$/i.test(rawText)) return "JUDGMENT";
  if (/^(?:Beschl\.|Beschluss|B\.)$/i.test(rawText)) return "ORDER";
  if (/^Entsch\.$/i.test(rawText)) return "DECISION";
  return "OTHER";
}

function getFormattingSignals(
  footnote: FootnoteSnapshot,
  start: number,
  end: number
): string[] | undefined {
  const italic = footnote.formattingRuns?.some(
    (run) => run.start < end && run.end > start && run.italic === true
  );
  return italic ? ["ITALIC_FORMATTING"] : undefined;
}

function createPerson(
  contentText: string,
  footnote: FootnoteSnapshot,
  start: number,
  end: number,
  role: PersonReference["role"]
): PersonReference | undefined {
  while (start < end && /\s/.test(contentText[start])) start += 1;
  while (end > start && /[\s,]/.test(contentText[end - 1])) end -= 1;
  if (start >= end) return undefined;
  return {
    rawText: contentText.slice(start, end),
    start,
    end,
    role,
    ...(getFormattingSignals(footnote, start, end)
      ? { roleSignals: getFormattingSignals(footnote, start, end) }
      : {}),
  };
}

function extractSlashPersons(
  contentText: string,
  footnote: FootnoteSnapshot,
  start: number,
  end: number,
  role: PersonReference["role"]
): PersonReference[] {
  const persons: PersonReference[] = [];
  let partStart = start;
  for (let index = start; index <= end; index += 1) {
    if (index === end || contentText[index] === "/") {
      const person = createPerson(contentText, footnote, partStart, index, role);
      if (person) persons.push(person);
      partStart = index + 1;
    }
  }
  return persons;
}

function isIgnorableCharacter(character: string): boolean {
  return /[\s,.;:()\u005b\u005d{}"'„“”=/–—…-]/.test(character);
}

function collectUnparsedRemainder(
  segment: CitationSegment,
  contentText: string,
  consumedRanges: readonly TextRange[]
): ExtractedTextSpan[] {
  const consumed = new Uint8Array(segment.end - segment.start);
  for (const range of [...consumedRanges, ...segment.modifiers]) {
    const start = Math.max(segment.start, range.start) - segment.start;
    const end = Math.min(segment.end, range.end) - segment.start;
    for (let index = start; index < end; index += 1) consumed[index] = 1;
  }

  const remainder: ExtractedTextSpan[] = [];
  let cursor = segment.coreStart;
  while (cursor < segment.coreEnd) {
    const local = cursor - segment.start;
    if (consumed[local] || isIgnorableCharacter(contentText[cursor])) {
      cursor += 1;
      continue;
    }
    const start = cursor;
    let lastMeaningfulEnd = cursor + 1;
    while (cursor < segment.coreEnd && !consumed[cursor - segment.start]) {
      if (!isIgnorableCharacter(contentText[cursor])) lastMeaningfulEnd = cursor + 1;
      cursor += 1;
    }
    remainder.push({
      rawText: contentText.slice(start, lastMeaningfulEnd),
      start,
      end: lastMeaningfulEnd,
    });
  }
  return remainder;
}

function extractionStatus(
  extractedCount: number,
  remainder: readonly ExtractedTextSpan[],
  forcePartial = false
): "complete" | "partial" | "unresolved" {
  if (extractedCount === 0) return "unresolved";
  return remainder.length > 0 || forcePartial ? "partial" : "complete";
}

function findAllLocators(
  contentText: string,
  segment: CitationSegment,
  pattern: RegExp,
  type: "page" | "marginNumber"
): CitationLocator[] {
  const locators: CitationLocator[] = [];
  pattern.lastIndex = 0;
  let match = pattern.exec(segment.coreText);
  while (match) {
    const start = segment.coreStart + match.index;
    locators.push({
      type,
      rawText: contentText.slice(start, start + match[0].length),
      start,
      end: start + match[0].length,
      value: match[1],
      ...(match[2] ? { suffix: match[2] as CitationLocator["suffix"] } : {}),
    });
    match = pattern.exec(segment.coreText);
  }
  return locators;
}

function extractStatute(
  candidate: StatuteReferenceCandidate,
  contentText: string
): StatuteExtraction {
  const rawText = contentText.slice(candidate.start, candidate.end);
  const unitMatch = /^(§§?|Art\.)/.exec(rawText);
  const unitType = unitMatch
    ? createComponent(
        contentText,
        candidate.start,
        candidate.start + unitMatch[0].length,
        unitMatch[0] as "§" | "§§" | "Art."
      )
    : undefined;
  const sectionValues = candidate.sections ?? (candidate.section ? [candidate.section] : []);
  const sections: StatuteSectionReference[] = [];
  let searchCursor = unitMatch?.[0].length ?? 0;

  for (const value of sectionValues) {
    const localStart = rawText.indexOf(value, searchCursor);
    if (localStart < 0) continue;
    const section = createComponent(
      contentText,
      candidate.start + localStart,
      candidate.start + localStart + value.length,
      value
    );
    if (section) sections.push({ section });
    searchCursor = localStart + value.length;
  }

  const targetSection = sections[sections.length - 1];
  const assignCaptured = (
    property:
      | "paragraph"
      | "sentence"
      | "number"
      | "letter"
      | "halfSentence"
      | "alternative"
      | "variant"
      | "case",
    pattern: RegExp,
    normalizedValue?: string
  ): void => {
    if (!targetSection) return;
    const match = pattern.exec(rawText);
    if (!match) return;
    const group = match[1] !== undefined ? 1 : 2;
    const component = componentFromGroup(
      contentText,
      candidate.start,
      match,
      group,
      normalizedValue ?? match[group],
      normalizedValue,
      match[0].lastIndexOf(match[group])
    );
    if (component) {
      targetSection[property] = {
        type: property,
        rawText: component.rawText,
        start: component.start,
        end: component.end,
        value: component.value,
      };
    }
  };

  const romanMatch = /\d+[A-Za-z]?\s+(VIII|VII|III|VI|IV|IX|II|V|X|I)(?=$|\s)/.exec(rawText);
  if (romanMatch && candidate.paragraph) {
    assignCaptured(
      "paragraph",
      /\d+[A-Za-z]?\s+(VIII|VII|III|VI|IV|IX|II|V|X|I)(?=$|\s)/,
      candidate.paragraph
    );
    if (candidate.sentence) {
      assignCaptured(
        "sentence",
        /\d+[A-Za-z]?\s+(?:VIII|VII|III|VI|IV|IX|II|V|X|I)\s+(\d+)/,
        candidate.sentence
      );
    }
  } else {
    if (candidate.paragraph) assignCaptured("paragraph", /\b(?:Abs\.|Absatz)\s*(\d+[A-Za-z]?)/i);
    if (candidate.sentence) assignCaptured("sentence", /\b(?:S\.|Satz)\s*(\d+[A-Za-z]?)/i);
  }
  if (candidate.number) assignCaptured("number", /\b(?:Nr\.|Nummer)\s*(\d+[A-Za-z]?)/i);
  if (candidate.letter) assignCaptured("letter", /\b(?:lit\.|Buchst\.|Buchstabe)\s*([A-Za-z])/i);
  if (candidate.halfSentence) assignCaptured("halfSentence", /\b(?:Hs\.|Halbsatz)\s*(\d+)/i);
  if (candidate.alternative) {
    assignCaptured(
      "alternative",
      /(?:\b(\d+)\.\s*(?:Alt\.|Alternative)|\b(?:Alt\.|Alternative)\s*(\d+))/i,
      candidate.alternative
    );
  }
  if (candidate.variant) {
    assignCaptured(
      "variant",
      /(?:\b(\d+)\.\s*(?:Var\.|Variante)|\b(?:Var\.|Variante)\s*(\d+))/i,
      candidate.variant
    );
  }
  if (candidate.case) assignCaptured("case", /\b(\d+)\.\s*Fall\b/i);

  if (targetSection && candidate.suffix) {
    const suffixPattern =
      candidate.suffix === "ff." ? /\bff\.?(?=$|[\s,.;:)\]])/gi : /\bf\.?(?=$|[\s,.;:)\]])/gi;
    let suffixMatch = suffixPattern.exec(rawText);
    let selectedSuffix = suffixMatch;
    while (suffixMatch) {
      selectedSuffix = suffixMatch;
      suffixMatch = suffixPattern.exec(rawText);
    }
    const suffix = selectedSuffix
      ? createComponent(
          contentText,
          candidate.start + selectedSuffix.index,
          candidate.start + selectedSuffix.index + selectedSuffix[0].length,
          candidate.suffix
        )
      : undefined;
    const qualifier =
      targetSection.case ??
      targetSection.variant ??
      targetSection.alternative ??
      targetSection.halfSentence ??
      targetSection.letter ??
      targetSection.number ??
      targetSection.sentence ??
      targetSection.paragraph;
    if (suffix && qualifier) {
      qualifier.rawText = contentText.slice(qualifier.start, suffix.end);
      qualifier.end = suffix.end;
      qualifier.suffix = candidate.suffix;
    } else if (suffix) {
      targetSection.suffix = suffix;
    }
  }

  let law: ExtractedComponent<string> | undefined;
  if (candidate.law) {
    const lawStart = rawText.lastIndexOf(candidate.law);
    law = createComponent(
      contentText,
      candidate.start + lawStart,
      candidate.start + lawStart + candidate.law.length,
      candidate.law
    );
  }

  return {
    referenceContext: candidate.referenceContext ?? "unknown",
    ...(unitType ? { unitType } : {}),
    sections,
    ...(law ? { law } : {}),
  };
}

function publicationComponent(
  contentText: string,
  segment: CitationSegment,
  match: RegExpExecArray,
  group: number,
  searchFrom = 0
): ExtractedComponent<string> | undefined {
  return componentFromGroup(
    contentText,
    segment.coreStart,
    match,
    group,
    match[group],
    undefined,
    searchFrom
  );
}

function publicationGroupStart(
  segment: CitationSegment,
  match: RegExpExecArray,
  group: number,
  searchFrom = 0
): number | undefined {
  const rawText = match[group];
  if (!rawText) return undefined;
  const localStart = match[0].indexOf(rawText, searchFrom);
  return localStart < 0 ? undefined : segment.coreStart + match.index + localStart;
}

function publicationPage(
  contentText: string,
  segment: CitationSegment,
  match: RegExpExecArray,
  pageGroup: number,
  suffixGroup?: number,
  searchFrom = 0
): CitationLocator | undefined {
  const start = publicationGroupStart(segment, match, pageGroup, searchFrom);
  if (start === undefined) return undefined;
  const value = match[pageGroup];
  let end = start + value.length;
  const suffix = suffixGroup ? match[suffixGroup] : undefined;
  if (suffix) {
    const suffixStart = publicationGroupStart(
      segment,
      match,
      suffixGroup!,
      end - segment.coreStart - match.index
    );
    if (suffixStart !== undefined) end = suffixStart + suffix.length;
  }
  return {
    type: "page",
    rawText: contentText.slice(start, end),
    start,
    end,
    value,
    ...(suffix ? { suffix: suffix as CitationLocator["suffix"] } : {}),
  };
}

function publicationPinpoints(
  contentText: string,
  segment: CitationSegment,
  match: RegExpExecArray,
  group: number,
  searchFrom = 0
): CitationLocator[] {
  const rawPinpoints = match[group];
  const groupStart = publicationGroupStart(segment, match, group, searchFrom);
  if (!rawPinpoints || groupStart === undefined) return [];

  const pinpoints: CitationLocator[] = [];
  PINPOINT_ITEM_PATTERN.lastIndex = 0;
  let item = PINPOINT_ITEM_PATTERN.exec(rawPinpoints);
  while (item) {
    const start = groupStart + item.index;
    const end = start + item[0].length;
    pinpoints.push({
      type: "page",
      rawText: contentText.slice(start, end),
      start,
      end,
      value: item[1],
      ...(item[2] ? { suffix: item[2] as CitationLocator["suffix"] } : {}),
    });
    item = PINPOINT_ITEM_PATTERN.exec(rawPinpoints);
  }
  return pinpoints;
}

function extractCasePublications(
  contentText: string,
  segment: CitationSegment
): { publications: CaseLawPublicationReference[]; consumed: TextRange[] } {
  const publications: CaseLawPublicationReference[] = [];
  const consumed: TextRange[] = [];

  OFFICIAL_PUBLICATION_PATTERN.lastIndex = 0;
  let official = OFFICIAL_PUBLICATION_PATTERN.exec(segment.coreText);
  while (official) {
    const collection = publicationComponent(contentText, segment, official, 1);
    if (collection) {
      const volume = publicationComponent(
        contentText,
        segment,
        official,
        2,
        collection.end - segment.coreStart - official.index
      );
      const pinpointGroup = official[4] ? 4 : official[5] ? 5 : undefined;
      const firstPage = publicationPage(
        contentText,
        segment,
        official,
        3,
        official[6] ? 6 : undefined,
        volume ? volume.end - segment.coreStart - official.index : 0
      );
      const pinpointPages = pinpointGroup
        ? publicationPinpoints(
            contentText,
            segment,
            official,
            pinpointGroup,
            firstPage ? firstPage.end - segment.coreStart - official.index : 0
          )
        : [];
      const citation: OfficialCollectionCitation = {
        kind: "officialCollection",
        collection,
        ...(volume ? { volume } : {}),
        ...(firstPage ? { firstPage } : {}),
        pinpointPages,
      };
      publications.push(citation);
      consumed.push(...rangeOf(collection), ...rangeOf(volume), ...rangeOf(firstPage));
      consumed.push(...pinpointPages);
    }
    official = OFFICIAL_PUBLICATION_PATTERN.exec(segment.coreText);
  }

  JOURNAL_PUBLICATION_PATTERN.lastIndex = 0;
  let journalMatch = JOURNAL_PUBLICATION_PATTERN.exec(segment.coreText);
  while (journalMatch) {
    const journal = publicationComponent(contentText, segment, journalMatch, 1);
    if (journal) {
      const year = publicationComponent(
        contentText,
        segment,
        journalMatch,
        2,
        journal.end - segment.coreStart - journalMatch.index
      );
      const pinpointGroup = journalMatch[4] ? 4 : journalMatch[5] ? 5 : undefined;
      const firstPage = publicationPage(
        contentText,
        segment,
        journalMatch,
        3,
        journalMatch[6] ? 6 : undefined,
        year ? year.end - segment.coreStart - journalMatch.index : 0
      );
      const pinpointPages = pinpointGroup
        ? publicationPinpoints(
            contentText,
            segment,
            journalMatch,
            pinpointGroup,
            firstPage ? firstPage.end - segment.coreStart - journalMatch.index : 0
          )
        : [];
      const citation: JournalCaseCitation = {
        kind: "journal",
        journal,
        ...(year ? { year } : {}),
        ...(firstPage ? { firstPage } : {}),
        pinpointPages,
      };
      publications.push(citation);
      consumed.push(...rangeOf(journal), ...rangeOf(year), ...rangeOf(firstPage));
      consumed.push(...pinpointPages);
    }
    journalMatch = JOURNAL_PUBLICATION_PATTERN.exec(segment.coreText);
  }

  DATABASE_PUBLICATION_PATTERN.lastIndex = 0;
  let databaseMatch = DATABASE_PUBLICATION_PATTERN.exec(segment.coreText);
  while (databaseMatch) {
    const databaseGroup = databaseMatch[1] ? 1 : 4;
    const database = publicationComponent(contentText, segment, databaseMatch, databaseGroup);
    if (database) {
      const citation: DatabaseCitation = {
        kind: "database",
        database,
        ...(databaseMatch[2]
          ? { year: publicationComponent(contentText, segment, databaseMatch, 2) }
          : {}),
        ...(databaseMatch[3]
          ? { identifier: publicationComponent(contentText, segment, databaseMatch, 3) }
          : {}),
      };
      publications.push(citation);
      consumed.push({
        start: segment.coreStart + databaseMatch.index,
        end: segment.coreStart + databaseMatch.index + databaseMatch[0].length,
      });
    }
    databaseMatch = DATABASE_PUBLICATION_PATTERN.exec(segment.coreText);
  }

  publications.sort((left, right) => {
    const leftStart =
      left.kind === "journal"
        ? left.journal.start
        : left.kind === "officialCollection"
          ? left.collection.start
          : left.database.start;
    const rightStart =
      right.kind === "journal"
        ? right.journal.start
        : right.kind === "officialCollection"
          ? right.collection.start
          : right.database.start;
    return leftStart - rightStart;
  });
  return { publications, consumed };
}

function extractCaseLawDetails(contentText: string, segment: CitationSegment): CaseLawBuild {
  const consumed: TextRange[] = [];
  const courtMatch = COURT_PATTERN.exec(segment.coreText);
  const court = courtMatch
    ? componentFromMatch(contentText, segment.coreStart, courtMatch)
    : undefined;
  consumed.push(...rangeOf(court));

  const decisionMatch = DECISION_TYPE_PATTERN.exec(segment.coreText);
  const decisionType = decisionMatch
    ? componentFromMatch(contentText, segment.coreStart, decisionMatch)
    : undefined;
  consumed.push(...rangeOf(decisionType));

  const dateMatch = DATE_WITH_MARKER_PATTERN.exec(segment.coreText);
  const date = dateMatch
    ? componentFromGroup(
        contentText,
        segment.coreStart,
        dateMatch,
        1,
        dateMatch[1],
        normalizeDate(dateMatch[1])
      )
    : undefined;
  if (dateMatch) {
    consumed.push({
      start: segment.coreStart + dateMatch.index,
      end: segment.coreStart + dateMatch.index + dateMatch[0].length,
    });
  }

  const docketMatch = DOCKET_NUMBER_PATTERN.exec(segment.coreText);
  const docketNumber = docketMatch
    ? componentFromMatch(contentText, segment.coreStart, docketMatch)
    : undefined;
  consumed.push(...rangeOf(docketNumber));

  const panelMatch = PANEL_PATTERN.exec(segment.coreText);
  const panel = panelMatch
    ? componentFromMatch(contentText, segment.coreStart, panelMatch)
    : undefined;
  consumed.push(...rangeOf(panel));

  const ecliMatch = ECLI_PATTERN.exec(segment.coreText);
  const ecli = ecliMatch
    ? componentFromMatch(contentText, segment.coreStart, ecliMatch)
    : undefined;
  consumed.push(...rangeOf(ecli));

  const publicationResult = extractCasePublications(contentText, segment);
  consumed.push(...publicationResult.consumed);
  const officialCollection = publicationResult.publications.find(
    (publication): publication is OfficialCollectionCitation =>
      publication.kind === "officialCollection"
  );
  const derivedCourtValue =
    !court && officialCollection
      ? OFFICIAL_COLLECTION_COURTS[officialCollection.collection.value]
      : undefined;
  for (const reference of segment.embeddedStatuteReferences) consumed.push(reference);

  return {
    data: {
      ...(court ? { court } : {}),
      ...(derivedCourtValue
        ? {
            derivedCourt: {
              value: derivedCourtValue,
              source: "officialCollectionMapping",
            },
          }
        : {}),
      ...(decisionType
        ? {
            decisionType,
            decisionTypeNormalized: normalizeDecisionType(decisionType.rawText),
          }
        : {}),
      ...(date ? { date, normalizedDate: date.normalizedValue } : {}),
      ...(docketNumber ? { docketNumber } : {}),
      ...(panel ? { panel } : {}),
      ...(ecli ? { ecli } : {}),
      citationForm: segment.classification.caseLawForm ?? "UNKNOWN",
      parallelCitations: publicationResult.publications,
      embeddedStatuteReferences: segment.embeddedStatuteReferences.map((reference) =>
        extractStatute(reference, contentText)
      ),
    },
    consumed,
  };
}

function extractCaseLaw(contentText: string, segment: CitationSegment): CitationExtractionResult {
  const build = extractCaseLawDetails(contentText, segment);
  const remainder = collectUnparsedRemainder(segment, contentText, build.consumed);
  const extractedCount =
    Number(Boolean(build.data.court)) +
    Number(Boolean(build.data.decisionType)) +
    Number(Boolean(build.data.date)) +
    Number(Boolean(build.data.docketNumber)) +
    build.data.parallelCitations.length;
  return {
    type: "CASE_LAW",
    status: extractionStatus(extractedCount, remainder),
    data: build.data,
    unparsedRemainder: remainder,
  };
}

function extractCommentary(
  contentText: string,
  footnote: FootnoteSnapshot,
  segment: CitationSegment
): CitationExtractionResult {
  const consumed: TextRange[] = [];
  const comma = segment.coreText.indexOf(",");
  const headEnd = comma >= 0 ? segment.coreStart + comma : segment.coreEnd;
  const head = contentText.slice(segment.coreStart, headEnd);
  const slash = head.indexOf("/");
  const workEnd = slash >= 0 ? segment.coreStart + slash : headEnd;
  const work = createComponent(
    contentText,
    segment.coreStart,
    workEnd,
    contentText.slice(segment.coreStart, workEnd)
  );
  consumed.push(...rangeOf(work));

  const persons =
    slash >= 0 ? extractSlashPersons(contentText, footnote, workEnd + 1, headEnd, "unknown") : [];
  consumed.push(...persons);

  let commentedLaw: ExtractedComponent<string> | undefined;
  if (work) {
    const lawMatch = /(?:^|-)(StGB|BGB|StPO)$/.exec(work.rawText);
    if (lawMatch) {
      const local = work.rawText.lastIndexOf(lawMatch[1]);
      commentedLaw = createComponent(
        contentText,
        work.start + local,
        work.start + local + lawMatch[1].length,
        lawMatch[1],
        lawMatch[1]
      );
    }
  }

  const margins = findAllLocators(contentText, segment, MARGIN_LOCATOR_PATTERN, "marginNumber");
  consumed.push(...margins);
  const statuteCandidate = segment.embeddedStatuteReferences.find(
    (reference) => reference.referenceContext === "statute"
  );
  if (statuteCandidate) consumed.push(statuteCandidate);
  const statuteReference = statuteCandidate
    ? extractStatute(statuteCandidate, contentText)
    : undefined;

  const editionMatch = EDITION_PATTERN.exec(segment.coreText);
  const edition = editionMatch
    ? componentFromMatch(
        contentText,
        segment.coreStart,
        editionMatch,
        editionMatch[1],
        editionMatch[1]
      )
    : undefined;
  consumed.push(...rangeOf(edition));
  const yearMatch = YEAR_PATTERN.exec(segment.coreText);
  const year = yearMatch
    ? componentFromMatch(contentText, segment.coreStart, yearMatch)
    : undefined;
  consumed.push(...rangeOf(year));
  const volumeMatch = VOLUME_PATTERN.exec(segment.coreText);
  const volume = volumeMatch
    ? componentFromMatch(
        contentText,
        segment.coreStart,
        volumeMatch,
        volumeMatch[1],
        volumeMatch[1]
      )
    : undefined;
  consumed.push(...rangeOf(volume));

  const data: CommentaryExtraction = {
    ...(work ? { work } : {}),
    ...(commentedLaw ? { commentedLaw } : {}),
    persons,
    editors: persons.filter((person) => person.role === "editor"),
    bearbeiters: persons.filter((person) => person.role === "bearbeiter"),
    ...(persons.length > 0
      ? { personSequence: { persons, roleResolution: "ambiguous" as const } }
      : {}),
    ...(volume ? { volume } : {}),
    ...(edition ? { edition } : {}),
    ...(year ? { year } : {}),
    ...(statuteReference ? { statuteReference } : {}),
    marginNumbers: margins,
  };
  const remainder = collectUnparsedRemainder(segment, contentText, consumed);
  return {
    type: "COMMENTARY",
    status: extractionStatus(
      Number(Boolean(work)) + persons.length + Number(Boolean(statuteReference)) + margins.length,
      remainder,
      persons.some((person) => person.role === "unknown")
    ),
    data,
    unparsedRemainder: remainder,
  };
}

function extractAuthorPrefix(
  contentText: string,
  footnote: FootnoteSnapshot,
  segment: CitationSegment,
  end?: number
): PersonReference[] {
  const comma = segment.coreText.indexOf(",");
  const authorEnd = end ?? (comma >= 0 ? segment.coreStart + comma : segment.coreStart);
  return authorEnd > segment.coreStart
    ? extractSlashPersons(contentText, footnote, segment.coreStart, authorEnd, "author")
    : [];
}

function findTitleBetween(
  contentText: string,
  start: number,
  end: number
): ExtractedComponent<string> | undefined {
  while (start < end && /[\s,]/.test(contentText[start])) start += 1;
  while (end > start && /[\s,]/.test(contentText[end - 1])) end -= 1;
  return start < end
    ? createComponent(contentText, start, end, contentText.slice(start, end))
    : undefined;
}

function extractBook(
  contentText: string,
  footnote: FootnoteSnapshot,
  segment: CitationSegment
): CitationExtractionResult {
  const consumed: TextRange[] = [];
  const authors = extractAuthorPrefix(contentText, footnote, segment);
  consumed.push(...authors);
  const authorEnd = authors[authors.length - 1]?.end ?? segment.coreStart;
  const editionMatch = EDITION_PATTERN.exec(segment.coreText);
  const yearMatch = YEAR_PATTERN.exec(segment.coreText);
  const firstCandidate = segment.embeddedStatuteReferences[0];
  const marginMatch = MARGIN_LOCATOR_PATTERN.exec(segment.coreText);
  const boundaries = [
    editionMatch ? segment.coreStart + editionMatch.index : segment.coreEnd,
    yearMatch ? segment.coreStart + yearMatch.index : segment.coreEnd,
    firstCandidate?.start ?? segment.coreEnd,
    marginMatch ? segment.coreStart + marginMatch.index : segment.coreEnd,
  ];
  const title = findTitleBetween(contentText, authorEnd + 1, Math.min(...boundaries));
  consumed.push(...rangeOf(title));

  const edition = editionMatch
    ? componentFromMatch(
        contentText,
        segment.coreStart,
        editionMatch,
        editionMatch[1],
        editionMatch[1]
      )
    : undefined;
  consumed.push(...rangeOf(edition));
  const year = yearMatch
    ? componentFromMatch(contentText, segment.coreStart, yearMatch)
    : undefined;
  consumed.push(...rangeOf(year));
  const volumeMatch = VOLUME_PATTERN.exec(segment.coreText);
  const volume = volumeMatch
    ? componentFromMatch(
        contentText,
        segment.coreStart,
        volumeMatch,
        volumeMatch[1],
        volumeMatch[1]
      )
    : undefined;
  consumed.push(...rangeOf(volume));

  const workCandidate = segment.embeddedStatuteReferences.find(
    (reference) => reference.referenceContext === "workSection"
  );
  const workSection = workCandidate
    ? createComponent(
        contentText,
        workCandidate.start,
        workCandidate.end,
        workCandidate.section ?? workCandidate.sections?.join(", ") ?? workCandidate.originalText
      )
    : undefined;
  if (workCandidate) consumed.push(workCandidate);
  const margins = findAllLocators(contentText, segment, MARGIN_LOCATOR_PATTERN, "marginNumber");
  const pages = findAllLocators(contentText, segment, PAGE_LOCATOR_PATTERN, "page");
  consumed.push(...margins, ...pages);

  const bookType: BookExtraction["bookType"] = title
    ? /Handbuch/i.test(title.rawText)
      ? "handbook"
      : /(?:Strafrecht|Zivilrecht|Lehrbuch|Grundkurs)/i.test(title.rawText)
        ? "textbook"
        : "monograph"
    : "unknown";
  const data: BookExtraction = {
    authors,
    ...(title ? { title } : {}),
    bookType,
    ...(volume ? { volume } : {}),
    ...(edition ? { edition } : {}),
    ...(year ? { year } : {}),
    ...(workSection ? { workSection } : {}),
    marginNumbers: margins,
    pages,
  };
  const remainder = collectUnparsedRemainder(segment, contentText, consumed);
  return {
    type: "BOOK",
    status: extractionStatus(authors.length + Number(Boolean(title)), remainder),
    data,
    unparsedRemainder: remainder,
  };
}

function extractJournalArticle(
  contentText: string,
  footnote: FootnoteSnapshot,
  segment: CitationSegment
): CitationExtractionResult {
  const publicationResult = extractCasePublications(contentText, segment);
  const publication = publicationResult.publications.find(
    (reference): reference is JournalCaseCitation => reference.kind === "journal"
  );
  const consumed: TextRange[] = publicationResult.consumed.slice();
  const journalStart = publication?.journal.start ?? segment.coreEnd;
  const comma = segment.coreText.indexOf(",");
  const authorEnd = comma >= 0 ? segment.coreStart + comma : segment.coreStart;
  const authors = extractAuthorPrefix(contentText, footnote, segment, authorEnd);
  consumed.push(...authors);
  const title = findTitleBetween(contentText, authorEnd + 1, journalStart);
  consumed.push(...rangeOf(title));
  const data: JournalArticleExtraction = {
    authors,
    ...(title ? { title } : {}),
    ...(publication?.journal ? { journal: publication.journal } : {}),
    ...(publication?.year ? { year: publication.year } : {}),
    ...(publication?.firstPage ? { firstPage: publication.firstPage } : {}),
    pinpointPages: publication?.pinpointPages ?? [],
  };
  const remainder = collectUnparsedRemainder(segment, contentText, consumed);
  return {
    type: "JOURNAL_ARTICLE",
    status: extractionStatus(
      authors.length +
        Number(Boolean(publication?.journal)) +
        Number(Boolean(publication?.year)) +
        Number(Boolean(publication?.firstPage)),
      remainder
    ),
    data,
    unparsedRemainder: remainder,
  };
}

function extractBookChapter(
  contentText: string,
  footnote: FootnoteSnapshot,
  segment: CitationSegment
): CitationExtractionResult {
  const consumed: TextRange[] = [];
  const inMatch = /\bin\s*:/i.exec(segment.coreText);
  const inStart = inMatch ? segment.coreStart + inMatch.index : segment.coreEnd;
  const comma = segment.coreText.indexOf(",");
  const authorEnd = comma >= 0 ? segment.coreStart + comma : segment.coreStart;
  const authors = extractAuthorPrefix(contentText, footnote, segment, authorEnd);
  consumed.push(...authors);
  const chapterTitle = findTitleBetween(contentText, authorEnd + 1, inStart);
  consumed.push(...rangeOf(chapterTitle));
  if (inMatch) consumed.push({ start: inStart, end: inStart + inMatch[0].length });

  const yearMatch = YEAR_PATTERN.exec(segment.coreText);
  const pageMatch = PAGE_LOCATOR_PATTERN.exec(segment.coreText);
  const containerStart = inMatch ? inStart + inMatch[0].length : inStart;
  const containerEnd = Math.min(
    yearMatch ? segment.coreStart + yearMatch.index : segment.coreEnd,
    pageMatch ? segment.coreStart + pageMatch.index : segment.coreEnd
  );
  const containerTitle = findTitleBetween(contentText, containerStart, containerEnd);
  consumed.push(...rangeOf(containerTitle));
  const year = yearMatch
    ? componentFromMatch(contentText, segment.coreStart, yearMatch)
    : undefined;
  consumed.push(...rangeOf(year));
  const pages = findAllLocators(contentText, segment, PAGE_LOCATOR_PATTERN, "page");
  consumed.push(...pages);

  const workCandidate = segment.embeddedStatuteReferences.find(
    (reference) => reference.referenceContext === "workSection"
  );
  const workSection = workCandidate
    ? createComponent(
        contentText,
        workCandidate.start,
        workCandidate.end,
        workCandidate.section ?? workCandidate.originalText
      )
    : undefined;
  if (workCandidate) consumed.push(workCandidate);
  const margins = findAllLocators(contentText, segment, MARGIN_LOCATOR_PATTERN, "marginNumber");
  consumed.push(...margins);

  const firstPage = pages[0]?.value
    ? createComponent(
        contentText,
        pages[0].start + pages[0].rawText.indexOf(pages[0].value),
        pages[0].start + pages[0].rawText.indexOf(pages[0].value) + pages[0].value.length,
        pages[0].value
      )
    : undefined;
  const data: BookChapterExtraction = {
    authors,
    ...(chapterTitle ? { chapterTitle } : {}),
    ...(containerTitle ? { containerTitle } : {}),
    editors: [],
    ...(year ? { year } : {}),
    ...(firstPage ? { firstPage } : {}),
    pinpointPages: pages,
    ...(workSection ? { workSection } : {}),
    marginNumbers: margins,
  };
  const remainder = collectUnparsedRemainder(segment, contentText, consumed);
  return {
    type: "BOOK_CHAPTER",
    status: extractionStatus(authors.length + Number(Boolean(containerTitle)), remainder),
    data,
    unparsedRemainder: remainder,
  };
}

function extractCaseNote(
  contentText: string,
  footnote: FootnoteSnapshot,
  segment: CitationSegment
): CitationExtractionResult {
  const consumed: TextRange[] = [];
  const markerMatch = CASE_NOTE_PATTERN.exec(segment.coreText);
  const markerStart = markerMatch ? segment.coreStart + markerMatch.index : segment.coreEnd;
  const comma = segment.coreText.indexOf(",");
  const authorEnd = comma >= 0 ? segment.coreStart + comma : markerStart;
  const authors = extractAuthorPrefix(contentText, footnote, segment, authorEnd);
  consumed.push(...authors);
  const noteMarker = markerMatch
    ? componentFromMatch(contentText, segment.coreStart, markerMatch)
    : undefined;
  consumed.push(...rangeOf(noteMarker));
  const caseLaw = extractCaseLawDetails(contentText, segment);
  consumed.push(...caseLaw.consumed);
  const journalCitation = caseLaw.data.parallelCitations.find(
    (citation): citation is JournalCaseCitation => citation.kind === "journal"
  );
  const data: CaseNoteExtraction = {
    authors,
    ...(noteMarker ? { noteMarker } : {}),
    annotatedCase: caseLaw.data,
    ...(journalCitation
      ? {
          journal: journalCitation.journal,
          year: journalCitation.year,
          firstPage: journalCitation.firstPage,
        }
      : {}),
    pinpointPages: journalCitation?.pinpointPages ?? [],
  };
  const remainder = collectUnparsedRemainder(segment, contentText, consumed);
  return {
    type: "CASE_NOTE",
    status: extractionStatus(authors.length + Number(Boolean(noteMarker)), remainder),
    data,
    unparsedRemainder: remainder,
  };
}

function extractLegislativeMaterial(
  contentText: string,
  segment: CitationSegment
): CitationExtractionResult {
  const consumed: TextRange[] = [];
  const match = /\b(BT|BR)-(Drs\.|Drucks\.?)\s*(\d+)\/(\d+)\b/i.exec(segment.coreText);
  const body = match
    ? componentFromGroup(
        contentText,
        segment.coreStart,
        match,
        1,
        match[1].toUpperCase(),
        match[1].toUpperCase() === "BT" ? "Bundestag" : "Bundesrat"
      )
    : undefined;
  const documentType = match
    ? componentFromGroup(contentText, segment.coreStart, match, 2)
    : undefined;
  const legislativeTerm = match
    ? componentFromGroup(contentText, segment.coreStart, match, 3)
    : undefined;
  const documentNumber = match
    ? componentFromGroup(
        contentText,
        segment.coreStart,
        match,
        4,
        match[4],
        undefined,
        match[0].indexOf(match[3]) + match[3].length
      )
    : undefined;
  if (match)
    consumed.push({
      start: segment.coreStart + match.index,
      end: segment.coreStart + match.index + match[0].length,
    });
  const pages = findAllLocators(contentText, segment, PAGE_LOCATOR_PATTERN, "page");
  consumed.push(...pages);
  const dateMatch =
    DATE_WITH_MARKER_PATTERN.exec(segment.coreText) ?? DATE_PATTERN.exec(segment.coreText);
  const dateGroup = dateMatch?.[1] ? 1 : 0;
  const date = dateMatch
    ? componentFromGroup(
        contentText,
        segment.coreStart,
        dateMatch,
        dateGroup,
        dateMatch[dateGroup],
        normalizeDate(dateMatch[dateGroup])
      )
    : undefined;
  if (dateMatch) {
    consumed.push({
      start: segment.coreStart + dateMatch.index,
      end: segment.coreStart + dateMatch.index + dateMatch[0].length,
    });
  }

  const data: LegislativeMaterialExtraction = {
    ...(body ? { body } : {}),
    ...(documentType ? { documentType } : {}),
    ...(legislativeTerm ? { legislativeTerm } : {}),
    ...(documentNumber ? { documentNumber } : {}),
    ...(date ? { date } : {}),
    pages,
  };
  const remainder = collectUnparsedRemainder(segment, contentText, consumed);
  return {
    type: "LEGISLATIVE_MATERIAL",
    status: extractionStatus(Number(Boolean(match)) + pages.length, remainder),
    data,
    unparsedRemainder: remainder,
  };
}

function extractOnlineSource(
  contentText: string,
  segment: CitationSegment,
  protectedRanges: readonly AnalysisProtectedRange[]
): CitationExtractionResult {
  const consumed: TextRange[] = [];
  const urls = findPlainTextUrls(segment.coreText);
  const firstUrl = urls[0];
  const protectedUrl = protectedRanges.find((range) => {
    if (range.start < segment.coreStart || range.end > segment.coreEnd) return false;
    const text = contentText.slice(range.start, range.end);
    return range.type === "plainTextUrl" || /^(?:https?:\/\/|www\.)/i.test(text);
  });
  const url = firstUrl
    ? createComponent(
        contentText,
        segment.coreStart + firstUrl.start,
        segment.coreStart + firstUrl.end,
        firstUrl.text
      )
    : protectedUrl
      ? createComponent(
          contentText,
          protectedUrl.start,
          protectedUrl.end,
          contentText.slice(protectedUrl.start, protectedUrl.end)
        )
      : undefined;
  consumed.push(...rangeOf(url));
  const accessMatch = ACCESS_DATE_PATTERN.exec(segment.coreText);
  const accessDate = accessMatch
    ? componentFromGroup(
        contentText,
        segment.coreStart,
        accessMatch,
        1,
        accessMatch[1],
        normalizeDate(accessMatch[1])
      )
    : undefined;
  if (accessMatch)
    consumed.push({
      start: segment.coreStart + accessMatch.index,
      end: segment.coreStart + accessMatch.index + accessMatch[0].length,
    });

  const prefixEnd = url?.start ?? segment.coreStart;
  const title = findTitleBetween(contentText, segment.coreStart, prefixEnd);
  consumed.push(...rangeOf(title));
  const data: OnlineSourceExtraction = {
    authors: [],
    ...(title && !/^(?:Onlinequelle|Website|Internetquelle)$/i.test(title.rawText)
      ? { title }
      : {}),
    ...(url ? { url } : {}),
    ...(accessDate ? { accessDate } : {}),
  };
  const remainder = collectUnparsedRemainder(segment, contentText, consumed);
  return {
    type: "ONLINE_SOURCE",
    status: extractionStatus(Number(Boolean(url)), remainder),
    data,
    unparsedRemainder: remainder,
  };
}

function extractAdministrativeMaterial(
  contentText: string,
  segment: CitationSegment
): CitationExtractionResult {
  const consumed: TextRange[] = [];
  const authorityMatch = /\b(BMF)\b/.exec(segment.coreText);
  const authority = authorityMatch
    ? componentFromGroup(
        contentText,
        segment.coreStart,
        authorityMatch,
        1,
        "BMF",
        "Bundesministerium der Finanzen"
      )
    : undefined;
  consumed.push(...rangeOf(authority));
  const documentMatch =
    /\b(?:BMF-)?(Schreiben)|\b(Anwendungserlass|Erlass|Rundschreiben|Verwaltungsanweisung)\b/i.exec(
      segment.coreText
    );
  const documentGroup = documentMatch?.[1] ? 1 : documentMatch?.[2] ? 2 : 0;
  const documentType =
    documentMatch && documentGroup
      ? componentFromGroup(contentText, segment.coreStart, documentMatch, documentGroup)
      : undefined;
  consumed.push(...rangeOf(documentType));
  const dateMatch =
    DATE_WITH_MARKER_PATTERN.exec(segment.coreText) ?? DATE_PATTERN.exec(segment.coreText);
  const dateGroup = dateMatch?.[1] ? 1 : 0;
  const date = dateMatch
    ? componentFromGroup(
        contentText,
        segment.coreStart,
        dateMatch,
        dateGroup,
        dateMatch[dateGroup],
        normalizeDate(dateMatch[dateGroup])
      )
    : undefined;
  if (dateMatch) {
    consumed.push({
      start: segment.coreStart + dateMatch.index,
      end: segment.coreStart + dateMatch.index + dateMatch[0].length,
    });
  }
  const fileMatch = dateMatch
    ? /^\s*,\s*([^,–—]+?)\s*(?=[–—]|$)/.exec(
        segment.coreText.slice(dateMatch.index + dateMatch[0].length)
      )
    : undefined;
  let fileNumber: ExtractedComponent<string> | undefined;
  if (fileMatch && dateMatch) {
    const base = segment.coreStart + dateMatch.index + dateMatch[0].length;
    const local = fileMatch[0].indexOf(fileMatch[1]);
    fileNumber = createComponent(
      contentText,
      base + local,
      base + local + fileMatch[1].length,
      fileMatch[1]
    );
    consumed.push(...rangeOf(fileNumber));
  }
  const urlMatch = findPlainTextUrls(segment.coreText)[0];
  const url = urlMatch
    ? createComponent(
        contentText,
        segment.coreStart + urlMatch.start,
        segment.coreStart + urlMatch.end,
        urlMatch.text
      )
    : undefined;
  consumed.push(...rangeOf(url));

  const data: AdministrativeMaterialExtraction = {
    ...(authority ? { authority } : {}),
    ...(documentType ? { documentType } : {}),
    ...(date ? { date } : {}),
    ...(fileNumber ? { fileNumber } : {}),
    ...(url ? { url } : {}),
  };
  const remainder = collectUnparsedRemainder(segment, contentText, consumed);
  return {
    type: "ADMINISTRATIVE_MATERIAL",
    status: extractionStatus(
      Number(Boolean(authority)) + Number(Boolean(documentType)) + Number(Boolean(date)),
      remainder
    ),
    data,
    unparsedRemainder: remainder,
  };
}

function extractOther(contentText: string, segment: CitationSegment): CitationExtractionResult {
  const urls = findPlainTextUrls(segment.coreText)
    .map((match) =>
      createComponent(
        contentText,
        segment.coreStart + match.start,
        segment.coreStart + match.end,
        match.text
      )
    )
    .filter((component): component is ExtractedComponent<string> => component !== undefined);
  const references = segment.embeddedStatuteReferences.map((reference) =>
    extractStatute(reference, contentText)
  );
  const data: OtherExtraction = { urls, referenceCandidates: references };
  const remainder = collectUnparsedRemainder(segment, contentText, [...urls]);
  return { type: "OTHER", status: "unresolved", data, unparsedRemainder: remainder };
}

function extractStatuteSegment(
  contentText: string,
  segment: CitationSegment
): CitationExtractionResult {
  const candidate = segment.embeddedStatuteReferences[0];
  const data = candidate
    ? extractStatute(candidate, contentText)
    : { referenceContext: "unknown" as const, sections: [] };
  const consumed = candidate ? [candidate] : [];
  const remainder = collectUnparsedRemainder(segment, contentText, consumed);
  return {
    type: "STATUTE",
    status: extractionStatus(data.sections.length, remainder),
    data,
    unparsedRemainder: remainder,
  };
}

export function isValidCitationExtraction(
  extraction: CitationExtractionResult,
  contentText: string
): boolean {
  const visit = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.every(visit);
    if (!value || typeof value !== "object") return true;
    const object = value as Record<string, unknown>;
    if (
      typeof object.rawText === "string" &&
      typeof object.start === "number" &&
      typeof object.end === "number"
    ) {
      if (
        !Number.isInteger(object.start) ||
        !Number.isInteger(object.end) ||
        object.start < 0 ||
        object.start >= object.end ||
        object.end > contentText.length ||
        object.rawText !== contentText.slice(object.start, object.end)
      ) {
        return false;
      }
    }
    return Object.values(object).every(visit);
  };
  return visit(extraction);
}

function extractSegment(
  contentText: string,
  footnote: FootnoteSnapshot,
  segment: CitationSegment,
  protectedRanges: readonly AnalysisProtectedRange[]
): CitationExtractionResult {
  switch (segment.classification.type) {
    case "STATUTE":
      return extractStatuteSegment(contentText, segment);
    case "CASE_LAW":
      return extractCaseLaw(contentText, segment);
    case "COMMENTARY":
      return extractCommentary(contentText, footnote, segment);
    case "BOOK":
      return extractBook(contentText, footnote, segment);
    case "JOURNAL_ARTICLE":
      return extractJournalArticle(contentText, footnote, segment);
    case "BOOK_CHAPTER":
      return extractBookChapter(contentText, footnote, segment);
    case "CASE_NOTE":
      return extractCaseNote(contentText, footnote, segment);
    case "LEGISLATIVE_MATERIAL":
      return extractLegislativeMaterial(contentText, segment);
    case "ONLINE_SOURCE":
      return extractOnlineSource(contentText, segment, protectedRanges);
    case "ADMINISTRATIVE_MATERIAL":
      return extractAdministrativeMaterial(contentText, segment);
    case "OTHER":
      return extractOther(contentText, segment);
  }
}

export function extractFootnoteParseResult(
  parseResult: FootnoteParseResult,
  footnote: FootnoteSnapshot,
  protectedRanges: readonly AnalysisProtectedRange[]
): FootnoteParseResult {
  return {
    ...parseResult,
    segments: parseResult.segments.map((segment) => {
      const extraction = extractSegment(footnote.contentText, footnote, segment, protectedRanges);
      return {
        ...segment,
        ...(isValidCitationExtraction(extraction, footnote.contentText) ? { extraction } : {}),
      };
    }),
  };
}
