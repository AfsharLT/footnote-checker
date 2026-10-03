import {
  createCanonicalSourceSlug,
  normalizeCitationSourceText,
} from "../citation-mapping/normalization";
import type {
  CitationSourceKind,
  CitationSourceMappingData,
  CitationSourceMaster,
} from "../citation-mapping/types";
import type { CitationType } from "../footnote-engine/types";
import type {
  DocumentSource,
  DocumentSourceRegistry,
  LiteraturePromotionItemResult,
  LiteraturePromotionResult,
} from "./types";

function cloneMapping(mapping: CitationSourceMappingData): CitationSourceMappingData {
  return JSON.parse(JSON.stringify(mapping)) as CitationSourceMappingData;
}

function cloneRegistry(registry: DocumentSourceRegistry): DocumentSourceRegistry {
  return JSON.parse(JSON.stringify(registry)) as DocumentSourceRegistry;
}

function linkRegistrySourceToPersistent(
  registry: DocumentSourceRegistry,
  source: DocumentSource,
  persistentSourceId: string
): void {
  source.persistentLiteratureEntryId = persistentSourceId;
  const itemIds = new Set(source.citationItemIds);
  registry.resolutions.forEach((resolution) => {
    if (!itemIds.has(resolution.citationItemId)) return;
    resolution.persistentSourceId = persistentSourceId;
    resolution.resolution = "PERSISTENT_MATCH";
    resolution.finalState = "PERSISTENT_MATCH";
  });
  registry.auditRecords.forEach((record) => {
    if (!itemIds.has(record.citationItemId)) return;
    record.persistentSourceId = persistentSourceId;
    record.resolution = "PERSISTENT_MATCH";
    record.finalState = "PERSISTENT_MATCH";
  });
}

function refreshAccounting(registry: DocumentSourceRegistry): void {
  const resolutions = registry.resolutions;
  registry.accounting = {
    citationItemsDetected: resolutions.length,
    persistentMatched: resolutions.filter((item) => item.finalState === "PERSISTENT_MATCH").length,
    documentMatched: resolutions.filter((item) => item.finalState === "DOCUMENT_MATCH").length,
    ambiguous: resolutions.filter((item) => item.finalState === "AMBIGUOUS").length,
    unresolved: resolutions.filter((item) => item.finalState === "UNRESOLVED").length,
    intentionallyIgnored: resolutions.filter((item) => item.finalState === "NON_SOURCE").length,
    failedLocal: resolutions.filter((item) => item.finalState === "FAILED_LOCAL").length,
    accountedTotal: resolutions.length,
    invariantSatisfied: true,
  };
}

function mappingKind(sourceType: CitationType): CitationSourceKind {
  if (sourceType === "COMMENTARY") return "COMMENTARY";
  if (sourceType === "JOURNAL_ARTICLE" || sourceType === "CASE_NOTE") return "JOURNAL";
  if (sourceType === "FESTSCHRIFT_CONTRIBUTION") return "FESTSCHRIFT";
  if (sourceType === "YEARBOOK_CONTRIBUTION") return "BOOK";
  if (sourceType === "BOOK" || sourceType === "BOOK_CHAPTER") return "BOOK";
  if (sourceType === "LEGISLATIVE_MATERIAL") return "REPORT";
  return "CUSTOM";
}

function sourceIdPrefix(kind: CitationSourceKind): string {
  if (kind === "COMMENTARY") return "commentary-unknown";
  return kind.toLocaleLowerCase("de-DE");
}

function preferredName(source: DocumentSource): string {
  const core = source.canonicalDisplayCitation.trim();
  const fingerprint = source.canonicalFingerprint;
  if (fingerprint.sourceType === "COMMENTARY") {
    return core.split(/[,/]/u)[0]?.trim() || core;
  }
  if (fingerprint.sourceType === "JOURNAL_ARTICLE" && fingerprint.normalizedWorkTitle) {
    const beforeYear = core.split(/\b(?:19|20)\d{2}\b/u)[0]?.replace(/[,;\s]+$/g, "");
    return beforeYear || core;
  }
  return core;
}

function equivalenceKeys(source: DocumentSource): Set<string> {
  return new Set(
    [
      source.canonicalDisplayCitation,
      source.canonicalFingerprint.normalizedBibliographicCore,
      source.canonicalFingerprint.normalizedWorkTitle,
      source.canonicalFingerprint.shortTitle,
      source.canonicalFingerprint.normalizedContainerTitle,
      ...source.observedVariants.map((variant) => variant.rawBibliographicCore),
    ]
      .filter((value): value is string => Boolean(value))
      .map(normalizeCitationSourceText)
  );
}

function persistentMatches(
  mapping: CitationSourceMappingData,
  source: DocumentSource
): CitationSourceMaster[] {
  const keys = equivalenceKeys(source);
  return mapping.sources.filter((candidate) => {
    const values = [candidate.preferredName, candidate.preferredCitationText]
      .filter((value): value is string => Boolean(value))
      .map(normalizeCitationSourceText);
    mapping.aliases
      .filter((alias) => alias.active && alias.canonicalSourceId === candidate.canonicalSourceId)
      .forEach((alias) => values.push(normalizeCitationSourceText(alias.alias)));
    return values.some((value) => keys.has(value));
  });
}

