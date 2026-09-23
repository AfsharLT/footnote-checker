import { findPlainTextUrls } from "./patterns";
import type {
  AnalysisProtectedRange,
  CaseLawCitationForm,
  CitationClassification,
  CitationSegment,
  ClassificationSignal,
  FootnoteParseResult,
} from "./types";

interface CaseLawSignals {
  strong: boolean;
  form: CaseLawCitationForm;
  signals: ClassificationSignal[];
}

interface TextRange {
  start: number;
  end: number;
}

const COURT_PATTERN =
  /\b(?:BVerfG|BGH|BAG|BFH|BVerwG|BSG|OLG(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]+)?|KG|LG|AG)\b/;
const OFFICIAL_COLLECTION_PATTERN =
  /\b(?:BVerfGE|BGHSt|BGHZ|BAGE|BFHE|BVerwGE|BSGE)\s+\d+,\s*\d+\b/;
const DECISION_TYPE_PATTERN =
  /(?:\b(?:Urteil|Beschluss)\b|\b(?:Urt|U|Beschl|B|Entsch)\.(?=$|[\s,;:–—-]))/i;
const DECISION_DATE_PATTERN = /\b(?:v\.|vom)\s*\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2})\b/i;
const DOCKET_NUMBER_PATTERN =
  /\b(?:(?:\d+|[IVXLCDM]+)\s+)?(?:StR|BvR|BvL|ZR|ZB|AZR|ABR|R|C|U|K|L|B|A)\s+\d+\/\d{2,4}\b/i;
const JOURNAL_REFERENCE_PATTERN =
  /\b(?:NJW|NStZ(?:-RR)?|JZ|JuS|JA|JR|StV|wistra|ZfIStW|KriPoZ|ZStW|GA|MDR|ZIP|NZG|GmbHR|DStR|DStZ|BB|NZWiSt|Jahrbuch\s+für\s+Recht\s+und\s+Ethik)\s+\d{4},\s*\d+\b/i;
const DATABASE_REFERENCE_PATTERN = /\b(?:BeckRS\s+\d{4},\s*\d+|juris|openJur)\b/i;
const LEGISLATIVE_MATERIAL_PATTERN =
  /(?:\b(?:Bundestags-Drucksache|Bundesrats-Drucksache)\b|\b(?:BT|BR)-(?:Drs|Drucks)\.(?=$|[\s,]))/i;
const ADMINISTRATIVE_MATERIAL_PATTERN =
  /\b(?:BMF-Schreiben|Schreiben\s+des\s+BMF|Anwendungserlass|AEAO|Erlass|Rundschreiben|Verwaltungsanweisung)\b/i;
const CASE_NOTE_PATTERN = /(?:\b(?:Anmerkung|Besprechung)\b|\b(?:Anm|Bespr)\.(?=$|[\s,]))/i;
const COMMENTARY_WORK_PATTERN =
  /\b(?:MüKo-(?:StGB|BGB|StPO)|BeckOK-(?:StGB|BGB|StPO)|NK-StGB|SK-StGB|LK-StGB|TK-StGB|KK-StPO)\b/i;
const COMMENTARY_STRUCTURE_PATTERN =
  /\b(?:[A-Za-zÄÖÜäöüß]+-(?:StGB|BGB|StPO)|Studienkommentar|Kommentar)\//i;
const WORK_BEARBEITER_PATTERN = /^[^,]+\/[A-ZÄÖÜ][A-Za-zÄÖÜäöüß'-]+/;
const BEARBEITER_IN_WORK_PATTERN =
  /^[A-ZÄÖÜ][\p{L}\p{M}'’.-]+(?:\s*\/\s*[A-ZÄÖÜ][\p{L}\p{M}'’.-]+)*\s*,\s*in\s*:\s*[^,;]{2,120}/iu;
const MARGIN_NUMBER_PATTERN = /\b(?:Rn\.|Rdn\.|Rdnr\.)\s*\d+[A-Za-z]?\b/i;
const AUTHOR_PREFIX_PATTERN = /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß'-]+(?:\/[A-ZÄÖÜ][A-Za-zÄÖÜäöüß'-]+)*\s*,/;
const BOOK_TITLE_PATTERN =
  /\b(?:Strafrecht|Zivilrecht|Lehrbuch|Handbuch|Monografie|Grundkurs|Allgemeiner\s+Teil|Besonderer\s+Teil)\b/i;
