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
import {
  buildDocumentSourceRegistry,
  type DocumentSourceRegistry,
} from "../document-source-registry";
import { classifyFootnoteParseResult } from "./citation-classifier";
import { extractFootnoteParseResult } from "./citation-extractor";
import { SEGMENTATION_USER_MESSAGE } from "./citation-sequence-segmenter";
import { segmentFootnote } from "./citation-segmenter";
import { deriveEffectiveCitationClassification } from "./effective-classification";
import { findPlainTextUrls } from "./patterns";
export { isRangeProtected } from "./protected-ranges";
import { deriveDocumentFootnoteFormattingBaseline } from "./rules/formatting";
import { runRules } from "./rules/runner";
import type { RuleContext } from "./rules/types";
import type {
  AnalysisProtectedRange,
  CitationItem,
  CitationSequence,
  EngineProtectedRange,
  Finding,
  FootnoteAnalysisResult,
  FootnoteEngineResult,
  FootnoteParseResult,
  TextPatternMatch,
} from "./types";

interface CitationItemLocation {
  sequence: CitationSequence;
  item: CitationItem;
}

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

function addUncertainSegmentationProtection(
  footnote: FootnoteSnapshot,
  analysis: FootnoteAnalysisResult,
  parseResult: FootnoteParseResult
): void {
  const ranges = [
    ...(parseResult.sequences ?? []).flatMap((sequence) =>
      sequence.items
        .filter((item) => item.status === "uncertain" || item.status === "failed")
        .map((item) => ({ start: item.start, end: item.end }))
    ),
    ...(parseResult.narrativeText ?? [])
      .filter((narrative) => narrative.status !== "recognized")
      .map((narrative) => ({ start: narrative.start, end: narrative.end })),
  ];

  for (const range of ranges) {
    if (
      range.start < range.end &&
      !analysis.engineProtectedRanges.some(
        (existing) => existing.start === range.start && existing.end === range.end
      )
    ) {
      analysis.engineProtectedRanges.push({
        type: "uncertainCitation",
        start: range.start,
        end: range.end,
        text: footnote.contentText.slice(range.start, range.end),
      });
      analysis.protectedRanges.push({ source: "engine", type: "uncertainCitation", ...range });
    }
  }
  analysis.protectedRanges.sort(compareProtectedRanges);
}

function failedFootnoteParseResult(footnote: FootnoteSnapshot): FootnoteParseResult {
  const end = footnote.contentText.length;
  const warning = {
    code: "CITATION_FOOTNOTE_FAILED",
    message: SEGMENTATION_USER_MESSAGE,
    stage: "footnote" as const,
    start: 0,
    end,
  };
  return {
    footnoteId: footnote.id,
    sourceTextHash: footnote.originalTextHash,
    segments: [],
    sequences: [],
    narrativeText:
      end > 0
        ? [
            {
              id: `narrative:${footnote.id}:0:${end}:${footnote.originalTextHash}`,
              footnoteId: footnote.id,
              ordinal: footnote.ordinal,
              start: 0,
              end,
              rawText: footnote.contentText,
              reason: "footnoteFailure",
              status: "failed",
              warnings: [warning],
            },
          ]
        : [],
    segmentationWarnings: [warning],
    segmentationStatus: "failed",
  };
}

function rangesOverlap(
  left: { start: number; end: number },
  right: { start: number; end: number }
): boolean {
  if (left.start === left.end) return left.start >= right.start && left.start <= right.end;
  return left.start < right.end && left.end > right.start;
}

