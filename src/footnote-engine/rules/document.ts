import { isRangeProtected } from "../protected-ranges";
import { actualFormattingValue } from "./helpers";
import type {
  DocumentFindingCandidate,
  DocumentRule,
  DocumentRuleContext,
  RuleContext,
} from "./types";

interface TextOccurrence {
  context: RuleContext;
  start: number;
  end: number;
  value: string;
  groupKey: string;
  metadata?: Record<string, unknown>;
}

function hasLocalFinding(
  document: DocumentRuleContext,
  occurrence: TextOccurrence,
  ruleIds: readonly string[]
): boolean {
  return document.findingsSoFar.some(
    (finding) =>
      finding.footnoteId === occurrence.context.footnote.id &&
      finding.start < occurrence.end &&
      finding.end > occurrence.start &&
      ruleIds.includes(finding.ruleId)
  );
}

function sourceNameOccurrence(context: RuleContext): TextOccurrence | undefined {
  const mapping = context.sourceMapping;
  if (mapping?.status !== "MATCHED" || !mapping.canonicalSourceId) return undefined;
  const component =
    context.extraction?.type === "COMMENTARY"
      ? context.extraction.data.work
      : context.extraction?.type === "JOURNAL_ARTICLE"
        ? context.extraction.data.journal
        : undefined;
  if (!component) return undefined;
  if (isRangeProtected(component.start, component.end, context.protectedRanges)) return undefined;
  return {
    context,
    start: component.start,
    end: component.end,
    value: component.rawText,
    groupKey: mapping.canonicalSourceId,
    metadata: { canonicalSourceId: mapping.canonicalSourceId },
  };
}

function groupOccurrences(occurrences: readonly TextOccurrence[]): Map<string, TextOccurrence[]> {
  const groups = new Map<string, TextOccurrence[]>();
  for (const occurrence of occurrences) {
    const group = groups.get(occurrence.groupKey);
    if (group) group.push(occurrence);
    else groups.set(occurrence.groupKey, [occurrence]);
  }
  return groups;
}

function variants(occurrences: readonly TextOccurrence[]): Map<string, TextOccurrence[]> {
  const result = new Map<string, TextOccurrence[]>();
  for (const occurrence of occurrences) {
    const group = result.get(occurrence.value);
    if (group) group.push(occurrence);
    else result.set(occurrence.value, [occurrence]);
  }
  return result;
}

export const sourceNameConsistencyRule: DocumentRule = {
  ruleId: "SOURCE_NAME_CONSISTENCY",
  priority: 300,
  evaluate(document) {
    const groups = groupOccurrences(
      document.occurrences
        .map(sourceNameOccurrence)
        .filter((occurrence): occurrence is TextOccurrence => occurrence !== undefined)
    );
    const findings: DocumentFindingCandidate[] = [];
    groups.forEach((occurrences, canonicalSourceId) => {
      const byVariant = variants(occurrences);
      if (byVariant.size < 2) return;
      if (
        occurrences.some((occurrence) =>
          hasLocalFinding(document, occurrence, ["COMMENTARY_WORK_NAME", "JOURNAL_WORK_NAME"])
        )
      ) {
        return;
      }
      const ordered = [...byVariant.entries()].sort(
        (left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0], "de")
      );
      const dominant = ordered[0][0];
      for (const occurrence of occurrences.filter((item) => item.value !== dominant)) {
        findings.push({
          footnote: occurrence.context.footnote,
          ruleId: "SOURCE_NAME_CONSISTENCY",
          priority: 300,
          candidate: {
            category: "citation",
            start: occurrence.start,
            end: occurrence.end,
            originalText: occurrence.value,
            severity: "warning",
            message: "Die Quelle wird im Dokument uneinheitlich bezeichnet.",
            metadata: {
              canonicalSourceId,
              variants: [...byVariant.keys()].sort((left, right) =>
                left.localeCompare(right, "de")
              ),
              occurrenceCount: occurrences.length,
            },
          },
        });
      }
    });
    return findings;
  },
};

