/* global performance */

import type {
  Finding,
  FindingCategory,
  FindingSeverity,
  FootnoteEngineResult,
  FootnoteParseResult,
} from "../footnote-engine/types";
import type { ReviewClass, ReviewDecisionState, ReviewItem, ReviewStatus } from "../review-engine";
import type { FootnoteSnapshot } from "./taskpane";

export const RULE_TITLES: Readonly<Record<string, string>> = {
  FINAL_PERIOD: "Schlusspunkt",
  EMPTY_FOOTNOTE: "Leere Fußnote",
  CASE_LAW_DECISION_TYPE: "Entscheidungsart",
  CASE_LAW_DATE_INTRODUCER: "Datumseinleitung",
  CASE_LAW_DATE_FORMAT: "Datumsformat",
  COMMENTARY_WORK_NAME: "Werkbezeichnung",
  COMMENTARY_MARGIN_NUMBER_ABBREVIATION: "Randnummer",
  COMMENTARY_FORMATTING: "Formatierung Bearbeiter",
  FORMAT_FONT_NAME: "Schriftart",
  FORMAT_FONT_SIZE: "Schriftgröße",
  FORMAT_BOLD: "Fettformatierung",
  FORMAT_ITALIC_REVIEW: "Kursivformatierung prüfen",
  FORMAT_UNDERLINE: "Unterstreichung",
  FORMAT_STRIKE: "Durchstreichung",
  FORMAT_SUPERSCRIPT: "Hochstellung",
  FORMAT_SUBSCRIPT: "Tiefstellung",
  FORMAT_CHARACTER_SPACING: "Zeichenabstand",
  SOURCE_MAPPING_LEGACY_UNCERTAIN: "Quellenzuordnung prüfen",
  SOURCE_MAPPING_AMBIGUOUS: "Quellenzuordnung prüfen",
  SOURCE_MAPPING_UNMATCHED: "Quelle prüfen",
  CITATION_OTHER_REVIEW: "Quelle manuell prüfen",
  CITATION_BOUNDARY_CAPITALIZATION: "Großschreibung am Zitatbeginn",
  BOOK_AUTHOR_TITLE_SEPARATOR: "Komma zwischen Autor und Werktitel",
  CITATION_STYLE_CONSISTENCY: "Zitierweise vereinheitlichen",
  SOURCE_NAME_CONSISTENCY: "Werkbezeichnung vereinheitlichen",
  SOURCE_CITATION_VARIANT_CONSISTENCY: "Zitierweise dieser Quelle prüfen",
  FORMATTING_CONSISTENCY: "Formatierung vereinheitlichen",
  RULE_OUTPUT_INVALID: "Technischen Prüfhinweis untersuchen",
};

export const CATEGORY_LABELS: Record<FindingCategory, string> = {
  punctuation: "Zeichensetzung",
  citation: "Zitation",
  formatting: "Formatierung",
  structure: "Struktur",
  content: "Inhalt",
  technical: "Technisch",
};

export const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  error: "Fehler",
  warning: "Warnung",
  info: "Info",
};

export interface ReviewFilters {
  severity: "ALL" | FindingSeverity;
  reviewClass: "ALL" | ReviewClass;
  status: "ALL" | ReviewStatus;
  category: "ALL" | FindingCategory;
  search: string;
  onlyWithFindings: boolean;
}

export const DEFAULT_REVIEW_FILTERS: ReviewFilters = {
  severity: "ALL",
  reviewClass: "ALL",
  status: "ALL",
  category: "ALL",
  search: "",
  onlyWithFindings: false,
};

export interface ReviewFootnoteGroup {
  footnote: FootnoteSnapshot;
  items: ReviewItem[];
  totalItemCount: number;
  accountingStatus: "FINDINGS" | "CLEAN" | "PARTIAL";
}

export function getRuleTitle(ruleId: string): string {
  return RULE_TITLES[ruleId] ?? "Prüfhinweis";
}

export function citationPreviewForFinding(
  finding: Finding,
  engineResult: FootnoteEngineResult
): string | undefined {
  if (!finding.citationItemId) return undefined;
  const parseResult = engineResult.parseResults.find(
    (candidate) => candidate.footnoteId === finding.footnoteId
  );
  const item = parseResult?.sequences
    ?.flatMap((sequence) => sequence.items)
    .find((candidate) => candidate.id === finding.citationItemId);
  if (!item) return undefined;
  if (
    finding.citationStart !== undefined &&
    (item.start !== finding.citationStart || item.end !== finding.citationEnd)
  ) {
    return undefined;
  }
  return item.rawText;
}

function searchableText(item: ReviewItem, footnote: FootnoteSnapshot | undefined): string {
  return [
    footnote?.ordinal,
    footnote ? `Fußnote ${footnote.ordinal}` : undefined,
    footnote?.displayLabel,
    item.finding.originalText,
    item.finding.suggestedText,
    item.finding.message,
    getRuleTitle(item.finding.ruleId),
    footnote?.contentText,
  ]
    .filter((part) => part !== undefined)
    .join(" ")
    .toLocaleLowerCase("de-DE");
}

