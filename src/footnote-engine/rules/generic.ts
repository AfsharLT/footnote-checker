import type { CitationModifierConcept } from "../../citation-settings/types";
import type { CitationLocator, CitationModifierType } from "../types";
import {
  fullLocatorRange,
  informationalCandidate,
  normalizePreferenceText,
  replacementCandidate,
} from "./helpers";
import type { FootnoteRule, RuleContext } from "./types";

const MODIFIER_CONCEPTS: Partial<Record<CitationModifierType, CitationModifierConcept>> = {
  comparison: "COMPARE",
  reference: "SEE",
  disagreement: "DIFFERENT_VIEW",
  additionalReferences: "FURTHER_REFERENCES",
  agreement: "AGREEING",
  criticism: "CRITICAL",
};

const SAFE_BOUNDARY_OPENERS = /[\s„“”‚‘’'"([{]/u;

function firstAlphabeticAtCitationBoundary(
  context: RuleContext
): { start: number; end: number } | undefined {
  if (!context.segment) return undefined;
  let cursor = context.segment.start;
  while (
    cursor < context.segment.end &&
    SAFE_BOUNDARY_OPENERS.test(context.footnote.contentText[cursor])
  ) {
    cursor += 1;
  }
  if (cursor >= context.segment.end || !/\p{L}/u.test(context.footnote.contentText[cursor])) {
    return undefined;
  }
  let before = context.segment.start - 1;
  while (before >= 0 && SAFE_BOUNDARY_OPENERS.test(context.footnote.contentText[before]))
    before -= 1;
  if (before >= 0 && context.footnote.contentText[before] !== ";") return undefined;
  return { start: cursor, end: cursor + 1 };
}

function uppercaseFirstAlphabetic(value: string): string {
  const index = value.search(/\p{L}/u);
  return index < 0
    ? value
    : `${value.slice(0, index)}${value[index].toLocaleUpperCase("de-DE")}${value.slice(index + 1)}`;
}

export const modifierStyleRule: FootnoteRule = {
  ruleId: "CITATION_MODIFIER_STYLE",
  category: "citation",
  priority: 200,
  scope: "segment",
  evaluate(context) {
    if (!context.segment) return [];
    return context.segment.modifiers.flatMap((modifier) => {
      const concept = MODIFIER_CONCEPTS[modifier.type];
      if (!concept) return [];
      const preference = context.resolvedSettings.modifiers[concept];
      const isRecognized = preference.recognizedVariants.some(
        (variant) => normalizePreferenceText(variant) === normalizePreferenceText(modifier.text)
      );
      if (!isRecognized) return [];
      const boundary = firstAlphabeticAtCitationBoundary(context);
      const preferredOutput =
        boundary && boundary.start >= modifier.start && boundary.start < modifier.end
          ? uppercaseFirstAlphabetic(preference.preferredOutput)
          : preference.preferredOutput;
      return replacementCandidate(
        context,
        modifier,
        preferredOutput,
        `Die bevorzugte Schreibweise des Zitierhinweises lautet „${preferredOutput}“.`,
        { modifierConcept: concept, expected: preferredOutput }
      );
    });
  },
};

export const citationBoundaryCapitalizationRule: FootnoteRule = {
  ruleId: "CITATION_BOUNDARY_CAPITALIZATION",
  category: "citation",
  priority: 199,
  scope: "segment",
  evaluate(context) {
    const target = firstAlphabeticAtCitationBoundary(context);
    if (!target) return [];
    const current = context.footnote.contentText.slice(target.start, target.end);
    if (current === current.toLocaleUpperCase("de-DE")) return [];
    const modifier = context.segment?.modifiers.find(
      (candidate) => candidate.start <= target.start && candidate.end >= target.end
    );
    if (modifier) {
      const concept = MODIFIER_CONCEPTS[modifier.type];
      const preference = concept ? context.resolvedSettings.modifiers[concept] : undefined;
      const recognized = preference?.recognizedVariants.some(
        (variant) => normalizePreferenceText(variant) === normalizePreferenceText(modifier.text)
      );
      if (preference && recognized) {
        return replacementCandidate(
          context,
          modifier,
          uppercaseFirstAlphabetic(preference.preferredOutput),
          "Am Beginn einer Zitiereinheit muss der erste Buchstabe großgeschrieben werden.",
          { boundary: target.start === 0 ? "FOOTNOTE_START" : "SEMICOLON" }
        );
      }
    }
    return replacementCandidate(
      context,
      target,
      current.toLocaleUpperCase("de-DE"),
      "Am Beginn einer Zitiereinheit muss der erste Buchstabe großgeschrieben werden.",
      { boundary: target.start === 0 ? "FOOTNOTE_START" : "SEMICOLON" }
    );
  },
};

export const bookAuthorTitleSeparatorRule: FootnoteRule = {
  ruleId: "BOOK_AUTHOR_TITLE_SEPARATOR",
  category: "citation",
  priority: 202,
  scope: "segment",
  evaluate(context) {
    if (!context.segment) return [];
    const match =
      /^(?:[„“”‚‘’'"([{]\s*)?(\p{Lu}[\p{L}'’.-]*(?:\/\p{Lu}[\p{L}'’.-]*)*)\s+(\p{Lu}[\p{L}][^,]{2,}),\s*((?:19|20)\d{2}),\s*(?:S\.|Seite)\s*\d/iu.exec(
        context.segment.coreText
      );
    if (!match || !match[1] || !match[2] || !match[3]) return [];
    const localAuthorStart = match[0].indexOf(match[1]);
    const position = context.segment.coreStart + localAuthorStart + match[1].length;
    return replacementCandidate(
      context,
      { start: position, end: position },
      ",",
      "Zwischen Autor und Werktitel fehlt ein Komma.",
      { detectedSourceFamily: "BOOK", separator: "," }
    );
  },
};

function locatorCandidates(context: RuleContext): Array<{
  locator: CitationLocator;
  concept: "MARGIN_NUMBER" | "PAGE";
  pattern: RegExp;
  label: string;
}> {
  const extraction = context.extraction;
  if (extraction?.type === "BOOK_CHAPTER") {
    return [
      ...extraction.data.marginNumbers.map((locator) => ({
        locator,
        concept: "MARGIN_NUMBER" as const,
        pattern: /\b(?:Rn\.|Rdnr\.|Randnummer)\s*\d+[A-Za-z]?(?:\s*ff?\.?)?$/i,
        label: "Randnummer",
      })),
      ...extraction.data.pinpointPages.map((locator) => ({
        locator,
        concept: "PAGE" as const,
        pattern: /\b(?:S\.|Seite)\s*\d+(?:\s*ff?\.?)?$/i,
        label: "Seite",
      })),
    ];
  }
  if (extraction?.type === "LEGISLATIVE_MATERIAL") {
    return extraction.data.pages.map((locator) => ({
      locator,
      concept: "PAGE" as const,
      pattern: /\b(?:S\.|Seite)\s*\d+(?:\s*ff?\.?)?$/i,
      label: "Seite",
    }));
  }
  return [];
}

export const genericAbbreviationStyleRule: FootnoteRule = {
  ruleId: "GENERIC_ABBREVIATION_STYLE",
  category: "citation",
  priority: 201,
  scope: "segment",
  supportedCitationTypes: ["BOOK_CHAPTER", "LEGISLATIVE_MATERIAL"],
  evaluate(context) {
    return locatorCandidates(context).flatMap(({ locator, concept, pattern, label }) => {
      const preference = context.resolvedSettings.abbreviations[concept];
      const range = fullLocatorRange(context.footnote.contentText, locator, pattern);
      const suffix = locator.suffix ? ` ${locator.suffix}` : "";
      return replacementCandidate(
        context,
        range,
        `${preference.preferredOutput} ${locator.value ?? locator.rawText}${suffix}`,
        `Die bevorzugte ${label}-Abkürzung lautet „${preference.preferredOutput}“.`,
        { abbreviationConcept: concept, expected: preference.preferredOutput }
      );
    });
  },
};

export const otherReviewRule: FootnoteRule = {
  ruleId: "CITATION_OTHER_REVIEW",
  category: "citation",
  priority: 210,
  scope: "segment",
  supportedCitationTypes: ["OTHER"],
  evaluate(context) {
    if (!context.segment) return [];
    if (context.sourceMapping?.status === "MATCHED") return [];
    return informationalCandidate(
      context,
      { start: context.segment.coreStart, end: context.segment.coreEnd },
      "Die Quelle konnte keinem bekannten Zitiermuster sicher zugeordnet werden und sollte manuell geprüft werden."
    );
  },
};

export const customSourcePreferredCitationRule: FootnoteRule = {
  ruleId: "CUSTOM_SOURCE_PREFERRED_CITATION",
  category: "citation",
  priority: 214,
  scope: "segment",
  supportedCitationTypes: ["OTHER", "BOOK"],
  evaluate(context) {
    if (!context.segment || context.sourceMapping?.status !== "MATCHED") return [];
    if (!["BOOK", "REPORT", "CUSTOM"].includes(context.sourceMapping.kind ?? "")) return [];
    const preferred = context.sourceMapping.preferredCitationText;
    if (!preferred || context.segment.coreText.trim() === preferred.trim()) return [];
    return replacementCandidate(
      context,
      { start: context.segment.coreStart, end: context.segment.coreEnd },
      preferred,
      "Das Zitat weicht von der hinterlegten bevorzugten vollständigen Zitierform ab.",
      { canonicalSourceId: context.sourceMapping.canonicalSourceId },
      "warning"
    );
  },
};

export const unresolvedExtractionRule: FootnoteRule = {
  ruleId: "CITATION_EXTRACTION_UNRESOLVED",
  category: "citation",
  priority: 211,
  scope: "segment",
  evaluate(context) {
    if (
      !context.segment ||
      context.extraction?.status !== "unresolved" ||
      context.extraction.type === "OTHER"
    ) {
      return [];
    }
    return informationalCandidate(
      context,
      { start: context.segment.coreStart, end: context.segment.coreEnd },
      "Die Zitierstruktur konnte nicht vollständig aufgelöst werden und sollte manuell geprüft werden."
    );
  },
};

export const ambiguousMappingRule: FootnoteRule = {
  ruleId: "SOURCE_MAPPING_AMBIGUOUS",
  category: "citation",
  priority: 212,
  scope: "segment",
  evaluate(context) {
    if (!context.segment) return [];
    const ambiguous = context.sourceMappings.find(
      (mapping) => mapping.resolution.status === "AMBIGUOUS"
    )?.resolution;
    if (!ambiguous) return [];
    return informationalCandidate(
      context,
      { start: context.segment.coreStart, end: context.segment.coreEnd },
      "Die Quelle konnte mehreren Mapping-Einträgen zugeordnet werden und sollte manuell geprüft werden.",
      { candidateCanonicalSourceIds: ambiguous.candidateCanonicalSourceIds ?? [] }
    );
  },
};

function mappedSourceText(context: RuleContext): string | undefined {
  if (context.extraction?.type === "COMMENTARY") return context.extraction.data.work?.rawText;
  if (context.extraction?.type === "JOURNAL_ARTICLE")
    return context.extraction.data.journal?.rawText;
  return context.sourceMapping?.matchedText;
}

export const uncertainLegacyMappingRule: FootnoteRule = {
  ruleId: "SOURCE_MAPPING_LEGACY_UNCERTAIN",
  category: "citation",
  priority: 213,
  scope: "segment",
  evaluate(context) {
    if (!context.segment || context.sourceMapping?.status !== "MATCHED") return [];
    if (context.sourceMapping.legacySafetyLevel !== "UNCERTAIN") return [];
    const actual = mappedSourceText(context);
    const preferred =
      context.resolvedSettings.preferredWorkName ?? context.sourceMapping.preferredName;
    // A differing name is already represented by the type-specific name rule.
    if (
      actual &&
      preferred &&
      actual !== preferred &&
      (context.extraction?.type === "COMMENTARY" || context.extraction?.type === "JOURNAL_ARTICLE")
    ) {
      return [];
    }
    return informationalCandidate(
      context,
      { start: context.segment.coreStart, end: context.segment.coreEnd },
      "Die Zuordnung basiert auf einem als unsicher gekennzeichneten Legacy-Mapping.",
      {
        canonicalSourceId: context.sourceMapping.canonicalSourceId,
        legacySafetyLevel: "UNCERTAIN",
      }
    );
  },
};

export const GENERIC_RULES: readonly FootnoteRule[] = [
  citationBoundaryCapitalizationRule,
  modifierStyleRule,
  genericAbbreviationStyleRule,
  bookAuthorTitleSeparatorRule,
  otherReviewRule,
  unresolvedExtractionRule,
  ambiguousMappingRule,
  uncertainLegacyMappingRule,
  customSourcePreferredCitationRule,
];
