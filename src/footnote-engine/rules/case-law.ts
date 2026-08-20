import type { CaseLawCitationSettings, PinpointStyle } from "../../citation-settings/types";
import type { CaseLawPublicationReference, CitationLocator } from "../types";
import { formatNormalizedDate, replacementCandidate, separatorBetween } from "./helpers";
import type { FootnoteRule, RuleContext, RuleFindingCandidate } from "./types";

function settings(context: RuleContext): CaseLawCitationSettings {
  return context.resolvedSettings.settings as CaseLawCitationSettings;
}

function caseData(context: RuleContext) {
  return context.extraction?.type === "CASE_LAW" ? context.extraction.data : undefined;
}

export const caseLawDecisionTypeRule: FootnoteRule = {
  ruleId: "CASE_LAW_DECISION_TYPE",
  category: "citation",
  priority: 120,
  scope: "segment",
  supportedCitationTypes: ["CASE_LAW"],
  evaluate(context) {
    const data = caseData(context);
    const normalized = data?.decisionTypeNormalized;
    if (!data?.decisionType || !normalized || normalized === "OTHER") return [];
    const preferred = settings(context).decisionTypeOutput[normalized];
    return replacementCandidate(
      context,
      data.decisionType,
      preferred,
      `Die bevorzugte Abkürzung für ${normalized === "JUDGMENT" ? "ein Urteil" : normalized === "ORDER" ? "einen Beschluss" : "eine Entscheidung"} lautet „${preferred}“.`,
      { decisionType: normalized, preferredOutput: preferred }
    );
  },
};

export const caseLawDateIntroducerRule: FootnoteRule = {
  ruleId: "CASE_LAW_DATE_INTRODUCER",
  category: "citation",
  priority: 121,
  scope: "segment",
  supportedCitationTypes: ["CASE_LAW"],
  evaluate(context) {
    const data = caseData(context);
    if (!context.segment || !data?.date) return [];
    const prefixStart = Math.max(context.segment.start, data.date.start - 12);
    const prefix = context.footnote.contentText.slice(prefixStart, data.date.start);
    const match = /\b(?:vom|v\.)\s*$/i.exec(prefix);
    if (!match) return [];
    const token = match[0].trimEnd();
    const start = prefixStart + match.index;
    const end = start + token.length;
    const preferred = settings(context).dateIntroducer;
    return replacementCandidate(
      context,
      { start, end },
      preferred,
      `Der bevorzugte Datumseinleiter lautet „${preferred}“.`,
      { expected: preferred }
    );
  },
};

export const caseLawDateFormatRule: FootnoteRule = {
  ruleId: "CASE_LAW_DATE_FORMAT",
  category: "citation",
  priority: 122,
  scope: "segment",
  supportedCitationTypes: ["CASE_LAW"],
  evaluate(context) {
    const data = caseData(context);
    if (!data?.date || !data.normalizedDate) return [];
    const expectedFormat = settings(context).dateFormat;
    const preferred = formatNormalizedDate(data.normalizedDate, expectedFormat);
    if (!preferred) return [];
    return replacementCandidate(
      context,
      data.date,
      preferred,
      `Das Datum entspricht nicht dem eingestellten Format ${expectedFormat}.`,
      { normalizedDate: data.normalizedDate, expectedFormat }
    );
  },
};

export const caseLawDocketSeparatorRule: FootnoteRule = {
  ruleId: "CASE_LAW_DOCKET_SEPARATOR",
  category: "citation",
  priority: 123,
  scope: "segment",
  supportedCitationTypes: ["CASE_LAW"],
  evaluate(context) {
    const data = caseData(context);
    if (
      !data?.date ||
      !data.docketNumber ||
      (data.citationForm !== "DIRECT" && data.citationForm !== "HYBRID")
    ) {
      return [];
    }
    const between = separatorBetween(context.footnote.contentText, data.date, data.docketNumber);
    if (!between || !between.text.trim()) return [];
    const preferred = settings(context).directCitation.separatorBeforeDocket;
    return replacementCandidate(
      context,
      between.range,
      preferred,
      `Vor dem Aktenzeichen soll der Trenner „${preferred}“ stehen.`,
      { expectedSeparator: preferred }
    );
  },
};

