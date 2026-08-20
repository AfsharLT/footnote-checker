import { replacementCandidate } from "./helpers";
import type { FootnoteRule } from "./types";

// Deliberately limited to established official-report and journal citation shapes.
const SAFE_UNCLOSED_PINPOINT =
  /\b(?:BVerfGE|BVerwGE|BGHZ|BGHSt|NJW|NStZ|JuS|JZ|NZWiSt|ZIP|WM|MDR|GRUR)\s+(?:\d{1,4}),\s*\d+\s*\(\d+(?:\s*f{1,2}\.?)?(?=\.(?:[\s\u200B-\u200D\u2060\uFEFF]*)$)/i;

export const citationPinpointBracketsRule: FootnoteRule = {
  ruleId: "CITATION_PINPOINT_BRACKETS",
  category: "citation",
  priority: 35,
  scope: "footnote",
  evaluate(context) {
    const match = SAFE_UNCLOSED_PINPOINT.exec(context.footnote.contentText);
    if (!match) return [];
    const insertion = match.index + match[0].length;
    return replacementCandidate(
      context,
      { start: insertion, end: insertion },
      ")",
      "Die Fundstellenklammer vor dem abschließenden Punkt ist nicht geschlossen.",
      { structure: "citationPinpoint" }
    );
  },
};
