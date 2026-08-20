import type { BookCitationSettings } from "../../citation-settings/types";
import {
  formattingCandidates,
  fullLocatorRange,
  replacementCandidate,
  separatorBetween,
} from "./helpers";
import type { FootnoteRule, RuleContext, RuleFindingCandidate } from "./types";

function data(context: RuleContext) {
  return context.extraction?.type === "BOOK" ? context.extraction.data : undefined;
}

function settings(context: RuleContext): BookCitationSettings {
  return context.resolvedSettings.settings as BookCitationSettings;
}

export const bookPersonSeparatorRule: FootnoteRule = {
  ruleId: "BOOK_PERSON_SEPARATOR",
  category: "citation",
  priority: 160,
  scope: "segment",
  supportedCitationTypes: ["BOOK"],
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

function locatorAbbreviationRule(
  ruleId: string,
  key: "marginNumbers" | "pages",
  setting: "marginNumberAbbreviation" | "pageAbbreviation",
  pattern: RegExp,
  label: string,
  priority: number
): FootnoteRule {
  return {
    ruleId,
    category: "citation",
    priority,
    scope: "segment",
    supportedCitationTypes: ["BOOK"],
    evaluate(context) {
      const expected = settings(context)[setting];
      return (data(context)?.[key] ?? []).flatMap((locator) => {
        const range = fullLocatorRange(context.footnote.contentText, locator, pattern);
        const suffix = locator.suffix ? ` ${locator.suffix}` : "";
        return replacementCandidate(
          context,
          range,
          `${expected} ${locator.value ?? locator.rawText}${suffix}`,
          `Die bevorzugte ${label}-Abkürzung lautet „${expected}“.`,
          { expected }
        );
      });
    },
  };
}

export const bookMarginNumberRule = locatorAbbreviationRule(
  "BOOK_MARGIN_NUMBER_ABBREVIATION",
  "marginNumbers",
  "marginNumberAbbreviation",
  /\b(?:Rn\.|Rdnr\.|Randnummer)\s*\d+[A-Za-z]?(?:\s*ff?\.)?$/i,
  "Randnummer",
  161
);
export const bookPageRule = locatorAbbreviationRule(
  "BOOK_PAGE_ABBREVIATION",
  "pages",
  "pageAbbreviation",
  /\b(?:S\.|Seite)\s*\d+(?:\s*ff?\.)?$/i,
  "Seiten",
  162
);

export const bookEditionRule: FootnoteRule = {
  ruleId: "BOOK_EDITION_ABBREVIATION",
  category: "citation",
  priority: 163,
  scope: "segment",
  supportedCitationTypes: ["BOOK"],
  evaluate(context) {
    const edition = data(context)?.edition;
    if (!edition) return [];
    const preferred = context.resolvedSettings.abbreviations.EDITION.preferredOutput;
    const match = /(?:Auflage|Aufl\.)/i.exec(edition.rawText);
    if (!match) return [];
    const start = edition.start + match.index;
    return replacementCandidate(
      context,
      { start, end: start + match[0].length },
      preferred,
      `Die bevorzugte Auflagen-Abkürzung lautet „${preferred}“.`,
      { abbreviationConcept: "EDITION", expected: preferred }
    );
  },
};

export const bookWorkSectionRule: FootnoteRule = {
  ruleId: "BOOK_WORK_SECTION_STYLE",
  category: "citation",
  priority: 164,
  scope: "segment",
  supportedCitationTypes: ["BOOK"],
  evaluate(context) {
    const workSection = data(context)?.workSection;
    if (!workSection || settings(context).workSectionStyle !== "sectionSymbol") return [];
    return /^§\s*\d/.test(workSection.rawText) ? [] : [];
  },
};

export const bookFormattingRule: FootnoteRule = {
  ruleId: "BOOK_AUTHOR_FORMATTING",
  category: "formatting",
  priority: 165,
  scope: "segment",
  supportedCitationTypes: ["BOOK"],
  evaluate(context) {
    const extraction = data(context);
    if (!extraction) return [];
    return [
      ...extraction.authors.flatMap((author) =>
        formattingCandidates(context, author, settings(context).authorFormatting, "Der Autor")
      ),
      ...(extraction.title
        ? formattingCandidates(
            context,
            extraction.title,
            context.resolvedSettings.formatting.workTitle,
            "Der Werktitel"
          )
        : []),
    ];
  },
};

export const BOOK_RULES: readonly FootnoteRule[] = [
  bookPersonSeparatorRule,
  bookMarginNumberRule,
  bookPageRule,
  bookEditionRule,
  bookWorkSectionRule,
  bookFormattingRule,
];