function associateFindingsWithCitationItems(
  findings: readonly Finding[],
  parseResults: readonly FootnoteParseResult[]
): Finding[] {
  const locationsByFootnote = new Map<string, CitationItemLocation[]>();
  const narrativeByFootnote = new Map<string, NonNullable<FootnoteParseResult["narrativeText"]>>();
  const segmentRanges = new Map<string, { start: number; end: number }>();
  for (const result of parseResults) {
    locationsByFootnote.set(
      result.footnoteId,
      (result.sequences ?? []).flatMap((sequence) =>
        sequence.items.map((item) => ({ sequence, item }))
      )
    );
    narrativeByFootnote.set(result.footnoteId, result.narrativeText ?? []);
    for (const segment of result.segments) {
      segmentRanges.set(`${result.footnoteId}:${segment.segmentId}`, {
        start: segment.coreStart,
        end: segment.coreEnd,
      });
    }
  }

  const associated = findings.flatMap((finding) => {
    if (!finding.citationSegmentId) return [finding];
    if (
      (narrativeByFootnote.get(finding.footnoteId) ?? []).some(
        (narrative) => narrative.start <= finding.start && narrative.end >= finding.end
      )
    ) {
      return [];
    }
    const locations = locationsByFootnote.get(finding.footnoteId) ?? [];
    const segmentRange = segmentRanges.get(`${finding.footnoteId}:${finding.citationSegmentId}`);
    const relevant = locations.filter(({ item }) => rangesOverlap(item, segmentRange ?? finding));
    if (relevant.length === 0) return [finding];

    const associations =
      finding.ruleId === "CITATION_OTHER_REVIEW"
        ? relevant
        : [
            relevant.find(({ item }) => item.start <= finding.start && item.end >= finding.end) ??
              [...relevant].sort(
                (left, right) =>
                  Math.min(right.item.end, finding.end) -
                  Math.max(right.item.start, finding.start) -
                  (Math.min(left.item.end, finding.end) - Math.max(left.item.start, finding.start))
              )[0],
          ];

    return associations.map(({ sequence, item }) => ({
      ...finding,
      ...(finding.ruleId === "CITATION_OTHER_REVIEW"
        ? {
            findingId: `${finding.findingId}:item:${item.id}`,
            start: item.start,
            end: item.end,
            originalText: item.rawText,
            message:
              "Diese Quelle konnte keiner bekannten Zitierweise sicher zugeordnet werden. Bitte prüfen Sie sie manuell.",
          }
        : {}),
      citationSequenceId: sequence.id,
      citationItemId: item.id,
      citationStart: item.start,
      citationEnd: item.end,
    }));
  });
  const unique = new Map<string, Finding>();
  for (const finding of associated) {
    const key =
      finding.ruleId === "CITATION_OTHER_REVIEW" && finding.citationItemId
        ? `${finding.footnoteId}:${finding.ruleId}:${finding.citationItemId}`
        : finding.findingId;
    if (!unique.has(key)) unique.set(key, finding);
  }
  return [...unique.values()];
}

function applyDocumentSourceRegistryFindings(
  findings: readonly Finding[],
  registry: DocumentSourceRegistry,
  parseResults: readonly FootnoteParseResult[],
  footnotes: readonly FootnoteSnapshot[]
): Finding[] {
  const sourceById = new Map(registry.sources.map((source) => [source.documentSourceId, source]));
  const resolutionByItemId = new Map(
    registry.resolutions.map((resolution) => [resolution.citationItemId, resolution])
  );
  const itemById = new Map(
    parseResults.flatMap((result) =>
      (result.sequences ?? []).flatMap((sequence) =>
        sequence.items.map((item) => [item.id, item] as const)
      )
    )
  );
  const footnoteById = new Map(footnotes.map((footnote) => [footnote.id, footnote]));
  const retained = findings.flatMap((finding) => {
    if (finding.ruleId !== "CITATION_OTHER_REVIEW" || !finding.citationItemId) {
      return [finding];
    }
    const resolution = resolutionByItemId.get(finding.citationItemId);
    const source = resolution?.documentSourceId
      ? sourceById.get(resolution.documentSourceId)
      : undefined;
    const safelyResolved =
      resolution &&
      !resolution.warnings.includes("SUSPICIOUS_NARRATIVE_PREFIX") &&
      (resolution.finalState === "PERSISTENT_MATCH" ||
        (source?.status === "CONFIRMED_DOCUMENT_SOURCE" &&
          (resolution.canEstablishIdentity ||
            resolution.explanation.strategy === "ANM_REFERENCE" ||
            resolution.explanation.strategy === "IMMEDIATE_CONTEXT")));
    if (safelyResolved) return [];
    return [
      resolution?.resolution === "AMBIGUOUS"
        ? {
            ...finding,
            message:
              "Die Quelle konnte nicht eindeutig einer bereits verwendeten Quelle zugeordnet werden.",
          }
        : finding,
    ];
  });
  const consistencyFindings: Finding[] = [];
  for (const resolution of registry.resolutions) {
    if (!resolution.documentSourceId || !resolution.canEstablishIdentity) continue;
    const source = sourceById.get(resolution.documentSourceId);
    const item = itemById.get(resolution.citationItemId);
    if (!source || !item || source.status !== "CONFIRMED_DOCUMENT_SOURCE") continue;
    if (
      !resolution.normalizedBibliographicCore ||
      resolution.normalizedBibliographicCore === source.canonicalVariant.normalizedBibliographicCore
    ) {
      continue;
    }
    const footnote = footnoteById.get(item.footnoteId);
    if (!footnote) continue;
    consistencyFindings.push({
      findingId: `document-source-variant:${item.id}:${source.documentSourceId}`,
      footnoteId: item.footnoteId,
      footnoteOrdinal: footnote.ordinal,
      sourceTextHash: footnote.originalTextHash,
      ruleId: "SOURCE_CITATION_VARIANT_CONSISTENCY",
      category: "citation",
      start: item.start,
      end: item.end,
      originalText: item.rawText,
      severity: "warning",
      message: "Diese Quelle wird im übrigen Dokument überwiegend anders zitiert.",
      citationSequenceId: item.sequenceId,
      citationItemId: item.id,
      citationStart: item.start,
      citationEnd: item.end,
      metadata: {
        documentSourceId: source.documentSourceId,
        canonicalDocumentCitation: source.canonicalDisplayCitation,
        requiresManualReview: true,
      },
    });
  }
  return [...retained, ...consistencyFindings];
}

