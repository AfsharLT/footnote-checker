import type { CitationSourceMappingResolution } from "@/citation-mapping/types";
import type { FootnoteEngineResult } from "@/footnote-engine/types";
import type { ReviewItem } from "@/review-engine";
import { getRuleTitle } from "@/taskpane/review-ui";
import type { FootnoteSnapshot } from "@/taskpane/taskpane";
import type { BatchItemResult, BatchWriteBackResult, WriteBackPlan } from "./batch-types";
import type { WriteBackResult, WriteBackState } from "./types";

export const CURRENT_WRITEBACK_REPORT_SCHEMA_VERSION = 1 as const;

export const WRITEBACK_REPORT_HEADERS = [
  "ReportSchemaVersion",
  "BatchId",
  "AnalysisTimestamp",
  "FootnoteOrdinal",
  "FootnoteId",
  "DisplayLabel",
  "RuleId",
  "RuleTitle",
  "Category",
  "Severity",
  "ReviewClass",
  "ReviewStatus",
  "ReviewReason",
  "OriginalText",
  "SuggestedText",
  "FindingMessage",
  "Start",
  "End",
  "ActionKind",
  "WriteBackStatus",
  "WriteBackResultReason",
  "AppliedAt",
  "ErrorCode",
  "ErrorMessage",
  "CitationType",
  "EffectiveCitationType",
  "MappingStatus",
  "CanonicalSourceId",
  "PreferredSourceName",
  "MappingKind",
  "LegacySafetyLevel",
  "FormattingProperty",
  "ActualFormattingValue",
  "ExpectedFormattingValue",
  "FormattingRole",
  "FormattingBaselineSource",
  "PlannedForWriteBack",
  "BatchExclusionReason",
  "RevalidationStatus",
  "Relocated",
  "ResolvedStart",
  "ResolvedEnd",
  "AlreadyResolved",
  "TechnicalEligibility",
  "ConflictCount",
  "FootnoteText",
] as const;

export type WriteBackReportHeader = (typeof WRITEBACK_REPORT_HEADERS)[number];
export type WriteBackReportRow = Record<WriteBackReportHeader, string>;

interface CitationReportData {
  citationType?: string;
  effectiveCitationType?: string;
  mapping?: CitationSourceMappingResolution;
}

interface CitationReportIndex {
  parseResultsByFootnoteId: Map<string, FootnoteEngineResult["parseResults"][number]>;
  segmentAnalysesByKey: Map<string, FootnoteEngineResult["segmentAnalyses"][number]>;
}

function createCitationReportIndex(
  engineResult: FootnoteEngineResult | undefined
): CitationReportIndex | undefined {
  if (!engineResult) return undefined;
  return {
    parseResultsByFootnoteId: new Map(
      engineResult.parseResults.map((result) => [result.footnoteId, result])
    ),
    segmentAnalysesByKey: new Map(
      engineResult.segmentAnalyses.map((analysis) => [
        `${analysis.footnoteId}:${analysis.segmentId}`,
        analysis,
      ])
    ),
  };
}

function containingSegment(
  segments: FootnoteEngineResult["parseResults"][number]["segments"],
  start: number,
  end: number
) {
  let lower = 0;
  let upper = segments.length - 1;
  let candidate = -1;
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (segments[middle].start <= start) {
      candidate = middle;
      lower = middle + 1;
    } else {
      upper = middle - 1;
    }
  }
  return candidate >= 0 && segments[candidate].end >= end ? segments[candidate] : undefined;
}

