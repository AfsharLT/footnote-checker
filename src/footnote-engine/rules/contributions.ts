import type { BookChapterCitationSettings, PinpointStyle } from "../../citation-settings/types";
import type { CitationLocator } from "../types";
import {
  formattingCandidates,
  informationalCandidate,
  normalizePreferenceText,
  replacementCandidate,
} from "./helpers";
import type { FootnoteRule, RuleContext, RuleFindingCandidate } from "./types";

function contributionData(context: RuleContext) {
  const extraction = context.extraction;
  return extraction?.type === "FESTSCHRIFT_CONTRIBUTION" ||
    extraction?.type === "YEARBOOK_CONTRIBUTION"
    ? extraction.data
    : undefined;
}

function settings(context: RuleContext): BookChapterCitationSettings {
  return context.resolvedSettings.settings as BookChapterCitationSettings;
}

function pinpointCandidate(
  context: RuleContext,
  firstPage: CitationLocator | undefined,
  pinpoint: CitationLocator | undefined,
  expectedStyle: PinpointStyle | "pagePrefix"
): RuleFindingCandidate[] {
  if (!firstPage || !pinpoint || expectedStyle === "pagePrefix") return [];
  const text = context.footnote.contentText;
  const between = text.slice(firstPage.end, pinpoint.start);
  const closingParenthesis = text[pinpoint.end] === ")";
  const parenthesized = /^\s*\(\s*$/u.test(between) && closingParenthesis;
  const commaSeparated = /^\s*,\s*$/u.test(between);
  if (!parenthesized && !commaSeparated) return [];
  const actualStyle: PinpointStyle = parenthesized ? "parentheses" : "comma";
  if (actualStyle === expectedStyle) return [];
  if (expectedStyle === "parentheses") {
    return replacementCandidate(
      context,
      { start: firstPage.end, end: pinpoint.end },
      ` (${pinpoint.rawText})`,
      "Die konkrete Beitragsfundstelle soll in Klammern angegeben werden.",
      { expectedStyle, actualStyle }
    );
  }
  return replacementCandidate(
    context,
    { start: firstPage.end, end: closingParenthesis ? pinpoint.end + 1 : pinpoint.end },
    `, ${pinpoint.rawText}`,
    "Die konkrete Beitragsfundstelle soll mit Komma angegeben werden.",
    { expectedStyle, actualStyle }
  );
}

export const contributionPinpointStyleRule: FootnoteRule = {
  ruleId: "CONTRIBUTION_PINPOINT_STYLE",
  category: "citation",
  priority: 176,
  scope: "segment",
  supportedCitationTypes: ["FESTSCHRIFT_CONTRIBUTION", "YEARBOOK_CONTRIBUTION"],
  evaluate(context) {
    if (context.extraction?.status === "unresolved") return [];
    const data = contributionData(context);
    return pinpointCandidate(
      context,
      data?.firstPage,
      data?.pinpointPages[0],
      settings(context).pinpointStyle
    );
  },
};

export const forthcomingManualReviewRule: FootnoteRule = {
  ruleId: "FORTHCOMING_PUBLICATION_REVIEW",
  category: "citation",
  priority: 179,
  scope: "segment",
  supportedCitationTypes: ["FORTHCOMING"],
  evaluate(context) {
    if (!context.segment) return [];
    return informationalCandidate(
      context,
      { start: context.segment.coreStart, end: context.segment.coreEnd },
      "Die Fundstelle ist als im Erscheinen gekennzeichnet; fehlende bibliografische Angaben müssen manuell geprüft werden.",
      { requiresManualReview: true, reason: "FORTHCOMING_INCOMPLETE_METADATA" }
    );
  },
};

export const contributionFollowingSuffixRule: FootnoteRule = {
  ruleId: "CONTRIBUTION_FOLLOWING_SUFFIX_STYLE",
  category: "citation",
  priority: 177,
  scope: "segment",
  supportedCitationTypes: ["FESTSCHRIFT_CONTRIBUTION", "YEARBOOK_CONTRIBUTION"],
  evaluate(context) {
    return (contributionData(context)?.pinpointPages ?? []).flatMap((locator) => {
      if (!locator.suffix) return [];
      const concept = locator.suffix.startsWith("ff") ? "FOLLOWING_MULTIPLE" : "FOLLOWING";
      const preferred = context.resolvedSettings.abbreviations[concept].preferredOutput;
      const match = /ff?\.?$/u.exec(locator.rawText);
      if (!match || normalizePreferenceText(match[0]) === normalizePreferenceText(preferred)) {
        return [];
      }
      return replacementCandidate(
        context,
        { start: locator.end - match[0].length, end: locator.end },
        preferred,
        `Die bevorzugte Schreibweise lautet „${preferred}“.`,
        { abbreviationConcept: concept }
      );
    });
  },
};

export const contributionAuthorFormattingRule: FootnoteRule = {
  ruleId: "CONTRIBUTION_AUTHOR_FORMATTING",
  category: "formatting",
  priority: 178,
  scope: "segment",
  supportedCitationTypes: ["FESTSCHRIFT_CONTRIBUTION", "YEARBOOK_CONTRIBUTION"],
  evaluate(context) {
    return (contributionData(context)?.authors ?? []).flatMap((author) =>
      formattingCandidates(context, author, settings(context).authorFormatting, "Der Autor")
    );
  },
};

export const CONTRIBUTION_RULES: readonly FootnoteRule[] = [
  contributionPinpointStyleRule,
  contributionFollowingSuffixRule,
  contributionAuthorFormattingRule,
  forthcomingManualReviewRule,
];