function attachSourceAuditFindings(
  registry: DocumentSourceRegistry,
  findings: readonly Finding[]
): void {
  const findingIdsByItem = new Map<string, string[]>();
  findings.forEach((finding) => {
    if (!finding.citationItemId) return;
    const ids = findingIdsByItem.get(finding.citationItemId) ?? [];
    ids.push(finding.findingId);
    findingIdsByItem.set(finding.citationItemId, ids);
  });
  registry.auditRecords.forEach((record) => {
    record.associatedFindingIds = [...(findingIdsByItem.get(record.citationItemId) ?? [])].sort();
    record.noFindingReason =
      record.associatedFindingIds.length === 0
        ? record.finalState === "PERSISTENT_MATCH"
          ? "KNOWN_PERSISTENT_SOURCE_WITHOUT_STYLE_FINDING"
          : record.finalState === "DOCUMENT_MATCH"
            ? "DOCUMENT_SOURCE_WITHOUT_STYLE_FINDING"
            : "SOURCE_ACCOUNTED_WITHOUT_RULE_FINDING"
        : undefined;
  });
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
    let analysis: FootnoteAnalysisResult;
    try {
      analysis = createFootnoteAnalysis(footnote);
    } catch {
      analysis = { footnoteId: footnote.id, engineProtectedRanges: [], protectedRanges: [] };
    }
    footnoteAnalyses.push(analysis);
    let parseResult: FootnoteParseResult;
    try {
      const classifiedParseResult = classifyFootnoteParseResult(
        segmentFootnote(footnote, analysis.protectedRanges, [profile.global.citationSeparator]),
        analysis.protectedRanges
      );
      parseResult = extractFootnoteParseResult(
        classifiedParseResult,
        footnote,
        analysis.protectedRanges
      );
    } catch {
      parseResult = failedFootnoteParseResult(footnote);
    }
    addUncertainSegmentationProtection(footnote, analysis, parseResult);
    parseResults.push(parseResult);
    engineProtectedRangeCount += analysis.engineProtectedRanges.length;

    for (const range of analysis.engineProtectedRanges) {
      if (range.type === "plainTextUrl") {
        plainTextUrlCount += 1;
      }
    }

    if (parseResult.segmentationStatus === "failed") continue;

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

  const documentSourceRegistry = buildDocumentSourceRegistry({
    footnotes,
    parseResults,
    segmentAnalyses,
    mappingData,
  });
  const findings = applyDocumentSourceRegistryFindings(
    associateFindingsWithCitationItems(
      runRules(footnoteContexts, segmentContexts, {
        footnotes,
        profile,
        mappingData,
      }),
      parseResults
    ),
    documentSourceRegistry,
    parseResults,
    footnotes
  );
  attachSourceAuditFindings(documentSourceRegistry, findings);

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
    documentSourceRegistry,
    registryDurationMs: documentSourceRegistry.durationMs,
    durationMs: Number((getTimestamp() - startedAt).toFixed(3)),
  };
}
