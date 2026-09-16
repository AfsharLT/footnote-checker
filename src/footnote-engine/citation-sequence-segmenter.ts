import type { FootnoteSnapshot } from "../taskpane/taskpane";
import { isRangeProtected } from "./protected-ranges";
import type {
  AnalysisProtectedRange,
  CitationCertainty,
  CitationFormattingEvidence,
  CitationInternalReference,
  CitationItem,
  CitationQualifier,
  CitationSequence,
  CitationSequenceResult,
  CitationStructureStatus,
  CitationStructureWarning,
  CitationType,
  NarrativeText,
} from "./types";

export const SEGMENTATION_USER_MESSAGE =
  "Ein Teil dieser Fußnote konnte nicht eindeutig als Quellenangabe eingeordnet werden. Die übrige Fußnote wurde trotzdem geprüft.";

interface TextRange {
  start: number;
  end: number;
}

interface CitationEvidence {
  score: number;
  citationType?: CitationType;
  signals: string[];
}

interface QualifierDefinition {
  signal: string;
  pattern: RegExp;
}

interface SequenceDraft {
  start: number;
  groupLabel?: string;
  qualifiers: CitationQualifier[];
  items: CitationItem[];
  warnings: CitationStructureWarning[];
}

export interface CitationSequenceFaultContext extends TextRange {
  footnoteId: string;
  paragraphIndex: number;
}

export interface CitationSequenceSegmenterOptions {
  faultInjector?: (stage: "sequence" | "item", context: CitationSequenceFaultContext) => void;
  citationSeparators?: readonly string[];
}

const QUALIFIER_DEFINITIONS: readonly QualifierDefinition[] = [
  { signal: "seeAlso", pattern: /\bs\.\s*auch\b/g },
  { signal: "comparison", pattern: /\bvgl\./gi },
  { signal: "reference", pattern: /\bs\.(?=\s|$)/g },
  { signal: "disagreement", pattern: /\bdagegen\b/gi },
  { signal: "criticism", pattern: /\bkritisch\b/gi },
  { signal: "deviation", pattern: /\babweichend\b/gi },
  { signal: "similarity", pattern: /ähnlich(?=$|[^\p{L}\p{M}\p{N}_])/giu },
  { signal: "lessRestrictive", pattern: /\bweniger\s+restriktiv\b/gi },
  { signal: "sameResult", pattern: /\bim\s+Ergebnis\s+ebenso\b/gi },
  { signal: "sameFinding", pattern: /\bmit\s+diesem\s+Befund\s+auch\b/gi },
  { signal: "supra", pattern: /\bS\.o\.\s+[IVXLC]+\.\s+sowie\b/g },
  { signal: "support", pattern: /\bdafür\b/gi },
  { signal: "narrower", pattern: /\benger\b/gi },
  { signal: "broader", pattern: /\bweiter\b/gi },
  { signal: "parsProToto", pattern: /\bpars\s+pro\s+toto\b/gi },
  { signal: "context", pattern: /\bhierzu\b/gi },
  { signal: "detail", pattern: /\bnäher\b/gi },
  { signal: "agreement", pattern: /\bso\b/gi },
  { signal: "topic", pattern: /\b(?:Zu|Zum|Zur)\s+[^:.;]{1,100}:/gi },
];

const THEMATIC_HEADING_PATTERN = /\b(?:Zu|Zum|Zur)\s+[^:.;]{1,100}:/gi;
const INTERNAL_REFERENCE_PATTERN = /\(\s*Anm\.\s*(\d+)\s*\)/gi;
const ABBREVIATION_BEFORE_PERIOD = new Set([
  "a",
  "abs",
  "abschn",
  "aufl",
  "bd",
  "beschl",
  "bzw",
  "d",
  "drs",
  "ed",
  "ff",
  "f",
  "lit",
  "m",
  "nr",
  "o",
  "rdn",
  "rdnr",
  "rn",
  "s",
  "st",
  "u",
  "urt",
  "v",
  "vgl",
  "z",
]);

