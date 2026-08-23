/* global Word */

import type { FormatChangeAction } from "@/review-engine";
import { formatProperty } from "./preflight";

export function applyFormattingChange(target: Word.Range, action: FormatChangeAction): void {
  const property = formatProperty(action);
  if (!property) throw new Error("Exactly one supported formatting property is required.");
  const value = action.changes[property];
  switch (property) {
    case "fontName":
      target.font.name = value as string;
      return;
    case "fontSize":
      target.font.size = value as number;
      return;
    case "bold":
      target.font.bold = value as boolean;
      return;
    case "italic":
      target.font.italic = value as boolean;
      return;
    case "underline":
      target.font.underline = (
        typeof value === "boolean" ? (value ? "Single" : "None") : value
      ) as Word.UnderlineType;
      return;
    case "strikeThrough":
      target.font.strikeThrough = value as boolean;
      return;
    case "superscript":
      target.font.superscript = value as boolean;
      return;
    case "subscript":
      target.font.subscript = value as boolean;
      return;
    case "characterSpacing":
      target.font.spacing = value as number;
  }
}
