import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import {
  ArrowUp,
  AlertTriangle,
  Check,
  CheckCheck,
  CircleAlert,
  Clock3,
  Download,
  Filter,
  Info,
  LoaderCircle,
  Play,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  X,
} from "lucide-react";
import { Collapsible } from "@/components/ui/collapsible";
import { FilterSelect, type FilterOption } from "@/components/ui/filter-select";
import { NeonButton } from "@/components/ui/neon-button";
import { LoadingProgress } from "./LoadingProgress";
import { loadingDisplay } from "../loading-progress";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { documentSourceForCitationItem } from "@/document-source-registry";
import { BrandLogo } from "@/taskpane/components/BrandLogo";
import { DocumentSourceReview } from "@/taskpane/components/DocumentSourceReview";
import type { FootnoteEngineResult } from "@/footnote-engine/types";
import {
  REVIEW_CLASS_LABELS,
  REVIEW_REASON_LABELS,
  REVIEW_STATUS_LABELS,
  canMarkManuallyChecked,
  type ReviewDecisionState,
  type ReviewEngineResult,
  type ReviewItem,
  type ReviewMode,
  type ReviewStatus,
} from "@/review-engine";
import {
  CATEGORY_LABELS,
  citationPreviewForFinding,
  createClosedFootnoteState,
  DEFAULT_REVIEW_FILTERS,
  SEVERITY_LABELS,
  deduplicateMessages,
  formatFormattingValue,
  getRuleTitle,
  hasActiveFilters,
  prepareReviewDisplay,
  setFootnoteOpen,
  type ReviewFilters,
  type ReviewFootnoteGroup,
  type OpenFootnoteState,
} from "@/taskpane/review-ui";
import type {
  DocumentFormattingSnapshot,
  FootnoteReadProgress,
  FootnoteReadResult,
  FootnoteSnapshot,
} from "@/taskpane/taskpane";
import { userMessageForReadWarning } from "@/taskpane/taskpane";
import type { HostCapabilities } from "@/taskpane/host-capabilities";
import type { AnalysisPerformanceMetrics, HostWorkState } from "@/taskpane/performance";
import {
  canApplySingleReviewItem,
  writeBackResultLabel,
  writeBackResultForItem,
  type BatchProgress,
  type BatchRunStatus,
  type BatchWriteBackResult,
  type WriteBackPlan,
  type WriteBackResult,
  type WriteBackState,
  type WriteBackStatus,
} from "@/write-back-engine";

const MODE_OPTIONS: Array<{ value: ReviewMode; label: string }> = [
  { value: "ANALYSIS", label: "Analyse" },
  { value: "REVIEW", label: "Prüfung" },
  { value: "CORRECTION", label: "Korrektur" },
];

const SEVERITY_OPTIONS: FilterOption[] = [
  { value: "ALL", label: "Alle" },
  { value: "error", label: "Fehler" },
  { value: "warning", label: "Warnungen" },
  { value: "info", label: "Hinweise" },
];
const REVIEW_CLASS_OPTIONS: FilterOption[] = [
  { value: "ALL", label: "Alle" },
  { value: "AUTO", label: "Automatisch" },
  { value: "MANUAL", label: "Prüfen" },
  { value: "TECHNICAL", label: "Technisch" },
  { value: "INFO", label: "Hinweis" },
];
const STATUS_OPTIONS: FilterOption[] = [
  { value: "ALL", label: "Alle" },
  { value: "UNREVIEWED", label: "Offen" },
  { value: "ACCEPTED", label: "Übernehmen" },
  { value: "MANUALLY_CHECKED", label: "Manuell geprüft" },
  { value: "REJECTED", label: "Abgelehnt" },
  { value: "DEFERRED", label: "Später prüfen" },
];
const CATEGORY_OPTIONS: FilterOption[] = [
  { value: "ALL", label: "Alle" },
  ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
];

interface ReviewWorkspaceProps {
  mode: ReviewMode;
  onModeChange(mode: ReviewMode): void;
  isLoading: boolean;
  progress: FootnoteReadProgress | null;
  onAnalyze(): void;
  onOpenSettings(): void;
  footnotes: FootnoteSnapshot[];
  engineResult: FootnoteEngineResult | null;
  reviewResult: ReviewEngineResult | null;
  autoCloseInactiveFootnotes: boolean;
  decisionState: ReviewDecisionState;
  onSetStatus(item: ReviewItem, status: ReviewStatus): void;
  onClearStatus(item: ReviewItem): void;
  onAcceptAllAutomatic(): void;
  onResetDecisions(): void;
  writeBackState: WriteBackState;
  onApplySingle(item: ReviewItem): void;
  onRunReviewBatch(): void;
  onExportDetailReport(): void;
  batchRunStatus: BatchRunStatus;
  batchProgress: BatchProgress | null;
  batchResult: BatchWriteBackResult | null;
  currentPlan: WriteBackPlan | null;
  reportError: string;
  technicalError: string;
  message: string;
  hasError: boolean;
  readerMetrics: FootnoteReadResult["readerMetrics"] | null;
  documentFormatting: DocumentFormattingSnapshot | null;
  hostCapabilities: HostCapabilities;
  analysisPerformance: AnalysisPerformanceMetrics | null;
  hostWorkState: HostWorkState;
  confirmReanalysis: boolean;
  onCancelReanalysis(): void;
  onConfirmReanalysis(): void;
  showSourceReview: boolean;
  onOpenSourceReview(): void;
  onCloseSourceReview(): void;
  onPromoteDocumentSources(documentSourceIds: string[]): void;
  sourcePromotionMessage: string;
}

function statusIcon(status: ReviewStatus): React.ReactNode {
  if (status === "ACCEPTED") return <Check size={13} aria-hidden="true" />;
  if (status === "MANUALLY_CHECKED") return <CheckCheck size={13} aria-hidden="true" />;
  if (status === "REJECTED") return <X size={13} aria-hidden="true" />;
  if (status === "DEFERRED") return <Clock3 size={13} aria-hidden="true" />;
  return <Info size={13} aria-hidden="true" />;
}