const EDITION_PATTERN = /\b\d+\.\s*Aufl\.(?=$|[\s,])/i;
const YEAR_PATTERN = /\b(?:19|20)\d{2}\b/;
const BOOK_CHAPTER_IN_PATTERN = /\bin\s*:/i;
const COLLECTION_WORK_PATTERN = /\b(?:Festschrift|Gedächtnisschrift|Sammelwerk|Handbuch|FS|GS)\b/i;
const PAGE_PATTERN = /\bS\.\s*\d+\b/;
const ACCESS_DATE_PATTERN =
  /\(?\s*(?:letzter|letzten|zuletzt(?:er)?)\s+(?:Aufruf|Abruf|abgerufen)\s*(?:am)?\s*\d{1,2}\.\d{1,2}\.\d{4}\s*\)?/i;
const WEB_SOURCE_LABEL_PATTERN = /\b(?:Onlinequelle|Website|Internetquelle|YouTube)\b/i;

function createSignal(
  code: string,
  text: string,
  start: number,
  end = start + text.length
): ClassificationSignal {
  return { code, text, start, end };
}

function findSignal(
  text: string,
  absoluteStart: number,
  pattern: RegExp,
  code: string
): ClassificationSignal | undefined {
  pattern.lastIndex = 0;
  const match = pattern.exec(text);
  return match
    ? createSignal(
        code,
        match[0],
        absoluteStart + match.index,
        absoluteStart + match.index + match[0].length
      )
    : undefined;
}

function compactSignals(signals: Array<ClassificationSignal | undefined>): ClassificationSignal[] {
  const result: ClassificationSignal[] = [];
  const keys = new Set<string>();

  for (const signal of signals) {
    if (!signal) continue;
    const key = `${signal.code}:${signal.start ?? ""}:${signal.end ?? ""}`;
    if (!keys.has(key)) {
      keys.add(key);
      result.push(signal);
    }
  }

  return result;
}

function embeddedStatuteSignal(segment: CitationSegment): ClassificationSignal | undefined {
  const reference = segment.embeddedStatuteReferences[0];
  return reference
    ? createSignal(
        "EMBEDDED_STATUTE_REFERENCE",
        reference.originalText,
        reference.start,
        reference.end
      )
    : undefined;
}

function sectionReferenceSignal(segment: CitationSegment): ClassificationSignal | undefined {
  const reference = segment.embeddedStatuteReferences[0];
  return reference
    ? createSignal(
        "SECTION_REFERENCE_CANDIDATE",
        reference.originalText,
        reference.start,
        reference.end
      )
    : undefined;
}

function detectCaseLaw(segment: CitationSegment): CaseLawSignals {
  const text = segment.coreText;
  const offset = segment.coreStart;
  const court = findSignal(text, offset, COURT_PATTERN, "COURT_PATTERN");
  const officialCollection = findSignal(
    text,
    offset,
    OFFICIAL_COLLECTION_PATTERN,
    "OFFICIAL_COLLECTION_PATTERN"
  );
  const decisionType = findSignal(text, offset, DECISION_TYPE_PATTERN, "DECISION_TYPE_PATTERN");
  const decisionDate = findSignal(text, offset, DECISION_DATE_PATTERN, "DECISION_DATE_PATTERN");
  const docketNumber = findSignal(text, offset, DOCKET_NUMBER_PATTERN, "DOCKET_NUMBER_PATTERN");
  const journal = findSignal(text, offset, JOURNAL_REFERENCE_PATTERN, "JOURNAL_REFERENCE_PATTERN");
  const database = findSignal(
    text,
    offset,
    DATABASE_REFERENCE_PATTERN,
    "DATABASE_REFERENCE_PATTERN"
  );
  const hasDirectForm = Boolean(decisionType || decisionDate || docketNumber);
  const forms: CaseLawCitationForm[] = [];

  if (hasDirectForm) forms.push("DIRECT");
  if (officialCollection) forms.push("OFFICIAL_COLLECTION");
  if (journal) forms.push("JOURNAL");
  if (database) forms.push("DATABASE");

  const form = forms.length > 1 ? "HYBRID" : (forms[0] ?? "UNKNOWN");
  const strong =
    Boolean(officialCollection) ||
    (Boolean(court) &&
      Boolean(decisionType || decisionDate || docketNumber || journal || database));

  return {
    strong,
    form,
    signals: compactSignals([
      court,
      officialCollection,
      decisionType,
      decisionDate,
      docketNumber,
      journal,
      database,
      embeddedStatuteSignal(segment),
    ]),
  };
}

