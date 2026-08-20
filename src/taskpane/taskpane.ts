/* global Office, Word, DOMParser, Element, performance */

import { normalizeFootnoteReferencesInContext, WORD_NOTE_REFERENCE_MARK } from "./locator-context";

export interface CharacterFormat {
  fontName?: string | null;
  fontSize?: number | null;
  bold?: boolean | null;
  italic?: boolean | null;
  underline?: Word.Font["underline"] | null;
  strikeThrough?: boolean | null;
  superscript?: boolean | null;
  subscript?: boolean | null;
  fontColor?: string | null;
  highlightColor?: string | null;
  characterSpacing?: number | null;
}

export interface FormattingRun extends CharacterFormat {
  start: number;
  end: number;
}

export type FootnoteReadStatus = "complete" | "partial" | "failed";

export interface FootnoteReadWarning {
  code: string;
  message: string;
}

export interface FootnoteField {
  type?: string;
  start?: number;
  end?: number;
  resultText?: string;
  locked?: boolean;
}

export interface FootnoteBookmark {
  name: string;
  start?: number;
  end?: number;
}

export interface FootnoteContentControl {
  id?: number;
  tag?: string;
  title?: string;
  type?: string;
  start?: number;
  end?: number;
}

export type ProtectedStructureType = "hyperlink" | "field" | "bookmark" | "contentControl";

export interface ProtectedRange {
  type: ProtectedStructureType;
  start: number;
  end: number;
}

export interface FootnoteParagraphFormat {
  index: number;
  styleName?: string;
  lineSpacing?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  leftIndent?: number;
  rightIndent?: number;
  firstLineIndent?: number;
  alignment?: Word.Paragraph["alignment"];
}

export interface DocumentFormattingSnapshot {
  autoHyphenation?: boolean;
  hyphenateCaps?: boolean;
  consecutiveHyphensLimit?: number;
  hyphenationZone?: number;
}

export interface FootnoteSnapshot {
  id: string;
  ordinal: number;
  displayLabel: string;
  rawWordText: string;
  contentText: string;
  contentLength: number;
  originalTextHash: string;
  reference: {
    referenceText: string;
  };
  locator: {
    ordinal: number;
    displayLabel: string;
    originalTextHash: string;
    contextBefore: string;
    contextAfter: string;
    paragraphIndex?: number;
  };
  paragraphCount: number;
  paragraphs: Array<{
    index: number;
    start?: number;
    end?: number;
  }>;
  hyperlinks: Array<{
    start?: number;
    end?: number;
    displayText: string;
    target: string;
  }>;
  fields: FootnoteField[];
  bookmarks: FootnoteBookmark[];
  contentControls: FootnoteContentControl[];
  protectedRanges: ProtectedRange[];
  readStatus: FootnoteReadStatus;
  readWarnings: FootnoteReadWarning[];
  baseCharacterFormat?: CharacterFormat;
  formattingRuns: FormattingRun[];
  paragraphFormats: FootnoteParagraphFormat[];
}

export interface FootnoteReadResult {
  footnotes: FootnoteSnapshot[];
  documentFormatting: DocumentFormattingSnapshot;
  readerMetrics: {
    durationMs: number;
    footnoteCount: number;
    completeCount: number;
    partialCount: number;
    failedCount: number;
    syncCount: number;
  };
}

export interface FootnoteReadProgress {
  phase: "initializing" | "reading" | "analyzing" | "complete";
  processed: number;
  total: number;
  percent: number;
}

export type FootnoteReadProgressCallback = (progress: FootnoteReadProgress) => void;

export function createFootnoteReadProgress(
  phase: FootnoteReadProgress["phase"],
  processed: number,
  total: number
): FootnoteReadProgress {
  const safeTotal = Math.max(0, total);
  const safeProcessed = Math.min(Math.max(0, processed), safeTotal);
  const percent =
    phase === "complete"
      ? 100
      : phase === "analyzing"
        ? 95
        : phase === "reading" && safeTotal > 0
          ? Math.round((safeProcessed / safeTotal) * 90)
          : 0;
  return { phase, processed: safeProcessed, total: safeTotal, percent };
}

const FOOTNOTE_CHUNK_SIZE = 150;
const OOXML_STRUCTURAL_TEXT_MARKS = new Set(["\r", "\n", "\v", "\f"]);
const CHARACTER_FORMAT_KEYS: Array<keyof CharacterFormat> = [
  "fontName",
  "fontSize",
  "bold",
  "italic",
  "underline",
  "strikeThrough",
  "superscript",
  "subscript",
  "fontColor",
  "highlightColor",
  "characterSpacing",
];

