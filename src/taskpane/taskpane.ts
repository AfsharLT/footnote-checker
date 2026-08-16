/* global Office, Word, DOMParser, Element */

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
  baseCharacterFormat?: CharacterFormat;
  formattingRuns: FormattingRun[];
  paragraphFormats: FootnoteParagraphFormat[];
}

export interface FootnoteReadResult {
  footnotes: FootnoteSnapshot[];
  documentFormatting: DocumentFormattingSnapshot;
}

const WORD_NOTE_REFERENCE_MARK = "\u0002";
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
  directFormat: CharacterFormat;
  characterStyle?: string;
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

function getOoxmlRunText(runElement: Element): string {
  const textParts: string[] = [];

  for (const element of Array.from(runElement.getElementsByTagName("*"))) {
    if (!isWordprocessingElement(element)) {
      continue;
    }

    switch (element.localName) {
      case "t":
      case "delText":
        textParts.push(element.textContent ?? "");
        break;
      case "tab":
        textParts.push("\t");
        break;
      case "br":
      case "cr":
        textParts.push("\v");
        break;
      case "noBreakHyphen":
        textParts.push("\u2011");
        break;
      case "softHyphen":
        textParts.push("\u00ad");
        break;
    }
  }

  return textParts.join("");
}

function parseOoxmlTextRuns(ooxml: string): OoxmlTextRun[] {
  try {
    const xmlDocument = new DOMParser().parseFromString(ooxml, "application/xml");
    if (xmlDocument.getElementsByTagName("parsererror").length > 0) {
      return [];
    }

    const allElements = Array.from(xmlDocument.getElementsByTagName("*"));
    const contentRoot =
      allElements.find((element) => isWordprocessingElement(element, "body")) ??
      xmlDocument.documentElement;
    const runElements = Array.from(contentRoot.getElementsByTagName("*")).filter((element) =>
      isWordprocessingElement(element, "r")
    );

    return runElements
      .map((runElement) => {
        const runProperties = getDirectChild(runElement, "rPr");
        const characterStyle = runProperties ? getDirectChild(runProperties, "rStyle") : undefined;
        return {
          text: getOoxmlRunText(runElement),
          directFormat: parseOoxmlRunFormat(runProperties),
          characterStyle: characterStyle ? getOoxmlAttribute(characterStyle, "val") : undefined,
        };
      })
      .filter((run) => run.text.length > 0);
  } catch {
    return [];
  }
}

function isStructuralOoxmlGap(text: string): boolean {
  return Array.from(text).every((character) => OOXML_STRUCTURAL_TEXT_MARKS.has(character));
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
  ooxml: string,
  contentText: string,
  baseCharacterFormat: CharacterFormat
): FormattingRun[] {
  if (!ooxml || contentText.length === 0) {
    return [];
  }

  const ooxmlRuns = parseOoxmlTextRuns(ooxml);
  const runs: FormattingRun[] = [];
  let searchOffset = 0;
  let removedReferenceMark = false;
  let previousRunCharacterStyle: string | undefined;

  for (const ooxmlRun of ooxmlRuns) {
    let runText = ooxmlRun.text;
    if (!removedReferenceMark && runText.startsWith(WORD_NOTE_REFERENCE_MARK)) {
      runText = runText.slice(1);
      removedReferenceMark = true;
    }
    if (runText.length === 0) continue;

    const start = contentText.indexOf(runText, searchOffset);
    if (start < 0 || !isStructuralOoxmlGap(contentText.slice(searchOffset, start))) {
      return [];
    }

    const end = start + runText.length;
    const formatting = getDirectFormattingDifferences(ooxmlRun.directFormat, baseCharacterFormat);
    searchOffset = end;

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

  return isStructuralOoxmlGap(contentText.slice(searchOffset)) ? runs : [];
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

export async function readFootnotes(): Promise<FootnoteReadResult> {
  if (!Office.context.requirements.isSetSupported("WordApi", "1.5")) {
    throw new Error(
      "Diese Word-Version unterstützt das Auslesen von Fußnoten nicht (WordApi 1.5 erforderlich)."
    );
  }

  const supportsDesktop13 = Office.context.requirements.isSetSupported("WordApiDesktop", "1.3");
  const supportsDesktop14 = Office.context.requirements.isSetSupported("WordApiDesktop", "1.4");

  return Word.run(async (context) => {
    const document = context.document;
    const footnotes = context.document.body.footnotes;
    footnotes.load({ body: { text: true }, reference: { text: true } });
    if (supportsDesktop13) {
      document.load(["autoHyphenation", "hyphenateCaps", "consecutiveHyphensLimit"]);
    }
    if (supportsDesktop14) {
      document.load("hyphenationZone");
    }

    await context.sync();

    const readContexts = footnotes.items.map((footnote) => {
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
        baseCharacterRange,
        ooxml,
      };
    });

    await context.sync();

    const snapshots = footnotes.items.map((footnote, index) => {
      const ordinal = index + 1;
      const rawWordText = readLoadedText(() => footnote.body.text);
      const contentText = removeLeadingWordNoteReferenceMark(rawWordText);
      const referenceText = readLoadedText(() => footnote.reference.text);
      const displayLabel = getDisplayLabel(referenceText, ordinal);
      const originalTextHash = hashText(contentText);
      const readContext = readContexts[index];
      const textBeforeReference = readLoadedText(() => readContext.beforeRange.text);
      const textAfterReference = readLoadedText(() => readContext.afterRange.text);
      const contextBefore = textBeforeReference.slice(-60);
      const contextAfter = textAfterReference.slice(0, 60);
      const paragraphTexts = readContext.paragraphs.items.map((paragraph) =>
        readLoadedText(() => paragraph.text)
      );
      const paragraphs = createParagraphStructure(paragraphTexts, contentText);
      const hyperlinks =
        readContext.hyperlinks?.items.map((hyperlink) => ({
          displayText: hyperlink.textToDisplay,
          target: getHyperlinkTarget(hyperlink.address, hyperlink.subAddress),
        })) ?? [];
      const baseCharacterFormat = getCharacterFormat(
        readContext.baseCharacterRange.font,
        supportsDesktop13
      );
      const formattingRuns = createFormattingRunsFromOoxml(
        readContext.ooxml.value,
        contentText,
        baseCharacterFormat
      );
      const paragraphFormats = readContext.paragraphs.items.map((paragraph, paragraphIndex) => ({
        index: paragraphIndex,
        styleName: paragraph.style,
        lineSpacing: paragraph.lineSpacing,
        spaceBefore: paragraph.spaceBefore,
        spaceAfter: paragraph.spaceAfter,
        leftIndent: paragraph.leftIndent,
        rightIndent: paragraph.rightIndent,
        firstLineIndent: paragraph.firstLineIndent,
        alignment: paragraph.alignment,
      }));

      return {
        id: `footnote-${ordinal}-${originalTextHash}`,
        ordinal,
        displayLabel,
        rawWordText,
        contentText,
        contentLength: contentText.length,
        originalTextHash,
        reference: {
          referenceText,
        },
        locator: {
          ordinal,
          displayLabel,
          originalTextHash,
          contextBefore,
          contextAfter,
        },
        paragraphCount: paragraphs.length,
        paragraphs,
        hyperlinks,
        baseCharacterFormat,
        formattingRuns,
        paragraphFormats,
      };
    });

    return {
      footnotes: snapshots,
      documentFormatting: getDocumentFormatting(document, supportsDesktop13, supportsDesktop14),
    };
  });
}
