/* global performance */

import type { FootnoteSnapshot } from "../taskpane/taskpane";
import { findPlainTextUrls } from "./patterns";
export { isRangeProtected } from "./protected-ranges";
import { finalPeriodRule } from "./rules/final-period";
import type { FootnoteRule, RuleFindingCandidate } from "./rules/types";
import type {
  AnalysisProtectedRange,
  EngineProtectedRange,
  Finding,
  FootnoteAnalysisResult,
  FootnoteEngineResult,
  TextPatternMatch,
} from "./types";

const ACTIVE_RULES: readonly FootnoteRule[] = [finalPeriodRule];

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
  ruleId: string,
  candidate: RuleFindingCandidate
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
    findingId: createFindingId(footnote, ruleId, candidate.start, candidate.end),
    footnoteId: footnote.id,
    footnoteOrdinal: footnote.ordinal,
    sourceTextHash: footnote.originalTextHash,
    ruleId,
    ...candidate,
  };
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

function compareProtectedRanges(
  left: AnalysisProtectedRange,
  right: AnalysisProtectedRange
): number {
  return (
    left.start - right.start ||
    left.end - right.end ||
    (left.source === right.source ? 0 : left.source === "reader" ? -1 : 1) ||
    compareStrings(left.type, right.type)
  );
}

function createReaderProtectedRanges(footnote: FootnoteSnapshot): AnalysisProtectedRange[] {
  return footnote.protectedRanges
    .map((range) => ({
      source: "reader" as const,
      type: range.type,
      start: range.start,
      end: range.end,
    }))
    .sort(compareProtectedRanges);
}

function createReaderCoverage(
  readerRanges: readonly AnalysisProtectedRange[]
): Array<{ start: number; end: number }> {
  const coverage: Array<{ start: number; end: number }> = [];

  for (const range of readerRanges) {
    const previous = coverage[coverage.length - 1];

    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      coverage.push({ start: range.start, end: range.end });
    }
  }

  return coverage;
}

function createValidatedEngineRange(
  contentText: string,
  match: TextPatternMatch
): EngineProtectedRange | undefined {
  const hasValidOffsets =
    Number.isInteger(match.start) &&
    Number.isInteger(match.end) &&
    match.start >= 0 &&
    match.start < match.end &&
    match.end <= contentText.length;

  if (!hasValidOffsets || match.text !== contentText.slice(match.start, match.end)) {
    return undefined;
  }

  return {
    type: "plainTextUrl",
    start: match.start,
    end: match.end,
    text: match.text,
  };
}

function createFootnoteAnalysis(footnote: FootnoteSnapshot): FootnoteAnalysisResult {
  const readerRanges = createReaderProtectedRanges(footnote);
  const readerCoverage = createReaderCoverage(readerRanges);
  const engineProtectedRanges: EngineProtectedRange[] = [];
  const urlMatches = findPlainTextUrls(footnote.contentText);
  let coverageIndex = 0;

  for (const match of urlMatches) {
    const engineRange = createValidatedEngineRange(footnote.contentText, match);

    if (!engineRange) {
      continue;
    }

    while (
      coverageIndex < readerCoverage.length &&
      readerCoverage[coverageIndex].end <= engineRange.start
    ) {
      coverageIndex += 1;
    }

    const coverage = readerCoverage[coverageIndex];
    const isFullyCoveredByReader =
      coverage !== undefined &&
      coverage.start <= engineRange.start &&
      coverage.end >= engineRange.end;

    // Reader structures take precedence when they already protect the complete
    // URL. Partial overlaps retain the full engine range conservatively.
    if (!isFullyCoveredByReader) {
      engineProtectedRanges.push(engineRange);
    }
  }

  const protectedRanges: AnalysisProtectedRange[] = readerRanges.slice();

  for (const range of engineProtectedRanges) {
    protectedRanges.push({
      source: "engine",
      type: range.type,
      start: range.start,
      end: range.end,
    });
  }

  protectedRanges.sort(compareProtectedRanges);

  return {
    footnoteId: footnote.id,
    engineProtectedRanges,
    protectedRanges,
  };
}

export function analyzeFootnotes(footnotes: readonly FootnoteSnapshot[]): FootnoteEngineResult {
  const startedAt = getTimestamp();
  const findings: Finding[] = [];
  const footnoteAnalyses: FootnoteAnalysisResult[] = [];
  let plainTextUrlCount = 0;
  let engineProtectedRangeCount = 0;

  for (const footnote of footnotes) {
    const analysis = createFootnoteAnalysis(footnote);
    footnoteAnalyses.push(analysis);
    engineProtectedRangeCount += analysis.engineProtectedRanges.length;

    for (const range of analysis.engineProtectedRanges) {
      if (range.type === "plainTextUrl") {
        plainTextUrlCount += 1;
      }
    }

    for (const rule of ACTIVE_RULES) {
      const candidates = rule.analyze(footnote, analysis.protectedRanges);

      for (const candidate of candidates) {
        const finding = createValidatedFinding(footnote, rule.ruleId, candidate);

        if (finding) {
          findings.push(finding);
        }
      }
    }
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
    footnoteAnalyses,
    analyzedFootnotes: footnotes.length,
    plainTextUrlCount,
    engineProtectedRangeCount,
    findingsBySeverity,
    durationMs: Number((getTimestamp() - startedAt).toFixed(3)),
  };
}