function hashText(text: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function readLoadedText(getText: () => string): string {
  try {
    return getText();
  } catch {
    return "";
  }
}

function removeLeadingWordNoteReferenceMark(rawWordText: string): string {
  return rawWordText.startsWith(WORD_NOTE_REFERENCE_MARK) ? rawWordText.slice(1) : rawWordText;
}

function getDisplayLabel(referenceText: string, ordinal: number): string {
  return referenceText && referenceText !== WORD_NOTE_REFERENCE_MARK
    ? referenceText
    : ordinal.toString();
}

function createParagraphStructure(
  paragraphTexts: string[],
  contentText: string
): FootnoteSnapshot["paragraphs"] {
  const normalizedParagraphTexts = paragraphTexts.map((text, index) =>
    index === 0 ? removeLeadingWordNoteReferenceMark(text) : text
  );
  const offsetsAreExact = normalizedParagraphTexts.join("") === contentText;
  let offset = 0;

  return normalizedParagraphTexts.map((text, index) => {
    const start = offset;
    offset += text.length;

    return offsetsAreExact ? { index, start, end: offset } : { index };
  });
}

function getHyperlinkTarget(address: string, subAddress: string): string {
  if (address && subAddress) {
    return `${address}#${subAddress}`;
  }

  return address || (subAddress ? `#${subAddress}` : "");
}

function getCharacterFormat(font: Word.Font, supportsDesktop13: boolean): CharacterFormat {
  return {
    fontName: font.name as string | null,
    fontSize: font.size as number | null,
    bold: font.bold as boolean | null,
    italic: font.italic as boolean | null,
    underline: font.underline as Word.Font["underline"] | null,
    strikeThrough: font.strikeThrough as boolean | null,
    superscript: font.superscript as boolean | null,
    subscript: font.subscript as boolean | null,
    fontColor: font.color as string | null,
    highlightColor: font.highlightColor as string | null,
    characterSpacing: supportsDesktop13 ? (font.spacing as number | null) : undefined,
  };
}

function getFormattingKey(formatting: CharacterFormat): string {
  return JSON.stringify(CHARACTER_FORMAT_KEYS.map((property) => formatting[property]));
}

interface OoxmlTextRun {
  text: string;
  ooxmlStart: number;
  ooxmlEnd: number;
  directFormat: CharacterFormat;
  characterStyle?: string;
}

interface OoxmlStructureRange {
  ooxmlStart: number;
  ooxmlEnd: number;
}

interface ParsedOoxmlField extends OoxmlStructureRange {
  locked?: boolean;
}

interface ParsedOoxmlBookmark extends OoxmlStructureRange {
  name: string;
}

interface ParsedOoxmlContentControl extends OoxmlStructureRange {
  id?: number;
  tag?: string;
  title?: string;
  type?: string;
}

interface ParsedFootnoteOoxml {
  parsed: boolean;
  textRuns: OoxmlTextRun[];
  fields: ParsedOoxmlField[];
  bookmarks: ParsedOoxmlBookmark[];
  hyperlinks: OoxmlStructureRange[];
  contentControls: ParsedOoxmlContentControl[];
  hasCharacterStyles: boolean;
  hasUnclosedStructures: boolean;
}

interface MappedOoxmlTextRun extends OoxmlTextRun {
  contentStart: number;
  contentEnd: number;
}

interface OoxmlContentMapping {
  complete: boolean;
  textRuns: MappedOoxmlTextRun[];
  toContentOffset: (ooxmlOffset: number, affinity: "start" | "end") => number | undefined;
}

function isWordprocessingElement(element: Element, localName?: string): boolean {
  const isWordprocessingNamespace =
    element.prefix === "w" || Boolean(element.namespaceURI?.includes("wordprocessingml"));
  return isWordprocessingNamespace && (localName === undefined || element.localName === localName);
}

function getDirectChild(element: Element, localName: string): Element | undefined {
  return Array.from(element.children).find((child) => isWordprocessingElement(child, localName));
}

function getOoxmlAttribute(element: Element, localName: string): string | undefined {
  return Array.from(element.attributes).find((attribute) => attribute.localName === localName)
    ?.value;
}

function parseOoxmlBoolean(element: Element | undefined): boolean | undefined {
  if (!element) {
    return undefined;
  }

  const value = getOoxmlAttribute(element, "val")?.toLowerCase();
  if (value === undefined || value === "1" || value === "true" || value === "on") {
    return true;
  }
  if (value === "0" || value === "false" || value === "off") {
    return false;
  }

  return undefined;
}

function parseOoxmlNumber(element: Element | undefined, divisor: number): number | undefined {
  if (!element) {
    return undefined;
  }

  const value = Number(getOoxmlAttribute(element, "val"));
  return Number.isFinite(value) ? value / divisor : undefined;
}

function normalizeOoxmlColor(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  if (/^[0-9a-f]{6}$/i.test(value)) {
    return `#${value.toUpperCase()}`;
  }

  return value.toLowerCase() === "auto" ? "Auto" : value;
}

const OOXML_UNDERLINE_TYPES: Record<string, Word.Font["underline"]> = {
  none: "None",
  single: "Single",
  words: "Word",
  double: "Double",
  thick: "Thick",
  dotted: "Dotted",
  dottedHeavy: "DottedHeavy",
  dash: "DashLine",
  dashedHeavy: "DashLineHeavy",
  dashLong: "DashLineLong",
  dashLongHeavy: "DashLineLongHeavy",
  dotDash: "DotDashLine",
  dashDotHeavy: "DotDashLineHeavy",
  dotDotDash: "TwoDotDashLine",
  dashDotDotHeavy: "TwoDotDashLineHeavy",
  wave: "Wave",
  wavyHeavy: "WaveHeavy",
  wavyDouble: "WaveDouble",
};

const OOXML_HIGHLIGHT_COLORS: Record<string, string> = {
  black: "#000000",
  blue: "#0000FF",
  cyan: "#00FFFF",
  darkBlue: "#000080",
  darkCyan: "#008080",
  darkGray: "#808080",
  darkGreen: "#008000",
  darkMagenta: "#800080",
  darkRed: "#800000",
  darkYellow: "#808000",
  green: "#00FF00",
  lightGray: "#C0C0C0",
  magenta: "#FF00FF",
  red: "#FF0000",
  white: "#FFFFFF",
  yellow: "#FFFF00",
};

function parseOoxmlUnderline(element: Element | undefined): Word.Font["underline"] | undefined {
  if (!element) {
    return undefined;
  }

  const value = getOoxmlAttribute(element, "val") ?? "single";
  return OOXML_UNDERLINE_TYPES[value] ?? (value as Word.Font["underline"]);
}

function parseOoxmlHighlight(element: Element | undefined): string | null | undefined {
  if (!element) {
    return undefined;
  }

  const value = getOoxmlAttribute(element, "val");
  if (!value) {
    return undefined;
  }
  if (value === "none") {
    return null;
  }

  return OOXML_HIGHLIGHT_COLORS[value] ?? value;
}

function parseOoxmlRunFormat(runProperties: Element | undefined): CharacterFormat {
  if (!runProperties) {
    return {};
  }

  const formatting: CharacterFormat = {};
  const runFonts = getDirectChild(runProperties, "rFonts");
  const fontName = runFonts
    ? (getOoxmlAttribute(runFonts, "ascii") ?? getOoxmlAttribute(runFonts, "hAnsi"))
    : undefined;
  const fontSize = parseOoxmlNumber(getDirectChild(runProperties, "sz"), 2);
  const bold = parseOoxmlBoolean(getDirectChild(runProperties, "b"));
  const italic = parseOoxmlBoolean(getDirectChild(runProperties, "i"));
  const underline = parseOoxmlUnderline(getDirectChild(runProperties, "u"));
  const strikeThrough = parseOoxmlBoolean(getDirectChild(runProperties, "strike"));
  const colorElement = getDirectChild(runProperties, "color");
  const color = normalizeOoxmlColor(
    colorElement ? getOoxmlAttribute(colorElement, "val") : undefined
  );
  const highlightColor = parseOoxmlHighlight(getDirectChild(runProperties, "highlight"));
  const characterSpacing = parseOoxmlNumber(getDirectChild(runProperties, "spacing"), 20);
  const verticalAlignment = getDirectChild(runProperties, "vertAlign");
  const verticalAlignmentValue = verticalAlignment
    ? getOoxmlAttribute(verticalAlignment, "val")
    : undefined;

  if (fontName !== undefined) formatting.fontName = fontName;
  if (fontSize !== undefined) formatting.fontSize = fontSize;
  if (bold !== undefined) formatting.bold = bold;
  if (italic !== undefined) formatting.italic = italic;
  if (underline !== undefined) formatting.underline = underline;
  if (strikeThrough !== undefined) formatting.strikeThrough = strikeThrough;
  if (color !== undefined) formatting.fontColor = color;
  if (highlightColor !== undefined) formatting.highlightColor = highlightColor;
  if (characterSpacing !== undefined) formatting.characterSpacing = characterSpacing;

  if (verticalAlignmentValue === "superscript") {
    formatting.superscript = true;
    formatting.subscript = false;
  } else if (verticalAlignmentValue === "subscript") {
    formatting.superscript = false;
    formatting.subscript = true;
  } else if (verticalAlignmentValue === "baseline") {
    formatting.superscript = false;
    formatting.subscript = false;
  }

  return formatting;
}

function getOoxmlTextValue(element: Element): string | undefined {
  switch (element.localName) {
    case "t":
    case "delText":
      return element.textContent ?? "";
    case "tab":
    case "ptab":
      return "\t";
    case "br":
    case "cr":
      return getOoxmlAttribute(element, "type") === "page" ? "\f" : "\v";
    case "noBreakHyphen":
      return "\u2011";
    case "softHyphen":
      return "\u00ad";
    default:
      return undefined;
  }
}

function getContentControlType(properties: Element | undefined): string | undefined {
  if (!properties) return undefined;

  const knownTypes = [
    "text",
    "richText",
    "checkBox",
    "dropDownList",
    "comboBox",
    "buildingBlockGallery",
    "date",
    "repeatingSection",
    "picture",
    "group",
  ];

  return knownTypes.find((type) => Boolean(getDirectChild(properties, type)));
}

function parseFootnoteOoxml(ooxml: string): ParsedFootnoteOoxml {
  const emptyResult: ParsedFootnoteOoxml = {
    parsed: false,
    textRuns: [],
    fields: [],
    bookmarks: [],
    hyperlinks: [],
    contentControls: [],
    hasCharacterStyles: false,
    hasUnclosedStructures: false,
  };

  try {
    const xmlDocument = new DOMParser().parseFromString(ooxml, "application/xml");
    if (xmlDocument.getElementsByTagName("parsererror").length > 0) {
      return emptyResult;
    }

    const allElements = Array.from(xmlDocument.getElementsByTagName("*"));
    const footnoteElement = allElements.find((element) =>
      isWordprocessingElement(element, "footnote")
    );
    const contentRoot =
      allElements.find((element) => isWordprocessingElement(element, "body")) ??
      footnoteElement ??
      xmlDocument.documentElement;
    const textRuns: OoxmlTextRun[] = [];
    const fields: ParsedOoxmlField[] = [];
    const bookmarks: ParsedOoxmlBookmark[] = [];
    const hyperlinks: OoxmlStructureRange[] = [];
    const contentControls: ParsedOoxmlContentControl[] = [];
    const openBookmarks = new Map<string, { name: string; start: number }>();
    const openFields: Array<{ resultStart?: number; locked?: boolean }> = [];
    let ooxmlOffset = 0;
    let hasCharacterStyles = false;
    let hasUnclosedStructures = false;

    const appendText = (text: string, directFormat: CharacterFormat, characterStyle?: string) => {
      if (text.length === 0) return;

      if (characterStyle) hasCharacterStyles = true;
      const ooxmlStart = ooxmlOffset;
      ooxmlOffset += text.length;
      textRuns.push({
        text,
        ooxmlStart,
        ooxmlEnd: ooxmlOffset,
        directFormat,
        characterStyle,
      });
    };

    const walkRun = (runElement: Element) => {
      const runProperties = getDirectChild(runElement, "rPr");
      const characterStyleElement = runProperties
        ? getDirectChild(runProperties, "rStyle")
        : undefined;
      const characterStyle = characterStyleElement
        ? getOoxmlAttribute(characterStyleElement, "val")
        : undefined;
      const directFormat = parseOoxmlRunFormat(runProperties);

      for (const child of Array.from(runElement.children)) {
        if (!isWordprocessingElement(child) || child.localName === "rPr") continue;

        if (child.localName === "fldChar") {
          const fieldCharacterType = getOoxmlAttribute(child, "fldCharType");
          if (fieldCharacterType === "begin") {
            openFields.push({
              locked: parseOoxmlBooleanAttribute(getOoxmlAttribute(child, "fldLock")),
            });
          } else if (fieldCharacterType === "separate") {
            const currentField = openFields[openFields.length - 1];
            if (currentField) currentField.resultStart = ooxmlOffset;
          } else if (fieldCharacterType === "end") {
            const currentField = openFields.pop();
            if (currentField) {
              fields.push({
                ooxmlStart: currentField.resultStart ?? ooxmlOffset,
                ooxmlEnd: ooxmlOffset,
                locked: currentField.locked,
              });
            } else {
              hasUnclosedStructures = true;
            }
          }
          continue;
        }

        if (child.localName === "instrText") continue;
        const text = getOoxmlTextValue(child);
        if (text !== undefined) appendText(text, directFormat, characterStyle);
      }
    };

    const walk = (element: Element) => {
      if (!isWordprocessingElement(element)) {
        for (const child of Array.from(element.children)) walk(child);
        return;
      }

      if (element.localName === "r") {
        walkRun(element);
        return;
      }

      if (element.localName === "bookmarkStart") {
        const id = getOoxmlAttribute(element, "id");
        const name = getOoxmlAttribute(element, "name");
        if (id && name) openBookmarks.set(id, { name, start: ooxmlOffset });
        return;
      }

      if (element.localName === "bookmarkEnd") {
        const id = getOoxmlAttribute(element, "id");
        const bookmark = id ? openBookmarks.get(id) : undefined;
        if (id && bookmark) {
          bookmarks.push({
            name: bookmark.name,
            ooxmlStart: bookmark.start,
            ooxmlEnd: ooxmlOffset,
          });
          openBookmarks.delete(id);
        } else {
          hasUnclosedStructures = true;
        }
        return;
      }

      if (element.localName === "hyperlink") {
        const start = ooxmlOffset;
        for (const child of Array.from(element.children)) walk(child);
        hyperlinks.push({ ooxmlStart: start, ooxmlEnd: ooxmlOffset });
        return;
      }

      if (element.localName === "fldSimple") {
        const start = ooxmlOffset;
        for (const child of Array.from(element.children)) walk(child);
        fields.push({
          ooxmlStart: start,
          ooxmlEnd: ooxmlOffset,
          locked: parseOoxmlBooleanAttribute(getOoxmlAttribute(element, "fldLock")),
        });
        return;
      }

      if (element.localName === "sdt") {
        const start = ooxmlOffset;
        const properties = getDirectChild(element, "sdtPr");
        for (const child of Array.from(element.children)) walk(child);
        const idElement = properties ? getDirectChild(properties, "id") : undefined;
        const idValue = idElement ? Number(getOoxmlAttribute(idElement, "val")) : undefined;
        const tagElement = properties ? getDirectChild(properties, "tag") : undefined;
        const titleElement = properties ? getDirectChild(properties, "alias") : undefined;
        contentControls.push({
          id: Number.isFinite(idValue) ? idValue : undefined,
          tag: tagElement ? getOoxmlAttribute(tagElement, "val") : undefined,
          title: titleElement ? getOoxmlAttribute(titleElement, "val") : undefined,
          type: getContentControlType(properties),
          ooxmlStart: start,
          ooxmlEnd: ooxmlOffset,
        });
        return;
      }

      for (const child of Array.from(element.children)) walk(child);
    };

    walk(contentRoot);
    hasUnclosedStructures =
      hasUnclosedStructures || openBookmarks.size > 0 || openFields.length > 0;

    return {
      parsed: true,
      textRuns,
      fields,
      bookmarks,
      hyperlinks,
      contentControls,
      hasCharacterStyles,
      hasUnclosedStructures,
    };
  } catch {
    return emptyResult;
  }
}

function parseOoxmlBooleanAttribute(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "on") {
    return true;
  }
  if (value === "0" || value.toLowerCase() === "false" || value.toLowerCase() === "off") {
    return false;
  }
  return undefined;
}

