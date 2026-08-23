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
  const readInProgressRef = useRef(false);

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
      setDecisionState((current) => reconcileReviewDecisions(current, analysis.findings));
      setReadProgress(createFootnoteReadProgress("complete", result.footnotes.length, result.footnotes.length));
      if (result.footnotes.length === 0) setMessage("Das Dokument enthält keine Fußnoten.");
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