function writeBackStatusIcon(status: WriteBackStatus): React.ReactNode {
  if (status === "APPLIED") return <Check size={13} aria-hidden="true" />;
  if (status === "FAILED") return <X size={13} aria-hidden="true" />;
  if (status === "STALE") return <AlertTriangle size={13} aria-hidden="true" />;
  return <Clock3 size={13} aria-hidden="true" />;
}

function severityIcon(severity: ReviewItem["finding"]["severity"]): React.ReactNode {
  if (severity === "error") return <CircleAlert size={14} aria-hidden="true" />;
  if (severity === "warning") return <AlertTriangle size={14} aria-hidden="true" />;
  return <Info size={14} aria-hidden="true" />;
}

function FilterFields({
  filters,
  onChange,
}: {
  filters: ReviewFilters;
  onChange(filters: ReviewFilters): void;
}) {
  return (
    <div className="fc-filter-grid">
      <FilterSelect
        label="Schweregrad"
        value={filters.severity}
        options={SEVERITY_OPTIONS}
        onChange={(severity) =>
          onChange({ ...filters, severity: severity as ReviewFilters["severity"] })
        }
      />
      <FilterSelect
        label="Prüfklasse"
        value={filters.reviewClass}
        options={REVIEW_CLASS_OPTIONS}
        onChange={(reviewClass) =>
          onChange({ ...filters, reviewClass: reviewClass as ReviewFilters["reviewClass"] })
        }
      />
      <FilterSelect
        label="Status"
        value={filters.status}
        options={STATUS_OPTIONS}
        onChange={(status) => onChange({ ...filters, status: status as ReviewFilters["status"] })}
      />
      <FilterSelect
        label="Kategorie"
        value={filters.category}
        options={CATEGORY_OPTIONS}
        onChange={(category) =>
          onChange({ ...filters, category: category as ReviewFilters["category"] })
        }
      />
      <label className="fc-filter-checkbox">
        <input
          type="checkbox"
          checked={filters.onlyWithFindings}
          onChange={(event) => onChange({ ...filters, onlyWithFindings: event.target.checked })}
        />
        <span>Nur Fußnoten mit Hinweisen</span>
      </label>
    </div>
  );
}

function ReviewSummary({ result, mode }: { result: ReviewEngineResult; mode: ReviewMode }) {
  const summary = result.summary;
  return (
    <SpotlightCard className="fc-summary" aria-label="Zusammenfassung der Prüfung">
      <div className="fc-summary__heading">
        <div>
          <p className="fc-eyebrow">Prüfergebnis</p>
          <h2>
            {mode === "CORRECTION"
              ? `${summary.correctionReady} sichere Korrekturen`
              : `${summary.total} Prüfhinweise`}
          </h2>
        </div>
        {summary.conflicts > 0 && (
          <span className="fc-badge fc-badge--technical">{summary.conflicts} Konflikte</span>
        )}
      </div>
      <div className="fc-summary__grid">
        <div>
          <span>Automatisch</span>
          <strong>{summary.byClass.automatic}</strong>
        </div>
        <div>
          <span>Prüfen</span>
          <strong>{summary.byClass.manual}</strong>
        </div>
        <div>
          <span>Technisch</span>
          <strong>{summary.byClass.technical}</strong>
        </div>
        <div>
          <span>Hinweise</span>
          <strong>{summary.byClass.info}</strong>
        </div>
      </div>
      <p className="fc-summary__status">
        {summary.byStatus.open} offen · {summary.byStatus.accepted} übernommen ·{" "}
        {summary.byStatus.manuallyChecked} manuell geprüft · {summary.byStatus.rejected} abgelehnt ·{" "}
        {summary.byStatus.deferred} später
      </p>
      {mode === "CORRECTION" && (
        <p className="fc-summary__correction">
          {summary.byClass.manual} müssen geprüft werden · {summary.byClass.technical} technisch
          blockiert. Sichere automatische Korrekturen werden automatisch angewendet.
        </p>
      )}
    </SpotlightCard>
  );
}

function ActionPreview({ item }: { item: ReviewItem }) {
  const action = item.proposedAction;
  if (!action) return null;
  if (action.type === "TEXT_REPLACE") {
    return (
      <div
        className="fc-change"
        aria-label={`Änderung von ${action.originalText} zu ${action.replacementText}`}
      >
        <span className="fc-change__before">{action.originalText || "(leer)"}</span>
        <span aria-hidden="true">→</span>
        <span className="fc-change__after">{action.replacementText || "(entfernen)"}</span>
      </div>
    );
  }
  if (action.type === "TEXT_INSERT") {
    return (
      <p className="fc-change fc-change--insert">
        Ergänzen: <span className="fc-change__after">{action.text}</span>
      </p>
    );
  }
  const property = Object.keys(action.changes)[0] ?? "Formatierung";
  const actual = item.finding.metadata?.actual;
  const expected = action.changes[property as keyof typeof action.changes];
  return (
    <div className="fc-change">
      <span className="fc-change__before">{formatFormattingValue(property, actual)}</span>
      <span aria-hidden="true">→</span>
      <span className="fc-change__after">{formatFormattingValue(property, expected)}</span>
    </div>
  );
}

function findingTitle(item: ReviewItem): string {
  return item.finding.ruleId === "CASE_LAW_DATE_FORMAT" &&
    item.finding.metadata?.uncertainty === "TWO_DIGIT_YEAR"
    ? "Datumsformat prüfen"
    : getRuleTitle(item.finding.ruleId);
}

