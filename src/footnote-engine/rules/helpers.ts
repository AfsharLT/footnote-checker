import type { CharacterStylePreference, CitationDateFormat } from "../../citation-settings/types";
import type { FootnoteSnapshot, FormattingRun } from "../../taskpane/taskpane";
import { isRangeProtected } from "../protected-ranges";
import type { CitationLocator, PersonReference } from "../types";
import type { RuleContext, RuleFindingCandidate } from "./types";

export interface TextRange {
  start: number;
  end: number;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function replacementCandidate(
  context: RuleContext,
  range: TextRange,
  suggestedText: string,
  message: string,
  metadata?: Record<string, unknown>,
  severity: RuleFindingCandidate["severity"] = "warning",
  category: RuleFindingCandidate["category"] = "citation"
): RuleFindingCandidate[] {
  if (
    range.start < 0 ||
    range.end < range.start ||
    range.end > context.footnote.contentText.length ||
    isRangeProtected(range.start, range.end, context.protectedRanges)
  ) {
    return [];
  }
  const originalText = context.footnote.contentText.slice(range.start, range.end);
  if (originalText === suggestedText) return [];
  return [
    {
      category,
      ...range,
      originalText,
      suggestedText,
      severity,
      message,
      ...(metadata ? { metadata } : {}),
    },
  ];
}

export function informationalCandidate(
  context: RuleContext,
  range: TextRange,
  message: string,
  metadata?: Record<string, unknown>,
  category: RuleFindingCandidate["category"] = "citation"
): RuleFindingCandidate[] {
  if (
    range.start < 0 ||
    range.end < range.start ||
    range.end > context.footnote.contentText.length
  ) {
    return [];
  }
  return [
    {
      category,
      ...range,
      originalText: context.footnote.contentText.slice(range.start, range.end),
      severity: "info",
      message,
      ...(metadata ? { metadata } : {}),
    },
  ];
}

export function fullLocatorRange(
  contentText: string,
  locator: CitationLocator,
  prefixPattern: RegExp
): TextRange {
  const lookBehindStart = Math.max(0, locator.start - 24);
  const window = contentText.slice(lookBehindStart, locator.end);
  prefixPattern.lastIndex = 0;
  let match = prefixPattern.exec(window);
  let selected: RegExpExecArray | undefined;
  while (match) {
    const absoluteEnd = lookBehindStart + match.index + match[0].length;
    if (absoluteEnd === locator.end) selected = match;
    if (!prefixPattern.global) break;
    match = prefixPattern.exec(window);
  }
  return selected
    ? { start: lookBehindStart + selected.index, end: locator.end }
    : { start: locator.start, end: locator.end };
}

export function formatNormalizedDate(
  normalizedDate: string,
  format: CitationDateFormat
): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizedDate);
  if (!match) return undefined;
  const year = format.endsWith("YY") && !format.endsWith("YYYY") ? match[1].slice(-2) : match[1];
  const day = format.startsWith("D.") ? String(Number(match[3])) : match[3];
  const month = format.includes(".M.") ? String(Number(match[2])) : match[2];
  return `${day}.${month}.${year}`;
}

export function separatorBetween(
  contentText: string,
  left: { end: number },
  right: { start: number }
): { range: TextRange; text: string } | undefined {
  if (left.end > right.start) return undefined;
  return {
    range: { start: left.end, end: right.start },
    text: contentText.slice(left.end, right.start),
  };
}

export function actualFormattingValue(
  snapshot: FootnoteSnapshot,
  start: number,
  end: number,
  property: "italic" | "bold" | "underline"
): boolean | "mixed" | undefined {
  const runs = (snapshot.formattingRuns ?? [])
    .filter((run) => run.start < end && run.end > start)
    .sort((left, right) => left.start - right.start);
  if (runs.length === 0) return undefined;
  let cursor = start;
  const values = new Set<boolean>();
  for (const run of runs) {
    const overlapStart = Math.max(start, run.start);
    const overlapEnd = Math.min(end, run.end);
    if (overlapStart > cursor) return undefined;
    const value = formattingProperty(run, property);
    if (value === undefined) return undefined;
    values.add(value);
    cursor = Math.max(cursor, overlapEnd);
  }
  if (cursor < end) return undefined;
  return values.size === 1 ? Array.from(values)[0] : "mixed";
}

function formattingProperty(
  run: FormattingRun,
  property: "italic" | "bold" | "underline"
): boolean | undefined {
  if (property === "underline") {
    if (run.underline === undefined || run.underline === null || run.underline === "Mixed") {
      return undefined;
    }
    return run.underline !== "None";
  }
  const value = run[property];
  return typeof value === "boolean" ? value : undefined;
}

export function formattingCandidates(
  context: RuleContext,
  target: PersonReference | { start: number; end: number; rawText: string },
  preference: CharacterStylePreference,
  roleLabel: string,
  role = roleLabel === "Der Bearbeiter"
    ? "bearbeiter"
    : roleLabel === "Der Herausgeber"
      ? "editor"
      : roleLabel === "Der Autor"
        ? "author"
        : "workTitle"
): RuleFindingCandidate[] {
  if (isRangeProtected(target.start, target.end, context.protectedRanges)) return [];
  const findings: RuleFindingCandidate[] = [];
  for (const property of ["italic", "bold", "underline"] as const) {
    const expected = preference[property];
    if (expected === undefined) continue;
    const actual = actualFormattingValue(context.footnote, target.start, target.end, property);
    if (actual === undefined || actual === "mixed" || actual === expected) continue;
    findings.push({
      category: "formatting",
      start: target.start,
      end: target.end,
      originalText: context.footnote.contentText.slice(target.start, target.end),
      severity: "warning",
      message: `${roleLabel} soll ${expected ? "" : "nicht "}${
        property === "italic" ? "kursiv" : property === "bold" ? "fett" : "unterstrichen"
      } formatiert sein.`,
      metadata: { role, formattingProperty: property, expected, actual },
    });
  }
  return findings;
}

export function findTokenRange(
  context: RuleContext,
  pattern: RegExp
): { range: TextRange; match: RegExpExecArray } | undefined {
  if (!context.segment) return undefined;
  pattern.lastIndex = 0;
  const match = pattern.exec(context.segment.originalText);
  if (!match) return undefined;
  const start = context.segment.start + match.index;
  return { range: { start, end: start + match[0].length }, match };
}

export function normalizePreferenceText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE");
}
