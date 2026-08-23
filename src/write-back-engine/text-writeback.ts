/* global Word */

import type { TextInsertAction, TextReplaceAction } from "@/review-engine";

export function applyTextReplacement(target: Word.Range, action: TextReplaceAction): void {
  target.insertText(action.replacementText, Word.InsertLocation.replace);
}

export function applyTextInsertion(target: Word.Range, action: TextInsertAction): void {
  target.insertText(action.text, Word.InsertLocation.start);
}