export function filterReviewItems(
  items: readonly ReviewItem[],
  footnotes: readonly FootnoteSnapshot[],
  filters: ReviewFilters
): ReviewItem[] {
  const footnotesById = new Map(footnotes.map((footnote) => [footnote.id, footnote] as const));
  const search = filters.search.trim().toLocaleLowerCase("de-DE");
  return items.filter(
    (item) =>
      (filters.severity === "ALL" || item.finding.severity === filters.severity) &&
      (filters.reviewClass === "ALL" || item.reviewClass === filters.reviewClass) &&
      (filters.status === "ALL" || item.decision.effectiveStatus === filters.status) &&
      (filters.category === "ALL" || item.finding.category === filters.category) &&
      (search === "" ||
        searchableText(item, footnotesById.get(item.finding.footnoteId)).includes(search))
  );
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = { error: 0, warning: 1, info: 2 };

export function groupReviewItems(
  items: readonly ReviewItem[],
  footnotes: readonly FootnoteSnapshot[],
  options: {
    includeEmpty?: boolean;
    allItems?: readonly ReviewItem[];
    parseResults?: readonly FootnoteParseResult[];
  } = {}
): ReviewFootnoteGroup[] {
  const grouped = new Map<string, ReviewItem[]>();
  const allGrouped = new Map<string, ReviewItem[]>();
  for (const item of items) {
    const current = grouped.get(item.finding.footnoteId);
    if (current) current.push(item);
    else grouped.set(item.finding.footnoteId, [item]);
  }
  for (const item of options.allItems ?? items) {
    const current = allGrouped.get(item.finding.footnoteId);
    if (current) current.push(item);
    else allGrouped.set(item.finding.footnoteId, [item]);
  }
  const parseResultsById = new Map(
    (options.parseResults ?? []).map((result) => [result.footnoteId, result] as const)
  );
  return footnotes
    .filter((footnote) => options.includeEmpty || grouped.has(footnote.id))
    .map((footnote) => {
      const totalItemCount = allGrouped.get(footnote.id)?.length ?? 0;
      const parseResult = parseResultsById.get(footnote.id);
      const partial =
        (footnote.readStatus !== undefined && footnote.readStatus !== "complete") ||
        (parseResult?.segmentationStatus !== undefined &&
          parseResult.segmentationStatus !== "recognized");
      return {
        footnote,
        items: [...(grouped.get(footnote.id) ?? [])].sort(
          (left, right) =>
            SEVERITY_ORDER[left.finding.severity] - SEVERITY_ORDER[right.finding.severity] ||
            left.finding.start - right.finding.start ||
            left.finding.ruleId.localeCompare(right.finding.ruleId, "de")
        ),
        totalItemCount,
        accountingStatus: partial ? "PARTIAL" : totalItemCount > 0 ? "FINDINGS" : "CLEAN",
      };
    });
}

export interface ReviewDisplayPreparation {
  filteredItems: ReviewItem[];
  groups: ReviewFootnoteGroup[];
  durationMs: number;
}

export function prepareReviewDisplay(
  items: readonly ReviewItem[],
  footnotes: readonly FootnoteSnapshot[],
  filters: ReviewFilters,
  parseResults: readonly FootnoteParseResult[] = [],
  now: () => number = () => performance.now()
): ReviewDisplayPreparation {
  const startedAt = now();
  const filteredItems = filterReviewItems(items, footnotes, filters);
  const itemFilterActive =
    filters.severity !== "ALL" ||
    filters.reviewClass !== "ALL" ||
    filters.status !== "ALL" ||
    filters.category !== "ALL";
  const filteredFootnoteIds = new Set(filteredItems.map((item) => item.finding.footnoteId));
  const allItemFootnoteIds = new Set(items.map((item) => item.finding.footnoteId));
  const search = filters.search.trim().toLocaleLowerCase("de-DE");
  const candidateFootnotes = footnotes.filter((footnote) => {
    const hasFindings = allItemFootnoteIds.has(footnote.id);
    if (filters.onlyWithFindings && !hasFindings) return false;
    if (itemFilterActive && !filteredFootnoteIds.has(footnote.id)) return false;
    if (search === "") return true;
    return (
      filteredFootnoteIds.has(footnote.id) ||
      [`Fußnote ${footnote.ordinal}`, footnote.displayLabel, footnote.contentText]
        .join(" ")
        .toLocaleLowerCase("de-DE")
        .includes(search)
    );
  });
  const groups = groupReviewItems(filteredItems, candidateFootnotes, {
    includeEmpty: true,
    allItems: items,
    parseResults,
  });
  return {
    filteredItems,
    groups,
    durationMs: Math.round((now() - startedAt) * 1000) / 1000,
  };
}

export function deduplicateMessages(...messages: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const message of messages) {
    const normalized = message?.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLocaleLowerCase("de-DE");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(normalized);
  }
  return unique;
}

export function hasActiveFilters(filters: ReviewFilters): boolean {
  return (
    filters.severity !== "ALL" ||
    filters.reviewClass !== "ALL" ||
    filters.status !== "ALL" ||
    filters.category !== "ALL" ||
    filters.onlyWithFindings ||
    filters.search.trim() !== ""
  );
}

export function explicitDecisionCount(state: ReviewDecisionState): number {
  return Object.keys(state).length;
}

export type OpenFootnoteState = ReadonlySet<string>;

export function createClosedFootnoteState(): OpenFootnoteState {
  return new Set<string>();
}

export function setFootnoteOpen(
  state: OpenFootnoteState,
  footnoteId: string,
  open: boolean,
  autoCloseInactiveFootnotes = true
): OpenFootnoteState {
  if (open && autoCloseInactiveFootnotes) return new Set([footnoteId]);
  const next = new Set(state);
  if (open) next.add(footnoteId);
  else next.delete(footnoteId);
  return next;
}

export function formatFormattingValue(property: string, value: unknown): string {
  if (value === undefined || value === null) return "nicht verfügbar";
  if (property === "fontSize" || property === "characterSpacing") return `${value} pt`;
  if (typeof value === "boolean") {
    if (property === "italic") return value ? "kursiv" : "nicht kursiv";
    if (property === "bold") return value ? "fett" : "nicht fett";
    if (property === "underline") return value ? "unterstrichen" : "nicht unterstrichen";
    return value ? "ja" : "nein";
  }
  return String(value);
}
