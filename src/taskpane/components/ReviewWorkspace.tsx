import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Dialog as AriaDialog,
  Heading,
  Modal,
  ModalOverlay,
} from "react-aria-components";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  CircleAlert,
  Clock3,
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
import { Progress } from "@/components/ui/progress";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { BrandLogo } from "@/taskpane/components/BrandLogo";
import type { FootnoteEngineResult } from "@/footnote-engine/types";
import {
  REVIEW_CLASS_LABELS,
  REVIEW_REASON_LABELS,
  REVIEW_STATUS_LABELS,
  type ReviewDecisionState,
  type ReviewEngineResult,
  type ReviewItem,
  type ReviewMode,
  type ReviewStatus,
} from "@/review-engine";
import {
  CATEGORY_LABELS,
  createClosedFootnoteState,
  DEFAULT_REVIEW_FILTERS,
  SEVERITY_LABELS,
  filterReviewItems,
  formatFormattingValue,
  getRuleTitle,
  groupReviewItems,
  hasActiveFilters,
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
import {
  canApplySingleReviewItem,
  writeBackResultLabel,
  writeBackResultForItem,
  type WriteBackResult,
  type WriteBackState,
  type WriteBackStatus,
} from "@/write-back-engine";

const MODE_OPTIONS: Array<{ value: ReviewMode; label: string }> = [
  { value: "ANALYSIS", label: "Analyse" },
  { value: "REVIEW", label: "Review" },
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
  decisionState: ReviewDecisionState;
  onSetStatus(item: ReviewItem, status: ReviewStatus): void;
  onClearStatus(item: ReviewItem): void;
  onAcceptAllAutomatic(): void;
  onResetDecisions(): void;
  writeBackState: WriteBackState;
  onApplySingle(item: ReviewItem): void;
  message: string;
  hasError: boolean;
  readerMetrics: FootnoteReadResult["readerMetrics"] | null;
  documentFormatting: DocumentFormattingSnapshot | null;
  confirmReanalysis: boolean;
  onCancelReanalysis(): void;
  onConfirmReanalysis(): void;
}

function statusIcon(status: ReviewStatus): React.ReactNode {
  if (status === "ACCEPTED") return <Check size={13} aria-hidden="true" />;
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

function FilterFields({ filters, onChange }: { filters: ReviewFilters; onChange(filters: ReviewFilters): void }) {
  return (
    <div className="fc-filter-grid">
      <FilterSelect
        label="Schweregrad"
        value={filters.severity}
        options={SEVERITY_OPTIONS}
        onChange={(severity) => onChange({ ...filters, severity: severity as ReviewFilters["severity"] })}
      />
      <FilterSelect
        label="Review"
        value={filters.reviewClass}
        options={REVIEW_CLASS_OPTIONS}
        onChange={(reviewClass) => onChange({ ...filters, reviewClass: reviewClass as ReviewFilters["reviewClass"] })}
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
        onChange={(category) => onChange({ ...filters, category: category as ReviewFilters["category"] })}
      />
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
          <h2>{mode === "CORRECTION" ? `${summary.correctionReady} sichere Korrekturen` : `${summary.total} Findings`}</h2>
        </div>
        {summary.conflicts > 0 && <span className="fc-badge fc-badge--technical">{summary.conflicts} Konflikte</span>}
      </div>
      <div className="fc-summary__grid">
        <div><span>Automatisch</span><strong>{summary.byClass.automatic}</strong></div>
        <div><span>Prüfen</span><strong>{summary.byClass.manual}</strong></div>
        <div><span>Technisch</span><strong>{summary.byClass.technical}</strong></div>
        <div><span>Hinweise</span><strong>{summary.byClass.info}</strong></div>
      </div>
      <p className="fc-summary__status">
        {summary.byStatus.open} offen · {summary.byStatus.accepted} übernehmen · {summary.byStatus.rejected} abgelehnt · {summary.byStatus.deferred} später
      </p>
      {mode === "CORRECTION" && (
        <p className="fc-summary__correction">
          {summary.byClass.manual} müssen geprüft werden · {summary.byClass.technical} technisch blockiert. Sichere AUTO-Korrekturen werden automatisch angewendet.
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
      <div className="fc-change" aria-label={`Änderung von ${action.originalText} zu ${action.replacementText}`}>
        <span className="fc-change__before">{action.originalText || "(leer)"}</span>
        <span aria-hidden="true">→</span>
        <span className="fc-change__after">{action.replacementText || "(entfernen)"}</span>
      </div>
    );
  }
  if (action.type === "TEXT_INSERT") {
    return <p className="fc-change fc-change--insert">Ergänzen: <span className="fc-change__after">{action.text}</span></p>;
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

function TechnicalDetails({ item, engineResult }: { item: ReviewItem; engineResult: FootnoteEngineResult }) {
  const parseResult = engineResult.parseResults.find((result) => result.footnoteId === item.finding.footnoteId);
  const segment = parseResult?.segments.find(
    (candidate) => candidate.start <= item.finding.start && candidate.end >= item.finding.end
  );
  const segmentAnalysis = segment
    ? engineResult.segmentAnalyses.find(
        (analysis) => analysis.footnoteId === item.finding.footnoteId && analysis.segmentId === segment.segmentId
      )
    : undefined;
  return (
    <dl className="fc-technical-grid">
      <div><dt>Rule ID</dt><dd>{item.finding.ruleId}</dd></div>
      <div><dt>Kategorie</dt><dd>{CATEGORY_LABELS[item.finding.category]}</dd></div>
      <div><dt>Severity</dt><dd>{SEVERITY_LABELS[item.finding.severity]}</dd></div>
      <div><dt>Review-Grund</dt><dd>{REVIEW_REASON_LABELS[item.classificationReason]}</dd></div>
      <div><dt>Bereich</dt><dd>[{item.finding.start}, {item.finding.end})</dd></div>
      <div><dt>Finding ID</dt><dd>{item.finding.findingId}</dd></div>
      <div><dt>Quelltext-Hash</dt><dd>{item.finding.sourceTextHash}</dd></div>
      <div><dt>Parser Type</dt><dd>{segment?.classification.type ?? "–"}</dd></div>
      <div><dt>Effective Type</dt><dd>{segmentAnalysis?.effectiveClassification.effectiveType ?? "–"}</dd></div>
      <div><dt>Extraction Status</dt><dd>{segment?.extraction?.status ?? "–"}</dd></div>
      <div><dt>Source Mapping</dt><dd><pre>{JSON.stringify(segmentAnalysis?.sourceMappings ?? [], null, 2)}</pre></dd></div>
      <div><dt>Formatting Metadata</dt><dd><pre>{JSON.stringify(item.finding.metadata ?? {}, null, 2)}</pre></dd></div>
      <div><dt>Proposed Action</dt><dd><pre>{JSON.stringify(item.proposedAction ?? null, null, 2)}</pre></dd></div>
      <div><dt>Technical Eligibility</dt><dd><pre>{JSON.stringify(item.technicalEligibility, null, 2)}</pre></dd></div>
      <div><dt>Conflict IDs</dt><dd>{item.conflicts.map((conflict) => conflict.conflictId).join(", ") || "–"}</dd></div>
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
}: {
  item: ReviewItem;
  mode: ReviewMode;
  engineResult: FootnoteEngineResult;
  onSetStatus(item: ReviewItem, status: ReviewStatus): void;
  onClearStatus(item: ReviewItem): void;
  writeBackResult?: WriteBackResult;
  onApplySingle(item: ReviewItem): void;
}) {
  const blockedReason = REVIEW_REASON_LABELS[item.classificationReason];
  const title = findingTitle(item);
  const canApply = canApplySingleReviewItem(item, writeBackResult);
  const isApplying =
    writeBackResult?.status === "PENDING" && writeBackResult.message === "Wird durchgeführt …";
  return (
    <article className={`fc-finding fc-finding--${item.finding.severity}`}>
      <div className="fc-finding__topline">
        <span className={`fc-badge fc-badge--severity-${item.finding.severity}`}>{severityIcon(item.finding.severity)}{SEVERITY_LABELS[item.finding.severity]}</span>
        <span className={`fc-badge fc-badge--class-${item.reviewClass.toLowerCase()}`}>{REVIEW_CLASS_LABELS[item.reviewClass]}</span>
        {item.conflicts.length > 0 && <span className="fc-badge fc-badge--technical"><ShieldAlert size={13} aria-hidden="true" />Konflikt</span>}
      </div>
      <h3>{title}</h3>
      <ActionPreview item={item} />
      <p className="fc-finding__message">{item.finding.message}</p>
      {item.conflicts.length > 0 && <p className="fc-finding__conflict">Diese Änderung überschneidet sich mit einer anderen vorgeschlagenen Änderung.</p>}
      <div className="fc-finding__status">
        <span>Status:</span>
        <span className={`fc-status fc-status--${item.decision.effectiveStatus.toLowerCase()}`}>{statusIcon(item.decision.effectiveStatus)}{REVIEW_STATUS_LABELS[item.decision.effectiveStatus]}</span>
        {item.decision.source === "MODE_DEFAULT" && mode === "CORRECTION" && <span className="fc-muted">automatisch freigegeben</span>}
      </div>
      {writeBackResult && (
        <div className="fc-writeback-status" aria-live="polite">
          <span>Word-Änderung:</span>
          <span className={`fc-writeback-badge fc-writeback-badge--${writeBackResult.status.toLowerCase()}`}>
            {writeBackStatusIcon(writeBackResult.status)}
            {isApplying ? "Wird durchgeführt …" : writeBackResultLabel(writeBackResult)}
          </span>
          {(writeBackResult.status === "FAILED" || writeBackResult.status === "STALE") &&
            writeBackResult.message && <span className="fc-writeback-message">{writeBackResult.message}</span>}
        </div>
      )}
      {mode === "REVIEW" && item.reviewClass !== "INFO" && (
        <div className="fc-finding__actions" aria-label={`Entscheidung für ${title}`}>
          <span title={!item.canAccept ? blockedReason || "Für dieses Finding ist keine sichere Aktion verfügbar." : undefined}>
            <NeonButton size="sm" variant="primary" disabled={!item.canAccept} onClick={() => onSetStatus(item, "ACCEPTED")}><Check size={14} aria-hidden="true" />Übernehmen</NeonButton>
          </span>
          <NeonButton size="sm" variant="destructive" onClick={() => onSetStatus(item, "REJECTED")}><X size={14} aria-hidden="true" />Ablehnen</NeonButton>
          <NeonButton size="sm" variant="subtle" onClick={() => onSetStatus(item, "DEFERRED")}><Clock3 size={14} aria-hidden="true" />Später prüfen</NeonButton>
          {item.decision.explicitStatus && <NeonButton size="sm" variant="ghost" onClick={() => onClearStatus(item)}><RotateCcw size={14} aria-hidden="true" />Zurücksetzen</NeonButton>}
        </div>
      )}
      {(mode === "REVIEW" || mode === "CORRECTION") && (canApply || isApplying) && (
        <div className="fc-writeback-actions">
          <NeonButton size="sm" variant="primary" disabled={isApplying} onClick={() => onApplySingle(item)}>
            {isApplying ? <LoaderCircle className="fc-spin" size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
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
      <div><dt>Inhalt</dt><dd>{footnote.contentText || "(leer)"}</dd></div>
      <div><dt>Hash</dt><dd>{footnote.originalTextHash}</dd></div>
      <div><dt>Reader-Status</dt><dd>{footnote.readStatus}</dd></div>
      <div><dt>Locator</dt><dd><pre>{JSON.stringify(footnote.locator, null, 2)}</pre></dd></div>
      <div><dt>Base Format</dt><dd><pre>{JSON.stringify(footnote.baseCharacterFormat ?? {}, null, 2)}</pre></dd></div>
      <div><dt>Formatting Runs</dt><dd>{footnote.formattingRuns.length}<pre>{JSON.stringify(footnote.formattingRuns, null, 2)}</pre></dd></div>
      <div><dt>Protected Ranges</dt><dd>{footnote.protectedRanges.length}<pre>{JSON.stringify(footnote.protectedRanges, null, 2)}</pre></dd></div>
      <div><dt>Absatzformate</dt><dd><pre>{JSON.stringify(footnote.paragraphFormats, null, 2)}</pre></dd></div>
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
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const problemLabel = group.items.length === 1 ? "1 Problem" : `${group.items.length} Probleme`;
  return (
    <section className="fc-footnote-group">
      <Collapsible
        open={open}
        onOpenChange={onOpenChange}
        ariaLabel={`Fußnote ${group.footnote.ordinal}, ${problemLabel}`}
        label={<span className="fc-footnote-group__label"><strong>Fußnote {group.footnote.ordinal}</strong><span>{problemLabel}</span></span>}
        buttonClassName="fc-footnote-group__trigger"
        contentClassName="fc-footnote-group__content"
      >
        {() => (
          <>
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
              />
            ))}
            <Collapsible label="Technische Fußnotendaten" className="fc-footnote-debug" contentClassName="fc-details__content">
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
}: {
  readerMetrics: FootnoteReadResult["readerMetrics"] | null;
  documentFormatting: DocumentFormattingSnapshot | null;
  engineResult: FootnoteEngineResult;
}) {
  return (
    <Collapsible label="Entwicklerdetails" className="fc-global-debug" contentClassName="fc-details__content">
      <dl className="fc-technical-grid">
        <div><dt>Reader</dt><dd><pre>{JSON.stringify(readerMetrics, null, 2)}</pre></dd></div>
        <div><dt>Dokumentformatierung</dt><dd><pre>{JSON.stringify(documentFormatting, null, 2)}</pre></dd></div>
        <div><dt>Engine</dt><dd>Analysiert: {engineResult.analyzedFootnotes}<br />Findings: {engineResult.findings.length}<br />Dauer: {engineResult.durationMs ?? "–"} ms</dd></div>
      </dl>
    </Collapsible>
  );
}

export function ReviewWorkspace(props: ReviewWorkspaceProps) {
  const [filters, setFilters] = useState<ReviewFilters>(DEFAULT_REVIEW_FILTERS);
  const [visibleGroupLimit, setVisibleGroupLimit] = useState(80);
  const [openFootnotes, setOpenFootnotes] = useState<OpenFootnoteState>(
    createClosedFootnoteState
  );
  const filteredItems = useMemo(
    () => filterReviewItems(props.reviewResult?.items ?? [], props.footnotes, filters),
    [props.reviewResult, props.footnotes, filters]
  );
  const groups = useMemo(
    () => groupReviewItems(filteredItems, props.footnotes),
    [filteredItems, props.footnotes]
  );
  const filterSignature = `${filters.severity}:${filters.reviewClass}:${filters.status}:${filters.category}:${filters.search}`;
  useEffect(() => setVisibleGroupLimit(80), [filterSignature]);
  useEffect(() => setOpenFootnotes(createClosedFootnoteState()), [props.engineResult]);
  const visibleGroups = groups.slice(0, visibleGroupLimit);
  const hasAnalysis = props.engineResult !== null && props.reviewResult !== null;
  const activeFilters = hasActiveFilters(filters);
  const writeBackResults = Object.values(props.writeBackState);
  const appliedCount = writeBackResults.filter((result) => result.status === "APPLIED").length;
  const staleCount = writeBackResults.filter((result) => result.status === "STALE").length;
  const failedCount = writeBackResults.filter((result) => result.status === "FAILED").length;
  const isCorrecting = props.isLoading && props.progress?.phase === "correcting";

  return (
    <main className="fc-app">
      <div className="fc-shell">
        <header className="fc-header">
          <div className="fc-brand">
            <BrandLogo size={34} />
            <div><h1>Footnote Checker</h1><p>Juristische Fußnoten prüfen</p></div>
          </div>
          <NeonButton variant="ghost" size="icon" aria-label="Einstellungen öffnen" title="Einstellungen" onClick={props.onOpenSettings}>
            <Settings size={19} aria-hidden="true" />
          </NeonButton>
        </header>

        <nav className="fc-modes" aria-label="Arbeitsmodus">
          {MODE_OPTIONS.map((option) => (
            <button key={option.value} type="button" className={props.mode === option.value ? "is-active" : ""} aria-pressed={props.mode === option.value} onClick={() => props.onModeChange(option.value)}>
              {option.label}
            </button>
          ))}
        </nav>

        <NeonButton className="fc-primary-action" variant="primary" size="lg" disabled={props.isLoading} onClick={props.onAnalyze}>
          <CheckCheck size={18} aria-hidden="true" />{isCorrecting ? "Sichere Korrekturen werden durchgeführt …" : props.isLoading ? "Fußnoten werden geprüft …" : "Fußnoten prüfen"}
        </NeonButton>

        {props.isLoading && props.progress && (
          <section className="fc-progress-panel" aria-live="polite">
            <strong>{isCorrecting ? "Sichere Korrekturen werden durchgeführt …" : "Fußnoten werden geprüft"}</strong>
            <Progress value={props.progress.percent} label={isCorrecting ? "Fortschritt der sicheren Korrekturen" : "Fortschritt der Fußnotenprüfung"} />
            <span>{props.progress.total > 0 ? `${props.progress.processed.toLocaleString("de-DE")} / ${props.progress.total.toLocaleString("de-DE")} ${isCorrecting ? "Korrekturen" : "Fußnoten"} · ${props.progress.percent} %` : `${props.progress.percent} %`}</span>
          </section>
        )}

        {props.message && <div className={props.hasError ? "fc-notice fc-notice--error" : "fc-notice"} role={props.hasError ? "alert" : "status"}>{props.hasError && <CircleAlert size={18} aria-hidden="true" />}<span>{props.message}</span></div>}

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
            {props.reviewResult.items.length === 0 ? (
              <section className="fc-success" role="status">
                <Check size={22} aria-hidden="true" />
                <div><h2>Keine Auffälligkeiten gefunden</h2><p>Die geprüften Fußnoten entsprechen den aktuell eingestellten Regeln.</p></div>
              </section>
            ) : (
              <>
                {props.mode === "REVIEW" && (
                  <div className="fc-sticky-actions fc-sticky-actions--review">
                    <div className="fc-sticky-actions__status">
                      {props.reviewResult.summary.byStatus.accepted} übernommen · {props.reviewResult.summary.byStatus.open} offen · {props.reviewResult.summary.byStatus.deferred} später
                    </div>
                    <div className="fc-bulk-actions">
                    <NeonButton variant="primary" size="sm" onClick={props.onAcceptAllAutomatic}><CheckCheck size={15} aria-hidden="true" />Alle automatischen übernehmen</NeonButton>
                    <NeonButton variant="secondary" size="sm" disabled={Object.keys(props.decisionState).length === 0} onClick={props.onResetDecisions}><RotateCcw size={15} aria-hidden="true" />Entscheidungen zurücksetzen</NeonButton>
                    </div>
                  </div>
                )}
                {props.mode === "CORRECTION" && (
                  <div className="fc-sticky-actions fc-sticky-actions--correction" aria-label="Korrekturergebnis">
                    <strong>Durchgeführt: {appliedCount}</strong>
                    <span>Erneut prüfen: {staleCount}</span>
                    <span>Fehlgeschlagen: {failedCount}</span>
                    <span>Prüfen: {props.reviewResult.summary.byClass.manual}</span>
                    <span>Technisch blockiert: {props.reviewResult.summary.byClass.technical}</span>
                    <span className="fc-muted">Sichere AUTO-Korrekturen werden sequenziell angewendet</span>
                  </div>
                )}
                <section className="fc-filters" aria-label="Findings filtern">
                  <label className="fc-search"><span>Suche</span><div><Search size={16} aria-hidden="true" /><input type="search" placeholder="Fußnoten oder Findings durchsuchen" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></div></label>
                  <div className="fc-filters-desktop"><FilterFields filters={filters} onChange={setFilters} /></div>
                  <div className="fc-filters-mobile"><Collapsible label={<><Filter size={15} aria-hidden="true" />Filter</>} contentClassName="fc-filter-mobile-content"><FilterFields filters={filters} onChange={setFilters} /></Collapsible></div>
                  <div className="fc-filter-status">
                    <span>{filteredItems.length} von {props.reviewResult.items.length} Findings angezeigt</span>
                    {activeFilters && <NeonButton variant="ghost" size="sm" onClick={() => setFilters(DEFAULT_REVIEW_FILTERS)}>Filter zurücksetzen</NeonButton>}
                  </div>
                </section>

                {groups.length === 0 ? (
                  <section className="fc-no-results"><h2>Keine passenden Findings</h2><p>Ändern oder entfernen Sie die aktiven Filter.</p></section>
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
                        open={openFootnotes.has(group.footnote.id)}
                        onOpenChange={(open) =>
                          setOpenFootnotes((current) =>
                            setFootnoteOpen(current, group.footnote.id, open)
                          )
                        }
                      />
                    ))}
                    {visibleGroupLimit < groups.length && <NeonButton className="fc-load-more" variant="secondary" onClick={() => setVisibleGroupLimit((limit) => limit + 80)}>Weitere {Math.min(80, groups.length - visibleGroupLimit)} Fußnoten anzeigen</NeonButton>}
                  </div>
                )}
              </>
            )}
            <GlobalTechnicalData readerMetrics={props.readerMetrics} documentFormatting={props.documentFormatting} engineResult={props.engineResult} />
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
                <Heading slot="title" id="reanalysis-title">Aktuelle Review-Entscheidungen verwerfen?</Heading>
                <p>Eine neue Analyse ersetzt die aktuellen Ergebnisse. Entscheidungen für unveränderte Findings werden weiterverwendet; nicht mehr passende Entscheidungen werden verworfen.</p>
                <div className="fc-dialog__actions">
                  <NeonButton variant="secondary" onClick={props.onCancelReanalysis}>Abbrechen</NeonButton>
                  <NeonButton variant="primary" onClick={props.onConfirmReanalysis}>Neue Analyse starten</NeonButton>
                </div>
              </AriaDialog>
            </Modal>
          </ModalOverlay>
        )}
      </div>
    </main>
  );
}