function isStructuralOoxmlGap(text: string): boolean {
  return Array.from(text).every((character) => OOXML_STRUCTURAL_TEXT_MARKS.has(character));
}

function mapOoxmlContent(textRuns: OoxmlTextRun[], contentText: string): OoxmlContentMapping {
  const mappedRuns: MappedOoxmlTextRun[] = [];
  let searchOffset = 0;
  let removedReferenceMark = false;

  for (const sourceRun of textRuns) {
    let text = sourceRun.text;
    let ooxmlStart = sourceRun.ooxmlStart;
    if (!removedReferenceMark && text.startsWith(WORD_NOTE_REFERENCE_MARK)) {
      text = text.slice(1);
      ooxmlStart += 1;
      removedReferenceMark = true;
    }
    if (text.length === 0) continue;

    const contentStart = contentText.indexOf(text, searchOffset);
    if (contentStart < 0 || !isStructuralOoxmlGap(contentText.slice(searchOffset, contentStart))) {
      return { complete: false, textRuns: [], toContentOffset: () => undefined };
    }

    const contentEnd = contentStart + text.length;
    mappedRuns.push({
      ...sourceRun,
      text,
      ooxmlStart,
      ooxmlEnd: ooxmlStart + text.length,
      contentStart,
      contentEnd,
    });
    searchOffset = contentEnd;
  }

  if (!isStructuralOoxmlGap(contentText.slice(searchOffset))) {
    return { complete: false, textRuns: [], toContentOffset: () => undefined };
  }

  const toContentOffset = (ooxmlOffset: number, affinity: "start" | "end") => {
    const containingRun = mappedRuns.find(
      (run) => ooxmlOffset > run.ooxmlStart && ooxmlOffset < run.ooxmlEnd
    );
    if (containingRun) {
      return containingRun.contentStart + (ooxmlOffset - containingRun.ooxmlStart);
    }

    if (affinity === "start") {
      const nextRun = mappedRuns.find((run) => run.ooxmlStart === ooxmlOffset);
      if (nextRun) return nextRun.contentStart;
    } else {
      const previousRun = [...mappedRuns].reverse().find((run) => run.ooxmlEnd === ooxmlOffset);
      if (previousRun) return previousRun.contentEnd;
    }

    if (mappedRuns.length === 0 && ooxmlOffset === 0 && contentText.length === 0) return 0;
    return undefined;
  };

  return { complete: true, textRuns: mappedRuns, toContentOffset };
}