function scalar(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function suggestedText(item: ReviewItem): string {
  const action = item.proposedAction;
  if (action?.type === "TEXT_REPLACE") return action.replacementText;
  if (action?.type === "TEXT_INSERT") return action.text;
  if (action?.type === "FORMAT_CHANGE") {
    const property = Object.keys(action.changes)[0] as keyof typeof action.changes | undefined;
    return property ? scalar(action.changes[property]) : "";
  }
  return item.finding.suggestedText ?? "";
}

function citationData(
  index: CitationReportIndex | undefined,
  item: ReviewItem
): CitationReportData {
  if (!index) return {};
  const parseResult = index.parseResultsByFootnoteId.get(item.finding.footnoteId);
  const segment = parseResult
    ? containingSegment(parseResult.segments, item.finding.start, item.finding.end)
    : undefined;
  const analysis = segment
    ? index.segmentAnalysesByKey.get(`${item.finding.footnoteId}:${segment.segmentId}`)
    : undefined;
  const sourceMapping =
    analysis?.sourceMappings.find((mapping) => mapping.target === "PRIMARY_SOURCE") ??
    analysis?.sourceMappings[0];
  return {
    citationType: segment?.classification.type,
    effectiveCitationType: analysis?.effectiveClassification.effectiveType,
    mapping: sourceMapping?.resolution,
  };
}

function batchResultFromWriteBackResult(
  item: ReviewItem,
  result: WriteBackResult | undefined
): Partial<BatchItemResult> {
  if (!result) return {};
  const local = result.localRevalidation;
  return {
    writeBackStatus: result.status,
    resultReason: result.reason,
    appliedAt: result.appliedAt,
    revalidationStatus: local?.status,
    relocated: local?.status === "RELOCATED",
    resolvedStart: local?.resolvedStart,
    resolvedEnd: local?.resolvedEnd,
    alreadyResolved: result.reason === "ALREADY_RESOLVED",
    errorCode: result.status === "FAILED" || result.status === "STALE" ? result.reason : undefined,
    message: result.message,
    originalText: item.finding.originalText,
    suggestedText: suggestedText(item),
  };
}

export function buildWriteBackReportRows(input: {
  items: readonly ReviewItem[];
  footnotes: readonly FootnoteSnapshot[];
  analysisTimestamp: string;
  plan?: WriteBackPlan;
  batchResult?: BatchWriteBackResult;
  writeBackState?: WriteBackState;
  engineResult?: FootnoteEngineResult;
}): WriteBackReportRow[] {
  const footnotes = new Map(input.footnotes.map((footnote) => [footnote.id, footnote]));
  const planItems = new Map(input.plan?.items.map((item) => [item.reviewItemId, item]) ?? []);
  const batchItems = new Map(
    input.batchResult?.itemResults.map((item) => [item.reviewItemId, item]) ?? []
  );
  const citationIndex = createCitationReportIndex(input.engineResult);
  return input.items.map((item) => {
    const footnote = footnotes.get(item.finding.footnoteId);
    const planned = planItems.get(item.reviewItemId);
    const execution =
      batchItems.get(item.reviewItemId) ??
      batchResultFromWriteBackResult(item, input.writeBackState?.[item.reviewItemId]);
    const citation = citationData(citationIndex, item);
    const metadata = item.finding.metadata ?? {};
    const mapping = citation.mapping;
    const formattingProperty =
      scalar(metadata.formattingProperty) ||
      (item.proposedAction?.type === "FORMAT_CHANGE"
        ? (Object.keys(item.proposedAction.changes)[0] ?? "")
        : "");
    const expectedFormattingValue =
      scalar(metadata.expected) ||
      (item.proposedAction?.type === "FORMAT_CHANGE" && formattingProperty
        ? scalar(
            item.proposedAction.changes[
              formattingProperty as keyof typeof item.proposedAction.changes
            ]
          )
        : "");
    const eligibility = item.technicalEligibility.eligible
      ? "ELIGIBLE"
      : `INELIGIBLE: ${item.technicalEligibility.reasons.join(", ")}`;
    return {
      ReportSchemaVersion: String(CURRENT_WRITEBACK_REPORT_SCHEMA_VERSION),
      BatchId: input.batchResult?.batchId ?? "",
      AnalysisTimestamp: input.analysisTimestamp,
      FootnoteOrdinal: String(item.finding.footnoteOrdinal),
      FootnoteId: item.finding.footnoteId,
      DisplayLabel: footnote?.displayLabel ?? String(item.finding.footnoteOrdinal),
      RuleId: item.finding.ruleId,
      RuleTitle: getRuleTitle(item.finding.ruleId),
      Category: item.finding.category,
      Severity: item.finding.severity,
      ReviewClass: item.reviewClass,
      ReviewStatus: item.decision.effectiveStatus,
      ReviewReason: item.classificationReason,
      OriginalText: item.finding.originalText,
      SuggestedText: suggestedText(item),
      FindingMessage: item.finding.message,
      Start: String(item.finding.start),
      End: String(item.finding.end),
      ActionKind: item.proposedAction?.type ?? "",
      WriteBackStatus: execution.writeBackStatus ?? "",
      WriteBackResultReason: execution.resultReason ?? "",
      AppliedAt: execution.appliedAt ?? "",
      ErrorCode: execution.errorCode ?? "",
      ErrorMessage: execution.message ?? "",
      CitationType: citation.citationType ?? "",
      EffectiveCitationType: citation.effectiveCitationType ?? "",
      MappingStatus: mapping?.status ?? "",
      CanonicalSourceId: mapping?.canonicalSourceId ?? scalar(metadata.canonicalSourceId),
      PreferredSourceName: mapping?.preferredName ?? scalar(metadata.preferredName),
      MappingKind: mapping?.kind ?? "",
      LegacySafetyLevel: mapping?.legacySafetyLevel ?? scalar(metadata.legacySafetyLevel),
      FormattingProperty: formattingProperty,
      ActualFormattingValue: scalar(metadata.actual),
      ExpectedFormattingValue: expectedFormattingValue,
      FormattingRole: scalar(metadata.semanticRole) || scalar(metadata.role),
      FormattingBaselineSource: scalar(metadata.baselineSource),
      PlannedForWriteBack: planned?.planned ? "true" : "false",
      BatchExclusionReason: planned?.exclusionReason ?? "",
      RevalidationStatus: execution.revalidationStatus ?? "",
      Relocated: execution.relocated ? "true" : "false",
      ResolvedStart: execution.resolvedStart === undefined ? "" : String(execution.resolvedStart),
      ResolvedEnd: execution.resolvedEnd === undefined ? "" : String(execution.resolvedEnd),
      AlreadyResolved: execution.alreadyResolved ? "true" : "false",
      TechnicalEligibility: eligibility,
      ConflictCount: String(item.conflicts.length),
      FootnoteText: footnote?.contentText ?? "",
    };
  });
}
