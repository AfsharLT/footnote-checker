import type { CommentaryCitationSettings } from "../../citation-settings/types";
import { absoluteContentRangeFromSegment } from "../offsets";
import {
  formattingCandidates,
  fullLocatorRange,
  informationalCandidate,
  mappedCommentaryBearbeiterCandidates,
  replacementCandidate,
  separatorBetween,
} from "./helpers";
import type { FootnoteRule, RuleContext, RuleFindingCandidate } from "./types";

function data(context: RuleContext) {
  return context.extraction?.type === "COMMENTARY" ? context.extraction.data : undefined;
}

function settings(context: RuleContext): CommentaryCitationSettings {
  return context.resolvedSettings.settings as CommentaryCitationSettings;
}

export const commentaryWorkNameRule: FootnoteRule = {
  ruleId: "COMMENTARY_WORK_NAME",
  category: "citation",
  priority: 140,
  scope: "segment",
  supportedCitationTypes: ["COMMENTARY"],
  evaluate(context) {
    const mapping = context.sourceMapping;
    if (mapping?.status !== "MATCHED") return [];
    const extractedWork = data(context)?.work;
    const structuredWork =
      mapping.matchSource === "STRUCTURED_ALIAS" &&
      mapping.matchedWorkText &&
      mapping.matchedWorkRange &&
      context.footnote.contentText.slice(
        mapping.matchedWorkRange.start,
        mapping.matchedWorkRange.end
      ) === mapping.matchedWorkText
        ? {
            rawText: mapping.matchedWorkText,
            value: mapping.matchedWorkText,
            ...mapping.matchedWorkRange,
          }
        : undefined;
    const fallbackWork =
      !extractedWork &&
      mapping.matchSource === "COMMENTARY_PREFIX" &&
      mapping.matchedText &&
      mapping.matchedRange &&
      context.footnote.contentText.slice(mapping.matchedRange.start, mapping.matchedRange.end) ===
        mapping.matchedText
        ? {
            rawText: mapping.matchedText,
            value: mapping.matchedText,
            ...mapping.matchedRange,
          }
        : undefined;
    const work = structuredWork ?? extractedWork ?? fallbackWork;
    if (!work) return [];
    const preferred = context.resolvedSettings.preferredWorkName ?? mapping.preferredName;
    if (!preferred || work.rawText === preferred) return [];
    const metadata = {
      canonicalSourceId: mapping.canonicalSourceId,
      preferredName: preferred,
      legacySafetyLevel: mapping.legacySafetyLevel,
    };
    if (mapping.legacySafetyLevel === "UNCERTAIN" && fallbackWork) return [];
    return mapping.legacySafetyLevel === "UNCERTAIN"
      ? informationalCandidate(
          context,
          work,
          "Die verwendete Werkbezeichnung weicht von der bevorzugten Bezeichnung ab; das Legacy-Mapping ist als unsicher gekennzeichnet.",
          metadata
        )
      : replacementCandidate(
          context,
          work,
          preferred,
          `Die bevorzugte Werkbezeichnung lautet „${preferred}“.`,
          metadata
        );
  },
};

export const commentaryPersonSeparatorRule: FootnoteRule = {
  ruleId: "COMMENTARY_PERSON_SEPARATOR",
  category: "citation",
  priority: 141,
  scope: "segment",
  supportedCitationTypes: ["COMMENTARY"],
  evaluate(context) {
    const extraction = data(context);
    const mappedPersons = mappedCommentaryBearbeiterCandidates(context);
    if (!extraction?.personSequence && mappedPersons.length === 0) return [];
    const safelyResolvedByMapping =
      context.sourceMapping?.personStructureHint === "WORK_THEN_BEARBEITER" ||
      context.sourceMapping?.personStructureHint === "BEARBEITER_THEN_WORK";
    if (
      mappedPersons.length === 0 &&
      extraction!.personSequence!.roleResolution !== "resolved" &&
      !safelyResolvedByMapping
    ) {
      return [];
    }
    const persons = mappedPersons.length > 0 ? mappedPersons : extraction!.personSequence!.persons;
    const expected = settings(context).personSeparator;
    const findings: RuleFindingCandidate[] = [];
    for (let index = 1; index < persons.length; index += 1) {
      const between = separatorBetween(
        context.footnote.contentText,
        persons[index - 1],
        persons[index]
      );
      if (!between) continue;
      findings.push(
        ...replacementCandidate(
          context,
          between.range,
          expected,
          `Personen sollen durch „${expected}“ getrennt werden.`,
          { expectedSeparator: expected }
        )
      );
    }
    return findings;
  },
};

