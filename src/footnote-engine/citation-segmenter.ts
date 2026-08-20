import type { FootnoteSnapshot } from "../taskpane/taskpane";
import { isRangeProtected } from "./protected-ranges";
import type {
  AnalysisProtectedRange,
  CitationModifier,
  CitationModifierType,
  CitationSegment,
  FootnoteParseResult,
  StatuteReferenceCandidate,
} from "./types";

interface SegmentBoundary {
  position: number;
  nextStart: number;
  separator?: string;
  priority: number;
}

interface ModifierDefinition {
  type: CitationModifierType;
  pattern: RegExp;
}

interface TextInterval {
  start: number;
  end: number;
}

const MODIFIER_DEFINITIONS: readonly ModifierDefinition[] = [
  { type: "additionalReferences", pattern: /m\.\s*w\.\s*N\./gi },
  { type: "disagreement", pattern: /a\.\s*A\./g },
  { type: "agreement", pattern: /so\s+auch/gi },
  { type: "comparison", pattern: /vgl\./gi },
  { type: "reference", pattern: /siehe/gi },
  { type: "reference", pattern: /s\./g },
  { type: "context", pattern: /dazu/gi },
  { type: "disagreement", pattern: /anders/gi },
  { type: "additionalReferences", pattern: /mwN/g },
  { type: "detail", pattern: /ausführlich/gi },
  { type: "approval", pattern: /zust\./gi },
  { type: "criticism", pattern: /krit\./gi },
  { type: "similarity", pattern: /ähnlich/gi },
  { type: "agreement", pattern: /ebenso/gi },
];

const CONSERVATIVE_CITATION_START =
  /^(?:(?:vgl\.|siehe|dazu|so\s+auch|a\.\s*A\.|anders|ausführlich|zust\.|krit\.|ahnlich|ähnlich|ebenso)\s+)?(?:BGH|BVerfG|BAG|BFH|BSG|BVerwG|EuGH|OLG|LG|AG|MüKo-|Fischer,|Roxin\/|BT-Drs\.|(?:§§?|Art\.)\s*\d)/i;
const SECTION_PATTERN = /^\d+[A-Za-z]?/;
const LAW_PATTERN = /^([A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9-]{0,30})(?=$|[\s,.;:)\]])/;
const ROMAN_PARAGRAPH_VALUES: Readonly<Record<string, string>> = {
  I: "1",
  II: "2",
  III: "3",
  IV: "4",
  V: "5",
  VI: "6",
  VII: "7",
  VIII: "8",
  IX: "9",
  X: "10",
};
const ROMAN_PARAGRAPH_PATTERN = /^(?:VIII|VII|III|VI|IV|IX|II|V|X|I)(?=$|[\s,.;:)\]])/;
const SHORTHAND_SENTENCE_PATTERN = /^\d+(?=$|[\s,.;:)\]])/;
const REFERENCE_SUFFIX_PATTERN = /^(ff?\.?)(?=$|[\s,.;:)\]])/;

const QUALIFIER_PATTERNS: ReadonlyArray<{
  property:
    | "paragraph"
    | "sentence"
    | "number"
    | "letter"
    | "halfSentence"
    | "alternative"
    | "variant"
    | "case";
  pattern: RegExp;
}> = [
  { property: "paragraph", pattern: /^(?:Abs\.|Absatz)\s*(\d+[A-Za-z]?)/i },
  { property: "sentence", pattern: /^(?:S\.|Satz)\s*(\d+[A-Za-z]?)/i },
  { property: "number", pattern: /^(?:Nr\.|Nummer)\s*(\d+[A-Za-z]?)/i },
  { property: "letter", pattern: /^(?:lit\.|Buchst\.|Buchstabe)\s*([A-Za-z])/i },
  { property: "halfSentence", pattern: /^(?:Hs\.|Halbsatz)\s*(\d+)/i },
  {
    property: "alternative",
    pattern: /^(?:(\d+)\.\s*(?:Alt\.|Alternative)|(?:Alt\.|Alternative)\s*(\d+))/i,
  },
  {
    property: "variant",
    pattern: /^(?:(\d+)\.\s*(?:Var\.|Variante)|(?:Var\.|Variante)\s*(\d+))/i,
  },
  { property: "case", pattern: /^(\d+)\.\s*Fall\b/i },
];

function isLetterOrDigit(character: string | undefined): boolean {
  return character !== undefined && /[0-9A-Za-zÀ-ɏ]/.test(character);
}

function hasTokenBoundaries(text: string, start: number, end: number): boolean {
  return !isLetterOrDigit(text[start - 1]) && !isLetterOrDigit(text[end]);
}

