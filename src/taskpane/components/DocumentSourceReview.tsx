import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { BookOpenCheck } from "lucide-react";
import { NeonButton } from "@/components/ui/neon-button";
import {
  isDocumentSourcePromotionSafe,
  type DocumentSource,
  type DocumentSourceRegistry,
} from "@/document-source-registry";

interface DocumentSourceReviewProps {
  registry: DocumentSourceRegistry;
  open: boolean;
  onOpenChange(open: boolean): void;
  onPromote(documentSourceIds: string[]): void;
}

function sourceTypeLabel(source: DocumentSource): string {
  const labels: Record<string, string> = {
    COMMENTARY: "Kommentar",
    BOOK: "Buch",
    BOOK_CHAPTER: "Buchbeitrag",
    FESTSCHRIFT_CONTRIBUTION: "Festschriftbeitrag",
    YEARBOOK_CONTRIBUTION: "Jahrbuchbeitrag",
    MANUSCRIPT: "Manuskript",
    FORTHCOMING: "Im Erscheinen",
    JOURNAL_ARTICLE: "Zeitschriftenaufsatz",
    CASE_NOTE: "Anmerkung",
    ONLINE_SOURCE: "Onlinequelle",
    LEGISLATIVE_MATERIAL: "Gesetzgebungsmaterial",
    ADMINISTRATIVE_MATERIAL: "Verwaltungsmaterial",
    OTHER: "Weitere Quelle",
  };
  return labels[source.canonicalFingerprint.sourceType] ?? "Quelle";
}

export function DocumentSourceReview({
  registry,
  open,
  onOpenChange,
  onPromote,
}: DocumentSourceReviewProps) {
  const sources = useMemo(
    () =>
      registry.sources.filter(
        (source) =>
          source.status === "CONFIRMED_DOCUMENT_SOURCE" && !source.persistentLiteratureEntryId
      ),
    [registry]
  );
  const safeIds = useMemo(
    () => sources.filter(isDocumentSourcePromotionSafe).map((source) => source.documentSourceId),
    [sources]
  );
  const [reviewing, setReviewing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(safeIds));
  useEffect(() => {
    if (!open) return;
    setReviewing(false);
    setSelectedIds(new Set(safeIds));
  }, [open, safeIds.join("|")]);

  return (
    <ModalOverlay
      className="fc-dialog-backdrop"
      isOpen={open}
      isDismissable
      onOpenChange={onOpenChange}
    >
      <Modal className="fc-dialog fc-source-review-modal">
        <AriaDialog className="fc-dialog__content" aria-label="Neue Quellen erkannt">
          <Heading slot="title">Neue Quellen erkannt</Heading>
          {!reviewing ? (
            <>
              <p>
                Es wurden {sources.length} neue {sources.length === 1 ? "Quelle" : "Quellen"}{" "}
                erkannt, die noch nicht im Literaturverzeichnis gespeichert{" "}
                {sources.length === 1 ? "ist" : "sind"}. Möchten Sie{" "}
                {sources.length === 1 ? "diese" : "diese"} jetzt prüfen und übernehmen?
              </p>
              <div className="fc-dialog__actions">
                <NeonButton variant="primary" size="sm" onClick={() => setReviewing(true)}>
                  Quellen prüfen
                </NeonButton>
                {safeIds.length > 0 && (
                  <NeonButton variant="secondary" size="sm" onClick={() => onPromote(safeIds)}>
                    Alle geeigneten übernehmen
                  </NeonButton>
                )}
                <NeonButton variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                  Später
                </NeonButton>
              </div>
            </>
          ) : (
            <>
              <p>Wählen Sie die Quellen aus, die dauerhaft gespeichert werden sollen.</p>
              <div className="fc-source-review-list">
                {sources.map((source) => {
                  const safe = isDocumentSourcePromotionSafe(source);
                  const selected = selectedIds.has(source.documentSourceId);
                  return (
                    <label className="fc-source-review-item" key={source.documentSourceId}>
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={!safe}
                        onChange={(event) => {
                          const next = new Set(selectedIds);
                          if (event.target.checked) next.add(source.documentSourceId);
                          else next.delete(source.documentSourceId);
                          setSelectedIds(next);
                        }}
                      />
                      <span>
                        <strong>{source.canonicalDisplayCitation}</strong>
                        <span>
                          {sourceTypeLabel(source)} · {source.occurrenceCount} Vorkommen ·
                          Dokumenteigene Quelle
                        </span>
                        {source.observedVariants.length > 1 && (
                          <details>
                            <summary>
                              {source.observedVariants.length} beobachtete Varianten
                            </summary>
                            <ul>
                              {source.observedVariants.map((variant) => (
                                <li
                                  key={`${source.documentSourceId}:${variant.rawBibliographicCore}`}
                                >
                                  {variant.rawBibliographicCore} ({variant.occurrenceCount}×)
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                        {!safe && (
                          <span>Diese Quelle muss vor einer Übernahme weiter geprüft werden.</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="fc-dialog__actions">
                <NeonButton
                  variant="primary"
                  size="sm"
                  disabled={selectedIds.size === 0}
                  onClick={() => onPromote([...selectedIds])}
                >
                  <BookOpenCheck size={15} aria-hidden="true" /> Ins Literaturverzeichnis übernehmen
                </NeonButton>
                <NeonButton variant="secondary" size="sm" onClick={() => setReviewing(false)}>
                  Zurück
                </NeonButton>
                <NeonButton variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                  Später
                </NeonButton>
              </div>
            </>
          )}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
