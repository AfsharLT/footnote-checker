import * as React from "react";
import { useMemo, useRef, useState } from "react";
import { useCitationSourceMapping } from "@/citation-mapping/use-citation-source-mapping";
import { useCitationSettings } from "@/citation-settings/use-citation-settings";
import { analyzeFootnotes } from "@/footnote-engine/engine";
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
import { formatReaderError } from "@/taskpane/reader-error";
import {
  createFootnoteReadProgress,
  readFootnotes,
  type DocumentFormattingSnapshot,
  type FootnoteReadProgress,
  type FootnoteReadResult,
  type FootnoteSnapshot,
} from "@/taskpane/taskpane";
import {
  applySingleReviewItem,
  createPendingWriteBackResult,
  runCorrectionAutoApply,
  type AppliedMutationRecord,
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
  const [documentFormatting, setDocumentFormatting] = useState<DocumentFormattingSnapshot | null>(null);
  const [readerMetrics, setReaderMetrics] = useState<FootnoteReadResult["readerMetrics"] | null>(null);
  const [engineResult, setEngineResult] = useState<FootnoteEngineResult | null>(null);
  const [decisionState, setDecisionState] = useState<ReviewDecisionState>({});
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [readProgress, setReadProgress] = useState<FootnoteReadProgress | null>(null);
  const [hasError, setHasError] = useState(false);
  const [confirmReanalysis, setConfirmReanalysis] = useState(false);
  const [writeBackState, setWriteBackState] = useState<WriteBackState>({});
  const readInProgressRef = useRef(false);
  const writeBackInFlightRef = useRef(new Set<string>());
  const appliedMutationsRef = useRef<AppliedMutationRecord[]>([]);

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
    if (readInProgressRef.current) return;
    readInProgressRef.current = true;
    setIsLoading(true);
    setHasError(false);
    setMessage("");
    setReadProgress(createFootnoteReadProgress("initializing", 0, 0));
    try {
      const result = await readFootnotes(setReadProgress);
      setReadProgress(createFootnoteReadProgress("analyzing", result.footnotes.length, result.footnotes.length));
      const analysis = analyzeFootnotes(result.footnotes, {
        profile: activeProfile,
        mappingData,
        mappingIndex,
      });
      setFootnotes(result.footnotes);
      setDocumentFormatting(result.documentFormatting);
      setReaderMetrics(result.readerMetrics);
      setEngineResult(analysis);
      const reconciledDecisions = reconcileReviewDecisions(decisionState, analysis.findings);
      setDecisionState(reconciledDecisions);
      setWriteBackState({});
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
        const autoApply = await runCorrectionAutoApply({
          items: analyzedReview.items,
          footnotes: result.footnotes,
          onProgress: ({ processed, total }) =>
            setReadProgress(createFootnoteReadProgress("correcting", processed, total)),
          onResult: (writeBackResult) =>
            setWriteBackState((current) => ({
              ...current,
              [writeBackResult.reviewItemId]: writeBackResult,
            })),
        });
        setWriteBackState(autoApply.state);
        appliedMutationsRef.current = autoApply.mutations;
        setMessage(
          `${autoApply.summary.applied} Korrekturen durchgeführt · ${autoApply.summary.stale} erneut prüfen · ${analyzedReview.summary.byClass.manual} müssen manuell geprüft werden${autoApply.summary.failed > 0 ? ` · ${autoApply.summary.failed} fehlgeschlagen` : ""}`
        );
      } else if (result.footnotes.length === 0) {
        setMessage("Das Dokument enthält keine Fußnoten.");
      }
      setReadProgress(createFootnoteReadProgress("complete", result.footnotes.length, result.footnotes.length));
    } catch (error) {
      setHasError(true);
      setMessage(formatReaderError(error));
      setReadProgress(null);
    } finally {
      readInProgressRef.current = false;
      setIsLoading(false);
    }
  };

  const requestAnalysis = () => {
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
    if (reviewResult) setDecisionState((current) => acceptAllAutomatic(current, reviewResult.items));
  };
  const handleApplySingle = async (item: ReviewItem) => {
    if (writeBackInFlightRef.current.has(item.reviewItemId)) return;
    const footnote = footnotes.find((candidate) => candidate.id === item.finding.footnoteId);
    if (!footnote) {
      const result: WriteBackResult = {
        reviewItemId: item.reviewItemId,
        status: "STALE",
        actionKind: item.proposedAction?.type,
        reason: "FOOTNOTE_NOT_FOUND",
        reasons: ["FOOTNOTE_NOT_FOUND"],
        message: "Die Fußnote wurde seit der Analyse verändert. Bitte prüfen Sie die Fußnote erneut.",
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
        !appliedMutationsRef.current.some(
          (record) => record.reviewItemId === result.reviewItemId
        )
      ) {
        appliedMutationsRef.current = [...appliedMutationsRef.current, result.mutation];
      }
      setWriteBackState((current) => ({ ...current, [item.reviewItemId]: result }));
    } finally {
      writeBackInFlightRef.current.delete(item.reviewItemId);
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
    <React.Suspense fallback={<main className="fc-app"><div className="fc-shell"><p className="fc-notice">Oberfläche wird geladen …</p></div></main>}>
      <ReviewWorkspace
        mode={mode}
        onModeChange={setMode}
        isLoading={isLoading}
        progress={readProgress}
        onAnalyze={requestAnalysis}
        onOpenSettings={() => setView("SETTINGS")}
        footnotes={footnotes}
        engineResult={engineResult}
        reviewResult={reviewResult}
        decisionState={decisionState}
        onSetStatus={handleSetStatus}
        onClearStatus={handleClearStatus}
        onAcceptAllAutomatic={handleAcceptAllAutomatic}
        onResetDecisions={() => setDecisionState(resetAllDecisions())}
        writeBackState={writeBackState}
        onApplySingle={handleApplySingle}
        message={message}
        hasError={hasError}
        readerMetrics={readerMetrics}
        documentFormatting={documentFormatting}
        confirmReanalysis={confirmReanalysis}
        onCancelReanalysis={() => setConfirmReanalysis(false)}
        onConfirmReanalysis={startConfirmedAnalysis}
      />
    </React.Suspense>
  );
};

export default App;
