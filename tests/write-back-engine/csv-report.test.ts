import type { CitationSourceMappingResolution } from "../../src/citation-mapping/types";
import type { FootnoteEngineResult, Finding } from "../../src/footnote-engine/types";
import type { ReviewItem, TechnicalEligibility } from "../../src/review-engine";
import type { FootnoteSnapshot } from "../../src/taskpane/taskpane";
import { hashFootnoteContentText } from "../../src/taskpane/taskpane";
import {
  buildWriteBackReportRows,
  createWriteBackPlan,
  CURRENT_WRITEBACK_REPORT_SCHEMA_VERSION,
  serializeWriteBackReportCsv,
  WRITEBACK_REPORT_HEADERS,
  writeBackReportFileName,
  type WriteBackState,
} from "../../src/write-back-engine";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function snapshot(contentText: string, ordinal: number): FootnoteSnapshot {
  const hash = hashFootnoteContentText(contentText);
  return {
    id: `report-footnote-${ordinal}-${hash}`,
    ordinal,
    displayLabel: String(ordinal),
    rawWordText: contentText,
    contentText,
    contentLength: contentText.length,
    originalTextHash: hash,
    reference: { referenceText: String(ordinal) },
    locator: {
      ordinal,
      displayLabel: String(ordinal),
      originalTextHash: hash,
      contextBefore: "",
      contextAfter: "",
    },
    paragraphCount: 1,
    paragraphs: [{ index: 0, start: 0, end: contentText.length }],
    hyperlinks: [],
    fields: [],
    bookmarks: [],
    contentControls: [],
    protectedRanges: [],
    readStatus: "complete",
    readWarnings: [],
    formattingRuns: [],
    paragraphFormats: [],
  };
}

const eligible: TechnicalEligibility = {
  eligible: true,
  reasons: [],
  findingValid: true,
  sourceHashMatches: true,
  rangeValid: true,
  originalTextMatches: true,
  protectedRangeOverlap: false,
  conflictingActionOverlap: false,
  formattingStateKnown: true,
  proposedActionBuildable: true,
};

