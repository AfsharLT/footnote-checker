/* global Office, Word */

export interface FootnoteSnapshot {
  id: string;
  ordinal: number;
  displayLabel: string;
  rawWordText: string;
  contentText: string;
  contentLength: number;
  originalTextHash: string;
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

export async function readFootnotes(): Promise<FootnoteSnapshot[]> {
  if (!Office.context.requirements.isSetSupported("WordApi", "1.5")) {
    throw new Error(
      "Diese Word-Version unterstützt das Auslesen von Fußnoten nicht (WordApi 1.5 erforderlich)."
    );
  }

  return Word.run(async (context) => {
    const footnotes = context.document.body.footnotes;
    footnotes.load({ body: { text: true }, reference: { text: true } });

    await context.sync();

    return footnotes.items.map((footnote, index) => {
      const ordinal = index + 1;
      const rawWordText = readLoadedText(() => footnote.body.text);
      const contentText = removeLeadingWordNoteReferenceMark(rawWordText);
      const referenceText = readLoadedText(() => footnote.reference.text);
      const displayLabel = getDisplayLabel(referenceText, ordinal);
      const originalTextHash = hashText(contentText);

      return {
        id: `footnote-${ordinal}-${originalTextHash}`,
        ordinal,
        displayLabel,
        rawWordText,
        contentText,
        contentLength: contentText.length,
        originalTextHash,
      };
    });
  });
}