function detectCommentary(segment: CitationSegment): CitationClassification | undefined {
  const knownWork = findSignal(
    segment.coreText,
    segment.coreStart,
    COMMENTARY_WORK_PATTERN,
    "COMMENTARY_WORK_PATTERN"
  );
  const generalStructure = findSignal(
    segment.coreText,
    segment.coreStart,
    COMMENTARY_STRUCTURE_PATTERN,
    "COMMENTARY_STRUCTURE_PATTERN"
  );
  const workBearbeiter = findSignal(
    segment.coreText,
    segment.coreStart,
    WORK_BEARBEITER_PATTERN,
    "COMMENTARY_WORK_BEARBEITER_PATTERN"
  );
  const bearbeiterInWork = findSignal(
    segment.coreText,
    segment.coreStart,
    BEARBEITER_IN_WORK_PATTERN,
    "COMMENTARY_BEARBEITER_IN_WORK_PATTERN"
  );
  const marginNumber = findSignal(
    segment.coreText,
    segment.coreStart,
    MARGIN_NUMBER_PATTERN,
    "MARGIN_NUMBER_PATTERN"
  );
  const statute = embeddedStatuteSignal(segment);
  const isCommentary =
    Boolean(knownWork && workBearbeiter && marginNumber && statute) ||
    Boolean(generalStructure && workBearbeiter && marginNumber && statute) ||
    Boolean(bearbeiterInWork && marginNumber && statute);

  if (!isCommentary) return undefined;

  return {
    type: "COMMENTARY",
    certainty: knownWork || bearbeiterInWork ? "high" : "medium",
    signals: compactSignals([
      knownWork,
      generalStructure,
      workBearbeiter,
      bearbeiterInWork,
      marginNumber,
      statute,
    ]),
  };
}

function detectBookChapter(segment: CitationSegment): CitationClassification | undefined {
  const inContext = findSignal(
    segment.coreText,
    segment.coreStart,
    BOOK_CHAPTER_IN_PATTERN,
    "BOOK_CHAPTER_IN_PATTERN"
  );
  const collection = findSignal(
    segment.coreText,
    segment.coreStart,
    COLLECTION_WORK_PATTERN,
    "COLLECTION_WORK_PATTERN"
  );
  const page = findSignal(segment.coreText, segment.coreStart, PAGE_PATTERN, "PAGE_PATTERN");

  if (!inContext || (!collection && !page)) return undefined;

  return {
    type: "BOOK_CHAPTER",
    certainty: collection ? "high" : "medium",
    signals: compactSignals([inContext, collection, page, embeddedStatuteSignal(segment)]),
  };
}

function findAuthorBeforeJournal(
  segment: CitationSegment,
  journalSignal: ClassificationSignal
): ClassificationSignal | undefined {
  const journalStart = journalSignal.start! - segment.coreStart;
  const prefix = segment.coreText.slice(0, journalStart).replace(/[\s,]+$/, "");
  const authorPattern = /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß'-]+(?:\/[A-ZÄÖÜ][A-Za-zÄÖÜäöüß'-]+)*$/;

  if (!authorPattern.test(prefix)) return undefined;
  return createSignal("AUTHOR_BEFORE_JOURNAL_PATTERN", prefix, segment.coreStart);
}

function detectJournalArticle(
  segment: CitationSegment,
  caseLaw: CaseLawSignals
): CitationClassification | undefined {
  if (caseLaw.strong) return undefined;
  const journal = findSignal(
    segment.coreText,
    segment.coreStart,
    JOURNAL_REFERENCE_PATTERN,
    "JOURNAL_REFERENCE_PATTERN"
  );
  if (!journal) return undefined;
  const author = findAuthorBeforeJournal(segment, journal);
  if (!author) return undefined;

  return {
    type: "JOURNAL_ARTICLE",
    certainty: "high",
    signals: [author, journal],
  };
}

function detectBook(segment: CitationSegment): CitationClassification | undefined {
  const author = findSignal(
    segment.coreText,
    segment.coreStart,
    AUTHOR_PREFIX_PATTERN,
    "AUTHOR_PREFIX_PATTERN"
  );
  const title = findSignal(
    segment.coreText,
    segment.coreStart,
    BOOK_TITLE_PATTERN,
    "BOOK_TITLE_PATTERN"
  );
  const edition = findSignal(
    segment.coreText,
    segment.coreStart,
    EDITION_PATTERN,
    "EDITION_PATTERN"
  );
  const year = findSignal(
    segment.coreText,
    segment.coreStart,
    YEAR_PATTERN,
    "PUBLICATION_YEAR_PATTERN"
  );
  const marginNumber = findSignal(
    segment.coreText,
    segment.coreStart,
    MARGIN_NUMBER_PATTERN,
    "MARGIN_NUMBER_PATTERN"
  );
  const strongStructure =
    Boolean(author && edition && year) ||
    Boolean(author && title && (edition || year || marginNumber));

  if (!strongStructure) return undefined;

  return {
    type: "BOOK",
    certainty: edition && year ? "high" : "medium",
    signals: compactSignals([
      author,
      title,
      edition,
      year,
      marginNumber,
      sectionReferenceSignal(segment),
    ]),
  };
}

