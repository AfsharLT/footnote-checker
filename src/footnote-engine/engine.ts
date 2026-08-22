/* global performance */

import type { FootnoteSnapshot } from "../taskpane/taskpane";
import { createDefaultCitationSourceMapping } from "../citation-mapping/default-mapping";
import {
  createCitationSourceMappingIndex,
  resolveCitationSegmentSources,
  type CitationSourceMappingIndex,
} from "../citation-mapping/resolver";
import type { CitationSourceMappingData } from "../citation-mapping/types";
import { createDefaultCitationStyleProfile } from "../citation-settings/defaults";
import { resolveCitationSettings } from "../citation-settings/resolver";
import type { CitationStyleProfile } from "../citation-settings/types";
import { classifyFootnoteParseResult } from "./citation-classifier";
import { extractFootnoteParseResult } from "./citation-extractor";
import { segmentFootnote } from "./citation-segmenter";
import { deriveEffectiveCitationClassification } from "./effective-classification";
import { findPlainTextUrls } from "./patterns";
export { isRangeProtected } from "./protected-ranges";
import { deriveDocumentFootnoteFormattingBaseline } from "./rules/formatting";
import { runRules } from "./rules/runner";
import type { RuleContext } from "./rules/types";
import type {
  AnalysisProtectedRange,
  EngineProtectedRange,
  FootnoteAnalysisResult,
  FootnoteEngineResult,
  FootnoteParseResult,
  TextPatternMatch,
} from "./types";

function getTimestamp(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  return left > right ? 1 : 0;
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

export interface AnalyzeFootnotesOptions {
  profile?: CitationStyleProfile;
  mappingData?: CitationSourceMappingData;
  mappingIndex?: CitationSourceMappingIndex;
}

export function analyzeFootnotes(
  footnotes: readonly FootnoteSnapshot[],
  options: AnalyzeFootnotesOptions = {}
): FootnoteEngineResult {
  const startedAt = getTimestamp();
  const footnoteAnalyses: FootnoteAnalysisResult[] = [];
  const parseResults: FootnoteParseResult[] = [];
  const segmentAnalyses: FootnoteEngineResult["segmentAnalyses"] = [];
  const footnoteContexts: RuleContext[] = [];
  const segmentContexts: RuleContext[] = [];
  const profile = options.profile ?? createDefaultCitationStyleProfile();
  const mappingData = options.mappingData ?? createDefaultCitationSourceMapping();
  const mappingIndex = options.mappingIndex ?? createCitationSourceMappingIndex(mappingData);
  const documentFormattingBaseline = deriveDocumentFootnoteFormattingBaseline(footnotes);
  let plainTextUrlCount = 0;
  let engineProtectedRangeCount = 0;

  for (const footnote of footnotes) {
    const analysis = createFootnoteAnalysis(footnote);
    footnoteAnalyses.push(analysis);
    const classifiedParseResult = classifyFootnoteParseResult(
      segmentFootnote(footnote, analysis.protectedRanges),
      analysis.protectedRanges
    );
    const parseResult = extractFootnoteParseResult(
      classifiedParseResult,
      footnote,
      analysis.protectedRanges
    );
    parseResults.push(parseResult);
    engineProtectedRangeCount += analysis.engineProtectedRanges.length;

    for (const range of analysis.engineProtectedRanges) {
      if (range.type === "plainTextUrl") {
        plainTextUrlCount += 1;
      }
    }

    footnoteContexts.push({
      footnote,
      parserCitationType: "OTHER",
      effectiveCitationType: "OTHER",
      effectiveClassification: {
        parserType: "OTHER",
        effectiveType: "OTHER",
        source: "PARSER",
      },
      resolvedSettings: resolveCitationSettings({ profile, citationType: "OTHER" }),
      sourceMappings: [],
      protectedRanges: analysis.protectedRanges,
      documentFormattingBaseline,
    });

    for (const segment of parseResult.segments) {
      const sourceMappings = resolveCitationSegmentSources(segment, mappingIndex, false);
      const sourceMapping =
        sourceMappings.find((mapping) => mapping.target === "PRIMARY_SOURCE")?.resolution ??
        sourceMappings[0]?.resolution;
      const effectiveClassification = deriveEffectiveCitationClassification(segment, sourceMapping);
      segmentAnalyses.push({
        footnoteId: footnote.id,
        segmentId: segment.segmentId,
        sourceMappings,
        effectiveClassification,
      });
      segmentContexts.push({
        footnote,
        segment,
        extraction: segment.extraction,
        parserCitationType: effectiveClassification.parserType,
        effectiveCitationType: effectiveClassification.effectiveType,
        effectiveClassification,
        resolvedSettings: resolveCitationSettings({
          profile,
          citationType: effectiveClassification.effectiveType,
          workOverride: sourceMapping?.workOverride,
        }),
        ...(sourceMapping ? { sourceMapping } : {}),
        sourceMappings,
        protectedRanges: analysis.protectedRanges,
        documentFormattingBaseline,
      });
    }
  }

  const findings = runRules(footnoteContexts, segmentContexts, {
    footnotes,
    profile,
    mappingData,
  });

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
    parseResults,
    segmentAnalyses,
    analyzedFootnotes: footnotes.length,
    plainTextUrlCount,
    engineProtectedRangeCount,
    findingsBySeverity,
    durationMs: Number((getTimestamp() - startedAt).toFixed(3)),
  };
}
