/* global Office, Word */

export async function readFootnotes(): Promise<string[]> {
  if (!Office.context.requirements.isSetSupported("WordApi", "1.5")) {
    throw new Error(
      "Diese Word-Version unterstützt das Auslesen von Fußnoten nicht (WordApi 1.5 erforderlich)."
    );
  }

  return Word.run(async (context) => {
    const footnotes = context.document.body.footnotes;
    footnotes.load({ body: { text: true } });

    await context.sync();

    return footnotes.items.map((footnote) => footnote.body.text);
  });
}