function findCitationModifiers(text: string, start: number, end: number): CitationModifier[] {
  const candidates: CitationModifier[] = [];
  const segmentText = text.slice(start, end);

  for (const definition of MODIFIER_DEFINITIONS) {
    definition.pattern.lastIndex = 0;
    let match = definition.pattern.exec(segmentText);

    while (match) {
      const modifierStart = start + match.index;
      const modifierEnd = modifierStart + match[0].length;

      if (hasTokenBoundaries(text, modifierStart, modifierEnd)) {
        candidates.push({
          type: definition.type,
          start: modifierStart,
          end: modifierEnd,
          text: text.slice(modifierStart, modifierEnd),
        });
      }

      match = definition.pattern.exec(segmentText);
    }
  }

  candidates.sort((left, right) => left.start - right.start || right.end - left.end);
  const modifiers: CitationModifier[] = [];

  for (const candidate of candidates) {
    const previous = modifiers[modifiers.length - 1];
    if (!previous || candidate.start >= previous.end) {
      modifiers.push(candidate);
    }
  }

  return modifiers;
}

function findCoreStart(
  text: string,
  start: number,
  end: number,
  modifiers: CitationModifier[]
): number {
  let cursor = start;

  while (cursor < end) {
    while (cursor < end && /\s/.test(text[cursor])) cursor += 1;
    const modifier = modifiers.find((candidate) => candidate.start === cursor);
    if (!modifier) break;
    cursor = modifier.end;
  }

  while (cursor < end && /\s/.test(text[cursor])) cursor += 1;
  return cursor;
}

function createMatchedEnclosureCoverage(text: string): Int32Array {
  const intervals: TextInterval[] = [];
  const bracketStack: Array<{ opening: string; start: number }> = [];
  const bracketPairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const quoteStack: Array<{ closing: string; start: number }> = [];
  const quoteOpenings: Record<string, string> = {
    "„": "“",
    "«": "»",
    "‹": "›",
    "‚": "‘",
    "‘": "’",
  };
  let asciiQuoteStart: number | undefined;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === "(" || character === "[" || character === "{") {
      bracketStack.push({ opening: character, start: index });
    } else if (bracketPairs[character]) {
      const openingIndex = bracketStack
        .map((entry) => entry.opening)
        .lastIndexOf(bracketPairs[character]);
      if (openingIndex >= 0) {
        const opening = bracketStack[openingIndex];
        bracketStack.splice(openingIndex, 1);
        intervals.push({ start: opening.start + 1, end: index });
      }
    }

    const currentQuote = quoteStack[quoteStack.length - 1];
    if (currentQuote?.closing === character) {
      quoteStack.pop();
      intervals.push({ start: currentQuote.start + 1, end: index });
    } else if (quoteOpenings[character]) {
      quoteStack.push({ closing: quoteOpenings[character], start: index });
    } else if (character === "“") {
      quoteStack.push({ closing: "”", start: index });
    } else if (character === '"' && text[index - 1] !== "\\") {
      if (asciiQuoteStart === undefined) {
        asciiQuoteStart = index;
      } else {
        intervals.push({ start: asciiQuoteStart + 1, end: index });
        asciiQuoteStart = undefined;
      }
    }
  }

  const difference = new Int32Array(text.length + 1);
  for (const interval of intervals) {
    difference[interval.start] += 1;
    difference[interval.end] -= 1;
  }

  for (let index = 1; index < difference.length; index += 1) {
    difference[index] += difference[index - 1];
  }

  return difference;
}

function addBoundary(boundaries: Map<number, SegmentBoundary>, boundary: SegmentBoundary): void {
  const existing = boundaries.get(boundary.position);
  if (!existing || boundary.priority > existing.priority) {
    boundaries.set(boundary.position, boundary);
  }
}