function getDirectFormattingDifferences(
  directFormatting: CharacterFormat,
  baseCharacterFormat: CharacterFormat
): CharacterFormat {
  const differences: CharacterFormat = {};

  for (const property of CHARACTER_FORMAT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(directFormatting, property)) {
      continue;
    }

    const baseValue = baseCharacterFormat[property];
    const value = directFormatting[property];

    if (baseValue === undefined || baseValue === null || baseValue === "" || value !== baseValue) {
      Object.assign(differences, { [property]: value });
    }
  }

  return differences;
}

function createFormattingRunsFromOoxml(
  mappedRuns: MappedOoxmlTextRun[],
  baseCharacterFormat: CharacterFormat
): FormattingRun[] {
  const runs: FormattingRun[] = [];
  let previousRunCharacterStyle: string | undefined;

  for (const ooxmlRun of mappedRuns) {
    const start = ooxmlRun.contentStart;
    const end = ooxmlRun.contentEnd;
    const formatting = getDirectFormattingDifferences(ooxmlRun.directFormat, baseCharacterFormat);

    if (Object.keys(formatting).length === 0) {
      continue;
    }

    const previousRun = runs[runs.length - 1];

    if (
      previousRun &&
      previousRun.end === start &&
      previousRunCharacterStyle === ooxmlRun.characterStyle &&
      getFormattingKey(previousRun) === getFormattingKey(formatting)
    ) {
      previousRun.end = end;
    } else {
      runs.push({ start, end, ...formatting });
      previousRunCharacterStyle = ooxmlRun.characterStyle;
    }
  }

  return runs;
}