function resolveReferenceContexts(
  segment: CitationSegment,
  classification: CitationClassification
): CitationSegment["embeddedStatuteReferences"] {
  return segment.embeddedStatuteReferences.map((reference, index, references) => {
    if (classification.type === "STATUTE" || classification.type === "COMMENTARY") {
      return { ...reference, referenceContext: "statute" };
    }

    if (reference.law) {
      return { ...reference, referenceContext: "statute" };
    }

    if (classification.type === "BOOK") {
      const followingEnd = references[index + 1]?.start ?? segment.end;
      const followingText = segment.originalText.slice(
        reference.end - segment.start,
        followingEnd - segment.start
      );
      if (/^\s*,?\s*(?:Rn\.|Rdnr\.)\s*\d+/i.test(followingText)) {
        return { ...reference, referenceContext: "workSection" };
      }
    }

    return { ...reference, referenceContext: "unknown" };
  });
}

function isAllowedStatuteGap(gap: string, position: "before" | "between" | "after"): boolean {
  if (position === "before") return /^[\s([{"'„“]*$/.test(gap);
  if (position === "after") return /^[\s.,;:)\]}"'”]*$/.test(gap);
  return /^[\s,;/]*(?:(?:und|oder|bis)\s*)?$/i.test(gap);
}

function statuteCoversCore(segment: CitationSegment): boolean {
  const references = [...segment.embeddedStatuteReferences]
    .filter((reference) => reference.start >= segment.coreStart && reference.end <= segment.coreEnd)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  if (references.length === 0) return false;

  let cursor = segment.coreStart;
  for (const reference of references) {
    const gap = segment.coreText.slice(
      cursor - segment.coreStart,
      reference.start - segment.coreStart
    );
    if (!isAllowedStatuteGap(gap, cursor === segment.coreStart ? "before" : "between")) {
      return false;
    }
    cursor = Math.max(cursor, reference.end);
  }

  return isAllowedStatuteGap(segment.coreText.slice(cursor - segment.coreStart), "after");
}

function detectStatute(segment: CitationSegment): CitationClassification | undefined {
  if (!statuteCoversCore(segment)) return undefined;
  return {
    type: "STATUTE",
    certainty: "high",
    signals: compactSignals([
      {
        code: "STATUTE_CORE_COVERAGE",
        text: segment.coreText,
        start: segment.coreStart,
        end: segment.coreEnd,
      },
      embeddedStatuteSignal(segment),
    ]),
  };
}

function getUrlRanges(
  segment: CitationSegment,
  protectedRanges: readonly AnalysisProtectedRange[]
): TextRange[] {
  const ranges: TextRange[] = [];

  for (const range of protectedRanges) {
    const start = Math.max(range.start, segment.coreStart);
    const end = Math.min(range.end, segment.coreEnd);
    if (start >= end) continue;
    const text = segment.originalText.slice(start - segment.start, end - segment.start);
    if (range.type === "plainTextUrl" || /^(?:https?:\/\/|www\.)/i.test(text)) {
      ranges.push({ start, end });
    }
  }

  for (const match of findPlainTextUrls(segment.coreText)) {
    ranges.push({ start: segment.coreStart + match.start, end: segment.coreStart + match.end });
  }

  ranges.sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: TextRange[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function detectOnlineSource(
  segment: CitationSegment,
  protectedRanges: readonly AnalysisProtectedRange[]
): CitationClassification | undefined {
  const ranges = getUrlRanges(segment, protectedRanges);
  if (ranges.length === 0) return undefined;

  let cursor = segment.coreStart;
  const remainderParts: string[] = [];
  for (const range of ranges) {
    remainderParts.push(
      segment.coreText.slice(cursor - segment.coreStart, range.start - segment.coreStart)
    );
    cursor = range.end;
  }
  remainderParts.push(segment.coreText.slice(cursor - segment.coreStart));
  const remainder = remainderParts.join(" ");
  const accessDate = findSignal(
    segment.coreText,
    segment.coreStart,
    ACCESS_DATE_PATTERN,
    "ACCESS_DATE_PATTERN"
  );
  const webLabel = findSignal(
    segment.coreText,
    segment.coreStart,
    WEB_SOURCE_LABEL_PATTERN,
    "WEB_SOURCE_LABEL_PATTERN"
  );
  const remainderWithoutAccessDate = remainder
    .replace(ACCESS_DATE_PATTERN, "")
    .replace(/[\s,.;:()\u005b\u005d…-]+/g, "");
  const urlDominates = remainderWithoutAccessDate.length === 0;

  if (!urlDominates && !accessDate && !webLabel) return undefined;

  const urlSignals = ranges.map((range) =>
    createSignal(
      "URL_PATTERN",
      segment.originalText.slice(range.start - segment.start, range.end - segment.start),
      range.start,
      range.end
    )
  );

  return {
    type: "ONLINE_SOURCE",
    certainty: urlDominates || accessDate ? "high" : "medium",
    signals: compactSignals([
      ...urlSignals,
      accessDate,
      webLabel,
      urlDominates
        ? {
            code: "URL_DOMINATES_CORE",
            start: segment.coreStart,
            end: segment.coreEnd,
          }
        : undefined,
    ]),
  };
}

export function classifyCitationSegment(
  segment: CitationSegment,
  protectedRanges: readonly AnalysisProtectedRange[] = []
): CitationClassification {
  const legislativeMaterial = findSignal(
    segment.coreText,
    segment.coreStart,
    LEGISLATIVE_MATERIAL_PATTERN,
    "LEGISLATIVE_MATERIAL_PATTERN"
  );
  if (legislativeMaterial) {
    return { type: "LEGISLATIVE_MATERIAL", certainty: "high", signals: [legislativeMaterial] };
  }

  const administrativeMaterial = findSignal(
    segment.coreText,
    segment.coreStart,
    ADMINISTRATIVE_MATERIAL_PATTERN,
    "ADMINISTRATIVE_MATERIAL_PATTERN"
  );
  if (administrativeMaterial) {
    return {
      type: "ADMINISTRATIVE_MATERIAL",
      certainty: "high",
      signals: [administrativeMaterial],
    };
  }

  const caseLaw = detectCaseLaw(segment);
  const caseNote = findSignal(
    segment.coreText,
    segment.coreStart,
    CASE_NOTE_PATTERN,
    "CASE_NOTE_PATTERN"
  );
  const noteContext = caseNote
    ? findSignal(segment.coreText, segment.coreStart, /\bzu\b/i, "CASE_NOTE_CONTEXT_PATTERN")
    : undefined;
  if (
    caseNote &&
    (caseLaw.strong ||
      noteContext ||
      caseLaw.signals.some((signal) => signal.code === "JOURNAL_REFERENCE_PATTERN"))
  ) {
    return {
      type: "CASE_NOTE",
      certainty: caseLaw.strong ? "high" : "medium",
      signals: compactSignals([caseNote, noteContext, ...caseLaw.signals]),
    };
  }

  if (caseLaw.strong) {
    return {
      type: "CASE_LAW",
      certainty: "high",
      signals: caseLaw.signals,
      caseLawForm: caseLaw.form,
    };
  }

  const commentary = detectCommentary(segment);
  if (commentary) return commentary;

  const bookChapter = detectBookChapter(segment);
  if (bookChapter) return bookChapter;

  const journalArticle = detectJournalArticle(segment, caseLaw);
  if (journalArticle) return journalArticle;

  const book = detectBook(segment);
  if (book) return book;

  const statute = detectStatute(segment);
  if (statute) return statute;

  const onlineSource = detectOnlineSource(segment, protectedRanges);
  if (onlineSource) return onlineSource;

  return {
    type: "OTHER",
    certainty: "low",
    signals: [{ code: "INSUFFICIENT_CLASSIFICATION_SIGNALS" }],
  };
}

export function classifyFootnoteParseResult(
  parseResult: FootnoteParseResult,
  protectedRanges: readonly AnalysisProtectedRange[]
): FootnoteParseResult {
  return {
    ...parseResult,
    segments: parseResult.segments.map((segment) => {
      const classification = classifyCitationSegment(segment, protectedRanges);
      return {
        ...segment,
        embeddedStatuteReferences: resolveReferenceContexts(segment, classification),
        classification,
      };
    }),
  };
}
