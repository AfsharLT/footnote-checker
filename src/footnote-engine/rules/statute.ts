import type { StatuteCitationSettings } from "../../citation-settings/types";
import type { CitationLocator, StatuteSectionReference } from "../types";
import {
  findTokenRange,
  fullLocatorRange,
  normalizePreferenceText,
  replacementCandidate,
} from "./helpers";
import type { FootnoteRule, RuleContext, RuleFindingCandidate } from "./types";

const ROMAN_VALUES: Readonly<Record<string, string>> = {
  "1": "I",
  "2": "II",
  "3": "III",
  "4": "IV",
  "5": "V",
  "6": "VI",
  "7": "VII",
  "8": "VIII",
  "9": "IX",
  "10": "X",
};

function statuteSettings(context: RuleContext): StatuteCitationSettings {
  return context.resolvedSettings.settings as StatuteCitationSettings;
}

function sections(context: RuleContext): StatuteSectionReference[] {
  return context.extraction?.type === "STATUTE" ? context.extraction.data.sections : [];
}

function locatorRule(
  ruleId: string,
  priority: number,
  evaluate: (context: RuleContext, section: StatuteSectionReference) => RuleFindingCandidate[]
): FootnoteRule {
  return {
    ruleId,
    category: "citation",
    priority,
    scope: "segment",
    supportedCitationTypes: ["STATUTE"],
    evaluate(context) {
      return sections(context).flatMap((section) => evaluate(context, section));
    },
  };
}

export const statuteParagraphStyleRule = locatorRule(
  "STATUTE_PARAGRAPH_STYLE",
  100,
  (context, section) => {
    const locator = section.paragraph;
    if (!locator) return [];
    const settings = statuteSettings(context);
    const abbreviation = context.resolvedSettings.abbreviations.PARAGRAPH.preferredOutput;
    const range = fullLocatorRange(
      context.footnote.contentText,
      locator,
      /\b(?:Abs\.|Absatz)\s*\d+[A-Za-z]?$/i
    );
    const suggested =
      settings.paragraphStyle === "roman"
        ? ROMAN_VALUES[locator.value ?? ""]
        : `${abbreviation} ${locator.value ?? locator.rawText}`;
    if (!suggested) return [];
    return replacementCandidate(
      context,
      range,
      suggested,
      settings.paragraphStyle === "roman"
        ? "Der Absatz soll mit einer römischen Zahl dargestellt werden."
        : `Die bevorzugte Absatzdarstellung lautet „${suggested}“.`,
      { semanticValue: locator.value, expectedStyle: settings.paragraphStyle }
    );
  }
);

export const statuteSentenceStyleRule = locatorRule(
  "STATUTE_SENTENCE_STYLE",
  101,
  (context, section) => {
    const locator = section.sentence;
    if (!locator) return [];
    const settings = statuteSettings(context);
    const abbreviation = context.resolvedSettings.abbreviations.SENTENCE.preferredOutput;
    const range = fullLocatorRange(
      context.footnote.contentText,
      locator,
      /\b(?:S\.|Satz)\s*\d+[A-Za-z]?$/i
    );
    const suggested =
      settings.sentenceStyle === "abbreviation"
        ? `${abbreviation} ${locator.value ?? locator.rawText}`
        : (locator.value ?? locator.rawText);
    return replacementCandidate(
      context,
      range,
      suggested,
      `Die bevorzugte Satzdarstellung lautet „${suggested}“.`,
      { semanticValue: locator.value, expectedStyle: settings.sentenceStyle }
    );
  }
);

function prefixedLocatorCandidate(
  context: RuleContext,
  locator: CitationLocator | undefined,
  pattern: RegExp,
  suggested: string,
  message: string,
  metadata: Record<string, unknown>
): RuleFindingCandidate[] {
  if (!locator) return [];
  return replacementCandidate(
    context,
    fullLocatorRange(context.footnote.contentText, locator, pattern),
    suggested,
    message,
    metadata
  );
}

export const statuteLetterStyleRule = locatorRule(
  "STATUTE_LETTER_STYLE",
  102,
  (context, section) => {
    const locator = section.letter;
    if (!locator) return [];
    const prefix = statuteSettings(context).letterStyle;
    const suggested = `${prefix} ${locator.value ?? locator.rawText}`;
    return prefixedLocatorCandidate(
      context,
      locator,
      /\b(?:lit\.|Buchst\.|Buchstabe)\s*[A-Za-z]$/i,
      suggested,
      `Die bevorzugte Buchstabendarstellung lautet „${suggested}“.`,
      { semanticValue: locator.value, expectedStyle: prefix }
    );
  }
);

function orderedQualifierRule(
  ruleId: string,
  property: "alternative" | "variant",
  setting: "alternativeStyle" | "variantStyle",
  concept: "ALTERNATIVE" | "VARIANT",
  priority: number
): FootnoteRule {
  return {
    ruleId,
    category: "citation",
    priority,
    scope: "segment",
    supportedCitationTypes: ["STATUTE"],
    evaluate(context) {
      const style = statuteSettings(context)[setting];
      const abbreviation = context.resolvedSettings.abbreviations[concept].preferredOutput;
      const tokenPattern =
        concept === "ALTERNATIVE"
          ? /(?:\d+\.\s*(?:Alt\.|Alternative)|(?:Alt\.|Alternative)\s*\d+)/i
          : /(?:\d+\.\s*(?:Var\.|Variante)|(?:Var\.|Variante)\s*\d+)/i;
      const token = findTokenRange(context, tokenPattern);
      const locator = sections(context)
        .map((section) => section[property])
        .find(Boolean);
      const value = locator?.value ?? token?.match[0].match(/\d+/)?.[0];
      if (!token || !value) return [];
      const suggested =
        style === "numberBeforeAbbreviation"
          ? `${value}. ${abbreviation}`
          : `${abbreviation} ${value}`;
      return replacementCandidate(
        context,
        token.range,
        suggested,
        `Die bevorzugte Darstellung ${property === "alternative" ? "der Alternative" : "der Variante"} lautet „${suggested}“.`,
        { semanticValue: value, expectedStyle: style }
      );
    },
  };
}

