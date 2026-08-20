import type { JournalArticleCitationSettings, PinpointStyle } from "../../citation-settings/types";
import type { CitationLocator } from "../types";
import {
  formattingCandidates,
  informationalCandidate,
  normalizePreferenceText,
  replacementCandidate,
  separatorBetween,
} from "./helpers";
import type { FootnoteRule, RuleContext, RuleFindingCandidate } from "./types";

function data(context: RuleContext) {
  return context.extraction?.type === "JOURNAL_ARTICLE" ? context.extraction.data : undefined;
}

function settings(context: RuleContext): JournalArticleCitationSettings {
  return context.resolvedSettings.settings as JournalArticleCitationSettings;
}

export const journalWorkNameRule: FootnoteRule = {
  ruleId: "JOURNAL_WORK_NAME",
  category: "citation",
  priority: 180,
  scope: "segment",
  supportedCitationTypes: ["JOURNAL_ARTICLE"],
  evaluate(context) {
    const journal = data(context)?.journal;
    const mapping = context.sourceMapping;
    if (!journal || mapping?.status !== "MATCHED") return [];
    const preferred = context.resolvedSettings.preferredWorkName ?? mapping.preferredName;
    if (!preferred || journal.rawText === preferred) return [];
    const metadata = {
      canonicalSourceId: mapping.canonicalSourceId,
      preferredName: preferred,
      legacySafetyLevel: mapping.legacySafetyLevel,
    };
    return mapping.legacySafetyLevel === "UNCERTAIN"
      ? informationalCandidate(
          context,
          journal,
          "Die verwendete Zeitschriftenbezeichnung weicht von der bevorzugten Bezeichnung ab; das Mapping ist als unsicher gekennzeichnet.",
          metadata
        )
      : replacementCandidate(
          context,
          journal,
          preferred,
          `Die bevorzugte Zeitschriftenbezeichnung lautet „${preferred}“.`,
          metadata
        );
  },
};

function pinpointStyleCandidate(
  context: RuleContext,
  firstPage: CitationLocator | undefined,
  pinpoint: CitationLocator | undefined,
  expectedStyle: PinpointStyle
): RuleFindingCandidate[] {
  if (!firstPage || !pinpoint) return [];
  const text = context.footnote.contentText;
  const between = text.slice(firstPage.end, pinpoint.start);
  const closingParenthesis = text[pinpoint.end] === ")";
  const actualStyle: PinpointStyle =
    between.includes("(") && closingParenthesis ? "parentheses" : "comma";
  if (actualStyle === expectedStyle) return [];
  const message = `Die konkrete Fundstelle soll ${expectedStyle === "parentheses" ? "in Klammern" : "mit Komma"} angegeben werden.`;
  if (expectedStyle === "parentheses") {
    return replacementCandidate(
      context,
      { start: firstPage.end, end: pinpoint.end },
      ` (${pinpoint.rawText})`,
      message,
      { expectedStyle, actualStyle }
    );
  }
  return replacementCandidate(
    context,
    { start: firstPage.end, end: closingParenthesis ? pinpoint.end + 1 : pinpoint.end },
    `, ${pinpoint.rawText}`,
    message,
    { expectedStyle, actualStyle }
  );
}

export const journalPinpointStyleRule: FootnoteRule = {
  ruleId: "JOURNAL_PINPOINT_STYLE",
  category: "citation",
  priority: 181,
  scope: "segment",
  supportedCitationTypes: ["JOURNAL_ARTICLE"],
  evaluate(context) {
    const extraction = data(context);
    return pinpointStyleCandidate(
      context,
      extraction?.firstPage,
      extraction?.pinpointPages[0],
      settings(context).pinpointStyle
    );
  },
};

export const journalPersonSeparatorRule: FootnoteRule = {
  ruleId: "JOURNAL_PERSON_SEPARATOR",
  category: "citation",
  priority: 182,
  scope: "segment",
  supportedCitationTypes: ["JOURNAL_ARTICLE"],
  evaluate(context) {
    const authors = data(context)?.authors ?? [];
    const expected = settings(context).personSeparator;
    const findings: RuleFindingCandidate[] = [];
    for (let index = 1; index < authors.length; index += 1) {
      const between = separatorBetween(
        context.footnote.contentText,
        authors[index - 1],
        authors[index]
      );
      if (!between) continue;
      findings.push(
        ...replacementCandidate(
          context,
          between.range,
          expected,
          `Autoren sollen durch „${expected}“ getrennt werden.`,
          { expectedSeparator: expected }
        )
      );
    }
    return findings;
  },
};

export const journalFormattingRule: FootnoteRule = {
  ruleId: "JOURNAL_AUTHOR_FORMATTING",
  category: "formatting",
  priority: 183,
  scope: "segment",
  supportedCitationTypes: ["JOURNAL_ARTICLE"],
  evaluate(context) {
    return (data(context)?.authors ?? []).flatMap((author) =>
      formattingCandidates(context, author, settings(context).authorFormatting, "Der Autor")
    );
  },
};

export const journalFollowingSuffixRule: FootnoteRule = {
  ruleId: "JOURNAL_FOLLOWING_SUFFIX_STYLE",
  category: "citation",
  priority: 184,
  scope: "segment",
  supportedCitationTypes: ["JOURNAL_ARTICLE"],
  evaluate(context) {
    const findings: RuleFindingCandidate[] = [];
    for (const locator of data(context)?.pinpointPages ?? []) {
      if (!locator.suffix) continue;
      const concept = locator.suffix.startsWith("ff") ? "FOLLOWING_MULTIPLE" : "FOLLOWING";
      const preferred = context.resolvedSettings.abbreviations[concept].preferredOutput;
      const match = /ff?\.?$/.exec(locator.rawText);
      if (!match || normalizePreferenceText(match[0]) === normalizePreferenceText(preferred))
        continue;
      findings.push(
        ...replacementCandidate(
          context,
          { start: locator.end - match[0].length, end: locator.end },
          preferred,
          `Die bevorzugte Schreibweise lautet „${preferred}“.`,
          { abbreviationConcept: concept }
        )
      );
    }
    return findings;
  },
};

export const JOURNAL_RULES: readonly FootnoteRule[] = [
  journalWorkNameRule,
  journalPinpointStyleRule,
  journalPersonSeparatorRule,
  journalFormattingRule,
  journalFollowingSuffixRule,
];
