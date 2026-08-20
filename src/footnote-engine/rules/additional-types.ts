import type {
  AdministrativeMaterialCitationSettings,
  BookChapterCitationSettings,
  CaseNoteCitationSettings,
  LegislativeMaterialCitationSettings,
  OnlineSourceCitationSettings,
  PinpointStyle,
} from "../../citation-settings/types";
import type { CitationLocator } from "../types";
import { formatNormalizedDate, formattingCandidates, replacementCandidate } from "./helpers";
import type { FootnoteRule, RuleContext, RuleFindingCandidate } from "./types";

function pinpointCandidate(
  context: RuleContext,
  firstPage: { start: number; end: number; rawText: string } | undefined,
  pinpoint: CitationLocator | undefined,
  expectedStyle: PinpointStyle
): RuleFindingCandidate[] {
  if (!firstPage || !pinpoint || firstPage.start === pinpoint.start) return [];
  const text = context.footnote.contentText;
  const between = text.slice(firstPage.end, pinpoint.start);
  const closingParenthesis = text[pinpoint.end] === ")";
  const actualStyle: PinpointStyle =
    between.includes("(") && closingParenthesis ? "parentheses" : "comma";
  if (actualStyle === expectedStyle) return [];
  const message = `Die konkrete Fundstelle soll ${expectedStyle === "parentheses" ? "in Klammern" : "mit Komma"} angegeben werden.`;
  return expectedStyle === "parentheses"
    ? replacementCandidate(
        context,
        { start: firstPage.end, end: pinpoint.end },
        ` (${pinpoint.rawText})`,
        message,
        { expectedStyle, actualStyle }
      )
    : replacementCandidate(
        context,
        { start: firstPage.end, end: closingParenthesis ? pinpoint.end + 1 : pinpoint.end },
        `, ${pinpoint.rawText}`,
        message,
        { expectedStyle, actualStyle }
      );
}

export const caseNoteRule: FootnoteRule = {
  ruleId: "CASE_NOTE_STYLE",
  category: "citation",
  priority: 190,
  scope: "segment",
  supportedCitationTypes: ["CASE_NOTE"],
  evaluate(context) {
    if (context.extraction?.type !== "CASE_NOTE") return [];
    const settings = context.resolvedSettings.settings as CaseNoteCitationSettings;
    const data = context.extraction.data;
    const findings: RuleFindingCandidate[] = [];
    findings.push(
      ...data.authors.flatMap((author) =>
        formattingCandidates(context, author, settings.authorFormatting, "Der Autor")
      )
    );
    if (data.noteMarker) {
      findings.push(
        ...replacementCandidate(
          context,
          data.noteMarker,
          settings.preferredNoteMarker,
          `Der bevorzugte Anmerkungshinweis lautet „${settings.preferredNoteMarker}“.`,
          { expected: settings.preferredNoteMarker }
        )
      );
    }
    findings.push(
      ...pinpointCandidate(
        context,
        data.firstPage,
        data.pinpointPages[0],
        settings.journalPinpointStyle
      )
    );
    return findings;
  },
};

export const bookChapterRule: FootnoteRule = {
  ruleId: "BOOK_CHAPTER_STYLE",
  category: "citation",
  priority: 191,
  scope: "segment",
  supportedCitationTypes: ["BOOK_CHAPTER"],
  evaluate(context) {
    if (context.extraction?.type !== "BOOK_CHAPTER" || !context.segment) return [];
    const settings = context.resolvedSettings.settings as BookChapterCitationSettings;
    const data = context.extraction.data;
    const findings: RuleFindingCandidate[] = [
      ...data.authors.flatMap((author) =>
        formattingCandidates(context, author, settings.authorFormatting, "Der Autor")
      ),
      ...data.editors.flatMap((editor) =>
        formattingCandidates(context, editor, settings.editorFormatting, "Der Herausgeber")
      ),
    ];
    const inMatch = /\bin\s*:/i.exec(context.segment.originalText);
    if (inMatch) {
      const start = context.segment.start + inMatch.index;
      findings.push(
        ...replacementCandidate(
          context,
          { start, end: start + inMatch[0].length },
          settings.inToken,
          `Der bevorzugte Einleitungstext lautet „${settings.inToken}“.`,
          { expected: settings.inToken }
        )
      );
    }
    if (settings.pinpointStyle !== "pagePrefix") {
      findings.push(
        ...pinpointCandidate(
          context,
          data.firstPage,
          data.pinpointPages.find((page) => page.start !== data.firstPage?.start),
          settings.pinpointStyle
        )
      );
    }
    if (data.containerTitle) {
      findings.push(
        ...formattingCandidates(
          context,
          data.containerTitle,
          context.resolvedSettings.formatting.workTitle,
          "Der Werktitel"
        )
      );
    }
    return findings;
  },
};