function TechnicalDetails({
  item,
  engineResult,
}: {
  item: ReviewItem;
  engineResult: FootnoteEngineResult;
}) {
  const parseResult = engineResult.parseResults.find(
    (result) => result.footnoteId === item.finding.footnoteId
  );
  const segment = parseResult?.segments.find(
    (candidate) => candidate.start <= item.finding.start && candidate.end >= item.finding.end
  );
  const segmentAnalysis = segment
    ? engineResult.segmentAnalyses.find(
        (analysis) =>
          analysis.footnoteId === item.finding.footnoteId &&
          analysis.segmentId === segment.segmentId
      )
    : undefined;
  return (
    <dl className="fc-technical-grid">
      <div>
        <dt>Regel-ID</dt>
        <dd>{item.finding.ruleId}</dd>
      </div>
      <div>
        <dt>Kategorie</dt>
        <dd>{CATEGORY_LABELS[item.finding.category]}</dd>
      </div>
      <div>
        <dt>Schweregrad</dt>
        <dd>{SEVERITY_LABELS[item.finding.severity]}</dd>
      </div>
      <div>
        <dt>Prüfgrund</dt>
        <dd>{REVIEW_REASON_LABELS[item.classificationReason]}</dd>
      </div>
      <div>
        <dt>Bereich</dt>
        <dd>
          [{item.finding.start}, {item.finding.end})
        </dd>
      </div>
      <div>
        <dt>Hinweis-ID</dt>
        <dd>{item.finding.findingId}</dd>
      </div>
      <div>
        <dt>Quelltext-Hash</dt>
        <dd>{item.finding.sourceTextHash}</dd>
      </div>
      <div>
        <dt>Parser-Typ</dt>
        <dd>{segment?.classification.type ?? "–"}</dd>
      </div>
      <div>
        <dt>Effektiver Typ</dt>
        <dd>{segmentAnalysis?.effectiveClassification.effectiveType ?? "–"}</dd>
      </div>
      <div>
        <dt>Extraktionsstatus</dt>
        <dd>{segment?.extraction?.status ?? "–"}</dd>
      </div>
      <div>
        <dt>Quellenzuordnung</dt>
        <dd>
          <pre>{JSON.stringify(segmentAnalysis?.sourceMappings ?? [], null, 2)}</pre>
        </dd>
      </div>
      {item.finding.citationItemId && engineResult.documentSourceRegistry && (
        <div>
          <dt>Dokumentquelle</dt>
          <dd>
            <pre>
              {JSON.stringify(
                {
                  resolution: engineResult.documentSourceRegistry.resolutions.find(
                    (resolution) => resolution.citationItemId === item.finding.citationItemId
                  ),
                  source: documentSourceForCitationItem(
                    engineResult.documentSourceRegistry,
                    item.finding.citationItemId
                  ),
                },
                null,
                2
              )}
            </pre>
          </dd>
        </div>
      )}
      <div>
        <dt>Formatierungsmetadaten</dt>
        <dd>
          <pre>{JSON.stringify(item.finding.metadata ?? {}, null, 2)}</pre>
        </dd>
      </div>
      <div>
        <dt>Änderungsvorschlag</dt>
        <dd>
          <pre>{JSON.stringify(item.proposedAction ?? null, null, 2)}</pre>
        </dd>
      </div>
      <div>
        <dt>Technische Eignung</dt>
        <dd>
          <pre>{JSON.stringify(item.technicalEligibility, null, 2)}</pre>
        </dd>
      </div>
      <div>
        <dt>Konflikt-IDs</dt>
        <dd>{item.conflicts.map((conflict) => conflict.conflictId).join(", ") || "–"}</dd>
      </div>
    </dl>
  );
}