function reviewItem(input: {
  id: string;
  footnote: FootnoteSnapshot;
  ruleId: string;
  reviewClass?: ReviewItem["reviewClass"];
  status?: ReviewItem["decision"]["effectiveStatus"];
  metadata?: Record<string, unknown>;
  originalText?: string;
  suggestedText?: string;
}): ReviewItem {
  const originalText = input.originalText ?? input.footnote.contentText;
  const start = input.footnote.contentText.indexOf(originalText);
  const finding: Finding = {
    findingId: `finding-${input.id}`,
    footnoteId: input.footnote.id,
    footnoteOrdinal: input.footnote.ordinal,
    sourceTextHash: input.footnote.originalTextHash,
    ruleId: input.ruleId,
    category: input.ruleId.startsWith("FORMAT") ? "formatting" : "citation",
    start: Math.max(0, start),
    end: Math.max(0, start) + originalText.length,
    originalText,
    ...(input.suggestedText ? { suggestedText: input.suggestedText } : {}),
    severity: input.reviewClass === "INFO" ? "info" : "warning",
    message: `Meldung mit "Quote"; ${input.id}`,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
  const reviewClass = input.reviewClass ?? "AUTO";
  const status = input.status ?? "ACCEPTED";
  const proposedAction =
    input.suggestedText !== undefined
      ? {
          type: "TEXT_REPLACE" as const,
          start: finding.start,
          end: finding.end,
          originalText,
          replacementText: input.suggestedText,
        }
      : input.ruleId === "FORMAT_FONT_SIZE"
        ? {
            type: "FORMAT_CHANGE" as const,
            start: finding.start,
            end: finding.end,
            changes: { fontSize: 8 },
          }
        : undefined;
  return {
    reviewItemId: input.id,
    finding,
    reviewClass,
    classificationReason:
      reviewClass === "INFO"
        ? "INFORMATION_ONLY"
        : proposedAction?.type === "FORMAT_CHANGE"
          ? "DETERMINISTIC_FORMAT_CHANGE"
          : proposedAction
            ? "DETERMINISTIC_TEXT_CHANGE"
            : "NO_ACTION_AVAILABLE",
    ...(proposedAction ? { proposedAction } : {}),
    decision: {
      effectiveStatus: status,
      source: "USER",
      explicitStatus: status,
    },
    technicalEligibility: proposedAction
      ? eligible
      : { ...eligible, eligible: false, reasons: ["ACTION_NOT_BUILDABLE"] },
    conflicts: [],
    canAccept: Boolean(proposedAction),
    sourceTextHash: input.footnote.originalTextHash,
  };
}

function engineFor(
  entries: Array<{
    item: ReviewItem;
    mapping: CitationSourceMappingResolution;
  }>
): FootnoteEngineResult {
  return {
    findings: entries.map(({ item }) => item.finding),
    footnoteAnalyses: entries.map(({ item }) => ({
      footnoteId: item.finding.footnoteId,
      engineProtectedRanges: [],
      protectedRanges: [],
    })),
    parseResults: entries.map(({ item }) => ({
      footnoteId: item.finding.footnoteId,
      sourceTextHash: item.finding.sourceTextHash,
      segments: [
        {
          segmentId: `segment-${item.reviewItemId}`,
          footnoteId: item.finding.footnoteId,
          ordinal: 1,
          start: 0,
          end: item.finding.end,
          originalText: item.finding.originalText,
          modifiers: [],
          coreStart: 0,
          coreEnd: item.finding.end,
          coreText: item.finding.originalText,
          embeddedStatuteReferences: [],
          classification: { type: "OTHER", certainty: "low", signals: [] },
        },
      ],
    })),
    segmentAnalyses: entries.map(({ item, mapping }) => ({
      footnoteId: item.finding.footnoteId,
      segmentId: `segment-${item.reviewItemId}`,
      sourceMappings: [{ target: "PRIMARY_SOURCE" as const, resolution: mapping }],
      effectiveClassification: {
        parserType: "OTHER" as const,
        effectiveType: "COMMENTARY" as const,
        source: "SOURCE_MAPPING" as const,
        canonicalSourceId: mapping.canonicalSourceId,
        mappingKind: "COMMENTARY" as const,
      },
    })),
    analyzedFootnotes: entries.length,
    plainTextUrlCount: 0,
    engineProtectedRangeCount: 0,
    findingsBySeverity: { info: 0, warning: entries.length, error: 0 },
  };
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 1; index < csv.length; index += 1) {
    const char = csv[index];
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ";") {
      row.push(field);
      field = "";
    } else if (char === "\r" && csv[index + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      index += 1;
    } else field += char;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

const muekoFootnote = snapshot("MüKo-StGB/Fischer Rdnr. 4.", 1);
const palandtFootnote = snapshot("Palandt/Reiter § 464 BGB Rn. 2.", 2);
const dangerousFootnote = snapshot("=SUM(1;2)\nZeile zwei mit ß", 3);
const formattingFootnote = snapshot("Format", 4);
const staleFootnote = snapshot("Urteil", 5);
const mueko = reviewItem({
  id: "mueko",
  footnote: muekoFootnote,
  ruleId: "COMMENTARY_WORK_NAME",
  originalText: "MüKo-StGB",
  suggestedText: "MüKoStGB",
});
const palandt = reviewItem({
  id: "palandt",
  footnote: palandtFootnote,
  ruleId: "SOURCE_MAPPING_LEGACY_UNCERTAIN",
  reviewClass: "INFO",
  status: "UNREVIEWED",
  originalText: "Palandt",
  metadata: {
    canonicalSourceId: "commentary-bgb-grueneberg",
    preferredName: "Grüneberg",
    legacySafetyLevel: "UNCERTAIN",
  },
});
const dangerous = reviewItem({
  id: "dangerous",
  footnote: dangerousFootnote,
  ruleId: "CITATION_OTHER_REVIEW",
  reviewClass: "MANUAL",
  status: "DEFERRED",
  originalText: dangerousFootnote.contentText,
});
const fontSize = reviewItem({
  id: "font-size",
  footnote: formattingFootnote,
  ruleId: "FORMAT_FONT_SIZE",
  metadata: {
    formattingProperty: "fontSize",
    actual: 10,
    expected: 8,
    role: "technical",
    baselineSource: "LOCAL_DOMINANT_FORMAT",
  },
});
const italic = reviewItem({
  id: "italic-review",
  footnote: formattingFootnote,
  ruleId: "FORMAT_ITALIC_REVIEW",
  reviewClass: "MANUAL",
  status: "REJECTED",
  metadata: {
    formattingProperty: "italic",
    actual: false,
    expected: true,
    semanticRole: "unknown",
    baselineSource: "ROLE_SETTING",
  },
});
const stale = reviewItem({
  id: "stale",
  footnote: staleFootnote,
  ruleId: "CASE_LAW_DECISION_TYPE",
  originalText: "Urteil",
  suggestedText: "Urt.",
});

const items = [mueko, palandt, dangerous, fontSize, italic, stale];
const plan = createWriteBackPlan({ mode: "REVIEW", items, createdAt: "2026-08-23T12:34:00.000Z" });
const state: WriteBackState = {
  mueko: {
    reviewItemId: "mueko",
    status: "APPLIED",
    actionKind: "TEXT_REPLACE",
    appliedAt: "2026-08-23T12:35:00.000Z",
    localRevalidation: { status: "RELOCATED", resolvedStart: 1, resolvedEnd: 10 },
  },
  "font-size": {
    reviewItemId: "font-size",
    status: "FAILED",
    reason: "WORD_API_ERROR",
    message: "Fehler; Host",
  },
  stale: {
    reviewItemId: "stale",
    status: "STALE",
    reason: "LOCAL_TARGET_MISSING",
    message: "Erneut prüfen",
    localRevalidation: { status: "MISSING" },
  },
};
const engine = engineFor([
  {
    item: mueko,
    mapping: {
      status: "MATCHED",
      canonicalSourceId: "commentary-stgb-mueko-stgb",
      preferredName: "MüKoStGB",
      kind: "COMMENTARY",
      legacySafetyLevel: "PROBABLE",
    },
  },
  {
    item: palandt,
    mapping: {
      status: "MATCHED",
      canonicalSourceId: "commentary-bgb-grueneberg",
      preferredName: "Grüneberg",
      kind: "COMMENTARY",
      legacySafetyLevel: "UNCERTAIN",
    },
  },
]);

const rows = buildWriteBackReportRows({
  items,
  footnotes: [
    muekoFootnote,
    palandtFootnote,
    dangerousFootnote,
    formattingFootnote,
    staleFootnote,
  ],
  analysisTimestamp: "2026-08-23T12:34:00.000Z",
  plan,
  writeBackState: state,
  engineResult: engine,
});
assert(rows.length === items.length, "Every finding must produce one report row");
assert(
  new Set(rows.map((row) => row.WriteBackStatus)).has("APPLIED") &&
    new Set(rows.map((row) => row.WriteBackStatus)).has("STALE") &&
    new Set(rows.map((row) => row.WriteBackStatus)).has("FAILED"),
  "Applied, stale and failed findings must all remain present in the report"
);
assert(
  rows.every((row) => row.ReportSchemaVersion === String(CURRENT_WRITEBACK_REPORT_SCHEMA_VERSION)),
  "Every row must contain the stable report schema version"
);
assert(
  rows.find((row) => row.RuleId === "COMMENTARY_WORK_NAME")?.CanonicalSourceId ===
    "commentary-stgb-mueko-stgb",
  "MüKo mapping metadata must be exported"
);
const palandtRow = rows.find((row) => row.RuleId === "SOURCE_MAPPING_LEGACY_UNCERTAIN");
assert(
  palandtRow?.LegacySafetyLevel === "UNCERTAIN" && palandtRow.PlannedForWriteBack === "false",
  "Uncertain Palandt mapping must remain visible without an automatic write-back"
);
const fontRow = rows.find((row) => row.RuleId === "FORMAT_FONT_SIZE");
assert(
  fontRow?.FormattingProperty === "fontSize" &&
    fontRow.ActualFormattingValue === "10" &&
    fontRow.ExpectedFormattingValue === "8",
  "Formatting actual and expected values must have dedicated columns"
);
const italicRow = rows.find((row) => row.RuleId === "FORMAT_ITALIC_REVIEW");
assert(
  italicRow?.FormattingProperty === "italic" && italicRow.FormattingRole === "unknown",
  "Manual italic role metadata must be exported"
);

const csv = serializeWriteBackReportCsv(rows);
assert(csv.startsWith("\ufeff"), "CSV must start with the UTF-8 BOM");
assert(csv.includes(";"), "CSV must use semicolon delimiters");
assert(
  csv.includes("MüKo-StGB") && csv.includes("Grüneberg") && csv.includes("ß"),
  "Umlauts and ß must remain lossless"
);
const parsed = parseCsv(csv);
assert(
  parsed[0].join("|") === WRITEBACK_REPORT_HEADERS.join("|"),
  "CSV headers must retain their stable order"
);
assert(
  parsed.every((row) => row.length === WRITEBACK_REPORT_HEADERS.length),
  "Quoted semicolons and line breaks must preserve a stable column count"
);
const originalTextIndex = WRITEBACK_REPORT_HEADERS.indexOf("OriginalText");
const dangerousCsvRow = parsed.find((row) => row[originalTextIndex].includes("SUM(1;2)"));
assert(
  dangerousCsvRow?.[originalTextIndex].startsWith("'="),
  "Formula-like text must be neutralized before Excel opens the CSV"
);
assert(
  csv.includes('"Meldung mit ""Quote""; mueko"'),
  "Quotes must be doubled inside quoted fields"
);
assert(
  writeBackReportFileName(new Date(2026, 7, 23, 9, 5)) ===
    "Footnote-Checker-Bericht-2026-08-23-0905.csv",
  "Report filename must use a safe local timestamp"
);

const largeFootnotes = Array.from({ length: 1_200 }, (_, index) =>
  snapshot(`Fußnote ${index}`, index + 100)
);
const largeItems = largeFootnotes.map((footnote, index) =>
  reviewItem({
    id: `report-large-${index}`,
    footnote,
    ruleId: "FINAL_PERIOD",
    originalText: footnote.contentText,
    suggestedText: `${footnote.contentText}.`,
  })
);
const largePlan = createWriteBackPlan({ mode: "ANALYSIS", items: largeItems });
const started = performance.now();
const largeRows = buildWriteBackReportRows({
  items: largeItems,
  footnotes: largeFootnotes,
  analysisTimestamp: "2026-08-23T12:34:00.000Z",
  plan: largePlan,
});
const largeCsv = serializeWriteBackReportCsv(largeRows);
const durationMs = performance.now() - started;
assert(largeRows.length === 1_200 && largeCsv.length > 1_200, "Large report must contain all rows");
assert(durationMs < 2_000, `1,200-row report must remain practical (${durationMs} ms)`);

console.log(
  `POC 15 CSV BOM/delimiter/quoting/formula/mapping/formatting tests passed; 1,200-row report: ${durationMs.toFixed(1)} ms.`
);
