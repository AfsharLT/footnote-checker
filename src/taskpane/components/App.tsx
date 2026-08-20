import * as React from "react";
import { useMemo, useRef, useState } from "react";
import { Button, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { resolveCitationSegmentSources } from "../../citation-mapping/resolver";
import type { CitationSourceMappingResolution } from "../../citation-mapping/types";
import { useCitationSourceMapping } from "../../citation-mapping/use-citation-source-mapping";
import { useCitationSettings } from "../../citation-settings/use-citation-settings";
import { analyzeFootnotes } from "../../footnote-engine/engine";
import type {
  CaseLawPublicationReference,
  CitationExtractionResult,
  CitationLocator,
  Finding,
  FootnoteAnalysisResult,
  FootnoteEngineResult,
  FootnoteParseResult,
} from "../../footnote-engine/types";
import { formatReaderError } from "../reader-error";
import {
  CharacterFormat,
  DocumentFormattingSnapshot,
  FootnoteReadProgress,
  FootnoteReadResult,
  FootnoteSnapshot,
  FormattingRun,
  createFootnoteReadProgress,
  readFootnotes,
} from "../taskpane";

const SettingsPanel = React.lazy(() =>
  import("./SettingsPanel").then((module) => ({ default: module.SettingsPanel }))
);

function formatBoolean(value: boolean | undefined): string {
  if (value === undefined) {
    return "Nicht verfügbar";
  }

  return value ? "Ja" : "Nein";
}

function formatValue(value: string | number | null | undefined): string {
  return value === undefined || value === null || value === "" ? "–" : value.toString();
}

const characterFormatLabels: Record<keyof CharacterFormat, string> = {
  fontName: "Font",
  fontSize: "Size",
  bold: "Bold",
  italic: "Italic",
  underline: "Underline",
  strikeThrough: "Strike",
  superscript: "Superscript",
  subscript: "Subscript",
  fontColor: "Color",
  highlightColor: "Highlight",
  characterSpacing: "Character Spacing",
};

function formatCharacterValue(
  property: keyof CharacterFormat,
  value: CharacterFormat[keyof CharacterFormat]
): string {
  if (value === undefined) {
    return "unavailable";
  }

  if (value === "" || value === "Mixed" || (value === null && property !== "highlightColor")) {
    return "mixed";
  }

  if (value === null) {
    return "none";
  }

  if (typeof value === "boolean") {
    return value.toString();
  }

  const unit = property === "fontSize" || property === "characterSpacing" ? " pt" : "";
  return `${value}${unit}`;
}

function describeFormattingRun(run: FormattingRun): string {
  return (Object.keys(characterFormatLabels) as Array<keyof CharacterFormat>)
    .filter((property) => Object.prototype.hasOwnProperty.call(run, property))
    .map(
      (property) =>
        `${characterFormatLabels[property]}: ${formatCharacterValue(property, run[property])}`
    )
    .join(" · ");
}

function describeLocator(locator: CitationLocator): string {
  const value = locator.value ?? locator.values?.join(", ") ?? locator.rawText;
  const range = locator.rangeEnd ? `–${locator.rangeEnd}` : "";
  const suffix = locator.suffix ? ` [suffix: ${locator.suffix}]` : "";
  return `${value}${range}${suffix}`;
}

function describeCasePublication(publication: CaseLawPublicationReference): string[] {
  switch (publication.kind) {
    case "officialCollection":
      return [
        `Official Collection: ${publication.collection.rawText}`,
        ...(publication.volume ? [`Volume: ${publication.volume.rawText}`] : []),
        ...(publication.firstPage ? [`First Page: ${describeLocator(publication.firstPage)}`] : []),
        ...(publication.pinpointPages.length > 0
          ? [`Pinpoints: ${publication.pinpointPages.map(describeLocator).join(", ")}`]
          : []),
      ];
    case "journal":
      return [
        `Journal Citation: ${publication.journal.rawText}`,
        ...(publication.year ? [`Publication Year: ${publication.year.rawText}`] : []),
        ...(publication.firstPage ? [`First Page: ${describeLocator(publication.firstPage)}`] : []),
        ...(publication.pinpointPages.length > 0
          ? [`Pinpoints: ${publication.pinpointPages.map(describeLocator).join(", ")}`]
          : []),
      ];
    case "database":
      return [
        `Database Citation: ${publication.database.rawText}`,
        ...(publication.year ? [`Database Year: ${publication.year.rawText}`] : []),
        ...(publication.identifier
          ? [`Database Identifier: ${publication.identifier.rawText}`]
          : []),
      ];
  }
}

function describeExtraction(extraction: CitationExtractionResult): string[] {
  switch (extraction.type) {
    case "STATUTE":
      return [
        `Sections: ${
          extraction.data.sections
            .map(
              (section) =>
                `${section.section.rawText}${section.suffix ? ` [suffix: ${section.suffix.rawText}]` : ""}`
            )
            .join(", ") || "–"
        }`,
        `Law: ${extraction.data.law?.rawText ?? "–"}`,
        `Context: ${extraction.data.referenceContext}`,
      ];
    case "CASE_LAW":
      return [
        `Citation Form: ${extraction.data.citationForm}`,
        ...(extraction.data.court ? [`Court: ${extraction.data.court.rawText}`] : []),
        ...(extraction.data.derivedCourt
          ? [
              `Derived Court: ${extraction.data.derivedCourt.value}`,
              `Derived Source: ${extraction.data.derivedCourt.source}`,
            ]
          : []),
        ...(extraction.data.decisionType
          ? [
              `Decision Type: ${extraction.data.decisionType.rawText}${extraction.data.decisionTypeNormalized ? ` → ${extraction.data.decisionTypeNormalized}` : ""}`,
            ]
          : []),
        ...(extraction.data.date
          ? [
              `Date: ${extraction.data.date.rawText}${extraction.data.normalizedDate ? ` → ${extraction.data.normalizedDate}` : ""}`,
            ]
          : []),
        ...(extraction.data.docketNumber
          ? [`Docket: ${extraction.data.docketNumber.rawText}`]
          : []),
        ...extraction.data.parallelCitations.flatMap(describeCasePublication),
      ];
    case "COMMENTARY":
      return [
        `Work: ${extraction.data.work?.rawText ?? "–"}`,
        `Persons: ${extraction.data.persons.map((person) => `${person.rawText} [${person.role}]`).join(", ") || "–"}`,
        `Margin Numbers: ${extraction.data.marginNumbers.map((locator) => locator.value).join(", ") || "–"}`,
      ];
    case "BOOK":
      return [
        `Authors: ${extraction.data.authors.map((person) => person.rawText).join(", ") || "–"}`,
        `Title: ${extraction.data.title?.rawText ?? "–"}`,
        `Work Section: ${extraction.data.workSection?.rawText ?? "–"}`,
        `Margin Numbers: ${extraction.data.marginNumbers.map((locator) => locator.rawText).join(", ") || "–"}`,
      ];
    case "JOURNAL_ARTICLE":
      return [
        `Authors: ${extraction.data.authors.map((person) => person.rawText).join(", ") || "–"}`,
        `Journal: ${extraction.data.journal?.rawText ?? "–"}`,
        `Year: ${extraction.data.year?.rawText ?? "–"}`,
        `First Page: ${extraction.data.firstPage ? describeLocator(extraction.data.firstPage) : "–"}`,
        `Pinpoints: ${extraction.data.pinpointPages.map(describeLocator).join(", ") || "–"}`,
      ];
    case "BOOK_CHAPTER":
      return [
        `Authors: ${extraction.data.authors.map((person) => person.rawText).join(", ") || "–"}`,
        `Container: ${extraction.data.containerTitle?.rawText ?? "–"}`,
        `Pages: ${extraction.data.pinpointPages.map((locator) => locator.rawText).join(", ") || "–"}`,
      ];
    case "CASE_NOTE":
      return [
        `Authors: ${extraction.data.authors.map((person) => person.rawText).join(", ") || "–"}`,
        `Marker: ${extraction.data.noteMarker?.rawText ?? "–"}`,
        `Annotated Court: ${extraction.data.annotatedCase?.court?.rawText ?? "–"}`,
      ];
    case "LEGISLATIVE_MATERIAL":
      return [
        `Material: ${extraction.data.body?.rawText ?? "–"}-${extraction.data.documentType?.rawText ?? "–"} ${extraction.data.legislativeTerm?.rawText ?? "–"}/${extraction.data.documentNumber?.rawText ?? "–"}`,
        `Pages: ${extraction.data.pages.map((locator) => locator.rawText).join(", ") || "–"}`,
      ];
    case "ONLINE_SOURCE":
      return [
        `Title: ${extraction.data.title?.rawText ?? "–"}`,
        `URL: ${extraction.data.url?.rawText ?? "–"}`,
        `Access Date: ${extraction.data.accessDate?.normalizedValue ?? extraction.data.accessDate?.rawText ?? "–"}`,
      ];
    case "ADMINISTRATIVE_MATERIAL":
      return [
        `Authority: ${extraction.data.authority?.rawText ?? "–"}`,
        `Document Type: ${extraction.data.documentType?.rawText ?? "–"}`,
        `Date: ${extraction.data.date?.normalizedValue ?? extraction.data.date?.rawText ?? "–"}`,
        `File Number: ${extraction.data.fileNumber?.rawText ?? "–"}`,
      ];
    case "OTHER":
      return [
        `URLs: ${extraction.data.urls.length}`,
        `Reference Candidates: ${extraction.data.referenceCandidates.length}`,
      ];
  }
}

function describeSourceMapping(resolution: CitationSourceMappingResolution): string[] {
  if (resolution.status === "UNMATCHED") return ["Mapping: UNMATCHED"];
  if (resolution.status === "AMBIGUOUS") {
    return [
      "Mapping: AMBIGUOUS",
      `Candidates: ${resolution.candidateCanonicalSourceIds?.join(", ") ?? "–"}`,
    ];
  }
  return [
    "Mapping: MATCHED",
    `Canonical: ${resolution.preferredName ?? "–"}`,
    `Matched via: ${resolution.matchedAlias ?? resolution.matchedText ?? "–"}`,
    `Match Source: ${resolution.matchSource ?? "–"}`,
    `Kind: ${resolution.kind ?? "–"}`,
    `Legal Area: ${resolution.legalArea ?? "–"}`,
    ...(resolution.commentedLaw ? [`Commented Law: ${resolution.commentedLaw}`] : []),
    ...(resolution.legacySafetyLevel ? [`Legacy Safety: ${resolution.legacySafetyLevel}`] : []),
    ...(resolution.personStructureHint
      ? [`Person Structure Hint: ${resolution.personStructureHint}`]
      : []),
  ];
}

const useStyles = makeStyles({
  root: {
    minHeight: "100vh",
    boxSizing: "border-box",
    padding: "40px 24px",
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
  },
  content: {
    maxWidth: "520px",
    margin: "0 auto",
  },
  title: {
    margin: "0 0 8px",
    color: "#12355b",
    fontSize: "28px",
    lineHeight: "36px",
    fontWeight: tokens.fontWeightSemibold,
  },
  description: {
    margin: "0 0 28px",
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase400,
    lineHeight: tokens.lineHeightBase400,
  },
  button: {
    width: "100%",
    minHeight: "44px",
    backgroundColor: "#12355b",
    color: tokens.colorNeutralForegroundOnBrand,
    ":hover": {
      backgroundColor: "#0d2947",
    },
    ":hover:active": {
      backgroundColor: "#091f36",
    },
  },
  secondaryButton: {
    width: "100%",
    minHeight: "40px",
    marginTop: "10px",
  },
  progressPanel: {
    display: "grid",
    gap: "6px",
    marginTop: "10px",
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase300,
  },
  progressTrack: {
    width: "100%",
    height: "8px",
    overflow: "hidden",
    borderRadius: "999px",
    backgroundColor: tokens.colorNeutralBackground4,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#12355b",
    transitionProperty: "width",
    transitionDuration: "120ms",
  },
  progressText: { margin: 0 },
  results: {
    minHeight: "180px",
    marginTop: "24px",
    padding: "20px",
    boxSizing: "border-box",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  resultItem: {
    ":not(:last-child)": {
      marginBottom: "24px",
      paddingBottom: "24px",
      borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    },
  },
  findingResultItem: {
    paddingLeft: "16px",
    borderLeft: `4px solid ${tokens.colorPaletteRedBorder2}`,
  },
  resultTitle: {
    margin: "0 0 8px",
    color: "#12355b",
    fontSize: tokens.fontSizeBase400,
    lineHeight: tokens.lineHeightBase400,
    fontWeight: tokens.fontWeightSemibold,
  },
  resultText: {
    margin: "4px 0 0",
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase400,
    whiteSpace: "pre-wrap",
  },
  findingCount: {
    margin: "4px 0 12px",
    color: tokens.colorPaletteRedForeground1,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase400,
    fontWeight: tokens.fontWeightSemibold,
  },
  findingItem: {
    margin: "12px 0",
    padding: "12px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  findingTitle: {
    margin: "0 0 6px",
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase400,
    fontWeight: tokens.fontWeightSemibold,
  },
  findingSeverityError: {
    color: tokens.colorPaletteRedForeground1,
  },
  findingSeverityWarning: {
    color: tokens.colorPaletteDarkOrangeForeground1,
  },
  findingSeverityInfo: {
    color: "#12355b",
  },
  message: {
    margin: 0,
    color: tokens.colorNeutralForeground2,
  },
  error: {
    margin: 0,
    color: tokens.colorPaletteRedForeground1,
    whiteSpace: "pre-wrap",
  },
});

const App: React.FC = () => {
  const styles = useStyles();
  const { activeProfile, updateProfile } = useCitationSettings();
  const { mappingData, mappingIndex, updateMapping } = useCitationSourceMapping();
  const [view, setView] = useState<"ANALYSIS" | "SETTINGS">("ANALYSIS");
  const [footnotes, setFootnotes] = useState<FootnoteSnapshot[]>([]);
  const [documentFormatting, setDocumentFormatting] = useState<DocumentFormattingSnapshot | null>(
    null
  );
  const [readerMetrics, setReaderMetrics] = useState<FootnoteReadResult["readerMetrics"] | null>(
    null
  );
  const [engineResult, setEngineResult] = useState<FootnoteEngineResult | null>(null);
  const [message, setMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [readProgress, setReadProgress] = useState<FootnoteReadProgress | null>(null);
  const [hasError, setHasError] = useState<boolean>(false);
  const readInProgressRef = useRef(false);
  const findingsByFootnoteId = useMemo(() => {
    const result = new Map<string, Finding[]>();

    for (const finding of engineResult?.findings ?? []) {
      const footnoteFindings = result.get(finding.footnoteId);

      if (footnoteFindings) {
        footnoteFindings.push(finding);
      } else {
        result.set(finding.footnoteId, [finding]);
      }
    }

    return result;
  }, [engineResult]);
  const analysesByFootnoteId = useMemo(() => {
    const result = new Map<string, FootnoteAnalysisResult>();

    for (const analysis of engineResult?.footnoteAnalyses ?? []) {
      result.set(analysis.footnoteId, analysis);
    }

    return result;
  }, [engineResult]);
  const parseResultsByFootnoteId = useMemo(() => {
    const result = new Map<string, FootnoteParseResult>();

    for (const parseResult of engineResult?.parseResults ?? []) {
      result.set(parseResult.footnoteId, parseResult);
    }

    return result;
  }, [engineResult]);

  const handleReadFootnotes = async () => {
    if (readInProgressRef.current) return;
    readInProgressRef.current = true;
    setIsLoading(true);
    setHasError(false);
    setMessage("");
    setReaderMetrics(null);
    setEngineResult(null);

    try {
      const result = await readFootnotes(setReadProgress);
      setFootnotes(result.footnotes);
      setDocumentFormatting(result.documentFormatting);
      setReaderMetrics(result.readerMetrics);
      setReadProgress(
        createFootnoteReadProgress("analyzing", result.footnotes.length, result.footnotes.length)
      );
      const analysis = analyzeFootnotes(result.footnotes);
      setEngineResult(analysis);
      setReadProgress(
        createFootnoteReadProgress("complete", result.footnotes.length, result.footnotes.length)
      );

      if (result.footnotes.length === 0) {
        setMessage("Das Dokument enthält keine Fußnoten.");
      }
    } catch (error) {
      setFootnotes([]);
      setDocumentFormatting(null);
      setReaderMetrics(null);
      setEngineResult(null);
      setHasError(true);
      setMessage(formatReaderError(error));
      setReadProgress(null);
    } finally {
      readInProgressRef.current = false;
      setIsLoading(false);
    }
  };

  if (view === "SETTINGS") {
    return (
      <main className={styles.root}>
        <div className={styles.content}>
          <React.Suspense
            fallback={<p className={styles.message}>Einstellungen werden geladen …</p>}
          >
            <SettingsPanel
              activeProfile={activeProfile}
              mappingData={mappingData}
              onSaveProfile={updateProfile}
              onSaveMapping={updateMapping}
              onClose={() => setView("ANALYSIS")}
            />
          </React.Suspense>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.root}>
      <div className={styles.content}>
        <h1 className={styles.title}>Footnote Checker</h1>
        <p className={styles.description}>Analyse und Prüfung juristischer Fußnoten</p>
        <Button
          className={styles.button}
          appearance="primary"
          size="large"
          disabled={isLoading}
          onClick={handleReadFootnotes}
        >
          {isLoading ? "Fußnoten werden ausgelesen …" : "Fußnoten auslesen"}
        </Button>
        {readProgress && (
          <div className={styles.progressPanel} aria-live="polite">
            <span>
              {readProgress.phase === "initializing"
                ? "Fußnoten werden vorbereitet …"
                : readProgress.phase === "analyzing"
                  ? "Fußnoten werden analysiert …"
                  : readProgress.phase === "complete"
                    ? "Fußnotenverarbeitung abgeschlossen"
                    : "Fußnoten werden ausgelesen …"}
            </span>
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-label="Fortschritt der Fußnotenverarbeitung"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={readProgress.percent}
            >
              <div className={styles.progressFill} style={{ width: `${readProgress.percent}%` }} />
            </div>
            <p className={styles.progressText}>
              {readProgress.total > 0
                ? `${readProgress.processed.toLocaleString("de-DE")} / ${readProgress.total.toLocaleString("de-DE")} Fußnoten · ${readProgress.percent} %`
                : `${readProgress.percent} %`}
            </p>
          </div>
        )}
        <Button className={styles.secondaryButton} onClick={() => setView("SETTINGS")}>
          Einstellungen öffnen
        </Button>
        <section className={styles.results} aria-label="Ergebnisse" aria-live="polite">
          {message && <p className={hasError ? styles.error : styles.message}>{message}</p>}
          {readerMetrics && (
            <article className={styles.resultItem}>
              <h2 className={styles.resultTitle}>Reader</h2>
              <p className={styles.resultText}>Fußnoten: {readerMetrics.footnoteCount}</p>
              <p className={styles.resultText}>Dauer: {readerMetrics.durationMs} ms</p>
              <p className={styles.resultText}>
                complete: {readerMetrics.completeCount} · partial: {readerMetrics.partialCount} ·
                failed: {readerMetrics.failedCount}
              </p>
            </article>
          )}
          {engineResult && (
            <article className={styles.resultItem}>
              <h2 className={styles.resultTitle}>Footnote Engine</h2>
              <p className={styles.resultText}>
                Analysierte Fußnoten: {engineResult.analyzedFootnotes}
              </p>
              <p className={styles.resultText}>Findings: {engineResult.findings.length}</p>
              <p className={styles.resultText}>
                Erkannte Klartext-URLs: {engineResult.plainTextUrlCount}
              </p>
              <p className={styles.resultText}>
                Engine Protected Ranges: {engineResult.engineProtectedRangeCount}
              </p>
              <p className={styles.resultText}>
                Errors: {engineResult.findingsBySeverity.error} · Warnings:{" "}
                {engineResult.findingsBySeverity.warning} · Infos:{" "}
                {engineResult.findingsBySeverity.info}
              </p>
              {engineResult.durationMs !== undefined && (
                <p className={styles.resultText}>Dauer: {engineResult.durationMs} ms</p>
              )}
            </article>
          )}
          {documentFormatting && (
            <article className={styles.resultItem}>
              <h2 className={styles.resultTitle}>Dokumentformatierung</h2>
              <p className={styles.resultText}>
                Automatische Silbentrennung: {formatBoolean(documentFormatting.autoHyphenation)}
              </p>
              <p className={styles.resultText}>
                Großbuchstaben trennen: {formatBoolean(documentFormatting.hyphenateCaps)}
              </p>
              <p className={styles.resultText}>
                Aufeinanderfolgende Trennstriche:{" "}
                {formatValue(documentFormatting.consecutiveHyphensLimit)}
              </p>
              <p className={styles.resultText}>
                Silbentrennungszone: {formatValue(documentFormatting.hyphenationZone)}
              </p>
            </article>
          )}
          {footnotes.map((footnote) => {
            const findings = findingsByFootnoteId.get(footnote.id) ?? [];
            const analysis = analysesByFootnoteId.get(footnote.id);
            const engineProtectedRanges = analysis?.engineProtectedRanges ?? [];
            const citationSegments = parseResultsByFootnoteId.get(footnote.id)?.segments ?? [];

            return (
              <article
                className={mergeClasses(
                  styles.resultItem,
                  findings.length > 0 ? styles.findingResultItem : undefined
                )}
                key={footnote.id}
              >
                <h2 className={styles.resultTitle}>Fußnote {footnote.ordinal}</h2>
                <p className={findings.length > 0 ? styles.findingCount : styles.resultText}>
                  Findings: {findings.length}
                </p>
                {findings.map((finding) => (
                  <div className={styles.findingItem} key={finding.findingId}>
                    <h3 className={styles.findingTitle}>Finding</h3>
                    <p className={styles.resultText}>Rule: {finding.ruleId}</p>
                    <p className={styles.resultText}>Category: {finding.category}</p>
                    <p
                      className={mergeClasses(
                        styles.resultText,
                        finding.severity === "error"
                          ? styles.findingSeverityError
                          : finding.severity === "warning"
                            ? styles.findingSeverityWarning
                            : styles.findingSeverityInfo
                      )}
                    >
                      Severity: {finding.severity}
                    </p>
                    <p className={styles.resultText}>Message: {finding.message}</p>
                    <p className={styles.resultText}>
                      Range: [{finding.start}, {finding.end})
                    </p>
                    <p className={styles.resultText}>Original: {finding.originalText}</p>
                    {finding.suggestedText !== undefined && (
                      <p className={styles.resultText}>Vorschlag: {finding.suggestedText}</p>
                    )}
                  </div>
                ))}
                <p className={styles.resultText}>Citation Segments: {citationSegments.length}</p>
                {citationSegments.map((segment) => (
                  <div className={styles.findingItem} key={segment.segmentId}>
                    <h3 className={styles.findingTitle}>Segment {segment.ordinal}</h3>
                    <p className={styles.resultText}>
                      Range: [{segment.start}, {segment.end})
                    </p>
                    <p className={styles.resultText}>Original: {segment.originalText}</p>
                    <p className={styles.resultText}>
                      Modifier:{" "}
                      {segment.modifiers.map((modifier) => modifier.text).join(", ") || "keine"}
                    </p>
                    <p className={styles.resultText}>Core: {segment.coreText}</p>
                    <p className={styles.resultText}>Type: {segment.classification.type}</p>
                    <p className={styles.resultText}>
                      Certainty: {segment.classification.certainty}
                    </p>
                    {segment.classification.caseLawForm && (
                      <p className={styles.resultText}>
                        Citation Form: {segment.classification.caseLawForm}
                      </p>
                    )}
                    <div className={styles.resultText}>
                      Signals:
                      <ul>
                        {segment.classification.signals.map((signal, signalIndex) => (
                          <li key={`${signal.code}-${signal.start ?? ""}-${signalIndex}`}>
                            {signal.code}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <p className={styles.resultText}>
                      Reference Candidates: {segment.embeddedStatuteReferences.length}
                    </p>
                    {segment.embeddedStatuteReferences.length > 0 && (
                      <ul className={styles.resultText}>
                        {segment.embeddedStatuteReferences.map((reference) => (
                          <li key={`${reference.start}-${reference.end}`}>
                            {reference.originalText} [{reference.start}, {reference.end}) · section:{" "}
                            {reference.section ?? reference.sections?.join(", ") ?? "–"} ·
                            paragraph: {reference.paragraph ?? "–"} · sentence:{" "}
                            {reference.sentence ?? "–"} · law: {reference.law ?? "–"} · context:{" "}
                            {reference.referenceContext ?? "unknown"}
                          </li>
                        ))}
                      </ul>
                    )}
                    {segment.extraction && (
                      <div className={styles.resultText}>
                        <p className={styles.resultText}>
                          Extraction Status: {segment.extraction.status}
                        </p>
                        <ul>
                          {describeExtraction(segment.extraction).map((line, lineIndex) => (
                            <li key={`${lineIndex}-${line}`}>{line}</li>
                          ))}
                        </ul>
                        <p className={styles.resultText}>
                          Unparsed:{" "}
                          {segment.extraction.unparsedRemainder.length === 0
                            ? "none"
                            : segment.extraction.unparsedRemainder
                                .map((span) => `“${span.rawText}”`)
                                .join(", ")}
                        </p>
                      </div>
                    )}
                    {resolveCitationSegmentSources(segment, mappingIndex).map(
                      (sourceMapping, mappingIndexValue) => (
                        <div
                          className={styles.resultText}
                          key={`${sourceMapping.target}-${sourceMapping.publicationIndex ?? "primary"}-${mappingIndexValue}`}
                        >
                          <p className={styles.resultText}>
                            Source Mapping Target: {sourceMapping.target}
                          </p>
                          <ul>
                            {describeSourceMapping(sourceMapping.resolution).map(
                              (line, lineIndex) => (
                                <li key={`${lineIndex}-${line}`}>{line}</li>
                              )
                            )}
                          </ul>
                        </div>
                      )
                    )}
                  </div>
                ))}
                <p className={styles.resultText}>ID: {footnote.id}</p>
                <p className={styles.resultText}>
                  Label: {footnote.displayLabel || "Nicht verfügbar"}
                </p>
                <p className={styles.resultText}>Text: {footnote.contentText}</p>
                <p className={styles.resultText}>Länge: {footnote.contentLength}</p>
                <p className={styles.resultText}>Hash: {footnote.originalTextHash}</p>
                <p className={styles.resultText}>Read Status: {footnote.readStatus}</p>
                {footnote.readWarnings.length === 0 ? (
                  <p className={styles.resultText}>Warnings: keine</p>
                ) : (
                  <div className={styles.resultText}>
                    Warnings:
                    <ul>
                      {footnote.readWarnings.map((warning) => (
                        <li key={warning.code}>{warning.code}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className={styles.resultText}>Kontext davor: {footnote.locator.contextBefore}</p>
                <p className={styles.resultText}>Kontext danach: {footnote.locator.contextAfter}</p>
                {footnote.locator.paragraphIndex !== undefined && (
                  <p className={styles.resultText}>
                    Absatzindex: {footnote.locator.paragraphIndex}
                  </p>
                )}
                <p className={styles.resultText}>Absätze: {footnote.paragraphCount}</p>
                <div className={styles.resultText}>
                  Geschützte Strukturen:
                  <ul>
                    <li>Hyperlinks: {footnote.hyperlinks.length}</li>
                    <li>Fields: {footnote.fields.length}</li>
                    <li>Bookmarks: {footnote.bookmarks.length}</li>
                    <li>Content Controls: {footnote.contentControls.length}</li>
                  </ul>
                </div>
                <div className={styles.resultText}>
                  Engine-Schutzbereiche:
                  <ul>
                    <li>Plain-Text-URLs: {engineProtectedRanges.length}</li>
                  </ul>
                </div>
                {engineProtectedRanges.map((range, rangeIndex) => (
                  <p
                    className={styles.resultText}
                    key={`${range.type}-${range.start}-${range.end}-${rangeIndex}`}
                  >
                    {range.type} [{range.start}, {range.end}): {range.text}
                  </p>
                ))}
                <p className={styles.resultText}>
                  Gemeinsame Protected Ranges: Reader {footnote.protectedRanges.length} · Engine{" "}
                  {engineProtectedRanges.length}
                </p>
                {footnote.protectedRanges.length === 0 ? (
                  <p className={styles.resultText}>Reader Protected Ranges: keine</p>
                ) : (
                  <div className={styles.resultText}>
                    Reader Protected Ranges:
                    <ul>
                      {footnote.protectedRanges.map((range, rangeIndex) => (
                        <li key={`${range.type}-${range.start}-${range.end}-${rangeIndex}`}>
                          {range.type} [{range.start}, {range.end})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {footnote.hyperlinks.length === 0 ? (
                  <p className={styles.resultText}>Hyperlinks: keine</p>
                ) : (
                  <div className={styles.resultText}>
                    Hyperlinks:
                    <ul>
                      {footnote.hyperlinks.map((hyperlink, hyperlinkIndex) => (
                        <li key={`${hyperlink.target}-${hyperlinkIndex}`}>
                          {hyperlink.displayText}: {hyperlink.target}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className={styles.resultText}>
                  Base Format:
                  <ul>
                    {(Object.keys(characterFormatLabels) as Array<keyof CharacterFormat>).map(
                      (property) => (
                        <li key={property}>
                          {characterFormatLabels[property]}:{" "}
                          {formatCharacterValue(property, footnote.baseCharacterFormat?.[property])}
                        </li>
                      )
                    )}
                  </ul>
                </div>
                <p className={styles.resultText}>
                  {footnote.formattingRuns.length === 0
                    ? "Formatting Runs: keine Abweichungen"
                    : `Formatting Runs: ${footnote.formattingRuns.length}`}
                </p>
                {footnote.formattingRuns.map((run, runIndex) => (
                  <p className={styles.resultText} key={`${run.start}-${run.end}-${runIndex}`}>
                    Run {runIndex + 1}: [{run.start}, {run.end}) · {describeFormattingRun(run)}
                  </p>
                ))}
                {footnote.paragraphFormats.map((paragraph) => (
                  <p className={styles.resultText} key={`paragraph-format-${paragraph.index}`}>
                    Absatz {paragraph.index + 1}: Style {formatValue(paragraph.styleName)} ·
                    Zeilenabstand {formatValue(paragraph.lineSpacing)} · Vor/Nach{" "}
                    {formatValue(paragraph.spaceBefore)}/{formatValue(paragraph.spaceAfter)} ·
                    Einzüge L/R/Erste {formatValue(paragraph.leftIndent)}/
                    {formatValue(paragraph.rightIndent)}/{formatValue(paragraph.firstLineIndent)} ·
                    Ausrichtung {formatValue(paragraph.alignment)}
                  </p>
                ))}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
};

export default App;