export const statuteAlternativeStyleRule = orderedQualifierRule(
  "STATUTE_ALTERNATIVE_STYLE",
  "alternative",
  "alternativeStyle",
  "ALTERNATIVE",
  103
);
export const statuteVariantStyleRule = orderedQualifierRule(
  "STATUTE_VARIANT_STYLE",
  "variant",
  "variantStyle",
  "VARIANT",
  104
);

export const statuteMultipleSectionSeparatorRule: FootnoteRule = {
  ruleId: "STATUTE_MULTIPLE_SECTION_SEPARATOR",
  category: "citation",
  priority: 105,
  scope: "segment",
  supportedCitationTypes: ["STATUTE"],
  evaluate(context) {
    const extractedSections = sections(context);
    if (extractedSections.length < 2) return [];
    const expected = statuteSettings(context).separatorBetweenMultipleSections;
    const findings: RuleFindingCandidate[] = [];
    for (let index = 1; index < extractedSections.length; index += 1) {
      const left = extractedSections[index - 1].section;
      const right = extractedSections[index].section;
      findings.push(
        ...replacementCandidate(
          context,
          { start: left.end, end: right.start },
          expected,
          `Mehrere Normen sollen durch „${expected}“ getrennt werden.`,
          { expectedSeparator: expected }
        )
      );
    }
    return findings;
  },
};

export const statuteAbbreviationStyleRule = locatorRule(
  "STATUTE_ABBREVIATION_STYLE",
  106,
  (context, section) => {
    const findings: RuleFindingCandidate[] = [];
    const definitions: Array<{
      locator: CitationLocator | undefined;
      concept: "NUMBER" | "HALF_SENTENCE";
      pattern: RegExp;
      label: string;
    }> = [
      {
        locator: section.number,
        concept: "NUMBER",
        pattern: /\b(?:Nr\.|Nummer)\s*\d+[A-Za-z]?$/i,
        label: "Nummer",
      },
      {
        locator: section.halfSentence,
        concept: "HALF_SENTENCE",
        pattern: /\b(?:Hs\.|Halbsatz)\s*\d+$/i,
        label: "Halbsatz",
      },
    ];
    for (const definition of definitions) {
      if (!definition.locator) continue;
      const preference = context.resolvedSettings.abbreviations[definition.concept];
      const suggested = `${preference.preferredOutput} ${definition.locator.value ?? definition.locator.rawText}`;
      findings.push(
        ...prefixedLocatorCandidate(
          context,
          definition.locator,
          definition.pattern,
          suggested,
          `Die bevorzugte Abkürzung für ${definition.label} lautet „${preference.preferredOutput}“.`,
          { abbreviationConcept: definition.concept }
        )
      );
    }
    return findings;
  }
);

export const statuteFollowingSuffixStyleRule = locatorRule(
  "STATUTE_FOLLOWING_SUFFIX_STYLE",
  107,
  (context, section) => {
    const findings: RuleFindingCandidate[] = [];
    const locators: CitationLocator[] = [
      section.paragraph,
      section.sentence,
      section.number,
      section.letter,
      section.halfSentence,
      section.alternative,
      section.variant,
    ].filter((locator): locator is CitationLocator => Boolean(locator));
    for (const locator of locators) {
      const semanticSuffix = locator.suffix;
      if (!semanticSuffix || !/^ff?\.?$/.test(semanticSuffix)) continue;
      const concept = semanticSuffix.startsWith("ff") ? "FOLLOWING_MULTIPLE" : "FOLLOWING";
      const preferred = context.resolvedSettings.abbreviations[concept].preferredOutput;
      const actualMatch = /ff?\.?$/.exec(locator.rawText);
      if (!actualMatch) continue;
      const range = { start: locator.end - actualMatch[0].length, end: locator.end };
      if (normalizePreferenceText(actualMatch[0]) === normalizePreferenceText(preferred)) continue;
      findings.push(
        ...replacementCandidate(
          context,
          range,
          preferred,
          `Die bevorzugte Schreibweise lautet „${preferred}“.`,
          { abbreviationConcept: concept }
        )
      );
    }
    const extractedSuffix = section.suffix;
    if (extractedSuffix) {
      const semanticSuffix = extractedSuffix.value;
      const concept = semanticSuffix === "ff." ? "FOLLOWING_MULTIPLE" : "FOLLOWING";
      const preferred = context.resolvedSettings.abbreviations[concept].preferredOutput;
      const actualMatch = /ff?\.?$/.exec(extractedSuffix.rawText);
      if (
        actualMatch &&
        normalizePreferenceText(actualMatch[0]) !== normalizePreferenceText(preferred)
      ) {
        findings.push(
          ...replacementCandidate(
            context,
            { start: extractedSuffix.end - actualMatch[0].length, end: extractedSuffix.end },
            preferred,
            `Die bevorzugte Schreibweise lautet „${preferred}“.`,
            { abbreviationConcept: concept }
          )
        );
      }
    }
    return findings;
  }
);

export const STATUTE_RULES: readonly FootnoteRule[] = [
  statuteParagraphStyleRule,
  statuteSentenceStyleRule,
  statuteLetterStyleRule,
  statuteAlternativeStyleRule,
  statuteVariantStyleRule,
  statuteMultipleSectionSeparatorRule,
  statuteAbbreviationStyleRule,
  statuteFollowingSuffixStyleRule,
];
