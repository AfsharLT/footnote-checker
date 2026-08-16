/* global performance */

import type { FootnoteSnapshot } from "../taskpane/taskpane";
import type { Finding, FindingCategory, FindingSeverity, FootnoteEngineResult } from "./types";

interface FindingCandidate {
  ruleId: string;
  category: FindingCategory;
  start: number;
  end: number;
  originalText: string;
  suggestedText?: string;
  severity: FindingSeverity;
  message: string;
  metadata?: Record<string, unknown>;
}

function getTimestamp(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function createFindingId(
  footnote: FootnoteSnapshot,
  ruleId: string,
  start: number,
  end: number
): string {
  return `finding:${footnote.id}:${ruleId}:${start}:${end}:${footnote.originalTextHash}`;
}

function createValidatedFinding(
  footnote: FootnoteSnapshot,
  candidate: FindingCandidate
): Finding | undefined {
  const hasValidOffsets =
    Number.isInteger(candidate.start) &&
    Number.isInteger(candidate.end) &&
    candidate.start >= 0 &&
    candidate.start <= candidate.end &&
    candidate.end <= footnote.contentText.length;

  if (
    !hasValidOffsets ||
    candidate.originalText !== footnote.contentText.slice(candidate.start, candidate.end)
  ) {
    return undefined;
  }

  return {
    findingId: createFindingId(footnote, candidate.ruleId, candidate.start, candidate.end),
    footnoteId: footnote.id,
    footnoteOrdinal: footnote.ordinal,
    sourceTextHash: footnote.originalTextHash,
    ...candidate,
  };
}

/*
 * TEMPORARY DEVELOPMENT ONLY.
 * Remove this function and its single invocation in analyzeFootnotes when the
 * first real engine rule is introduced. It does not represent a fachliche Regel.
 */
function createDevelopmentTestFinding(footnotes: readonly FootnoteSnapshot[]): Finding | undefined {
  const footnote = footnotes.find((snapshot) => snapshot.contentText.length > 0);

  if (!footnote) {
    return undefined;
  }

  const start = 0;
  const end = Math.min(footnote.contentText.length, 12);

  return createValidatedFinding(footnote, {
    ruleId: "DEV_TEST_FINDING",
    category: "technical",
    start,
    end,
    originalText: footnote.contentText.slice(start, end),
    severity: "warning",
    message: "Development test finding",
  });
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  return left > right ? 1 : 0;
}

function compareFindings(left: Finding, right: Finding): number {
  return (
    left.footnoteOrdinal - right.footnoteOrdinal ||
    left.start - right.start ||
    compareStrings(left.ruleId, right.ruleId) ||
    compareStrings(left.findingId, right.findingId)
  );
}

export function analyzeFootnotes(footnotes: readonly FootnoteSnapshot[]): FootnoteEngineResult {
  const startedAt = getTimestamp();
  const findings: Finding[] = [];
  const developmentTestFinding = createDevelopmentTestFinding(footnotes);

  if (developmentTestFinding) {
    findings.push(developmentTestFinding);
  }

  findings.sort(compareFindings);

  const findingsBySeverity = {
    info: 0,
    warning: 0,
    error: 0,
  };

  for (const finding of findings) {
    findingsBySeverity[finding.severity] += 1;
  }

  return {
    findings,
    analyzedFootnotes: footnotes.length,
    findingsBySeverity,
    durationMs: Number((getTimestamp() - startedAt).toFixed(3)),
  };
}