function customSourceCitationOccurrence(context: RuleContext): TextOccurrence | undefined {
  const mapping = context.sourceMapping;
  if (
    !context.segment ||
    mapping?.status !== "MATCHED" ||
    !mapping.canonicalSourceId ||
    !["BOOK", "REPORT", "CUSTOM"].includes(mapping.kind ?? "")
  )
    return undefined;
  const range = { start: context.segment.coreStart, end: context.segment.coreEnd };
  if (isRangeProtected(range.start, range.end, context.protectedRanges)) return undefined;
  return {
    context,
    ...range,
    value: context.footnote.contentText.slice(range.start, range.end).trim(),
    groupKey: mapping.canonicalSourceId,
    metadata: { canonicalSourceId: mapping.canonicalSourceId },
  };
}

export const customSourceCitationConsistencyRule: DocumentRule = {
  ruleId: "SOURCE_CITATION_VARIANT_CONSISTENCY",
  priority: 305,
  evaluate(document) {
    const groups = groupOccurrences(
      document.occurrences
        .map(customSourceCitationOccurrence)
        .filter((item): item is TextOccurrence => item !== undefined)
    );
    const findings: DocumentFindingCandidate[] = [];
    groups.forEach((occurrences, canonicalSourceId) => {
      const byVariant = variants(occurrences);
      if (byVariant.size < 2) return;
      if (
        occurrences.some((item) =>
          hasLocalFinding(document, item, ["CUSTOM_SOURCE_PREFERRED_CITATION"])
        )
      )
        return;
      const dominant = [...byVariant.entries()].sort(
        (left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0], "de")
      )[0][0];
      occurrences
        .filter((item) => item.value !== dominant)
        .forEach((occurrence) => {
          findings.push({
            footnote: occurrence.context.footnote,
            ruleId: "SOURCE_CITATION_VARIANT_CONSISTENCY",
            priority: 305,
            candidate: {
              category: "citation",
              start: occurrence.start,
              end: occurrence.end,
              originalText: occurrence.context.footnote.contentText.slice(
                occurrence.start,
                occurrence.end
              ),
              severity: "warning",
              message: "Die gleiche Quelle wird im Dokument unterschiedlich zitiert.",
              metadata: { canonicalSourceId, variants: [...byVariant.keys()].sort() },
            },
          });
        });
    });
    return findings;
  },
};