export const legislativeMaterialRule: FootnoteRule = {
  ruleId: "LEGISLATIVE_MATERIAL_PREFIX",
  category: "citation",
  priority: 192,
  scope: "segment",
  supportedCitationTypes: ["LEGISLATIVE_MATERIAL"],
  evaluate(context) {
    if (context.extraction?.type !== "LEGISLATIVE_MATERIAL") return [];
    const data = context.extraction.data;
    const settings = context.resolvedSettings.settings as LegislativeMaterialCitationSettings;
    if (!data.body || !data.documentType) return [];
    const prefix =
      data.body.value === "BT"
        ? settings.BundestagDocumentPrefix
        : settings.BundesratDocumentPrefix;
    return replacementCandidate(
      context,
      { start: data.body.start, end: data.documentType.end },
      prefix,
      `Die bevorzugte Drucksachen-Abkürzung lautet „${prefix}“.`,
      { expected: prefix, body: data.body.value }
    );
  },
};

function dateIntroducerCandidate(
  context: RuleContext,
  date: { start: number; end: number; rawText: string; normalizedValue?: string },
  preferred: string,
  labelPattern: RegExp,
  message: string
): RuleFindingCandidate[] {
  if (!context.segment) return [];
  const prefixStart = Math.max(context.segment.start, date.start - 32);
  const prefix = context.footnote.contentText.slice(prefixStart, date.start);
  const match = labelPattern.exec(prefix);
  if (!match) return [];
  const raw = match[0].trimEnd();
  const start = prefixStart + match.index;
  return replacementCandidate(context, { start, end: start + raw.length }, preferred, message, {
    expected: preferred,
  });
}

export const onlineSourceRule: FootnoteRule = {
  ruleId: "ONLINE_SOURCE_ACCESS_DATE",
  category: "citation",
  priority: 193,
  scope: "segment",
  supportedCitationTypes: ["ONLINE_SOURCE"],
  evaluate(context) {
    if (context.extraction?.type !== "ONLINE_SOURCE") return [];
    const date = context.extraction.data.accessDate;
    if (!date) return [];
    const settings = context.resolvedSettings.settings as OnlineSourceCitationSettings;
    const findings = dateIntroducerCandidate(
      context,
      date,
      settings.accessDateLabel,
      /(?:zuletzt\s+abgerufen\s+am|abgerufen\s+am|letzter\s+Aufruf\s+am)\s*$/i,
      `Der bevorzugte Hinweis zum Abrufdatum lautet „${settings.accessDateLabel}“.`
    );
    const normalizedDate = date.normalizedValue;
    const preferredDate = normalizedDate
      ? formatNormalizedDate(normalizedDate, settings.dateFormat)
      : undefined;
    return preferredDate
      ? [
          ...findings,
          ...replacementCandidate(
            context,
            date,
            preferredDate,
            `Das Abrufdatum entspricht nicht dem eingestellten Format ${settings.dateFormat}.`,
            { normalizedDate, expectedFormat: settings.dateFormat }
          ),
        ]
      : findings;
  },
};

export const administrativeMaterialRule: FootnoteRule = {
  ruleId: "ADMINISTRATIVE_MATERIAL_DATE",
  category: "citation",
  priority: 194,
  scope: "segment",
  supportedCitationTypes: ["ADMINISTRATIVE_MATERIAL"],
  evaluate(context) {
    if (context.extraction?.type !== "ADMINISTRATIVE_MATERIAL") return [];
    const date = context.extraction.data.date;
    if (!date) return [];
    const settings = context.resolvedSettings.settings as AdministrativeMaterialCitationSettings;
    const findings = dateIntroducerCandidate(
      context,
      date,
      settings.dateIntroducer,
      /(?:vom|v\.)\s*$/i,
      `Der bevorzugte Datumseinleiter lautet „${settings.dateIntroducer}“.`
    );
    const preferredDate = date.normalizedValue
      ? formatNormalizedDate(date.normalizedValue, settings.dateFormat)
      : undefined;
    return preferredDate
      ? [
          ...findings,
          ...replacementCandidate(
            context,
            date,
            preferredDate,
            `Das Datum entspricht nicht dem eingestellten Format ${settings.dateFormat}.`,
            { normalizedDate: date.normalizedValue, expectedFormat: settings.dateFormat }
          ),
        ]
      : findings;
  },
};

export const ADDITIONAL_TYPE_RULES: readonly FootnoteRule[] = [
  caseNoteRule,
  bookChapterRule,
  legislativeMaterialRule,
  onlineSourceRule,
  administrativeMaterialRule,
];
