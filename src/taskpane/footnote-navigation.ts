/* global Word */
import type { FootnoteSnapshot } from "./taskpane";
import { contentTextFromRawWordText } from "./taskpane";
import { normalizeFootnoteReferencesInContext } from "./locator-context";
import type { AppliedMutationRecord } from "@/write-back-engine";

export interface FootnoteNavigationInput {
  footnote: FootnoteSnapshot;
  footnotes: readonly FootnoteSnapshot[];
  appliedMutations: readonly AppliedMutationRecord[];
}
export interface FootnoteNavigationResult {
  status: "SELECTED" | "STALE" | "UNSUPPORTED" | "FAILED";
  message: string;
}
export const STALE_NAVIGATION_MESSAGE =
  "Die Fußnote lässt sich nicht mehr eindeutig zuordnen. Bitte die Fußnoten erneut prüfen.";

export function expectedNavigationText(input: FootnoteNavigationInput): string | undefined {
  let text = input.footnote.contentText;
  for (const mutation of input.appliedMutations) {
    if (mutation.footnoteId !== input.footnote.id || mutation.actionKind === "FORMAT_CHANGE")
      continue;
    if (
      mutation.newText === undefined ||
      mutation.oldStart < 0 ||
      mutation.oldEnd < mutation.oldStart ||
      mutation.oldEnd > text.length
    )
      return undefined;
    text = text.slice(0, mutation.oldStart) + mutation.newText + text.slice(mutation.oldEnd);
  }
  return text;
}

export function navigationTargetIsCurrent(
  input: FootnoteNavigationInput,
  current: { count: number; contentText: string; contextBefore: string; contextAfter: string }
): boolean {
  const { footnote, footnotes } = input;
  const ordinal = footnote.locator.ordinal;
  if (
    !Number.isInteger(ordinal) ||
    ordinal < 1 ||
    ordinal > current.count ||
    current.count !== footnotes.length ||
    footnotes[ordinal - 1]?.id !== footnote.id
  )
    return false;
  if (expectedNavigationText(input) !== current.contentText) return false;
  if (
    footnote.locator.contextBefore !== current.contextBefore ||
    footnote.locator.contextAfter !== current.contextAfter
  )
    return false;
  // Identical text AND reference context cannot safely distinguish two notes.
  return (
    footnotes.filter(
      (candidate) =>
        candidate.contentText === footnote.contentText &&
        candidate.locator.contextBefore === footnote.locator.contextBefore &&
        candidate.locator.contextAfter === footnote.locator.contextAfter
    ).length === 1
  );
}

export async function navigateToFootnote(
  input: FootnoteNavigationInput,
  run: (
    callback: (context: Word.RequestContext) => Promise<FootnoteNavigationResult>
  ) => Promise<FootnoteNavigationResult> = (callback) => Word.run(callback)
): Promise<FootnoteNavigationResult> {
  try {
    return await run(async (context) => {
      const notes = context.document.body.footnotes;
      notes.load("items");
      await context.sync();
      const ordinal = input.footnote.locator.ordinal;
      if (
        !Number.isInteger(ordinal) ||
        ordinal < 1 ||
        ordinal > notes.items.length ||
        notes.items.length !== input.footnotes.length
      )
        return { status: "STALE", message: STALE_NAVIGATION_MESSAGE };
      const note = notes.items[ordinal - 1];
      const reference = note.reference;
      const paragraph = reference.paragraphs.getFirst();
      const before = paragraph
        .getRange(Word.RangeLocation.start)
        .expandTo(reference.getRange(Word.RangeLocation.start));
      const after = reference
        .getRange(Word.RangeLocation.end)
        .expandTo(paragraph.getRange(Word.RangeLocation.end));
      note.body.load("text");
      before.load("text");
      after.load("text");
      await context.sync();
      if (
        !navigationTargetIsCurrent(input, {
          count: notes.items.length,
          contentText: contentTextFromRawWordText(note.body.text),
          contextBefore: normalizeFootnoteReferencesInContext(before.text, "before").text,
          contextAfter: normalizeFootnoteReferencesInContext(after.text, "after").text,
        })
      )
        return { status: "STALE", message: STALE_NAVIGATION_MESSAGE };
      note.body.getRange(Word.RangeLocation.content).select(Word.SelectionMode.start);
      await context.sync();
      const selectedBody = context.document.getSelection().parentBody;
      selectedBody.load(["text", "type"]);
      await context.sync();
      if (
        !["Footnote", "NoteItem"].includes(selectedBody.type) ||
        contentTextFromRawWordText(selectedBody.text) !== contentTextFromRawWordText(note.body.text)
      ) {
        return {
          status: "FAILED",
          message: "Word hat die Fußnote nicht wie erwartet geöffnet. Bitte erneut versuchen.",
        };
      }
      return {
        status: "SELECTED",
        message: `Fußnote ${input.footnote.ordinal} ist in Word geöffnet.`,
      };
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    return code === "NotImplemented" || code === "ApiNotFound" || code === "NotSupported"
      ? {
          status: "UNSUPPORTED",
          message:
            "Diese Word-Version unterstützt das direkte Springen zur Fußnote nicht. Die Prüfung bleibt verfügbar.",
        }
      : {
          status: "FAILED",
          message:
            "Die Fußnote konnte in Word nicht geöffnet werden. Bitte erneut versuchen oder die Fußnoten erneut prüfen.",
        };
  }
}