function citationStyleOccurrences(context: RuleContext): TextOccurrence[] {
  const extraction = context.extraction;
  const output: TextOccurrence[] = [];
  if (extraction?.type === "CASE_LAW") {
    const data = extraction.data;
    if (data.decisionType && data.decisionTypeNormalized) {
      if (
        !isRangeProtected(data.decisionType.start, data.decisionType.end, context.protectedRanges)
      ) {
        output.push({
          context,
          start: data.decisionType.start,
          end: data.decisionType.end,
          value: data.decisionType.rawText,
          groupKey: `decision:${data.decisionTypeNormalized}`,
        });
      }
    }
    if (data.date?.normalizedValue) {
      if (!isRangeProtected(data.date.start, data.date.end, context.protectedRanges)) {
        output.push({
          context,
          start: data.date.start,
          end: data.date.end,
          value: data.date.rawText,
          groupKey: "date:CASE_LAW",
        });
      }
    }
  }
  const locators =
    extraction?.type === "COMMENTARY"
      ? extraction.data.marginNumbers
      : extraction?.type === "BOOK"
        ? extraction.data.marginNumbers
        : extraction?.type === "BOOK_CHAPTER"
          ? extraction.data.marginNumbers
          : [];
  for (const locator of locators) {
    const token = /^(?:Rn\.|Rdnr\.|Randnummer)/i.exec(locator.rawText)?.[0];
    if (token) {
      if (isRangeProtected(locator.start, locator.start + token.length, context.protectedRanges)) {
        continue;
      }
      output.push({
        context,
        start: locator.start,
        end: locator.start + token.length,
        value: token,
        groupKey: `margin:${extraction?.type}`,
      });
    }
  }

  const persons =
    extraction?.type === "COMMENTARY" &&
    (extraction.data.personSequence?.roleResolution === "resolved" ||
      context.sourceMapping?.personStructureHint === "WORK_THEN_BEARBEITER")
      ? extraction.data.persons
      : extraction?.type === "BOOK"
        ? extraction.data.authors
        : extraction?.type === "JOURNAL_ARTICLE"
          ? extraction.data.authors
          : extraction?.type === "CASE_NOTE"
            ? extraction.data.authors
            : [];
  for (let index = 1; index < persons.length; index += 1) {
    const start = persons[index - 1].end;
    const end = persons[index].start;
    if (start >= end || isRangeProtected(start, end, context.protectedRanges)) continue;
    output.push({
      context,
      start,
      end,
      value: context.footnote.contentText.slice(start, end),
      groupKey: `personSeparator:${extraction?.type}`,
    });
  }

  const journalPinpoint =
    extraction?.type === "JOURNAL_ARTICLE"
      ? {
          firstPage: extraction.data.firstPage,
          pinpoint: extraction.data.pinpointPages[0],
          groupKey: "journalPinpoint:JOURNAL_ARTICLE",
        }
      : extraction?.type === "CASE_NOTE"
        ? {
            firstPage: extraction.data.firstPage,
            pinpoint: extraction.data.pinpointPages[0],
            groupKey: "journalPinpoint:CASE_NOTE",
          }
        : extraction?.type === "CASE_LAW"
          ? (() => {
              const publication = extraction.data.parallelCitations.find(
                (candidate) => candidate.kind === "journal"
              );
              return publication?.kind === "journal"
                ? {
                    firstPage: publication.firstPage,
                    pinpoint: publication.pinpointPages[0],
                    groupKey: "journalPinpoint:CASE_LAW",
                  }
                : undefined;
            })()
          : undefined;
  if (journalPinpoint?.firstPage && journalPinpoint.pinpoint) {
    const { firstPage, pinpoint, groupKey } = journalPinpoint;
    const start = firstPage.end;
    const hasClosingParenthesis = context.footnote.contentText[pinpoint.end] === ")";
    const end = pinpoint.end + (hasClosingParenthesis ? 1 : 0);
    if (!isRangeProtected(start, end, context.protectedRanges)) {
      output.push({
        context,
        start,
        end,
        value:
          context.footnote.contentText.slice(start, pinpoint.start).includes("(") &&
          hasClosingParenthesis
            ? "parentheses"
            : "comma",
        groupKey,
      });
    }
  }
  return output;
}

const LOCAL_STYLE_RULES = [
  "CASE_LAW_DECISION_TYPE",
  "CASE_LAW_DATE_FORMAT",
  "COMMENTARY_MARGIN_NUMBER_ABBREVIATION",
  "BOOK_MARGIN_NUMBER_ABBREVIATION",
  "GENERIC_ABBREVIATION_STYLE",
  "COMMENTARY_PERSON_SEPARATOR",
  "BOOK_PERSON_SEPARATOR",
  "JOURNAL_PERSON_SEPARATOR",
  "JOURNAL_PINPOINT_STYLE",
  "CASE_NOTE_STYLE",
  "CASE_LAW_JOURNAL_PINPOINT_STYLE",
] as const;