function publicationStart(publication: CaseLawPublicationReference): number {
  return publication.kind === "journal"
    ? publication.journal.start
    : publication.kind === "officialCollection"
      ? publication.collection.start
      : publication.database.start;
}

export const caseLawParallelSeparatorRule: FootnoteRule = {
  ruleId: "CASE_LAW_PARALLEL_SEPARATOR",
  category: "citation",
  priority: 124,
  scope: "segment",
  supportedCitationTypes: ["CASE_LAW"],
  evaluate(context) {
    const data = caseData(context);
    if (
      data?.citationForm !== "HYBRID" ||
      !data.docketNumber ||
      data.parallelCitations.length === 0
    ) {
      return [];
    }
    const firstPublication = [...data.parallelCitations].sort(
      (left, right) => publicationStart(left) - publicationStart(right)
    )[0];
    const between = separatorBetween(context.footnote.contentText, data.docketNumber, {
      start: publicationStart(firstPublication),
    });
    if (!between || !between.text.trim()) return [];
    const preferred = settings(context).hybridCitation.parallelCitationSeparator;
    return replacementCandidate(
      context,
      between.range,
      preferred,
      `Parallelfundstellen sollen durch „${preferred}“ getrennt werden.`,
      { expectedSeparator: preferred }
    );
  },
};

function pinpointCandidate(
  context: RuleContext,
  firstPage: CitationLocator | undefined,
  pinpointPages: CitationLocator[],
  expectedStyle: PinpointStyle,
  message: string
): RuleFindingCandidate[] {
  const pinpoint = pinpointPages[0];
  if (!firstPage || !pinpoint) return [];
  const text = context.footnote.contentText;
  const between = text.slice(firstPage.end, pinpoint.start);
  const closingParenthesis = text[pinpoint.end] === ")";
  const actualStyle: PinpointStyle =
    between.includes("(") && closingParenthesis ? "parentheses" : "comma";
  if (actualStyle === expectedStyle) return [];
  if (expectedStyle === "parentheses") {
    return replacementCandidate(
      context,
      { start: firstPage.end, end: pinpoint.end },
      ` (${pinpoint.rawText})`,
      message,
      { expectedStyle, actualStyle }
    );
  }
  const start = between.includes("(") ? firstPage.end : pinpoint.start;
  const end = closingParenthesis ? pinpoint.end + 1 : pinpoint.end;
  return replacementCandidate(context, { start, end }, `, ${pinpoint.rawText}`, message, {
    expectedStyle,
    actualStyle,
  });
}

function pinpointRule(
  ruleId: string,
  kind: "journal" | "officialCollection",
  priority: number
): FootnoteRule {
  return {
    ruleId,
    category: "citation",
    priority,
    scope: "segment",
    supportedCitationTypes: ["CASE_LAW"],
    evaluate(context) {
      const data = caseData(context);
      const publication = data?.parallelCitations.find((candidate) => candidate.kind === kind);
      if (!publication || publication.kind === "database") return [];
      const expectedStyle =
        kind === "journal"
          ? settings(context).journalCitation.pinpointStyle
          : settings(context).officialCollectionCitation.pinpointStyle;
      return pinpointCandidate(
        context,
        publication.firstPage,
        publication.pinpointPages,
        expectedStyle,
        `Die konkrete Fundstelle soll ${expectedStyle === "parentheses" ? "in Klammern" : "mit Komma"} angegeben werden.`
      );
    },
  };
}

export const caseLawJournalPinpointStyleRule = pinpointRule(
  "CASE_LAW_JOURNAL_PINPOINT_STYLE",
  "journal",
  125
);
export const caseLawOfficialPinpointStyleRule = pinpointRule(
  "CASE_LAW_OFFICIAL_COLLECTION_PINPOINT_STYLE",
  "officialCollection",
  126
);

export const CASE_LAW_RULES: readonly FootnoteRule[] = [
  caseLawDecisionTypeRule,
  caseLawDateIntroducerRule,
  caseLawDateFormatRule,
  caseLawDocketSeparatorRule,
  caseLawParallelSeparatorRule,
  caseLawJournalPinpointStyleRule,
  caseLawOfficialPinpointStyleRule,
];
