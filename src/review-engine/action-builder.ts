import type { Finding } from "../footnote-engine/types";
import type { FormattingChangeSet, ProposedReviewAction } from "./types";

const FORMATTING_PROPERTIES = [
  "italic",
  "bold",
  "underline",
  "fontName",
  "fontSize",
  "strikeThrough",
  "superscript",
  "subscript",
  "characterSpacing",
] as const satisfies ReadonlyArray<keyof FormattingChangeSet>;

function formattingChange(finding: Finding): FormattingChangeSet | undefined {
  const property = finding.metadata?.formattingProperty;
  const expected = finding.metadata?.expected;
  if (
    typeof property !== "string" ||
    !FORMATTING_PROPERTIES.includes(property as keyof FormattingChangeSet) ||
    expected === undefined ||
    expected === null ||
    expected === "mixed" ||
    expected === "Mixed"
  ) {
    return undefined;
  }

  if (["fontSize", "characterSpacing"].includes(property) && typeof expected !== "number") {
    return undefined;
  }
  if (property === "fontName" && typeof expected !== "string") return undefined;
  if (
    ["italic", "bold", "strikeThrough", "superscript", "subscript"].includes(property) &&
    typeof expected !== "boolean"
  ) {
    return undefined;
  }
  if (property === "underline" && typeof expected !== "boolean" && typeof expected !== "string") {
    return undefined;
  }
  return { [property]: expected } as FormattingChangeSet;
}

export function buildProposedReviewAction(finding: Finding): ProposedReviewAction | undefined {
  if (finding.category === "formatting") {
    if (finding.ruleId === "FORMAT_ITALIC_REVIEW") {
      return undefined;
    }
    const changes = formattingChange(finding);
    return changes && finding.start < finding.end
      ? { type: "FORMAT_CHANGE", start: finding.start, end: finding.end, changes }
      : undefined;
  }

  if (finding.suggestedText === undefined) return undefined;
  if (finding.start === finding.end && finding.originalText === "") {
    return { type: "TEXT_INSERT", position: finding.start, text: finding.suggestedText };
  }
  if (finding.start < finding.end) {
    return {
      type: "TEXT_REPLACE",
      start: finding.start,
      end: finding.end,
      originalText: finding.originalText,
      replacementText: finding.suggestedText,
    };
  }
  return undefined;
}
