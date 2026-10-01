import type { FootnoteReadProgress } from "./taskpane";
import type { BatchProgress } from "../write-back-engine/batch-types";

export const PHASE_LABELS: Record<FootnoteReadProgress["phase"], string> = {
  initializing: "Prüfung wird vorbereitet …",
  reading: "Fußnoten werden aus Word gelesen …",
  enriching: "Linkinformationen werden ergänzt …",
  analyzing: "Quellen und Zitierbestandteile werden erkannt …",
  resolving: "Quellen und Kurzbelege werden zugeordnet …",
  checking: "Zitierregeln werden geprüft …",
  finalizing: "Ergebnisse werden vorbereitet …",
  correcting: "Sichere Korrekturen werden durchgeführt …",
  complete: "Prüfung abgeschlossen",
};

export interface LoadingDisplay {
  label: string;
  detail: string;
  percent: number;
  active: boolean;
}

export function loadingDisplay(
  progress: FootnoteReadProgress | null,
  batch: BatchProgress | null,
  batchRunning: boolean,
  correcting: boolean,
  loading: boolean
): LoadingDisplay | null {
  if (batchRunning) {
    const processed = batch?.processed ?? 0;
    const total = batch?.total ?? 0;
    const ratio = total > 0 ? Math.min(1, processed / total) : 0;
    const start = correcting ? 85 : 0;
    return {
      label:
        batch?.phase === "FINALIZING"
          ? "Korrekturlauf wird abgeschlossen …"
          : batch?.phase === "WRITING"
            ? PHASE_LABELS.correcting
            : "Korrekturen werden vorbereitet …",
      detail: `${processed.toLocaleString("de-DE")} / ${total.toLocaleString("de-DE")} Korrekturen verarbeitet`,
      percent: batch?.phase === "FINALIZING" ? 99 : Math.round(start + ratio * (98 - start)),
      active: true,
    };
  }
  if (!progress || (!loading && progress.phase !== "complete")) return null;
  const unit =
    progress.phase === "resolving" || progress.phase === "checking" ? "Prüfschritte" : "Fußnoten";
  return {
    label: PHASE_LABELS[progress.phase],
    detail:
      progress.phase === "initializing"
        ? "Word-Dokument wird geöffnet"
        : progress.phase === "enriching"
          ? `${progress.total.toLocaleString("de-DE")} Fußnoten gelesen · Zusatzinformationen aus Word`
          : progress.phase === "finalizing"
            ? "Quellenabgleich und Ergebnisliste abschließen"
            : `${progress.processed.toLocaleString("de-DE")} / ${progress.total.toLocaleString("de-DE")} ${unit} verarbeitet`,
    percent:
      correcting && progress.phase !== "complete"
        ? Math.round(progress.percent * 0.85)
        : progress.percent,
    active: loading,
  };
}
