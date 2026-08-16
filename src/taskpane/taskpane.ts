/* global Office, Word */

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
}

const WORD_NOTE_REFERENCE_MARK = "\u0002";

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

export async function readFootnotes(): Promise<FootnoteSnapshot[]> {
  if (!Office.context.requirements.isSetSupported("WordApi", "1.5")) {
    throw new Error(
      "Diese Word-Version unterstützt das Auslesen von Fußnoten nicht (WordApi 1.5 erforderlich)."
    );
  }

  const supportsHyperlinks = Office.context.requirements.isSetSupported("WordApiDesktop", "1.3");

  return Word.run(async (context) => {
    const footnotes = context.document.body.footnotes;
    footnotes.load({ body: { text: true }, reference: { text: true } });

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
      paragraphs.load({ text: true });

      const hyperlinks = supportsHyperlinks ? footnote.body.getRange().hyperlinks : undefined;
      hyperlinks?.load({ address: true, subAddress: true, textToDisplay: true });

      return { beforeRange, afterRange, paragraphs, hyperlinks };
    });

    await context.sync();

    return footnotes.items.map((footnote, index) => {
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
      };
    });
  });
}