function createSegmentBoundaries(
  footnote: FootnoteSnapshot,
  protectedRanges: readonly AnalysisProtectedRange[]
): SegmentBoundary[] {
  const text = footnote.contentText;
  const enclosureCoverage = createMatchedEnclosureCoverage(text);
  const boundaries = new Map<number, SegmentBoundary>();

  for (let index = 0; index < text.length; index += 1) {
    if (
      text[index] === ";" &&
      enclosureCoverage[index] === 0 &&
      !isRangeProtected(index, index + 1, protectedRanges)
    ) {
      addBoundary(boundaries, {
        position: index,
        nextStart: index + 1,
        separator: ";",
        priority: 3,
      });
    }
  }

  const paragraphs = (footnote.paragraphs ?? [])
    .filter(
      (paragraph): paragraph is { index: number; start: number; end: number } =>
        Number.isInteger(paragraph.start) &&
        Number.isInteger(paragraph.end) &&
        paragraph.start! >= 0 &&
        paragraph.start! <= paragraph.end! &&
        paragraph.end! <= text.length
    )
    .sort((left, right) => left.start - right.start || left.index - right.index);

  for (let index = 0; index + 1 < paragraphs.length; index += 1) {
    const boundaryPosition = paragraphs[index].end;
    const nextStart = paragraphs[index + 1].start;
    if (boundaryPosition <= nextStart) {
      addBoundary(boundaries, {
        position: boundaryPosition,
        nextStart,
        priority: 2,
      });
    }
  }

  for (let index = 1; index < text.length; index += 1) {
    if (text[index] !== "." || !/[0-9)\]]/.test(text[index - 1])) continue;
    if (isRangeProtected(index, index + 1, protectedRanges) || enclosureCoverage[index] > 0) {
      continue;
    }

    let nextStart = index + 1;
    if (nextStart >= text.length || !/\s/.test(text[nextStart])) continue;
    while (nextStart < text.length && /\s/.test(text[nextStart])) nextStart += 1;

    if (nextStart < text.length && CONSERVATIVE_CITATION_START.test(text.slice(nextStart))) {
      addBoundary(boundaries, {
        position: index + 1,
        nextStart,
        priority: 1,
      });
    }
  }

  return Array.from(boundaries.values()).sort(
    (left, right) => left.position - right.position || right.priority - left.priority
  );
}

function readSection(text: string, cursor: number): { value: string; end: number } | undefined {
  const match = SECTION_PATTERN.exec(text.slice(cursor));
  return match ? { value: match[0], end: cursor + match[0].length } : undefined;
}

function skipWhitespace(text: string, cursor: number, end: number): number {
  while (cursor < end && /\s/.test(text[cursor])) cursor += 1;
  return cursor;
}

function hasLawShape(value: string): boolean {
  const uppercaseCount = Array.from(value).filter((character) => /[A-ZÄÖÜ]/.test(character)).length;
  return uppercaseCount >= 2;
}

function findStatuteReferences(
  text: string,
  coreStart: number,
  coreEnd: number
): StatuteReferenceCandidate[] {
  const references: StatuteReferenceCandidate[] = [];
  const unitPattern = /(?:§§?|Art\.)/g;
  unitPattern.lastIndex = coreStart;
  let unitMatch = unitPattern.exec(text);

  while (unitMatch && unitMatch.index < coreEnd) {
    const start = unitMatch.index;
    const unitType = unitMatch[0] as "§" | "§§" | "Art.";
    let cursor = skipWhitespace(text, start + unitMatch[0].length, coreEnd);
    const firstSection = readSection(text, cursor);

    if (!firstSection || firstSection.end > coreEnd) {
      unitMatch = unitPattern.exec(text);
      continue;
    }

    const sections = [firstSection.value];
    cursor = firstSection.end;

    if (unitType === "§§") {
      while (cursor < coreEnd) {
        const separatorMatch = /^\s*(?:,|und)\s*/i.exec(text.slice(cursor, coreEnd));
        if (!separatorMatch) break;
        const nextSection = readSection(text, cursor + separatorMatch[0].length);
        if (!nextSection) break;
        sections.push(nextSection.value);
        cursor = nextSection.end;
      }
    }

    let meaningfulEnd = cursor;
    const values: Partial<StatuteReferenceCandidate> = {};
    const romanParagraphStart = skipWhitespace(text, cursor, coreEnd);
    const romanParagraphMatch = ROMAN_PARAGRAPH_PATTERN.exec(
      text.slice(romanParagraphStart, coreEnd)
    );

    if (romanParagraphMatch) {
      values.paragraph = ROMAN_PARAGRAPH_VALUES[romanParagraphMatch[0]];
      cursor = romanParagraphStart + romanParagraphMatch[0].length;
      meaningfulEnd = cursor;

      const shorthandSentenceStart = skipWhitespace(text, cursor, coreEnd);
      const shorthandSentenceMatch = SHORTHAND_SENTENCE_PATTERN.exec(
        text.slice(shorthandSentenceStart, coreEnd)
      );
      if (shorthandSentenceMatch) {
        values.sentence = shorthandSentenceMatch[0];
        cursor = shorthandSentenceStart + shorthandSentenceMatch[0].length;
        meaningfulEnd = cursor;
      }
    }

    let qualifierFound = true;

    while (qualifierFound) {
      qualifierFound = false;
      const qualifierStart = skipWhitespace(text, cursor, coreEnd);
      const remainder = text.slice(qualifierStart, coreEnd);

      for (const qualifier of QUALIFIER_PATTERNS) {
        const match = qualifier.pattern.exec(remainder);
        if (match) {
          values[qualifier.property] = match[1] ?? match[2];
          cursor = qualifierStart + match[0].length;
          meaningfulEnd = cursor;
          qualifierFound = true;
          break;
        }
      }
    }

    const suffixStart = skipWhitespace(text, cursor, coreEnd);
    const suffixMatch = REFERENCE_SUFFIX_PATTERN.exec(text.slice(suffixStart, coreEnd));
    if (suffixMatch) {
      values.suffix = suffixMatch[1].toLocaleLowerCase("de-DE").startsWith("ff") ? "ff." : "f.";
      cursor = suffixStart + suffixMatch[0].length;
      meaningfulEnd = cursor;
    }

    const lawStart = skipWhitespace(text, cursor, coreEnd);
    const lawMatch = LAW_PATTERN.exec(text.slice(lawStart, coreEnd));
    if (lawMatch && hasLawShape(lawMatch[1])) {
      values.law = lawMatch[1];
      meaningfulEnd = lawStart + lawMatch[1].length;
      cursor = meaningfulEnd;
    }

    const reference: StatuteReferenceCandidate = {
      start,
      end: meaningfulEnd,
      originalText: text.slice(start, meaningfulEnd),
      unitType,
      ...(unitType === "§§" ? { sections } : { section: sections[0] }),
      ...values,
      referenceContext: "unknown",
    };

    if (reference.start < reference.end && reference.end <= coreEnd) {
      references.push(reference);
    }

    unitPattern.lastIndex = Math.max(cursor, start + unitMatch[0].length);
    unitMatch = unitPattern.exec(text);
  }

  return references;
}