function FindingCard({
  item,
  mode,
  engineResult,
  onSetStatus,
  onClearStatus,
  writeBackResult,
  onApplySingle,
  batchRunning,
}: {
  item: ReviewItem;
  mode: ReviewMode;
  engineResult: FootnoteEngineResult;
  onSetStatus(item: ReviewItem, status: ReviewStatus): void;
  onClearStatus(item: ReviewItem): void;
  writeBackResult?: WriteBackResult;
  onApplySingle(item: ReviewItem): void;
  batchRunning: boolean;
}) {
  const blockedReason = REVIEW_REASON_LABELS[item.classificationReason];
  const title = findingTitle(item);
  const canApply = canApplySingleReviewItem(item, writeBackResult);
  const isApplying =
    writeBackResult?.status === "PENDING" && writeBackResult.message === "Wird durchgeführt …";
  const findingMessage = deduplicateMessages(item.finding.message)[0];
  const writeBackMessage = deduplicateMessages(item.finding.message, writeBackResult?.message)[1];
  const citationPreview = citationPreviewForFinding(item.finding, engineResult);
  const documentSource = engineResult.documentSourceRegistry
    ? documentSourceForCitationItem(
        engineResult.documentSourceRegistry,
        item.finding.citationItemId
      )
    : undefined;
  const canManuallyCheck = canMarkManuallyChecked(item);
  const applied = writeBackResult?.status === "APPLIED";
  const terminalDecision =
    applied ||
    item.decision.explicitStatus === "MANUALLY_CHECKED" ||
    item.decision.explicitStatus === "REJECTED" ||
    item.decision.explicitStatus === "DEFERRED";
  const acceptedSelected = item.decision.explicitStatus === "ACCEPTED" && !applied;
  return (
    <article className={`fc-finding fc-finding--${item.finding.severity}`}>
      <div className="fc-finding__topline">
        <span className={`fc-badge fc-badge--severity-${item.finding.severity}`}>
          {severityIcon(item.finding.severity)}
          {SEVERITY_LABELS[item.finding.severity]}
        </span>
        <span className={`fc-badge fc-badge--class-${item.reviewClass.toLowerCase()}`}>
          {REVIEW_CLASS_LABELS[item.reviewClass]}
        </span>
        {item.conflicts.length > 0 && (
          <span className="fc-badge fc-badge--technical">
            <ShieldAlert size={13} aria-hidden="true" />
            Konflikt
          </span>
        )}
        {documentSource?.status === "CONFIRMED_DOCUMENT_SOURCE" && (
          <span className="fc-badge fc-badge--document-source">Dokumenteigene Quelle</span>
        )}
      </div>
      <h3>{title}</h3>
      <ActionPreview item={item} />
      {citationPreview && (
        <div className="fc-source-preview">
          <span>Quelle</span>
          <blockquote title={citationPreview}>{citationPreview}</blockquote>
        </div>
      )}
      {findingMessage && <p className="fc-finding__message">{findingMessage}</p>}
      {item.conflicts.length > 0 && (
        <p className="fc-finding__conflict">
          Diese Änderung überschneidet sich mit einer anderen vorgeschlagenen Änderung.
        </p>
      )}
      <div className="fc-finding__status">
        <span>Status:</span>
        <span className={`fc-status fc-status--${item.decision.effectiveStatus.toLowerCase()}`}>
          {statusIcon(item.decision.effectiveStatus)}
          {REVIEW_STATUS_LABELS[item.decision.effectiveStatus]}
        </span>
        {item.decision.source === "MODE_DEFAULT" && mode === "CORRECTION" && (
          <span className="fc-muted">automatisch freigegeben</span>
        )}
      </div>
      {writeBackResult && (
        <div className="fc-writeback-status" aria-live="polite">
          <span>Word-Änderung:</span>
          <span
            className={`fc-writeback-badge fc-writeback-badge--${writeBackResult.status.toLowerCase()}`}
          >
            {writeBackStatusIcon(writeBackResult.status)}
            {isApplying ? "Wird durchgeführt …" : writeBackResultLabel(writeBackResult)}
          </span>
          {(writeBackResult.status === "FAILED" || writeBackResult.status === "STALE") &&
            writeBackMessage && <span className="fc-writeback-message">{writeBackMessage}</span>}
        </div>
      )}
      {mode === "REVIEW" && item.reviewClass !== "TECHNICAL" && (
        <div className="fc-finding__actions" aria-label={`Entscheidung für ${title}`}>
          {terminalDecision ? (
            <NeonButton
              className="fc-review-action"
              size="sm"
              variant="secondary"
              disabled={batchRunning}
              onClick={() => onClearStatus(item)}
            >
              <RotateCcw size={14} aria-hidden="true" />
              Zurücksetzen
            </NeonButton>
          ) : item.proposedAction ? (
            <span
              title={
                !item.canAccept
                  ? blockedReason || "Für diesen Hinweis ist keine sichere Aktion verfügbar."
                  : undefined
              }
            >
              <NeonButton
                className={`fc-review-action${acceptedSelected ? " fc-review-action--selected" : ""}`}
                size="sm"
                variant={acceptedSelected ? "secondary" : "primary"}
                disabled={!item.canAccept || batchRunning}
                onClick={() => onSetStatus(item, "ACCEPTED")}
                aria-pressed={acceptedSelected}
              >
                <Check size={14} aria-hidden="true" />
                Übernehmen
              </NeonButton>
            </span>
          ) : canManuallyCheck ? (
            <NeonButton
              className="fc-review-action"
              size="sm"
              variant="primary"
              disabled={batchRunning}
              onClick={() => onSetStatus(item, "MANUALLY_CHECKED")}
            >
              <CheckCheck size={13} aria-hidden="true" />
              Manuell geprüft
            </NeonButton>
          ) : (
            <span className="fc-manual-hint">
              Keine sichere automatische Änderung verfügbar – bitte im Dokument prüfen.
            </span>
          )}
          {!terminalDecision && (
            <NeonButton
              className="fc-review-action"
              size="sm"
              variant="destructive"
              disabled={batchRunning}
              onClick={() => onSetStatus(item, "REJECTED")}
            >
              <X size={14} aria-hidden="true" />
              Ablehnen
            </NeonButton>
          )}
          {!terminalDecision && (
            <NeonButton
              className="fc-review-action"
              size="sm"
              variant="subtle"
              disabled={batchRunning}
              onClick={() => onSetStatus(item, "DEFERRED")}
            >
              <Clock3 size={14} aria-hidden="true" />
              Später prüfen
            </NeonButton>
          )}
          {!terminalDecision && item.decision.explicitStatus && (
            <NeonButton
              className="fc-review-action"
              size="sm"
              variant="ghost"
              disabled={batchRunning}
              onClick={() => onClearStatus(item)}
            >
              <RotateCcw size={14} aria-hidden="true" />
              Zurücksetzen
            </NeonButton>
          )}
        </div>
      )}
      {(mode === "REVIEW" || mode === "CORRECTION") && (canApply || isApplying) && (
        <div className="fc-writeback-actions">
          <NeonButton
            size="sm"
            variant="primary"
            disabled={isApplying || batchRunning}
            onClick={() => onApplySingle(item)}
          >
            {isApplying ? (
              <LoaderCircle className="fc-spin" size={14} aria-hidden="true" />
            ) : (
              <Play size={14} aria-hidden="true" />
            )}
            {isApplying ? "Wird durchgeführt …" : "Durchführen"}
          </NeonButton>
        </div>
      )}
      <Collapsible label="Details" className="fc-details" contentClassName="fc-details__content">
        <TechnicalDetails item={item} engineResult={engineResult} />
      </Collapsible>
    </article>
  );
}