function addReadWarning(warnings: FootnoteReadWarning[], code: string, message: string): void {
  if (!warnings.some((warning) => warning.code === code)) {
    warnings.push({ code, message });
  }
}

function mapStructureRange(
  range: OoxmlStructureRange,
  mapping: OoxmlContentMapping
): { start: number; end: number } | undefined {
  const start = mapping.toContentOffset(range.ooxmlStart, "start");
  const end = mapping.toContentOffset(range.ooxmlEnd, "end");

  return start !== undefined && end !== undefined && start <= end ? { start, end } : undefined;
}

interface LoadedFieldData {
  type?: string;
  resultText?: string;
  locked?: boolean;
}

interface LoadedHyperlinkData {
  displayText: string;
  target: string;
}

interface LoadedContentControlData {
  id?: number;
  tag?: string;
  title?: string;
  type?: string;
}

function createFootnoteFields(
  loadedFields: LoadedFieldData[],
  parsedFields: ParsedOoxmlField[],
  mapping: OoxmlContentMapping,
  contentText: string,
  warnings: FootnoteReadWarning[]
): FootnoteField[] {
  const sortedParsedFields = [...parsedFields].sort(
    (left, right) => left.ooxmlStart - right.ooxmlStart || right.ooxmlEnd - left.ooxmlEnd
  );
  const fieldCount = Math.max(loadedFields.length, sortedParsedFields.length);
  const fields: FootnoteField[] = [];

  for (let index = 0; index < fieldCount; index += 1) {
    const loadedField = loadedFields[index];
    const parsedField = sortedParsedFields[index];
    const mappedRange = parsedField ? mapStructureRange(parsedField, mapping) : undefined;
    const mappedResultText = mappedRange
      ? contentText.slice(mappedRange.start, mappedRange.end)
      : undefined;
    const resultTextMatches =
      !loadedField ||
      loadedField.resultText === undefined ||
      loadedField.resultText === mappedResultText;

    if (loadedField && parsedField && (!mappedRange || !resultTextMatches)) {
      addReadWarning(
        warnings,
        "FIELD_OFFSET_UNRESOLVED",
        "A field result could not be mapped safely to contentText."
      );
    }

    fields.push({
      type: loadedField?.type,
      start: mappedRange && resultTextMatches ? mappedRange.start : undefined,
      end: mappedRange && resultTextMatches ? mappedRange.end : undefined,
      resultText: loadedField?.resultText ?? mappedResultText,
      locked: loadedField?.locked ?? parsedField?.locked,
    });
  }

  if (loadedFields.length !== sortedParsedFields.length) {
    addReadWarning(
      warnings,
      "FIELD_STRUCTURE_COUNT_MISMATCH",
      "Office.js and OOXML reported different field counts."
    );
  }

  return fields;
}

