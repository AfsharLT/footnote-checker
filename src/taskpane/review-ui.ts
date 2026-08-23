import type { FindingCategory, FindingSeverity } from "../footnote-engine/types";
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
  CITATION_STYLE_CONSISTENCY: "Zitierweise vereinheitlichen",
  SOURCE_NAME_CONSISTENCY: "Werkbezeichnung vereinheitlichen",
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
}

export const DEFAULT_REVIEW_FILTERS: ReviewFilters = {
  severity: "ALL",
  reviewClass: "ALL",
  status: "ALL",
  category: "ALL",
  search: "",
};

export interface ReviewFootnoteGroup {
  footnote: FootnoteSnapshot;
  items: ReviewItem[];
}

export function getRuleTitle(ruleId: string): string {
  return RULE_TITLES[ruleId] ?? "Prüfhinweis";
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
  footnotes: readonly FootnoteSnapshot[]
): ReviewFootnoteGroup[] {
  const grouped = new Map<string, ReviewItem[]>();
  for (const item of items) {
    const current = grouped.get(item.finding.footnoteId);
    if (current) current.push(item);
    else grouped.set(item.finding.footnoteId, [item]);
  }
  return footnotes
    .filter((footnote) => grouped.has(footnote.id))
    .map((footnote) => ({
      footnote,
      items: [...(grouped.get(footnote.id) ?? [])].sort(
        (left, right) =>
          SEVERITY_ORDER[left.finding.severity] - SEVERITY_ORDER[right.finding.severity] ||
          left.finding.start - right.finding.start ||
          left.finding.ruleId.localeCompare(right.finding.ruleId, "de")
      ),
    }));
}

export function hasActiveFilters(filters: ReviewFilters): boolean {
  return (
    filters.severity !== "ALL" ||
    filters.reviewClass !== "ALL" ||
    filters.status !== "ALL" ||
    filters.category !== "ALL" ||
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
  open: boolean
): OpenFootnoteState {
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