function FootnoteTechnicalData({ footnote }: { footnote: FootnoteSnapshot }) {
  return (
    <dl className="fc-technical-grid">
      <div>
        <dt>Inhalt</dt>
        <dd>{footnote.contentText || "(leer)"}</dd>
      </div>
      <div>
        <dt>Hash</dt>
        <dd>{footnote.originalTextHash}</dd>
      </div>
      <div>
        <dt>Reader-Status</dt>
        <dd>{footnote.readStatus}</dd>
      </div>
      <div>
        <dt>Locator</dt>
        <dd>
          <pre>{JSON.stringify(footnote.locator, null, 2)}</pre>
        </dd>
      </div>
      <div>
        <dt>Base Format</dt>
        <dd>
          <pre>{JSON.stringify(footnote.baseCharacterFormat ?? {}, null, 2)}</pre>
        </dd>
      </div>
      <div>
        <dt>Formatting Runs</dt>
        <dd>
          {footnote.formattingRuns.length}
          <pre>{JSON.stringify(footnote.formattingRuns, null, 2)}</pre>
        </dd>
      </div>
      <div>
        <dt>Protected Ranges</dt>
        <dd>
          {footnote.protectedRanges.length}
          <pre>{JSON.stringify(footnote.protectedRanges, null, 2)}</pre>
        </dd>
      </div>
      <div>
        <dt>Absatzformate</dt>
        <dd>
          <pre>{JSON.stringify(footnote.paragraphFormats, null, 2)}</pre>
        </dd>
      </div>
    </dl>
  );
}