function createFootnoteBookmarks(
  parsedBookmarks: ParsedOoxmlBookmark[],
  mapping: OoxmlContentMapping,
  warnings: FootnoteReadWarning[]
): FootnoteBookmark[] {
  return parsedBookmarks.map((bookmark) => {
    const mappedRange = mapStructureRange(bookmark, mapping);
    if (!mappedRange) {
      addReadWarning(
        warnings,
        "BOOKMARK_OFFSET_UNRESOLVED",
        "A bookmark could not be mapped safely to contentText."
      );
    }

    return {
      name: bookmark.name,
      start: mappedRange?.start,
      end: mappedRange?.end,
    };
  });
}

function createFootnoteHyperlinks(
  loadedHyperlinks: LoadedHyperlinkData[],
  parsedHyperlinks: OoxmlStructureRange[],
  mapping: OoxmlContentMapping,
  contentText: string,
  warnings: FootnoteReadWarning[]
): FootnoteSnapshot["hyperlinks"] {
  const hyperlinks = loadedHyperlinks.map((hyperlink, index) => {
    const parsedHyperlink = parsedHyperlinks[index];
    const mappedRange = parsedHyperlink ? mapStructureRange(parsedHyperlink, mapping) : undefined;
    const rangeMatches =
      mappedRange !== undefined &&
      contentText.slice(mappedRange.start, mappedRange.end) === hyperlink.displayText;

    if (!rangeMatches) {
      addReadWarning(
        warnings,
        "HYPERLINK_OFFSET_UNRESOLVED",
        "A hyperlink could not be mapped safely to contentText."
      );
    }

    return {
      displayText: hyperlink.displayText,
      target: hyperlink.target,
      start: rangeMatches ? mappedRange.start : undefined,
      end: rangeMatches ? mappedRange.end : undefined,
    };
  });

  if (loadedHyperlinks.length !== parsedHyperlinks.length) {
    addReadWarning(
      warnings,
      "HYPERLINK_STRUCTURE_COUNT_MISMATCH",
      "Office.js and OOXML reported different hyperlink counts."
    );
  }

  return hyperlinks;
}

function createFootnoteContentControls(
  loadedControls: LoadedContentControlData[],
  parsedControls: ParsedOoxmlContentControl[],
  mapping: OoxmlContentMapping,
  warnings: FootnoteReadWarning[]
): FootnoteContentControl[] {
  const loadedById = new Map(
    loadedControls
      .filter((control) => control.id !== undefined)
      .map((control) => [control.id as number, control])
  );
  const usedIds = new Set<number>();
  const controls: FootnoteContentControl[] = parsedControls.map((parsedControl) => {
    const loadedControl =
      parsedControl.id !== undefined ? loadedById.get(parsedControl.id) : undefined;
    if (loadedControl?.id !== undefined) usedIds.add(loadedControl.id);
    const mappedRange = mapStructureRange(parsedControl, mapping);
    if (!mappedRange) {
      addReadWarning(
        warnings,
        "CONTENT_CONTROL_OFFSET_UNRESOLVED",
        "A content control could not be mapped safely to contentText."
      );
    }

    return {
      id: loadedControl?.id ?? parsedControl.id,
      tag: loadedControl?.tag ?? parsedControl.tag,
      title: loadedControl?.title ?? parsedControl.title,
      type: loadedControl?.type ?? parsedControl.type,
      start: mappedRange?.start,
      end: mappedRange?.end,
    };
  });

  for (const loadedControl of loadedControls) {
    if (loadedControl.id !== undefined && usedIds.has(loadedControl.id)) continue;
    controls.push(loadedControl);
    addReadWarning(
      warnings,
      "CONTENT_CONTROL_OFFSET_UNRESOLVED",
      "A content control could not be mapped safely to contentText."
    );
  }

  if (loadedControls.length !== parsedControls.length) {
    addReadWarning(
      warnings,
      "CONTENT_CONTROL_STRUCTURE_COUNT_MISMATCH",
      "Office.js and OOXML reported different content control counts."
    );
  }

  return controls;
}

function createProtectedRanges(snapshot: {
  hyperlinks: FootnoteSnapshot["hyperlinks"];
  fields: FootnoteField[];
  bookmarks: FootnoteBookmark[];
  contentControls: FootnoteContentControl[];
}): ProtectedRange[] {
  const protectedRanges: ProtectedRange[] = [];
  const append = (
    type: ProtectedStructureType,
    structures: Array<{ start?: number; end?: number }>
  ) => {
    for (const structure of structures) {
      if (structure.start !== undefined && structure.end !== undefined) {
        protectedRanges.push({ type, start: structure.start, end: structure.end });
      }
    }
  };

  append("hyperlink", snapshot.hyperlinks);
  append("field", snapshot.fields);
  append("bookmark", snapshot.bookmarks);
  append("contentControl", snapshot.contentControls);

  return protectedRanges
    .filter(
      (range, index, allRanges) =>
        allRanges.findIndex(
          (candidate) =>
            candidate.type === range.type &&
            candidate.start === range.start &&
            candidate.end === range.end
        ) === index
    )
    .sort((left, right) => left.start - right.start || left.end - right.end);
}

function getDocumentFormatting(
  document: Word.Document,
  supportsDesktop13: boolean,
  supportsDesktop14: boolean
): DocumentFormattingSnapshot {
  return {
    autoHyphenation: supportsDesktop13 ? document.autoHyphenation : undefined,
    hyphenateCaps: supportsDesktop13 ? document.hyphenateCaps : undefined,
    consecutiveHyphensLimit: supportsDesktop13 ? document.consecutiveHyphensLimit : undefined,
    hyphenationZone: supportsDesktop14 ? document.hyphenationZone : undefined,
  };
}