function trimRange(text: string, range: TextRange): TextRange {
  let { start, end } = range;
  while (start < end && /\s/.test(text[start])) start += 1;
  while (end > start && /\s/.test(text[end - 1])) end -= 1;
  return { start, end };
}

function isValidRange(text: string, range: TextRange): boolean {
  return (
    Number.isInteger(range.start) &&
    Number.isInteger(range.end) &&
    range.start >= 0 &&
    range.start < range.end &&
    range.end <= text.length
  );
}

function stableId(
  kind: "sequence" | "item" | "narrative",
  footnote: FootnoteSnapshot,
  start: number,
  end: number
): string {
  return `${kind}:${footnote.id}:${start}:${end}:${footnote.originalTextHash}`;
}

function normalizeForAnalysis(rawText: string): string {
  return rawText
    .normalize("NFC")
    .replace(/[\u00a0\u2007\u202f\u2009]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNarrativeOpening(text: string): boolean {
  return /^(?:So\s+wird|Diese[rs]?|Unter\s+Annahme|Zudem|Der\s+Beginn|Ein\s+weiterer|Dadurch|Damit|geht|gehen|ist|sind)\b/i.test(
    normalizeForAnalysis(text)
  );
}

function findQualifiers(text: string, range: TextRange): CitationQualifier[] {
  const candidates: CitationQualifier[] = [];
  const rawText = text.slice(range.start, range.end);

  for (const definition of QUALIFIER_DEFINITIONS) {
    definition.pattern.lastIndex = 0;
    let match = definition.pattern.exec(rawText);
    while (match) {
      const start = range.start + match.index;
      let end = start + match[0].length;
      if (text[end] === ":" && end < range.end) end += 1;
      candidates.push({ signal: definition.signal, start, end, rawText: text.slice(start, end) });
      match = definition.pattern.exec(rawText);
    }
  }

  candidates.sort((left, right) => left.start - right.start || right.end - left.end);
  return candidates.filter(
    (candidate, index, all) =>
      !all
        .slice(0, index)
        .some((previous) => previous.start <= candidate.start && previous.end >= candidate.end)
  );
}

function citationEvidence(rawText: string): CitationEvidence {
  const text = normalizeForAnalysis(rawText);
  if (isNarrativeOpening(text)) {
    return { score: 0, signals: ["narrativeOpening"] };
  }
  const signals: string[] = [];
  let score = 0;
  const add = (signal: string, points: number, pattern: RegExp): boolean => {
    pattern.lastIndex = 0;
    if (!pattern.test(text)) return false;
    score += points;
    signals.push(signal);
    return true;
  };

  const court = add("court", 2, /\b(?:BVerfG|BGH|BAG|BFH|BSG|BVerwG|EuGH|OLG|LG|AG|KG)\b/i);
  const reporter = add(
    "reporter",
    2,
    /\b(?:BVerfGE|BGHSt|BGHZ|RGSt|NJW|NStZ(?:-RR)?|JZ|JuS|JA|JR|StV|wistra|ZStW|GA|MDR|MedR|BeckRS|Jahrbuch\s+für\s+Recht\s+und\s+Ethik)\b/i
  );
  const statute = add("statute", 2, /(?:^|[\s,;(])(?:§§?|Art\.)\s*\d/i);
  const margin = add("marginNumber", 2, /\b(?:Rn\.|Rdn\.?|Rdnr\.)\s*\d/i);
  const edition = add("edition", 1, /\b(?:Aufl\.|Ed\.)\s*\d|\b\d+\.\s*(?:Aufl\.|Ed\.)/i);
  const authorShape = add(
    "authorShape",
    1,
    /^(?:(?:vgl\.|s\.|s\.\s*auch|dagegen|kritisch|ähnlich|hierzu|näher|so)\s+)?[A-ZÄÖÜ][\p{L}\p{M}'’-]+(?:\/[A-ZÄÖÜ][\p{L}\p{M}'’-]+)*\s*,/iu
  );
  add("shortAuthorReference", 1, /^(?:ders\.|dies\.)\s+/i);
  const workShape = add(
    "workShape",
    2,
    /\b(?:MüKo-|BeckOK-|NK-|SK-|LK-|KK-|Kommentar|Strafrecht|Zivilrecht|Handbuch|Lehrbuch)\b/i
  );
  const material = add("legislativeMaterial", 3, /\b(?:BT|BR)-(?:Drs|Drucks)\./i);
  const administrative = add(
    "administrativeMaterial",
    3,
    /\b(?:BMF|BMI|BMJ|BMG|BMDV|BVerwA)-Schreiben\b/i
  );
  const online = add("online", 2, /(?:https?:\/\/|www\.)/i);
  add("manuscript", 2, /\(Manuskript\)/i);
  add("sourceNoun", 1, /\b(?:Quelle|Fundstelle|Werk)\b/i);
  const yearPage = add("yearPage", 1, /\b(?:19|20)\d{2}\s*,\s*\d+/);
  const docket = add("docket", 2, /\b(?:StR|BvR|BvL|ZR|ZB|AZR|ABR)\s+\d+\/\d+/i);
  add("pageLocator", 1, /\bS\.\s*\d+/);
  add("locatorContinuation", 1, /^\d+\s*ff?\./i);

  let citationType: CitationType | undefined;
  if (material) citationType = "LEGISLATIVE_MATERIAL";
  else if (administrative) citationType = "ADMINISTRATIVE_MATERIAL";
  else if (online) citationType = "ONLINE_SOURCE";
  else if (court || reporter || docket) citationType = "CASE_LAW";
  else if (margin && (workShape || statute)) citationType = "COMMENTARY";
  else if (statute && !authorShape) citationType = "STATUTE";
  else if (authorShape && (edition || workShape || yearPage)) citationType = "BOOK";

  return { score, citationType, signals };
}

function configuredSeparators(values: readonly string[] | undefined): string[] {
  const separators = (values ?? [";"])
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return [...new Set(separators.length > 0 ? separators : [";"])].sort(
    (left, right) => right.length - left.length
  );
}

function citationItemRange(
  text: string,
  clause: TextRange
): { range: TextRange; qualifiers: CitationQualifier[] } {
  const rawText = text.slice(clause.start, clause.end);
  const lowerCaseReferenceColon = /^(?:s\.\s*auch|s\.(?:\s+aber)?)\s*:\s*/u.exec(rawText);
  const lowerCaseReferencePlain = /^(?:s\.\s*auch|s\.(?:\s+aber)?)\s+/u.exec(rawText);
  const colonPrefix =
    lowerCaseReferenceColon ??
    /^(?:Mit\s+diesem\s+Befund\s+auch|vgl\.|dagegen(?:\s+jedoch)?|kritisch|abweichend|ähnlich|weniger\s+restriktiv|im\s+Ergebnis\s+ebenso|dafür|enger|weiter|pars\s+pro\s+toto|hierzu|näher|so)\s*:\s*/iu.exec(
      rawText
    );
  const plainPrefix =
    lowerCaseReferencePlain ??
    /^(?:S\.o\.\s+[IVXLC]+\.\s+sowie|Mit\s+diesem\s+Befund\s+auch|vgl\.|dagegen(?:\s+jedoch)?|kritisch|abweichend|ähnlich|weniger\s+restriktiv|im\s+Ergebnis\s+ebenso|dafür|enger|weiter|pars\s+pro\s+toto|hierzu|näher|so)\s+/iu.exec(
      rawText
    );
  const prefix = colonPrefix ?? plainPrefix;
  if (!prefix) return { range: clause, qualifiers: [] };

  const prefixRange = { start: clause.start, end: clause.start + prefix[0].trimEnd().length };
  return {
    range: trimRange(text, { start: clause.start + prefix[0].length, end: clause.end }),
    qualifiers: findQualifiers(text, prefixRange),
  };
}

function paragraphRanges(footnote: FootnoteSnapshot): TextRange[] {
  const text = footnote.contentText;
  const ranges = (footnote.paragraphs ?? [])
    .map((paragraph) => ({ start: paragraph.start, end: paragraph.end }))
    .filter(
      (range): range is TextRange =>
        Number.isInteger(range.start) &&
        Number.isInteger(range.end) &&
        range.start! >= 0 &&
        range.start! < range.end! &&
        range.end! <= text.length
    )
    .sort((left, right) => left.start - right.start || left.end - right.end);
  return ranges.length > 0 ? ranges : text.length > 0 ? [{ start: 0, end: text.length }] : [];
}

function precedingToken(text: string, periodIndex: number): string {
  let start = periodIndex - 1;
  while (start >= 0 && /[\p{L}\p{M}]/u.test(text[start])) start -= 1;
  return text.slice(start + 1, periodIndex).toLocaleLowerCase("de-DE");
}

function isSentenceBoundary(text: string, index: number, paragraphEnd: number): boolean {
  const character = text[index];
  if (character !== "." && character !== "!" && character !== "?") return false;
  let next = index + 1;
  while (next < paragraphEnd && /\s/.test(text[next])) next += 1;
  const token = precedingToken(text, index);
  const alphaNumericSuffix =
    token === "a" && /\d+a$/i.test(text.slice(Math.max(0, index - 8), index));
  if (character === "." && ABBREVIATION_BEFORE_PERIOD.has(token) && !alphaNumericSuffix) {
    return false;
  }
  if (
    character === "." &&
    /\d/.test(text[index - 1]) &&
    /^(?:Aufl|Ed|Abschn|Alt|Var|Fall)\./i.test(text.slice(next))
  ) {
    return false;
  }
  if (next >= paragraphEnd) return true;
  return /[A-ZÄÖÜ„“"(§]/.test(text[next]);
}

function followedBySeparator(text: string, end: number, separators: readonly string[]): boolean {
  let cursor = end;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  return separators.some((separator) => text.startsWith(separator, cursor));
}

function isQualifierLabelBeforeColon(rawText: string): boolean {
  const text = normalizeForAnalysis(rawText);
  if (/^(?:s\.\s*auch|s\.(?:\s+aber)?)$/u.test(text)) return true;
  return /^(?:Mit\s+diesem\s+Befund\s+auch|vgl\.|dagegen(?:\s+jedoch)?|kritisch|abweichend|ähnlich|weniger\s+restriktiv|im\s+Ergebnis\s+ebenso|dafür|enger|weiter|pars\s+pro\s+toto|hierzu|näher|so)$/iu.test(
    text
  );
}

function hasCompletedCitationShapeBeforeColon(rawText: string): boolean {
  const text = normalizeForAnalysis(rawText);
  const evidence = citationEvidence(text);
  if (evidence.score < 2) return false;
  return (
    /\bS\.\s*\d+(?:\s*,\s*\d+)*(?:\s*ff?\.?)?$/u.test(text) ||
    /\b(?:Rn\.|Rdn\.?|Rdnr\.)\s*\d+[a-z]?(?:\s*ff?\.?)?$/iu.test(text) ||
    /\b(?:19|20)\d{2}\s*,\s*\d+(?:\s*,\s*\d+)?(?:\s*ff?\.?)?$/u.test(text) ||
    /\b\d{1,4}\s*,\s*\d+(?:\s*,\s*\d+)?(?:\s*ff?\.?)?$/u.test(text)
  );
}

function looksLikePostCitationNarrative(rawText: string): boolean {
  const text = normalizeForAnalysis(rawText);
  if (!text) return false;
  if (/^[„“"'‚‘’]/u.test(text)) return true;
  if (/^[a-zäöüß]/u.test(text)) return true;
  return /^(?:keine|zur|zum|für|gegen|wenn|weil|wobei|wonach|unter|mit|ohne|als|dass)\b/iu.test(
    text
  );
}

function colonBoundaryKind(
  text: string,
  colonIndex: number,
  localStart: number,
  localEnd: number
): "qualifier" | "citationNarrative" | undefined {
  const left = trimRange(text, { start: localStart, end: colonIndex });
  const right = trimRange(text, { start: colonIndex + 1, end: localEnd });
  if (!isValidRange(text, left) || !isValidRange(text, right)) return undefined;
  const leftText = text.slice(left.start, left.end);
  const rightText = text.slice(right.start, right.end);
  if (isQualifierLabelBeforeColon(leftText) && citationEvidence(rightText).score > 0) {
    return "qualifier";
  }
  if (hasCompletedCitationShapeBeforeColon(leftText) && looksLikePostCitationNarrative(rightText)) {
    return "citationNarrative";
  }
  return undefined;
}

function createClauseRanges(
  text: string,
  paragraph: TextRange,
  protectedRanges: readonly AnalysisProtectedRange[],
  separators: readonly string[]
): TextRange[] {
  const boundaries = new Set<number>([paragraph.start, paragraph.end]);
  const colonCandidates: number[] = [];
  THEMATIC_HEADING_PATTERN.lastIndex = paragraph.start;
  let heading = THEMATIC_HEADING_PATTERN.exec(text);
  while (heading && heading.index < paragraph.end) {
    const headingEnd = heading.index + heading[0].length;
    if (headingEnd <= paragraph.end) {
      boundaries.add(heading.index);
      boundaries.add(headingEnd);
    }
    heading = THEMATIC_HEADING_PATTERN.exec(text);
  }

  let enclosureDepth = 0;
  for (let index = paragraph.start; index < paragraph.end; index += 1) {
    const character = text[index];
    if (character === "(" || character === "[" || character === "{") enclosureDepth += 1;
    if (character === ")" || character === "]" || character === "}") {
      enclosureDepth = Math.max(0, enclosureDepth - 1);
    }
    if (enclosureDepth > 0 || isRangeProtected(index, index + 1, protectedRanges)) continue;
    const configuredSeparator = separators.find((separator) => text.startsWith(separator, index));
    if (configuredSeparator) {
      boundaries.add(index);
      boundaries.add(index + configuredSeparator.length);
      index += configuredSeparator.length - 1;
    } else if (isSentenceBoundary(text, index, paragraph.end)) {
      boundaries.add(index + 1);
    } else if (character === ":" && precedingToken(text, index) !== "in") {
      colonCandidates.push(index);
    }
  }

  for (const colonIndex of colonCandidates) {
    const primaryBoundaries = [...boundaries].sort((left, right) => left - right);
    const localStart =
      [...primaryBoundaries].reverse().find((boundary) => boundary <= colonIndex) ??
      paragraph.start;
    const localEnd = primaryBoundaries.find((boundary) => boundary > colonIndex) ?? paragraph.end;
    const kind = colonBoundaryKind(text, colonIndex, localStart, localEnd);
    if (kind === "qualifier") boundaries.add(colonIndex + 1);
    if (kind === "citationNarrative") boundaries.add(colonIndex);
  }

  const positions = [...boundaries].sort((left, right) => left - right);
  const clauses: TextRange[] = [];
  for (let index = 0; index + 1 < positions.length; index += 1) {
    const range = trimRange(text, { start: positions[index], end: positions[index + 1] });
    const trimmed = trimRange(text, range);
    if (
      isValidRange(text, trimmed) &&
      !separators.some((separator) => text.slice(trimmed.start, trimmed.end) === separator)
    ) {
      clauses.push(trimmed);
    }
  }
  const transitionRanges = clauses.flatMap((clause) => {
    const rawText = text.slice(clause.start, clause.end);
    const transitionPattern =
      /(?:\b(?:Rn\.|Rdn\.?|Rdnr\.)\s*\d+[a-z]?(?:\s*ff?\.)?|\bS\.\s*\d+(?:\s*,\s*\d+)*(?:\s*ff?\.)?|\b\d{3,4}(?:\s*,\s*\d+)+(?:\s*ff?\.)?)[,)]*\s+(?=(?:geht|gehen|ist|sind|nimmt|nehmen|vertritt|vertreten|lehnt|lehnen|für|zur|zum|wegen|mit|ohne|als|bei|wonach)\b)/g;
    let transition: RegExpExecArray | null = null;
    let match = transitionPattern.exec(rawText);
    while (match) {
      transition = match;
      match = transitionPattern.exec(rawText);
    }
    if (!transition) return [clause];
    const boundary = clause.start + transition.index + transition[0].trimEnd().length;
    const citation = trimRange(text, { start: clause.start, end: boundary });
    const narrative = trimRange(text, { start: boundary, end: clause.end });
    return [citation, narrative].filter((range) => isValidRange(text, range));
  });
  return transitionRanges.flatMap((clause) => {
    const rawText = text.slice(clause.start, clause.end);
    if (!isNarrativeOpening(rawText)) return [clause];
    const embeddedPattern =
      /,\s+(?=(?:[Vv]gl\.|s\.(?:\s+auch|\s+aber)?|dagegen|kritisch|abweichend|ähnlich|weniger\s+restriktiv|im\s+Ergebnis\s+ebenso|hierzu|näher)\s+)/gu;
    let boundary: number | undefined;
    let match = embeddedPattern.exec(rawText);
    while (match) {
      const candidate = trimRange(text, {
        start: clause.start + match.index + match[0].length,
        end: clause.end,
      });
      const itemContent = citationItemRange(text, candidate);
      if (
        isValidRange(text, itemContent.range) &&
        citationEvidence(text.slice(itemContent.range.start, itemContent.range.end)).score > 0
      ) {
        boundary = clause.start + match.index;
      }
      match = embeddedPattern.exec(rawText);
    }
    if (boundary === undefined) return [clause];
    const narrative = trimRange(text, { start: clause.start, end: boundary });
    const citation = trimRange(text, { start: boundary + 1, end: clause.end });
    return [narrative, citation].filter((range) => isValidRange(text, range));
  });
}

function internalReferences(text: string, range: TextRange): CitationInternalReference[] {
  const result: CitationInternalReference[] = [];
  const rawText = text.slice(range.start, range.end);
  INTERNAL_REFERENCE_PATTERN.lastIndex = 0;
  let match = INTERNAL_REFERENCE_PATTERN.exec(rawText);
  while (match) {
    const start = range.start + match.index;
    const end = start + match[0].length;
    result.push({
      start,
      end,
      rawText: text.slice(start, end),
      referencedOrdinal: Number(match[1]),
      status: "unresolved",
    });
    match = INTERNAL_REFERENCE_PATTERN.exec(rawText);
  }
  return result;
}

function formattingEvidence(
  footnote: FootnoteSnapshot,
  range: TextRange
): CitationFormattingEvidence[] {
  return (footnote.formattingRuns ?? [])
    .filter((run) => run.start < range.end && run.end > range.start)
    .map((run) => ({
      start: Math.max(range.start, run.start),
      end: Math.min(range.end, run.end),
      properties: Object.keys(run).filter((key) => key !== "start" && key !== "end"),
    }));
}

function structureWarning(
  code: string,
  stage: CitationStructureWarning["stage"],
  range: TextRange
): CitationStructureWarning {
  return { code, stage, start: range.start, end: range.end, message: SEGMENTATION_USER_MESSAGE };
}

function createNarrative(
  footnote: FootnoteSnapshot,
  range: TextRange,
  reason: NarrativeText["reason"],
  warning?: CitationStructureWarning
): NarrativeText {
  return {
    id: stableId("narrative", footnote, range.start, range.end),
    footnoteId: footnote.id,
    ordinal: footnote.ordinal,
    start: range.start,
    end: range.end,
    rawText: footnote.contentText.slice(range.start, range.end),
    reason,
    status: warning
      ? reason === "narrative"
        ? "recognized"
        : reason === "footnoteFailure"
          ? "failed"
          : "uncertain"
      : "recognized",
    warnings: warning ? [warning] : [],
  };
}

function createItem(
  footnote: FootnoteSnapshot,
  sequenceId: string,
  itemOrdinal: number,
  range: TextRange,
  evidence: CitationEvidence,
  qualifiers: CitationQualifier[]
): CitationItem {
  const warnings =
    evidence.score >= 3 ? [] : [structureWarning("CITATION_ITEM_PARTIAL", "item", range)];
  const confidence: CitationCertainty =
    evidence.score >= 4 ? "high" : evidence.score >= 2 ? "medium" : "low";
  const status: CitationStructureStatus =
    evidence.score >= 2 ? "recognized" : "partiallyRecognized";
  const rawText = footnote.contentText.slice(range.start, range.end);
  return {
    id: stableId("item", footnote, range.start, range.end),
    footnoteId: footnote.id,
    ordinal: itemOrdinal,
    sequenceId,
    start: range.start,
    end: range.end,
    rawText,
    normalizedText: normalizeForAnalysis(rawText),
    ...(evidence.citationType ? { citationType: evidence.citationType } : {}),
    qualifiers,
    locators: [],
    internalReferences: internalReferences(footnote.contentText, range),
    sourceResolutionStatus: "notAttempted",
    canonicalSourceId: null,
    formattingEvidence: formattingEvidence(footnote, range),
    confidence,
    status,
    warnings,
  };
}

function sequenceStatus(items: readonly CitationItem[]): CitationStructureStatus {
  if (items.some((item) => item.status === "failed")) return "failed";
  if (items.some((item) => item.status !== "recognized")) return "partiallyRecognized";
  return "recognized";
}

function resultStatus(
  sequences: readonly CitationSequence[],
  warnings: readonly CitationStructureWarning[]
): CitationStructureStatus {
  if (warnings.some((warning) => warning.stage === "footnote")) return "failed";
  if (warnings.length > 0 || sequences.some((sequence) => sequence.status !== "recognized")) {
    return "partiallyRecognized";
  }
  return "recognized";
}

export function isValidCitationSequenceResult(
  result: CitationSequenceResult,
  contentText: string
): boolean {
  const validSpan = (span: { start: number; end: number; rawText: string }) =>
    isValidRange(contentText, span) && span.rawText === contentText.slice(span.start, span.end);
  return (
    result.sequences.every(
      (sequence) =>
        validSpan(sequence) &&
        sequence.items.every(
          (item) =>
            validSpan(item) &&
            item.start >= sequence.start &&
            item.end <= sequence.end &&
            item.qualifiers.every(validSpan) &&
            item.internalReferences.every(validSpan) &&
            item.formattingEvidence.every(
              (evidence) => evidence.start >= item.start && evidence.end <= item.end
            )
        ) &&
        sequence.qualifiers.every(validSpan)
    ) && result.narrativeText.every(validSpan)
  );
}

export function segmentCitationSequences(
  footnote: FootnoteSnapshot,
  protectedRanges: readonly AnalysisProtectedRange[],
  options: CitationSequenceSegmenterOptions = {}
): CitationSequenceResult {
  const sequences: CitationSequence[] = [];
  const narrativeText: NarrativeText[] = [];
  const warnings: CitationStructureWarning[] = [];
  const text = footnote.contentText;
  const separators = configuredSeparators(options.citationSeparators);

  try {
    const paragraphs = paragraphRanges(footnote);
    paragraphs.forEach((paragraph, paragraphIndex) => {
      try {
        options.faultInjector?.("sequence", {
          footnoteId: footnote.id,
          paragraphIndex,
          ...paragraph,
        });
        const clauses = createClauseRanges(text, paragraph, protectedRanges, separators);
        let draft: SequenceDraft | undefined;
        let pendingQualifiers: CitationQualifier[] = [];
        let pendingItemQualifiers: CitationQualifier[] = [];
        let pendingStart: number | undefined;
        let pendingGroupLabel: string | undefined;

        const closeSequence = () => {
          if (!draft || draft.items.length === 0) {
            draft = undefined;
            return;
          }
          const end = draft.items[draft.items.length - 1].end;
          const sequenceId = stableId("sequence", footnote, draft.start, end);
          for (const item of draft.items) item.sequenceId = sequenceId;
          const status = sequenceStatus(draft.items);
          sequences.push({
            id: sequenceId,
            footnoteId: footnote.id,
            ordinal: sequences.length + 1,
            start: draft.start,
            end,
            rawText: text.slice(draft.start, end),
            qualifiers: draft.qualifiers,
            ...(draft.groupLabel ? { groupLabel: draft.groupLabel } : {}),
            items: draft.items,
            confidence: status === "recognized" ? "high" : "low",
            status,
            warnings: draft.warnings,
          });
          draft = undefined;
        };

        for (const clause of clauses) {
          const rawText = text.slice(clause.start, clause.end);
          THEMATIC_HEADING_PATTERN.lastIndex = 0;
          const heading = THEMATIC_HEADING_PATTERN.exec(rawText);
          if (rawText.endsWith(":") && isQualifierLabelBeforeColon(rawText.slice(0, -1))) {
            pendingQualifiers = findQualifiers(text, clause);
            pendingItemQualifiers = [...pendingQualifiers];
            if (!draft) pendingStart = clause.start;
            continue;
          }
          if (
            (heading?.index === 0 && heading[0].length === rawText.length) ||
            (rawText.endsWith(":") &&
              rawText.length <= 110 &&
              !isNarrativeOpening(rawText) &&
              citationEvidence(rawText).score === 0)
          ) {
            closeSequence();
            pendingQualifiers = findQualifiers(text, clause);
            pendingStart = clause.start;
            pendingGroupLabel = rawText;
            continue;
          }

          const clauseEvidence = citationEvidence(rawText);
          if (clauseEvidence.score === 0) {
            closeSequence();
            const narrativeRange =
              pendingStart !== undefined ? { start: pendingStart, end: clause.end } : clause;
            narrativeText.push(createNarrative(footnote, narrativeRange, "narrative"));
            pendingQualifiers = [];
            pendingItemQualifiers = [];
            pendingStart = undefined;
            pendingGroupLabel = undefined;
            continue;
          }
          const itemContent = citationItemRange(text, clause);
          if (!isValidRange(text, itemContent.range)) {
            closeSequence();
            narrativeText.push(createNarrative(footnote, clause, "narrative"));
            continue;
          }
          const evidence = citationEvidence(
            text.slice(itemContent.range.start, itemContent.range.end)
          );

          const previousItem = draft?.items[draft.items.length - 1];
          if (
            previousItem?.rawText.match(/[.!?]$/) &&
            !followedBySeparator(text, previousItem.end, separators)
          ) {
            closeSequence();
          }

          const sequenceId =
            draft?.items[0]?.sequenceId ??
            stableId("sequence", footnote, pendingStart ?? clause.start, clause.end);
          if (!draft) {
            draft = {
              start: pendingStart ?? clause.start,
              ...(pendingGroupLabel ? { groupLabel: pendingGroupLabel } : {}),
              qualifiers: [...pendingQualifiers],
              items: [],
              warnings: [],
            };
            pendingQualifiers = [];
            pendingStart = undefined;
            pendingGroupLabel = undefined;
          }

          try {
            options.faultInjector?.("item", {
              footnoteId: footnote.id,
              paragraphIndex,
              ...clause,
            });
            const itemQualifiers = [...pendingItemQualifiers, ...itemContent.qualifiers];
            if (pendingQualifiers.length > 0) {
              draft.qualifiers.push(...pendingQualifiers);
              pendingQualifiers = [];
            }
            pendingItemQualifiers = [];
            const item = createItem(
              footnote,
              sequenceId,
              draft.items.length + 1,
              itemContent.range,
              evidence,
              itemQualifiers
            );
            draft.items.push(item);
            draft.warnings.push(...item.warnings);
            warnings.push(...item.warnings);
          } catch {
            const warning = structureWarning("CITATION_ITEM_FAILED", "item", clause);
            warnings.push(warning);
            draft.warnings.push(warning);
            narrativeText.push(createNarrative(footnote, clause, "itemFailure", warning));
          }
        }
        closeSequence();
      } catch {
        const warning = structureWarning("CITATION_SEQUENCE_FAILED", "sequence", paragraph);
        warnings.push(warning);
        narrativeText.push(createNarrative(footnote, paragraph, "sequenceFailure", warning));
      }
    });
  } catch {
    if (text.length > 0) {
      const range = { start: 0, end: text.length };
      const warning = structureWarning("CITATION_FOOTNOTE_FAILED", "footnote", range);
      warnings.push(warning);
      narrativeText.push(createNarrative(footnote, range, "footnoteFailure", warning));
    }
  }

  return {
    footnoteId: footnote.id,
    sourceTextHash: footnote.originalTextHash,
    sequences,
    narrativeText,
    warnings,
    status: resultStatus(sequences, warnings),
  };
}