export const citationStyleConsistencyRule: DocumentRule = {
  ruleId: "CITATION_STYLE_CONSISTENCY",
  priority: 310,
  evaluate(document) {
    const groups = groupOccurrences(document.occurrences.flatMap(citationStyleOccurrences));
    const findings: DocumentFindingCandidate[] = [];
    groups.forEach((occurrences) => {
      const byVariant = variants(occurrences);
      if (byVariant.size < 2) return;
      // A profile-based local rule is always primary and suppresses majority-style advice.
      if (occurrences.some((item) => hasLocalFinding(document, item, LOCAL_STYLE_RULES))) return;
      const dominant = [...byVariant.entries()].sort(
        (left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0], "de")
      )[0][0];
      for (const occurrence of occurrences.filter((item) => item.value !== dominant)) {
        findings.push({
          footnote: occurrence.context.footnote,
          ruleId: "CITATION_STYLE_CONSISTENCY",
          priority: 310,
          candidate: {
            category: "citation",
            start: occurrence.start,
            end: occurrence.end,
            originalText: occurrence.value,
            severity: "info",
            message: "Diese Zitierkomponente wird im Dokument uneinheitlich dargestellt.",
            metadata: {
              semanticComponent: occurrence.groupKey,
              variants: [...byVariant.keys()].sort((left, right) =>
                left.localeCompare(right, "de")
              ),
              occurrenceCount: occurrences.length,
            },
          },
        });
      }
    });
    return findings;
  },
};

interface FormattingOccurrence extends TextOccurrence {
  actual: boolean;
  property: "bold" | "underline";
}

function formattingOccurrences(context: RuleContext): FormattingOccurrence[] {
  const extraction = context.extraction;
  const roles =
    extraction?.type === "COMMENTARY"
      ? [
          ...extraction.data.bearbeiters.map((person) => ({ person, role: "bearbeiter" })),
          ...extraction.data.editors.map((person) => ({ person, role: "editor" })),
        ]
      : extraction?.type === "BOOK"
        ? extraction.data.authors.map((person) => ({ person, role: "author" }))
        : extraction?.type === "JOURNAL_ARTICLE"
          ? extraction.data.authors.map((person) => ({ person, role: "author" }))
          : [];
  const sourceId = context.sourceMapping?.canonicalSourceId ?? extraction?.type ?? "unknown";
  const output: FormattingOccurrence[] = [];
  for (const { person, role } of roles) {
    if (isRangeProtected(person.start, person.end, context.protectedRanges)) continue;
    for (const property of ["bold", "underline"] as const) {
      const preference =
        context.resolvedSettings.formatting[role as "author" | "bearbeiter" | "editor"];
      if (preference[property] !== undefined) continue;
      const actual = actualFormattingValue(context.footnote, person.start, person.end, property);
      if (typeof actual !== "boolean") continue;
      output.push({
        context,
        start: person.start,
        end: person.end,
        value: String(actual),
        actual,
        property,
        groupKey: `${sourceId}:${role}:${property}`,
        metadata: { role, canonicalSourceId: context.sourceMapping?.canonicalSourceId },
      });
    }
  }
  return output;
}

export const formattingConsistencyRule: DocumentRule = {
  ruleId: "FORMATTING_CONSISTENCY",
  priority: 320,
  evaluate(document) {
    const groups = groupOccurrences(document.occurrences.flatMap(formattingOccurrences));
    const findings: DocumentFindingCandidate[] = [];
    groups.forEach((occurrences) => {
      const byVariant = variants(occurrences);
      if (byVariant.size < 2) return;
      const dominant = [...byVariant.entries()].sort(
        (left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0], "de")
      )[0][0];
      for (const occurrence of occurrences.filter((item) => item.value !== dominant)) {
        const item = occurrence as FormattingOccurrence;
        findings.push({
          footnote: occurrence.context.footnote,
          ruleId: "FORMATTING_CONSISTENCY",
          priority: 320,
          candidate: {
            category: "formatting",
            start: occurrence.start,
            end: occurrence.end,
            originalText: occurrence.context.footnote.contentText.slice(
              occurrence.start,
              occurrence.end
            ),
            severity: "info",
            message: "Die Formatierung dieser Rolle ist im Dokument uneinheitlich.",
            metadata: {
              ...occurrence.metadata,
              formattingProperty: item.property,
              actual: item.actual,
              variants: [...byVariant.keys()],
              occurrenceCount: occurrences.length,
            },
          },
        });
      }
    });
    return findings;
  },
};

export const DOCUMENT_RULES: readonly DocumentRule[] = [
  sourceNameConsistencyRule,
  customSourceCitationConsistencyRule,
  citationStyleConsistencyRule,
  formattingConsistencyRule,
];