function createPersistentSource(
  mapping: CitationSourceMappingData,
  source: DocumentSource
): { source?: CitationSourceMaster; error?: string } {
  const name = preferredName(source);
  const kind = mappingKind(source.canonicalFingerprint.sourceType);
  const slug = createCanonicalSourceSlug(name);
  const canonicalSourceId = `${sourceIdPrefix(kind)}-${slug}`;
  if (!slug) return { error: "Aus der Quellenangabe konnte keine stabile Kennung erzeugt werden." };
  if (mapping.sources.some((candidate) => candidate.canonicalSourceId === canonicalSourceId)) {
    return { error: "Eine Quelle mit derselben Kennung muss zuerst manuell geprüft werden." };
  }
  const citationType = source.canonicalFingerprint.sourceType;
  const created: CitationSourceMaster = {
    schemaVersion: 1,
    canonicalSourceId,
    sourceOrigin: "USER",
    kind,
    preferredName: name,
    preferredCitationText: source.canonicalDisplayCitation,
    legalArea: "SONSTIGE",
    applicableCitationTypes: [citationType],
    active: true,
    notes: "Aus einer dokumenteigenen Quelle übernommen.",
    ...(kind === "COMMENTARY" || kind === "JOURNAL"
      ? {
          workOverride: {
            canonicalWorkId: canonicalSourceId,
            citationType:
              kind === "COMMENTARY" ? ("COMMENTARY" as const) : ("JOURNAL_ARTICLE" as const),
            preferredName: name,
          },
        }
      : {}),
  };
  return { source: created };
}

export function isDocumentSourcePromotionSafe(source: DocumentSource): boolean {
  return (
    source.status === "CONFIRMED_DOCUMENT_SOURCE" &&
    !source.persistentLiteratureEntryId &&
    source.canonicalFingerprint.confidence === "high" &&
    !source.warnings.includes("SUSPICIOUS_NARRATIVE_PREFIX")
  );
}

export function promoteDocumentSources(
  registry: DocumentSourceRegistry,
  mappingData: CitationSourceMappingData,
  documentSourceIds: readonly string[]
): LiteraturePromotionResult {
  const registryCopy = cloneRegistry(registry);
  const mapping = cloneMapping(mappingData);
  const selectedIds = new Set(documentSourceIds);
  const items: LiteraturePromotionItemResult[] = [];
  let mappingChanged = false;

  for (const source of registryCopy.sources) {
    if (!selectedIds.has(source.documentSourceId)) continue;
    if (source.persistentLiteratureEntryId) {
      items.push({
        documentSourceId: source.documentSourceId,
        status: "SKIPPED",
        persistentLiteratureEntryId: source.persistentLiteratureEntryId,
        message: "Die Quelle ist bereits im Literaturverzeichnis gespeichert.",
      });
      continue;
    }
    if (source.status !== "CONFIRMED_DOCUMENT_SOURCE") {
      items.push({
        documentSourceId: source.documentSourceId,
        status: "SKIPPED",
        message: "Die Quelle ist noch nicht ausreichend oft bestätigt.",
      });
      continue;
    }
    const matches = persistentMatches(mapping, source);
    if (matches.length === 1) {
      linkRegistrySourceToPersistent(registryCopy, source, matches[0].canonicalSourceId);
      items.push({
        documentSourceId: source.documentSourceId,
        status: "LINKED_EXISTING",
        persistentLiteratureEntryId: matches[0].canonicalSourceId,
        message: "Die Quelle wurde mit einem bestehenden Eintrag verknüpft.",
      });
      continue;
    }
    if (matches.length > 1) {
      items.push({
        documentSourceId: source.documentSourceId,
        status: "AMBIGUOUS",
        message: "Mehrere passende Einträge wurden gefunden. Bitte prüfen Sie die Zuordnung.",
      });
      continue;
    }
    if (!isDocumentSourcePromotionSafe(source)) {
      items.push({
        documentSourceId: source.documentSourceId,
        status: "SKIPPED",
        message: "Diese Quelle muss vor der Übernahme manuell geprüft werden.",
      });
      continue;
    }
    const created = createPersistentSource(mapping, source);
    if (!created.source) {
      items.push({
        documentSourceId: source.documentSourceId,
        status: "FAILED",
        message: created.error ?? "Die Quelle konnte nicht übernommen werden.",
      });
      continue;
    }
    mapping.sources.push(created.source);
    const aliases = [
      created.source.preferredName,
      ...source.observedVariants.map((variant) => variant.rawBibliographicCore),
    ];
    [...new Set(aliases.map((alias) => alias.trim()).filter(Boolean))].forEach((alias) => {
      if (
        !mapping.aliases.some(
          (candidate) =>
            candidate.canonicalSourceId === created.source!.canonicalSourceId &&
            normalizeCitationSourceText(candidate.alias) === normalizeCitationSourceText(alias)
        )
      ) {
        mapping.aliases.push({
          canonicalSourceId: created.source!.canonicalSourceId,
          alias,
          matchMode: "CASE_INSENSITIVE_TEXT",
          wholeWord: true,
          active: true,
        });
      }
    });
    linkRegistrySourceToPersistent(registryCopy, source, created.source.canonicalSourceId);
    mappingChanged = true;
    items.push({
      documentSourceId: source.documentSourceId,
      status: "CREATED",
      persistentLiteratureEntryId: created.source.canonicalSourceId,
      message: "Die Quelle wurde ins Literaturverzeichnis übernommen.",
    });
  }

  registryCopy.unpromotedConfirmedSourceCount = registryCopy.sources.filter(
    (source) => source.status === "CONFIRMED_DOCUMENT_SOURCE" && !source.persistentLiteratureEntryId
  ).length;
  refreshAccounting(registryCopy);
  return { registry: registryCopy, mapping, mappingChanged, items };
}
