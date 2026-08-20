import type { FootnoteRule } from "./types";

const TECHNICAL_CHARACTERS = new Set(["\u200b", "\u200c", "\u200d", "\u2060", "\ufeff"]);

function isContentless(value: string): boolean {
  return Array.from(value).every(
    (character) => /\s/u.test(character) || TECHNICAL_CHARACTERS.has(character)
  );
}

export const emptyFootnoteRule: FootnoteRule = {
  ruleId: "EMPTY_FOOTNOTE",
  category: "structure",
  priority: 20,
  scope: "footnote",
  evaluate(context) {
    if (!isContentless(context.footnote.contentText)) return [];
    return [
      {
        category: "structure",
        start: 0,
        end: 0,
        originalText: "",
        severity: "error",
        message: "Die Fußnote enthält keinen Inhalt.",
      },
    ];
  },
};