function trimSegmentRange(
  text: string,
  start: number,
  end: number
): { start: number; end: number } {
  while (start < end && /\s/.test(text[start])) start += 1;
  while (end > start && /\s/.test(text[end - 1])) end -= 1;
  return { start, end };
}

export function isValidCitationSegment(segment: CitationSegment, contentText: string): boolean {
  return (
    Number.isInteger(segment.start) &&
    Number.isInteger(segment.end) &&
    segment.start >= 0 &&
    segment.start < segment.end &&
    segment.end <= contentText.length &&
    segment.originalText === contentText.slice(segment.start, segment.end) &&
    segment.coreStart >= segment.start &&
    segment.coreStart <= segment.coreEnd &&
    segment.coreEnd <= segment.end &&
    segment.coreText === contentText.slice(segment.coreStart, segment.coreEnd) &&
    segment.modifiers.every(
      (modifier) =>
        modifier.start >= segment.start &&
        modifier.start < modifier.end &&
        modifier.end <= segment.end &&
        modifier.text === contentText.slice(modifier.start, modifier.end)
    ) &&
    segment.embeddedStatuteReferences.every(
      (reference) =>
        reference.start >= segment.coreStart &&
        reference.start < reference.end &&
        reference.end <= segment.coreEnd &&
        reference.originalText === contentText.slice(reference.start, reference.end)
    )
  );
}

export function segmentFootnote(
  footnote: FootnoteSnapshot,
  protectedRanges: readonly AnalysisProtectedRange[]
): FootnoteParseResult {
  const text = footnote.contentText;
  const segments: CitationSegment[] = [];
  const boundaries = createSegmentBoundaries(footnote, protectedRanges);
  let rangeStart = 0;
  let separatorBefore: string | undefined;

  const appendSegment = (rangeEnd: number, separatorAfter?: string): void => {
    const trimmed = trimSegmentRange(text, rangeStart, rangeEnd);
    if (trimmed.start >= trimmed.end) return;

    const modifiers = findCitationModifiers(text, trimmed.start, trimmed.end);
    const coreStart = findCoreStart(text, trimmed.start, trimmed.end, modifiers);
    const segment: CitationSegment = {
      segmentId: `segment:${footnote.id}:${trimmed.start}:${trimmed.end}:${footnote.originalTextHash}`,
      footnoteId: footnote.id,
      ordinal: segments.length + 1,
      start: trimmed.start,
      end: trimmed.end,
      originalText: text.slice(trimmed.start, trimmed.end),
      ...(separatorBefore ? { separatorBefore } : {}),
      ...(separatorAfter ? { separatorAfter } : {}),
      modifiers,
      coreStart,
      coreEnd: trimmed.end,
      coreText: text.slice(coreStart, trimmed.end),
      embeddedStatuteReferences: findStatuteReferences(text, coreStart, trimmed.end),
      classification: {
        type: "OTHER",
        certainty: "low",
        signals: [{ code: "NOT_YET_CLASSIFIED" }],
      },
    };

    if (isValidCitationSegment(segment, text)) {
      segments.push(segment);
    }
  };

  for (const boundary of boundaries) {
    if (boundary.position < rangeStart) continue;
    appendSegment(boundary.position, boundary.separator);
    rangeStart = boundary.nextStart;
    separatorBefore = boundary.separator;
  }

  appendSegment(text.length);

  return {
    footnoteId: footnote.id,
    sourceTextHash: footnote.originalTextHash,
    segments,
  };
}