export async function readFootnotes(
  onProgress?: FootnoteReadProgressCallback
): Promise<FootnoteReadResult> {
  const startedAt = performance.now();
  onProgress?.(createFootnoteReadProgress("initializing", 0, 0));

  if (!Office.context.requirements.isSetSupported("WordApi", "1.5")) {
    throw new Error(
      "Diese Word-Version unterstützt das Auslesen von Fußnoten nicht (WordApi 1.5 erforderlich)."
    );
  }

  const supportsDesktop13 = Office.context.requirements.isSetSupported("WordApiDesktop", "1.3");
  const supportsDesktop14 = Office.context.requirements.isSetSupported("WordApiDesktop", "1.4");

  const result = await Word.run(async (context) => {
    const document = context.document;
    const footnotes = context.document.body.footnotes;
    footnotes.load({ body: { text: true }, reference: { text: true } });
    if (supportsDesktop13) {
      document.load(["autoHyphenation", "hyphenateCaps", "consecutiveHyphensLimit"]);
    }
    if (supportsDesktop14) {
      document.load("hyphenationZone");
    }

    let syncCount = 1;
    await context.sync();

    const snapshots: FootnoteSnapshot[] = [];
    const total = footnotes.items.length;
    onProgress?.(createFootnoteReadProgress("reading", 0, total));

    for (
      let chunkStart = 0;
      chunkStart < footnotes.items.length;
      chunkStart += FOOTNOTE_CHUNK_SIZE
    ) {
      const chunk = footnotes.items.slice(chunkStart, chunkStart + FOOTNOTE_CHUNK_SIZE);
      const readContexts = chunk.map((footnote) => {
        const reference = footnote.reference;
        const paragraph = reference.paragraphs.getFirst();
        const beforeRange = paragraph
          .getRange(Word.RangeLocation.start)
          .expandTo(reference.getRange(Word.RangeLocation.start));
        const afterRange = reference
          .getRange(Word.RangeLocation.end)
          .expandTo(paragraph.getRange(Word.RangeLocation.end));

        beforeRange.load("text");
        afterRange.load("text");
        const paragraphs = footnote.body.paragraphs;
        paragraphs.load({
          text: true,
          style: true,
          lineSpacing: true,
          spaceBefore: true,
          spaceAfter: true,
          leftIndent: true,
          rightIndent: true,
          firstLineIndent: true,
          alignment: true,
        });

        const hyperlinks = supportsDesktop13 ? footnote.body.getRange().hyperlinks : undefined;
        hyperlinks?.load({ address: true, subAddress: true, textToDisplay: true });

        const fields = footnote.body.fields;
        fields.load({ type: true, locked: true, result: { text: true } });

        const contentControls = footnote.body.getContentControls();
        contentControls.load({ id: true, tag: true, title: true, type: true });

        const baseCharacterRange = footnote.body.getRange(Word.RangeLocation.content);
        // These are scalar Font values; the lint rule interprets the nested load path as navigational.
        // eslint-disable-next-line office-addins/no-navigational-load
        baseCharacterRange.load({
          font: {
            name: true,
            size: true,
            bold: true,
            italic: true,
            underline: true,
            strikeThrough: true,
            superscript: true,
            subscript: true,
            color: true,
            highlightColor: true,
            spacing: supportsDesktop13,
          },
        });
        const ooxml = footnote.body.getOoxml();

        return {
          beforeRange,
          afterRange,
          paragraphs,
          hyperlinks,
          fields,
          contentControls,
          baseCharacterRange,
          ooxml,
        };
      });

      // One sync per bounded chunk prevents an unbounded all-footnotes OOXML payload.
      // eslint-disable-next-line office-addins/no-context-sync-in-loop
      await context.sync();
      syncCount += 1;

      for (let localIndex = 0; localIndex < chunk.length; localIndex += 1) {
        const footnote = chunk[localIndex];
        const readContext = readContexts[localIndex];
        const ordinal = chunkStart + localIndex + 1;

        try {
          const rawWordText = footnote.body.text;
          const contentText = removeLeadingWordNoteReferenceMark(rawWordText);
          const referenceText = footnote.reference.text;
          const displayLabel = getDisplayLabel(referenceText, ordinal);
          const originalTextHash = hashText(contentText);
          const warnings: FootnoteReadWarning[] = [];
          const paragraphTexts = readContext.paragraphs.items.map((paragraph) => paragraph.text);
          const paragraphs = createParagraphStructure(paragraphTexts, contentText);
          if (paragraphs.some((paragraph) => paragraph.start === undefined)) {
            addReadWarning(
              warnings,
              "PARAGRAPH_OFFSET_UNRESOLVED",
              "Paragraph boundaries could not be mapped safely to contentText."
            );
          }

          const parsedOoxml = parseFootnoteOoxml(readContext.ooxml.value);
          if (!parsedOoxml.parsed) {
            addReadWarning(
              warnings,
              "OOXML_PARSE_FAILED",
              "The footnote OOXML could not be processed."
            );
          }
          if (parsedOoxml.hasUnclosedStructures) {
            addReadWarning(
              warnings,
              "OOXML_STRUCTURE_UNCLOSED",
              "The footnote OOXML contains an unclosed protected structure."
            );
          }
          if (parsedOoxml.hasCharacterStyles) {
            addReadWarning(
              warnings,
              "CHARACTER_STYLE_UNRESOLVED",
              "Character style inheritance could not be resolved completely."
            );
          }

          const ooxmlMapping = mapOoxmlContent(parsedOoxml.textRuns, contentText);
          if (parsedOoxml.parsed && !ooxmlMapping.complete) {
            addReadWarning(
              warnings,
              "FORMAT_OFFSET_UNRESOLVED",
              "OOXML text and formatting runs could not be mapped safely to contentText."
            );
          }

          const loadedHyperlinks: LoadedHyperlinkData[] =
            readContext.hyperlinks?.items.map((hyperlink) => ({
              displayText: hyperlink.textToDisplay,
              target: getHyperlinkTarget(hyperlink.address, hyperlink.subAddress),
            })) ?? [];
          const hyperlinks = supportsDesktop13
            ? createFootnoteHyperlinks(
                loadedHyperlinks,
                parsedOoxml.hyperlinks,
                ooxmlMapping,
                contentText,
                warnings
              )
            : [];
          const loadedFields: LoadedFieldData[] = readContext.fields.items.map((field) => ({
            type: field.type,
            resultText: field.result.text,
            locked: field.locked,
          }));
          const fields = createFootnoteFields(
            loadedFields,
            parsedOoxml.fields,
            ooxmlMapping,
            contentText,
            warnings
          );
          const bookmarks = createFootnoteBookmarks(parsedOoxml.bookmarks, ooxmlMapping, warnings);
          const loadedContentControls: LoadedContentControlData[] =
            readContext.contentControls.items.map((control) => ({
              id: control.id,
              tag: control.tag,
              title: control.title,
              type: control.type,
            }));
          const contentControls = createFootnoteContentControls(
            loadedContentControls,
            parsedOoxml.contentControls,
            ooxmlMapping,
            warnings
          );
          const protectedRanges = createProtectedRanges({
            hyperlinks,
            fields,
            bookmarks,
            contentControls,
          });
          const baseCharacterFormat = getCharacterFormat(
            readContext.baseCharacterRange.font,
            supportsDesktop13
          );
          const formattingRuns = ooxmlMapping.complete
            ? createFormattingRunsFromOoxml(ooxmlMapping.textRuns, baseCharacterFormat)
            : [];
          const paragraphFormats = readContext.paragraphs.items.map(
            (paragraph, paragraphIndex) => ({
              index: paragraphIndex,
              styleName: paragraph.style,
              lineSpacing: paragraph.lineSpacing,
              spaceBefore: paragraph.spaceBefore,
              spaceAfter: paragraph.spaceAfter,
              leftIndent: paragraph.leftIndent,
              rightIndent: paragraph.rightIndent,
              firstLineIndent: paragraph.firstLineIndent,
              alignment: paragraph.alignment,
            })
          );
          const normalizedContextBefore = normalizeFootnoteReferencesInContext(
            readContext.beforeRange.text,
            "before"
          );
          const normalizedContextAfter = normalizeFootnoteReferencesInContext(
            readContext.afterRange.text,
            "after"
          );
          if (normalizedContextBefore.failed || normalizedContextAfter.failed) {
            addReadWarning(
              warnings,
              "REFERENCE_TOKENIZATION_FALLBACK",
              "Footnote reference markers in the locator context required a safe fallback."
            );
          }

          snapshots.push({
            id: `footnote-${ordinal}-${originalTextHash}`,
            ordinal,
            displayLabel,
            rawWordText,
            contentText,
            contentLength: contentText.length,
            originalTextHash,
            reference: { referenceText },
            locator: {
              ordinal,
              displayLabel,
              originalTextHash,
              contextBefore: normalizedContextBefore.text,
              contextAfter: normalizedContextAfter.text,
            },
            paragraphCount: paragraphs.length,
            paragraphs,
            hyperlinks,
            fields,
            bookmarks,
            contentControls,
            protectedRanges,
            readStatus: warnings.length === 0 ? "complete" : "partial",
            readWarnings: warnings,
            baseCharacterFormat,
            formattingRuns,
            paragraphFormats,
          });
        } catch {
          const rawWordText = readLoadedText(() => footnote.body.text);
          const contentText = removeLeadingWordNoteReferenceMark(rawWordText);
          const originalTextHash = hashText(contentText);
          const referenceText = readLoadedText(() => footnote.reference.text);
          const displayLabel = getDisplayLabel(referenceText, ordinal);
          snapshots.push({
            id: `footnote-${ordinal}-${originalTextHash}`,
            ordinal,
            displayLabel,
            rawWordText,
            contentText,
            contentLength: contentText.length,
            originalTextHash,
            reference: { referenceText },
            locator: {
              ordinal,
              displayLabel,
              originalTextHash,
              contextBefore: "",
              contextAfter: "",
            },
            paragraphCount: 0,
            paragraphs: [],
            hyperlinks: [],
            fields: [],
            bookmarks: [],
            contentControls: [],
            protectedRanges: [],
            readStatus: "failed",
            readWarnings: [
              {
                code: "FOOTNOTE_SNAPSHOT_FAILED",
                message: "The footnote could not be converted into a reliable snapshot.",
              },
            ],
            formattingRuns: [],
            paragraphFormats: [],
          });
        }
      }
      onProgress?.(createFootnoteReadProgress("reading", chunkStart + chunk.length, total));
    }

    return {
      footnotes: snapshots,
      documentFormatting: getDocumentFormatting(document, supportsDesktop13, supportsDesktop14),
      syncCount,
    };
  });

  const completeCount = result.footnotes.filter(
    (footnote) => footnote.readStatus === "complete"
  ).length;
  const partialCount = result.footnotes.filter(
    (footnote) => footnote.readStatus === "partial"
  ).length;
  const failedCount = result.footnotes.filter(
    (footnote) => footnote.readStatus === "failed"
  ).length;

  return {
    footnotes: result.footnotes,
    documentFormatting: result.documentFormatting,
    readerMetrics: {
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      footnoteCount: result.footnotes.length,
      completeCount,
      partialCount,
      failedCount,
      syncCount: result.syncCount,
    },
  };
}