function FootnoteGroup({
  group,
  mode,
  engineResult,
  onSetStatus,
  onClearStatus,
  writeBackState,
  onApplySingle,
  batchRunning,
  open,
  onOpenChange,
}: {
  group: ReviewFootnoteGroup;
  mode: ReviewMode;
  engineResult: FootnoteEngineResult;
  onSetStatus(item: ReviewItem, status: ReviewStatus): void;
  onClearStatus(item: ReviewItem): void;
  writeBackState: WriteBackState;
  onApplySingle(item: ReviewItem): void;
  batchRunning: boolean;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const problemLabel =
    group.accountingStatus === "CLEAN"
      ? "Keine Probleme gefunden"
      : group.accountingStatus === "PARTIAL"
        ? `${group.totalItemCount} Hinweise · Analyse teilweise unsicher`
        : group.totalItemCount === 1
          ? "1 Prüfhinweis"
          : `${group.totalItemCount} Prüfhinweise`;
  return (
    <section className="fc-footnote-group">
      <Collapsible
        open={open}
        onOpenChange={onOpenChange}
        ariaLabel={`Fußnote ${group.footnote.ordinal}, ${problemLabel}`}
        label={
          <span className="fc-footnote-group__label">
            <strong>Fußnote {group.footnote.ordinal}</strong>
            <span>{problemLabel}</span>
          </span>
        }
        buttonClassName="fc-footnote-group__trigger"
        contentClassName="fc-footnote-group__content"
      >
        {() => (
          <>
            {group.accountingStatus === "CLEAN" && (
              <p className="fc-footnote-accounting fc-footnote-accounting--clean">
                <Check size={15} aria-hidden="true" /> Keine Probleme gefunden
              </p>
            )}
            {group.accountingStatus === "PARTIAL" && (
              <div className="fc-footnote-accounting fc-footnote-accounting--partial">
                <AlertTriangle size={15} aria-hidden="true" />
                <span>
                  Die Fußnote wurde vollständig als Text gelesen. Einzelne Zusatzinformationen
                  konnten nicht vollständig geprüft werden.
                  {group.footnote.readWarnings.length > 0 && (
                    <ul>
                      {[
                        ...new Set(
                          group.footnote.readWarnings.map((warning) =>
                            userMessageForReadWarning(warning)
                          )
                        ),
                      ].map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  )}
                  {group.footnote.readWarnings.some((warning) => warning.affectsCorrectness) && (
                    <strong>Eine manuelle Prüfung wird empfohlen.</strong>
                  )}
                </span>
              </div>
            )}
            {group.items.map((item) => (
              <FindingCard
                key={item.reviewItemId}
                item={item}
                mode={mode}
                engineResult={engineResult}
                onSetStatus={onSetStatus}
                onClearStatus={onClearStatus}
                writeBackResult={writeBackResultForItem(writeBackState, item)}
                onApplySingle={onApplySingle}
                batchRunning={batchRunning}
              />
            ))}
            <Collapsible
              label="Technische Fußnotendaten"
              className="fc-footnote-debug"
              contentClassName="fc-details__content"
            >
              <FootnoteTechnicalData footnote={group.footnote} />
            </Collapsible>
          </>
        )}
      </Collapsible>
    </section>
  );
}

function GlobalTechnicalData({
  readerMetrics,
  documentFormatting,
  engineResult,
  batchResult,
  hostCapabilities,
  analysisPerformance,
  reviewPreparationDurationMs,
}: {
  readerMetrics: FootnoteReadResult["readerMetrics"] | null;
  documentFormatting: DocumentFormattingSnapshot | null;
  engineResult: FootnoteEngineResult;
  batchResult: BatchWriteBackResult | null;
  hostCapabilities: HostCapabilities;
  analysisPerformance: AnalysisPerformanceMetrics | null;
  reviewPreparationDurationMs: number;
}) {
  return (
    <Collapsible
      label="Entwicklerdetails"
      className="fc-global-debug"
      contentClassName="fc-details__content"
    >
      <dl className="fc-technical-grid">
        <div>
          <dt>Footnote Reader</dt>
          <dd>
            <pre>{JSON.stringify(readerMetrics, null, 2)}</pre>
          </dd>
        </div>
        <div>
          <dt>Host und Plattform</dt>
          <dd>
            <pre>{JSON.stringify(hostCapabilities, null, 2)}</pre>
          </dd>
        </div>
        <div>
          <dt>Analyseperformance</dt>
          <dd>
            <pre>
              {JSON.stringify({ ...analysisPerformance, reviewPreparationDurationMs }, null, 2)}
            </pre>
          </dd>
        </div>
        <div>
          <dt>Dokumentformatierung</dt>
          <dd>
            <pre>{JSON.stringify(documentFormatting, null, 2)}</pre>
          </dd>
        </div>
        <div>
          <dt>Engine</dt>
          <dd>
            Analysiert: {engineResult.analyzedFootnotes}
            <br />
            Prüfhinweise: {engineResult.findings.length}
            <br />
            Dauer: {engineResult.durationMs ?? "–"} ms
          </dd>
        </div>
        {engineResult.documentSourceRegistry && (
          <div>
            <dt>Quellen-Accounting</dt>
            <dd>
              <pre>
                {JSON.stringify(
                  {
                    accounting: engineResult.documentSourceRegistry.accounting,
                    auditRecords: engineResult.documentSourceRegistry.auditRecords,
                  },
                  null,
                  2
                )}
              </pre>
            </dd>
          </div>
        )}
        {batchResult && (
          <div>
            <dt>Write-back-Performance</dt>
            <dd>
              <pre>{JSON.stringify(batchResult.performance, null, 2)}</pre>
            </dd>
          </div>
        )}
      </dl>
    </Collapsible>
  );
}

export function ReviewWorkspace(props: ReviewWorkspaceProps) {
  const scrollOwnerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [filters, setFilters] = useState<ReviewFilters>(DEFAULT_REVIEW_FILTERS);
  const [visibleGroupLimit, setVisibleGroupLimit] = useState(80);
  const [openFootnotes, setOpenFootnotes] = useState<OpenFootnoteState>(createClosedFootnoteState);
  const preparedDisplay = useMemo(
    () =>
      prepareReviewDisplay(
        props.reviewResult?.items ?? [],
        props.footnotes,
        filters,
        props.engineResult?.parseResults ?? []
      ),
    [props.reviewResult, props.footnotes, props.engineResult, filters]
  );
  const { filteredItems, groups } = preparedDisplay;
  const filterSignature = `${filters.severity}:${filters.reviewClass}:${filters.status}:${filters.category}:${filters.search}`;
  useEffect(() => setVisibleGroupLimit(80), [filterSignature]);
  useEffect(() => setOpenFootnotes(createClosedFootnoteState()), [props.engineResult]);
  const visibleGroups = groups.slice(0, visibleGroupLimit);
  const hasAnalysis = props.engineResult !== null && props.reviewResult !== null;
  const activeFilters = hasActiveFilters(filters);
  const isBatchRunning =
    props.batchRunStatus === "PLANNING" ||
    props.batchRunStatus === "RUNNING" ||
    props.batchRunStatus === "FINALIZING";
  const isSingleWriteBackRunning = Object.values(props.writeBackState).some(
    (result) => result.status === "PENDING" && result.message === "Wird durchgeführt …"
  );
  const isMutationRunning = isBatchRunning || isSingleWriteBackRunning;
  const isCorrecting = isBatchRunning && props.mode === "CORRECTION";
  const batchSummary = props.batchResult?.summary;
  const batchHasIssues = props.batchResult?.status === "COMPLETED_WITH_ISSUES";

  const loading = loadingDisplay(
    props.progress,
    props.batchProgress,
    isBatchRunning,
    props.mode === "CORRECTION",
    props.isLoading
  );
  const backToTop = () => {
    const owner = scrollOwnerRef.current;
    if (!owner) return;
    owner.scrollTop = 0;
    headerRef.current?.focus({ preventScroll: true });
  };

  return (
    <main className="fc-app">
      <div
        className="fc-shell"
        ref={scrollOwnerRef}
        onScroll={(event) => setShowBackToTop(event.currentTarget.scrollTop > 180)}
      >
        <header className="fc-header" ref={headerRef} tabIndex={-1}>
          <div className="fc-brand">
            <BrandLogo size={34} />
            <div>
              <h1>Footnote-Checker</h1>
              <p>Juristische Fußnoten prüfen</p>
            </div>
          </div>
          <NeonButton
            variant="ghost"
            size="icon"
            disabled={props.isLoading || isMutationRunning}
            aria-label="Einstellungen öffnen"
            title="Einstellungen"
            onClick={props.onOpenSettings}
          >
            <Settings size={19} aria-hidden="true" />
          </NeonButton>
        </header>

        <nav className="fc-modes" aria-label="Arbeitsmodus">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={props.isLoading || isMutationRunning}
              className={props.mode === option.value ? "is-active" : ""}
              aria-pressed={props.mode === option.value}
              onClick={() => props.onModeChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </nav>

        <NeonButton
          className="fc-primary-action"
          variant="primary"
          size="lg"
          disabled={props.isLoading || isMutationRunning}
          onClick={props.onAnalyze}
        >
          <CheckCheck size={18} aria-hidden="true" />
          {props.hostWorkState === "FINALIZING"
            ? "Korrekturlauf wird abgeschlossen …"
            : isCorrecting
              ? "Sichere Korrekturen werden durchgeführt …"
              : props.isLoading
                ? "Fußnoten werden geprüft …"
                : "Fußnoten prüfen"}
        </NeonButton>

        {loading && <LoadingProgress display={loading} />}

        {props.message && (
          <div
            className={props.hasError ? "fc-notice fc-notice--error" : "fc-notice"}
            role={props.hasError ? "alert" : "status"}
          >
            {props.hasError && <CircleAlert size={18} aria-hidden="true" />}
            <span>{props.message}</span>
          </div>
        )}
        {props.reportError && (
          <div className="fc-notice fc-notice--error" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            <span>{props.reportError}</span>
          </div>
        )}
        {props.technicalError && (
          <Collapsible
            label="Technische Fehlerdetails"
            className="fc-global-debug"
            contentClassName="fc-details__content"
          >
            <pre className="fc-error-details">{props.technicalError}</pre>
          </Collapsible>
        )}

        {!hasAnalysis && !props.hasError && !props.isLoading && (
          <section className="fc-empty-state">
            <BrandLogo size={36} />
            <h2>Juristische Fußnoten prüfen</h2>
            <p>Prüfen Sie die juristischen Fußnoten des aktuellen Dokuments.</p>
          </section>
        )}

        {props.reviewResult && props.engineResult && (
          <>
            <ReviewSummary result={props.reviewResult} mode={props.mode} />
            {(props.engineResult.documentSourceRegistry?.unpromotedConfirmedSourceCount ?? 0) >
              0 && (
              <section className="fc-document-sources-callout" role="status">
                <div>
                  <strong>
                    {props.engineResult.documentSourceRegistry!.unpromotedConfirmedSourceCount} neue
                    dokumenteigene{" "}
                    {props.engineResult.documentSourceRegistry!.unpromotedConfirmedSourceCount === 1
                      ? "Quelle erkannt"
                      : "Quellen erkannt"}
                  </strong>
                  <p>Diese Quellen bleiben zunächst auf das aktuelle Dokument beschränkt.</p>
                </div>
                <NeonButton variant="secondary" size="sm" onClick={props.onOpenSourceReview}>
                  Quellen prüfen
                </NeonButton>
              </section>
            )}
            {props.sourcePromotionMessage && (
              <div className="fc-notice" role="status">
                <span>{props.sourcePromotionMessage}</span>
              </div>
            )}
            {!props.batchResult && (
              <div className="fc-report-actions">
                <NeonButton
                  variant="secondary"
                  size="sm"
                  disabled={isBatchRunning}
                  onClick={props.onExportDetailReport}
                >
                  <Download size={15} aria-hidden="true" />
                  Detailbericht exportieren
                </NeonButton>
              </div>
            )}
            {props.batchResult && batchSummary && (
              <section
                className={`fc-batch-summary${batchHasIssues ? " fc-batch-summary--issues" : props.batchResult.status === "FAILED" ? " fc-batch-summary--failed" : ""}`}
                role="status"
              >
                <div className="fc-batch-summary__heading">
                  <div>
                    <p className="fc-eyebrow">Abschluss</p>
                    <h2>
                      {props.batchResult.status === "FAILED"
                        ? "Korrekturlauf abgebrochen"
                        : "Korrekturlauf abgeschlossen"}
                    </h2>
                  </div>
                  {batchHasIssues && (
                    <span className="fc-badge fc-badge--warning">Mit Hinweisen</span>
                  )}
                </div>
                <div className="fc-batch-summary__grid">
                  <div>
                    <span>Geprüfte Fußnoten</span>
                    <strong>{props.footnotes.length}</strong>
                  </div>
                  <div>
                    <span>Prüfhinweise</span>
                    <strong>{batchSummary.totalFindings}</strong>
                  </div>
                  <div>
                    <span>Durchgeführt</span>
                    <strong>{batchSummary.applied}</strong>
                  </div>
                  <div>
                    <span>Manuell prüfen</span>
                    <strong>{batchSummary.manualReview}</strong>
                  </div>
                  <div>
                    <span>Manuell geprüft</span>
                    <strong>{batchSummary.manuallyChecked}</strong>
                  </div>
                  <div>
                    <span>Technisch blockiert</span>
                    <strong>{batchSummary.technical}</strong>
                  </div>
                  <div>
                    <span>Erneut prüfen</span>
                    <strong>{batchSummary.stale}</strong>
                  </div>
                  <div>
                    <span>Fehlgeschlagen</span>
                    <strong>{batchSummary.failed}</strong>
                  </div>
                </div>
                <p>
                  {batchSummary.applied} Korrekturen durchgeführt · {batchSummary.stale} erneut
                  prüfen · {batchSummary.failed} fehlgeschlagen · {batchSummary.manuallyChecked}{" "}
                  manuell geprüft · {batchSummary.manualReview} manuell zu prüfen
                </p>
                <div className="fc-batch-summary__actions">
                  <NeonButton variant="primary" size="sm" onClick={props.onExportDetailReport}>
                    <Download size={15} aria-hidden="true" />
                    Detailbericht exportieren
                  </NeonButton>
                  <NeonButton
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      document.querySelector(".fc-results")?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    Ergebnisse anzeigen
                  </NeonButton>
                </div>
              </section>
            )}
            {props.reviewResult.items.length === 0 && (
              <section className="fc-success" role="status">
                <Check size={22} aria-hidden="true" />
                <div>
                  <h2>Keine Auffälligkeiten gefunden</h2>
                  <p>Die geprüften Fußnoten entsprechen den aktuell eingestellten Regeln.</p>
                </div>
              </section>
            )}
            <>
              {props.mode === "REVIEW" && (
                <div className="fc-sticky-actions fc-sticky-actions--review">
                  <div className="fc-sticky-actions__status">
                    {props.reviewResult.summary.byStatus.accepted} übernommen ·{" "}
                    {props.reviewResult.summary.byStatus.manuallyChecked} manuell geprüft ·{" "}
                    {props.reviewResult.summary.byStatus.open} offen ·{" "}
                    {props.reviewResult.summary.byStatus.deferred} später
                  </div>
                  <div className="fc-bulk-actions">
                    <NeonButton
                      variant="primary"
                      size="sm"
                      disabled={
                        isMutationRunning || (props.currentPlan?.totals.eligible ?? 0) === 0
                      }
                      onClick={props.onRunReviewBatch}
                    >
                      {isBatchRunning ? (
                        <LoaderCircle className="fc-spin" size={15} aria-hidden="true" />
                      ) : (
                        <Play size={15} aria-hidden="true" />
                      )}
                      {isBatchRunning
                        ? "Änderungen werden durchgeführt …"
                        : "Ausgewählte Änderungen durchführen"}
                    </NeonButton>
                    <NeonButton
                      variant="secondary"
                      size="sm"
                      disabled={isBatchRunning}
                      onClick={props.onAcceptAllAutomatic}
                    >
                      <CheckCheck size={15} aria-hidden="true" />
                      Alle automatischen übernehmen
                    </NeonButton>
                    <NeonButton
                      variant="secondary"
                      size="sm"
                      disabled={isBatchRunning || Object.keys(props.decisionState).length === 0}
                      onClick={props.onResetDecisions}
                    >
                      <RotateCcw size={15} aria-hidden="true" />
                      Entscheidungen zurücksetzen
                    </NeonButton>
                  </div>
                  {(props.currentPlan?.totals.eligible ?? 0) === 0 && (
                    <span className="fc-muted">Keine ausgewählten sicheren Änderungen.</span>
                  )}
                </div>
              )}
              {props.mode === "CORRECTION" && (
                <div
                  className="fc-sticky-actions fc-sticky-actions--correction"
                  aria-label="Korrekturergebnis"
                >
                  <strong>Durchgeführt: {batchSummary?.applied ?? 0}</strong>
                  <span>Erneut prüfen: {batchSummary?.stale ?? 0}</span>
                  <span>Fehlgeschlagen: {batchSummary?.failed ?? 0}</span>
                  <span>Prüfen: {props.reviewResult.summary.byClass.manual}</span>
                  <span>Technisch blockiert: {props.reviewResult.summary.byClass.technical}</span>
                  <span className="fc-muted">
                    Sichere automatische Korrekturen werden sequenziell angewendet
                  </span>
                </div>
              )}
              <section className="fc-filters" aria-label="Prüfhinweise filtern">
                <label className="fc-search">
                  <span>Suche</span>
                  <div>
                    <Search size={16} aria-hidden="true" />
                    <input
                      type="search"
                      placeholder="Fußnoten oder Prüfhinweise durchsuchen"
                      value={filters.search}
                      onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                    />
                  </div>
                </label>
                <div className="fc-filters-desktop">
                  <FilterFields filters={filters} onChange={setFilters} />
                </div>
                <div className="fc-filters-mobile">
                  <Collapsible
                    label={
                      <>
                        <Filter size={15} aria-hidden="true" />
                        Filter
                      </>
                    }
                    contentClassName="fc-filter-mobile-content"
                  >
                    <FilterFields filters={filters} onChange={setFilters} />
                  </Collapsible>
                </div>
                <div className="fc-filter-status">
                  <span>
                    {filteredItems.length} von {props.reviewResult.items.length} Prüfhinweisen
                    angezeigt
                  </span>
                  {activeFilters && (
                    <NeonButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setFilters(DEFAULT_REVIEW_FILTERS)}
                    >
                      Filter zurücksetzen
                    </NeonButton>
                  )}
                </div>
              </section>

              {groups.length === 0 ? (
                <section className="fc-no-results">
                  <h2>Keine passenden Prüfhinweise</h2>
                  <p>Ändern oder entfernen Sie die aktiven Filter.</p>
                </section>
              ) : (
                <div className="fc-results" aria-label="Prüfergebnisse">
                  {visibleGroups.map((group) => (
                    <FootnoteGroup
                      key={group.footnote.id}
                      group={group}
                      mode={props.mode}
                      engineResult={props.engineResult as FootnoteEngineResult}
                      onSetStatus={props.onSetStatus}
                      onClearStatus={props.onClearStatus}
                      writeBackState={props.writeBackState}
                      onApplySingle={props.onApplySingle}
                      batchRunning={isMutationRunning}
                      open={openFootnotes.has(group.footnote.id)}
                      onOpenChange={(open) =>
                        setOpenFootnotes((current) =>
                          setFootnoteOpen(
                            current,
                            group.footnote.id,
                            open,
                            props.autoCloseInactiveFootnotes
                          )
                        )
                      }
                    />
                  ))}
                  {visibleGroupLimit < groups.length && (
                    <NeonButton
                      className="fc-load-more"
                      variant="secondary"
                      onClick={() => setVisibleGroupLimit((limit) => limit + 80)}
                    >
                      Weitere {Math.min(80, groups.length - visibleGroupLimit)} Fußnoten anzeigen
                    </NeonButton>
                  )}
                </div>
              )}
            </>
            <GlobalTechnicalData
              readerMetrics={props.readerMetrics}
              documentFormatting={props.documentFormatting}
              engineResult={props.engineResult}
              batchResult={props.batchResult}
              hostCapabilities={props.hostCapabilities}
              analysisPerformance={props.analysisPerformance}
              reviewPreparationDurationMs={preparedDisplay.durationMs}
            />
          </>
        )}
        {props.confirmReanalysis && (
          <ModalOverlay
            className="fc-dialog-backdrop"
            isOpen
            isDismissable
            onOpenChange={(open) => {
              if (!open) props.onCancelReanalysis();
            }}
          >
            <Modal className="fc-dialog">
              <AriaDialog aria-labelledby="reanalysis-title" className="fc-dialog__content">
                <Heading slot="title" id="reanalysis-title">
                  Aktuelle Prüfentscheidungen verwerfen?
                </Heading>
                <p>
                  Eine neue Analyse ersetzt die aktuellen Ergebnisse. Entscheidungen für
                  unveränderte Prüfhinweise werden weiterverwendet; nicht mehr passende
                  Entscheidungen werden verworfen.
                </p>
                <div className="fc-dialog__actions">
                  <NeonButton variant="secondary" onClick={props.onCancelReanalysis}>
                    Abbrechen
                  </NeonButton>
                  <NeonButton variant="primary" onClick={props.onConfirmReanalysis}>
                    Neue Analyse starten
                  </NeonButton>
                </div>
              </AriaDialog>
            </Modal>
          </ModalOverlay>
        )}
        {props.engineResult?.documentSourceRegistry && (
          <DocumentSourceReview
            registry={props.engineResult.documentSourceRegistry}
            open={props.showSourceReview}
            onOpenChange={(open) =>
              open ? props.onOpenSourceReview() : props.onCloseSourceReview()
            }
            onPromote={props.onPromoteDocumentSources}
          />
        )}
      </div>
      {showBackToTop && (
        <button
          type="button"
          className="fc-back-to-top"
          aria-label="Nach oben zu Einstellungen und Aktionen"
          title="Nach oben"
          onClick={backToTop}
        >
          <ArrowUp size={20} aria-hidden="true" />
        </button>
      )}
    </main>
  );
}
