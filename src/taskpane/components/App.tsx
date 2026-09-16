/* global performance, window */

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCitationSourceMapping } from "@/citation-mapping/use-citation-source-mapping";
import { useCitationSettings } from "@/citation-settings/use-citation-settings";
import { analyzeFootnotes } from "@/footnote-engine/engine";
import { SEGMENTATION_USER_MESSAGE } from "@/footnote-engine/citation-sequence-segmenter";
import type { FootnoteEngineResult } from "@/footnote-engine/types";
import {
  acceptAllAutomatic,
  clearExplicitReviewStatus,
  reconcileReviewDecisions,
  resetAllDecisions,
  runReviewEngine,
  setReviewStatus,
  type ReviewDecisionState,
  type ReviewItem,
  type ReviewMode,
  type ReviewStatus,
} from "@/review-engine";
import {
  getOfficeHostCapabilities,
  unsupportedCapabilityTechnicalDetails,
  type HostCapabilities,
} from "@/taskpane/host-capabilities";
import { formatReaderError, readerErrorUserMessage } from "@/taskpane/reader-error";
import {
  hostWorkStateForBatchPhase,
  type AnalysisPerformanceMetrics,
  type HostWorkState,
} from "@/taskpane/performance";
import {
  createFootnoteReadProgress,
  createReaderNotice,
  readFootnotes,
  type DocumentFormattingSnapshot,
  type FootnoteReadProgress,
  type FootnoteReadResult,
  type FootnoteSnapshot,
} from "@/taskpane/taskpane";
import {
  applySingleReviewItem,
  buildWriteBackReportRows,
  createWriteBackPlan,
  createPendingWriteBackResult,
  runWriteBackBatch,
  serializeWriteBackReportCsv,
  writeBackReportFileName,
  type AppliedMutationRecord,
  type BatchProgress,
  type BatchRunStatus,
  type BatchWriteBackResult,
  type WriteBackPlan,
  type WriteBackResult,
  type WriteBackState,
} from "@/write-back-engine";

const ReviewWorkspace = React.lazy(() =>
  import("./ReviewWorkspace").then((module) => ({ default: module.ReviewWorkspace }))
);

const SettingsPanel = React.lazy(() =>
  import("./SettingsPanel").then((module) => ({ default: module.SettingsPanel }))
);