export const commentaryMarginNumberRule: FootnoteRule = {
  ruleId: "COMMENTARY_MARGIN_NUMBER_ABBREVIATION",
  category: "citation",
  priority: 142,
  scope: "segment",
  supportedCitationTypes: ["COMMENTARY"],
  evaluate(context) {
    const expected = settings(context).marginNumberAbbreviation;
    const extracted = data(context)?.marginNumbers ?? [];
    if (extracted.length === 0 && context.segment && context.sourceMapping?.kind === "COMMENTARY") {
      const pattern = /\b(?:Rn\.|Rdn\.|Rdnr\.|Randnummer)\s*(\d+[A-Za-z]?)(?:\s*(ff?\.?))?/gi;
      return Array.from(context.segment.originalText.matchAll(pattern)).flatMap((match) => {
        const range = absoluteContentRangeFromSegment(
          context.segment!,
          match.index ?? -1,
          (match.index ?? -1) + match[0].length,
          "segment"
        );
        if (!range) return [];
        return replacementCandidate(
          context,
          range,
          `${expected} ${match[1]}${match[2] ? ` ${match[2]}` : ""}`,
          `Die bevorzugte Randnummer-Abkürzung lautet „${expected}“.`,
          { abbreviationConcept: "MARGIN_NUMBER", expected }
        );
      });
    }
    return extracted.flatMap((locator) => {
      const range = fullLocatorRange(
        context.footnote.contentText,
        locator,
        /\b(?:Rn\.|Rdn\.|Rdnr\.|Randnummer)\s*\d+[A-Za-z]?(?:\s*ff?\.)?$/i
      );
      const value = locator.value ?? locator.rawText;
      const suffix = locator.suffix ? ` ${locator.suffix}` : "";
      return replacementCandidate(
        context,
        range,
        `${expected} ${value}${suffix}`,
        `Die bevorzugte Randnummer-Abkürzung lautet „${expected}“.`,
        { abbreviationConcept: "MARGIN_NUMBER", expected }
      );
    });
  },
};

export const commentaryFormattingRule: FootnoteRule = {
  ruleId: "COMMENTARY_FORMATTING",
  category: "formatting",
  priority: 143,
  scope: "segment",
  supportedCitationTypes: ["COMMENTARY"],
  evaluate(context) {
    const extraction = data(context);
    const findings: RuleFindingCandidate[] = [];
    for (const person of context.sourceMapping?.matchSource === "STRUCTURED_ALIAS"
      ? []
      : (extraction?.persons ?? [])) {
      if (person.role === "bearbeiter") {
        findings.push(
          ...formattingCandidates(
            context,
            person,
            settings(context).bearbeiterFormatting,
            "Der Bearbeiter"
          )
        );
      } else if (person.role === "editor") {
        findings.push(
          ...formattingCandidates(
            context,
            person,
            settings(context).editorFormatting,
            "Der Herausgeber"
          )
        );
      }
    }
    for (const mappedBearbeiter of mappedCommentaryBearbeiterCandidates(context)) {
      findings.push(
        ...formattingCandidates(
          context,
          mappedBearbeiter,
          settings(context).bearbeiterFormatting,
          "Der Bearbeiter",
          "bearbeiter"
        ).map((candidate) => ({
          ...candidate,
          metadata: {
            ...candidate.metadata,
            roleResolutionSource: "SOURCE_MAPPING_HINT",
            requiresManualReview: true,
          },
        }))
      );
    }
    if (extraction?.work) {
      findings.push(
        ...formattingCandidates(
          context,
          extraction.work,
          context.resolvedSettings.formatting.workTitle,
          "Der Werktitel"
        )
      );
    }
    return findings;
  },
};

export const COMMENTARY_RULES: readonly FootnoteRule[] = [
  commentaryWorkNameRule,
  commentaryPersonSeparatorRule,
  commentaryMarginNumberRule,
  commentaryFormattingRule,
];