const App: React.FC = () => {
  const { activeProfile, updateProfile } = useCitationSettings();
  const { mappingData, mappingIndex, updateMapping } = useCitationSourceMapping();
  const [view, setView] = useState<"WORKSPACE" | "SETTINGS">("WORKSPACE");
  const [mode, setMode] = useState<ReviewMode>("ANALYSIS");
  const [footnotes, setFootnotes] = useState<FootnoteSnapshot[]>([]);
  const [documentFormatting, setDocumentFormatting] = useState<DocumentFormattingSnapshot | null>(
    null
  );
  const [readerMetrics, setReaderMetrics] = useState<FootnoteReadResult["readerMetrics"] | null>(
    null
  );
  const [engineResult, setEngineResult] = useState<FootnoteEngineResult | null>(null);
  const [decisionState, setDecisionState] = useState<ReviewDecisionState>({});
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [readProgress, setReadProgress] = useState<FootnoteReadProgress | null>(null);
  const [hasError, setHasError] = useState(false);
  const [confirmReanalysis, setConfirmReanalysis] = useState(false);
  const [writeBackState, setWriteBackState] = useState<WriteBackState>({});
  const [analysisTimestamp, setAnalysisTimestamp] = useState("");
  const [writeBackPlan, setWriteBackPlan] = useState<WriteBackPlan | null>(null);
  const [batchResult, setBatchResult] = useState<BatchWriteBackResult | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchRunStatus, setBatchRunStatus] = useState<BatchRunStatus>("IDLE");
  const [reportError, setReportError] = useState("");
  const [technicalError, setTechnicalError] = useState("");
  const [analysisPerformance, setAnalysisPerformance] = useState<AnalysisPerformanceMetrics | null>(
    null
  );
  const [hostWorkState, setHostWorkState] = useState<HostWorkState>("IDLE");
  const [hostCapabilities] = useState<HostCapabilities>(() => getOfficeHostCapabilities());
  const readInProgressRef = useRef(false);
  const batchInFlightRef = useRef(false);
  const writeBackInFlightRef = useRef(new Set<string>());
  const appliedMutationsRef = useRef<AppliedMutationRecord[]>([]);

  useEffect(() => {
    const cleanupBestEffortResources = () => {
      readInProgressRef.current = false;
      batchInFlightRef.current = false;
      writeBackInFlightRef.current.clear();
      appliedMutationsRef.current = [];
    };
    window.addEventListener("pagehide", cleanupBestEffortResources);
    return () => {
      window.removeEventListener("pagehide", cleanupBestEffortResources);
      cleanupBestEffortResources();
    };
  }, []);

  const protectedRangesByFootnoteId = useMemo(
    () =>
      new Map(
        (engineResult?.footnoteAnalyses ?? []).map((analysis) => [
          analysis.footnoteId,
          analysis.protectedRanges,
        ])
      ),
    [engineResult]
  );
  const reviewResult = useMemo(
    () =>
      engineResult
        ? runReviewEngine({
            findings: engineResult.findings,
            footnotes,
            mode,
            decisionState,
            protectedRangesByFootnoteId,
          })
        : null,
    [engineResult, footnotes, mode, decisionState, protectedRangesByFootnoteId]
  );

  const analyzeCurrentDocument = async () => {
    if (
      readInProgressRef.current ||
      batchInFlightRef.current ||
      writeBackInFlightRef.current.size > 0
    )
      return;
    if (!hostCapabilities.supported) {
      setHasError(true);
      setMessage("Diese Word-Version unterstützt eine benötigte Funktion noch nicht.");
      setTechnicalError(unsupportedCapabilityTechnicalDetails(hostCapabilities));
      return;
    }
    const analysisStartedAt = performance.now();
    readInProgressRef.current = true;
    setHostWorkState("ANALYZING");
    setIsLoading(true);
    setHasError(false);
    setMessage("");
    setTechnicalError("");
    setReadProgress(createFootnoteReadProgress("initializing", 0, 0));
    try {
      const result = await readFootnotes(setReadProgress);
      const readerNotice = createReaderNotice(result);
      setReadProgress(
        createFootnoteReadProgress("analyzing", result.footnotes.length, result.footnotes.length)
      );
      const analysis = analyzeFootnotes(result.footnotes, {
        profile: activeProfile,
        mappingData,
        mappingIndex,
      });
      const analysisNotice = [
        readerNotice,
        analysis.parseResults.some((parseResult) =>
          parseResult.segmentationWarnings?.some((warning) => warning.code.endsWith("_FAILED"))
        )
          ? SEGMENTATION_USER_MESSAGE
          : "",
      ]
        .filter(Boolean)
        .join(" ");
      setFootnotes(result.footnotes);
      setDocumentFormatting(result.documentFormatting);
      setReaderMetrics(result.readerMetrics);
      setAnalysisPerformance({
        readerDurationMs: result.readerMetrics.durationMs,
        engineDurationMs: analysis.durationMs ?? 0,
        totalAnalysisDurationMs: Math.round((performance.now() - analysisStartedAt) * 10) / 10,
        contextSyncCount: result.readerMetrics.syncCount,
        footnoteCount: result.footnotes.length,
      });
      setEngineResult(analysis);
      const analyzedAt = new Date().toISOString();
      setAnalysisTimestamp(analyzedAt);
      const reconciledDecisions = reconcileReviewDecisions(decisionState, analysis.findings);
      setDecisionState(reconciledDecisions);
      setWriteBackState({});
      setWriteBackPlan(null);
      setBatchResult(null);
      setBatchProgress(null);
      setBatchRunStatus("IDLE");
      setReportError("");
      appliedMutationsRef.current = [];
      if (mode === "CORRECTION") {
        const analyzedReview = runReviewEngine({
          findings: analysis.findings,
          footnotes: result.footnotes,
          mode,
          decisionState: reconciledDecisions,
          protectedRangesByFootnoteId: new Map(
            analysis.footnoteAnalyses.map((footnoteAnalysis) => [
              footnoteAnalysis.footnoteId,
              footnoteAnalysis.protectedRanges,
            ])
          ),
        });
        const plan = createWriteBackPlan({ mode, items: analyzedReview.items });
        setWriteBackPlan(plan);
        batchInFlightRef.current = true;
        setHostWorkState("WRITING");
        setBatchRunStatus("PLANNING");
        const batch = await runWriteBackBatch(plan, {
          items: analyzedReview.items,
          footnotes: result.footnotes,
          onProgress: (progress) => {
            setBatchProgress(progress);
            setBatchRunStatus(
              progress.phase === "PLANNING"
                ? "PLANNING"
                : progress.phase === "FINALIZING"
                  ? "FINALIZING"
                  : "RUNNING"
            );
            setHostWorkState(hostWorkStateForBatchPhase(progress.phase));
          },
          onResults: (writeBackResults) =>
            setWriteBackState((current) => {
              const next = { ...current };
              for (const result of writeBackResults) next[result.reviewItemId] = result;
              return next;
            }),
        });
        setWriteBackState(batch.state);
        appliedMutationsRef.current = batch.mutations;
        setBatchResult(batch);
        setBatchRunStatus(batch.status);
        setHostWorkState("IDLE");
        setMessage(analysisNotice);
      } else if (result.footnotes.length === 0) {
        setMessage("Das Dokument enthält keine Fußnoten.");
      } else {
        setMessage(analysisNotice);
      }
      setReadProgress(
        createFootnoteReadProgress("complete", result.footnotes.length, result.footnotes.length)
      );
    } catch (error) {
      setHasError(true);
      setMessage(readerErrorUserMessage(error));
      setTechnicalError(formatReaderError(error));
      setReadProgress(null);
    } finally {
      batchInFlightRef.current = false;
      readInProgressRef.current = false;
      setIsLoading(false);
      setHostWorkState("IDLE");
    }
  };

  const requestAnalysis = () => {
    if (batchInFlightRef.current || writeBackInFlightRef.current.size > 0) return;
    if (Object.keys(decisionState).length > 0 && engineResult) {
      setConfirmReanalysis(true);
      return;
    }
    void analyzeCurrentDocument();
  };

  const startConfirmedAnalysis = () => {
    setConfirmReanalysis(false);
    void analyzeCurrentDocument();
  };

  const handleSetStatus = (item: ReviewItem, status: ReviewStatus) =>
    setDecisionState((current) => setReviewStatus(current, item, status));
  const handleClearStatus = (item: ReviewItem) =>
    setDecisionState((current) => clearExplicitReviewStatus(current, item.finding.findingId));
  const handleAcceptAllAutomatic = () => {
    if (reviewResult)
      setDecisionState((current) => acceptAllAutomatic(current, reviewResult.items));
  };
  const handleApplySingle = async (item: ReviewItem) => {
    if (batchInFlightRef.current || writeBackInFlightRef.current.has(item.reviewItemId)) return;
    const footnote = footnotes.find((candidate) => candidate.id === item.finding.footnoteId);
    if (!footnote) {
      const result: WriteBackResult = {
        reviewItemId: item.reviewItemId,
        status: "STALE",
        actionKind: item.proposedAction?.type,
        reason: "FOOTNOTE_NOT_FOUND",
        reasons: ["FOOTNOTE_NOT_FOUND"],
        message:
          "Die Fußnote wurde seit der Analyse verändert. Bitte prüfen Sie die Fußnote erneut.",
      };
      setWriteBackState((current) => ({ ...current, [item.reviewItemId]: result }));
      return;
    }
    writeBackInFlightRef.current.add(item.reviewItemId);
    setWriteBackState((current) => ({
      ...current,
      [item.reviewItemId]: createPendingWriteBackResult(item, "Wird durchgeführt …"),
    }));
    try {
      const result = await applySingleReviewItem({
        reviewItem: item,
        footnote,
        appliedMutations: appliedMutationsRef.current,
      });
      if (
        result.mutation &&
        !appliedMutationsRef.current.some((record) => record.reviewItemId === result.reviewItemId)
      ) {
        appliedMutationsRef.current = [...appliedMutationsRef.current, result.mutation];
      }
      setWriteBackState((current) => ({ ...current, [item.reviewItemId]: result }));
    } finally {
      writeBackInFlightRef.current.delete(item.reviewItemId);
    }
  };

  const runReviewBatch = async () => {
    if (
      !reviewResult ||
      batchInFlightRef.current ||
      readInProgressRef.current ||
      writeBackInFlightRef.current.size > 0
    )
      return;
    const plan = createWriteBackPlan({
      mode: "REVIEW",
      items: reviewResult.items,
      state: writeBackState,
    });
    if (plan.totals.eligible === 0) return;
    batchInFlightRef.current = true;
    setHostWorkState("WRITING");
    setWriteBackPlan(plan);
    setBatchResult(null);
    setBatchRunStatus("PLANNING");
    setBatchProgress(null);
    setReportError("");
    try {
      const batch = await runWriteBackBatch(plan, {
        items: reviewResult.items,
        footnotes,
        initialState: writeBackState,
        initialMutations: appliedMutationsRef.current,
        onProgress: (progress) => {
          setBatchProgress(progress);
          setBatchRunStatus(
            progress.phase === "PLANNING"
              ? "PLANNING"
              : progress.phase === "FINALIZING"
                ? "FINALIZING"
                : "RUNNING"
          );
          setHostWorkState(hostWorkStateForBatchPhase(progress.phase));
        },
        onResults: (writeBackResults) =>
          setWriteBackState((current) => {
            const next = { ...current };
            for (const result of writeBackResults) next[result.reviewItemId] = result;
            return next;
          }),
      });
      setWriteBackState(batch.state);
      appliedMutationsRef.current = batch.mutations;
      setBatchResult(batch);
      setBatchRunStatus(batch.status);
      setHostWorkState("IDLE");
    } catch {
      setBatchRunStatus("FAILED");
      setReportError("Der Korrekturlauf konnte technisch nicht abgeschlossen werden.");
    } finally {
      batchInFlightRef.current = false;
      setHostWorkState("IDLE");
    }
  };

  const exportDetailReport = () => {
    if (!reviewResult || !engineResult) return;
    setReportError("");
    try {
      const reportPlan =
        writeBackPlan ??
        createWriteBackPlan({ mode, items: reviewResult.items, state: writeBackState });
      const rows = buildWriteBackReportRows({
        items: reviewResult.items,
        footnotes,
        analysisTimestamp: analysisTimestamp || new Date().toISOString(),
        plan: reportPlan,
        batchResult: batchResult ?? undefined,
        writeBackState,
        engineResult,
      });
      const url = URL.createObjectURL(
        new Blob([serializeWriteBackReportCsv(rows)], { type: "text/csv;charset=utf-8" })
      );
      const link = document.createElement("a");
      try {
        link.href = url;
        link.download = writeBackReportFileName();
        link.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      setReportError("Der Detailbericht konnte nicht exportiert werden.");
    }
  };

  if (view === "SETTINGS") {
    return (
      <main className="fc-app">
        <div className="fc-shell fc-shell--settings">
          <React.Suspense fallback={<p className="fc-notice">Einstellungen werden geladen …</p>}>
            <SettingsPanel
              activeProfile={activeProfile}
              mappingData={mappingData}
              onSaveProfile={updateProfile}
              onSaveMapping={updateMapping}
              onClose={() => setView("WORKSPACE")}
            />
          </React.Suspense>
        </div>
      </main>
    );
  }

  return (
    <React.Suspense
      fallback={
        <main className="fc-app">
          <div className="fc-shell">
            <p className="fc-notice">Oberfläche wird geladen …</p>
          </div>
        </main>
      }
    >
      <ReviewWorkspace
        mode={mode}
        onModeChange={(nextMode) => {
          if (!batchInFlightRef.current) setMode(nextMode);
        }}
        isLoading={isLoading}
        progress={readProgress}
        onAnalyze={requestAnalysis}
        onOpenSettings={() => {
          if (!batchInFlightRef.current) setView("SETTINGS");
        }}
        footnotes={footnotes}
        engineResult={engineResult}
        reviewResult={reviewResult}
        autoCloseInactiveFootnotes={activeProfile.global.autoCloseInactiveFootnotes}
        decisionState={decisionState}
        onSetStatus={handleSetStatus}
        onClearStatus={handleClearStatus}
        onAcceptAllAutomatic={handleAcceptAllAutomatic}
        onResetDecisions={() => setDecisionState(resetAllDecisions())}
        writeBackState={writeBackState}
        onApplySingle={handleApplySingle}
        onRunReviewBatch={() => void runReviewBatch()}
        onExportDetailReport={exportDetailReport}
        batchRunStatus={batchRunStatus}
        batchProgress={batchProgress}
        batchResult={batchResult}
        currentPlan={
          reviewResult
            ? createWriteBackPlan({ mode, items: reviewResult.items, state: writeBackState })
            : null
        }
        reportError={reportError}
        technicalError={technicalError}
        message={message}
        hasError={hasError}
        readerMetrics={readerMetrics}
        documentFormatting={documentFormatting}
        hostCapabilities={hostCapabilities}
        analysisPerformance={analysisPerformance}
        hostWorkState={hostWorkState}
        confirmReanalysis={confirmReanalysis}
        onCancelReanalysis={() => setConfirmReanalysis(false)}
        onConfirmReanalysis={startConfirmedAnalysis}
      />
    </React.Suspense>
  );
};

export default App;
