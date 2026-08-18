import type { WorkCitationOverride } from "../citation-settings/types";
import { createCanonicalSourceSlug, normalizeCitationSourceText } from "./normalization";
import type {
  CitationSourceAlias,
  CitationSourceKind,
  CitationSourceLegalArea,
  CitationSourceMaster,
  CitationSourceMigrationResult,
  CommentaryPersonStructureHint,
  LegacySafetyLevel,
  LegacyWorkMappingRow,
} from "./types";

const KNOWN_LEGACY_STATISTICS = {
  legacyRows: 71,
  canonicalSources: 25,
  commentarySources: 21,
  journalSources: 4,
  aliases: 71,
  uncertainAliases: 7,
};

function yes(value: string): boolean {
  return normalizeCitationSourceText(value) === "ja";
}

function nonEmpty(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function sourceKind(workType: string): CitationSourceKind {
  return normalizeCitationSourceText(workType).startsWith("zeitschrift") ? "JOURNAL" : "COMMENTARY";
}

function legalArea(value: string): CitationSourceLegalArea {
  switch (normalizeCitationSourceText(value)) {
    case "bgb":
      return "BGB";
    case "stgb":
      return "STGB";
    case "stpo":
      return "STPO";
    case "zpo":
      return "ZPO";
    case "gg":
      return "GG";
    case "allgemein":
      return "GENERAL";
    default:
      return "UNKNOWN";
  }
}

function commentedLaw(area: CitationSourceLegalArea): string | undefined {
  switch (area) {
    case "BGB":
      return "BGB";
    case "STGB":
      return "StGB";
    case "STPO":
      return "StPO";
    case "ZPO":
      return "ZPO";
    case "GG":
      return "GG";
    default:
      return undefined;
  }
}

function safetyLevel(value: string): LegacySafetyLevel | undefined {
  switch (normalizeCitationSourceText(value)) {
    case "wahrscheinlich":
      return "PROBABLE";
    case "unsicher":
      return "UNCERTAIN";
    default:
      return undefined;
  }
}

function personStructureHint(rows: readonly LegacyWorkMappingRow[]): CommentaryPersonStructureHint {
  const hasBearbeiterPattern = rows.some((row) => /\/\s*Bearbeiter\b/i.test(row.examplePattern));
  const hasWithoutBearbeiterNote = rows.some((row) =>
    /Einzelautor-Kommentar ohne Bearbeitertrenner|Einzelautor-\/Mehrpersonenwerk, meist ohne Bearbeiter/i.test(
      row.notes
    )
  );
  if (hasBearbeiterPattern && hasWithoutBearbeiterNote) return "AMBIGUOUS";
  if (hasWithoutBearbeiterNote) return "WORK_WITHOUT_BEARBEITER";
  if (hasBearbeiterPattern) return "WORK_THEN_BEARBEITER";
  return "UNKNOWN";
}

function sourceId(
  kind: CitationSourceKind,
  area: CitationSourceLegalArea,
  preferredName: string
): string {
  const prefix = kind === "JOURNAL" ? "journal" : "commentary";
  const areaPart = kind === "JOURNAL" ? "" : `${area.toLowerCase()}-`;
  return `${prefix}-${areaPart}${createCanonicalSourceSlug(preferredName)}`;
}

function workOverride(
  canonicalSourceId: string,
  kind: CitationSourceKind,
  preferredName: string
): WorkCitationOverride {
  return kind === "COMMENTARY"
    ? {
        canonicalWorkId: canonicalSourceId,
        citationType: "COMMENTARY",
        preferredName,
      }
    : {
        canonicalWorkId: canonicalSourceId,
        citationType: "JOURNAL_ARTICLE",
        preferredName,
      };
}

function aliasFromRow(row: LegacyWorkMappingRow, canonicalSourceId: string): CitationSourceAlias {
  return {
    ...(nonEmpty(row.mappingId) ? { legacyMappingId: row.mappingId.trim() } : {}),
    canonicalSourceId,
    alias: row.searchVariant.trim(),
    matchMode: "CASE_INSENSITIVE_TEXT",
    wholeWord: yes(row.wholeWord),
    active: yes(row.active),
    ...(safetyLevel(row.safetyLevel) ? { legacySafetyLevel: safetyLevel(row.safetyLevel) } : {}),
    ...(nonEmpty(row.automaticCorrectionAllowed)
      ? { legacyAutoCorrectionAllowed: yes(row.automaticCorrectionAllowed) }
      : {}),
    ...(nonEmpty(row.commentCode) ? { legacyCommentCode: row.commentCode.trim() } : {}),
    legacyActions: {
      ...(nonEmpty(row.analysisAction) ? { analysis: row.analysisAction.trim() } : {}),
      ...(nonEmpty(row.reviewAction) ? { review: row.reviewAction.trim() } : {}),
      ...(nonEmpty(row.correctionAction) ? { correction: row.correctionAction.trim() } : {}),
    },
    ...(nonEmpty(row.notes) ? { notes: row.notes.trim() } : {}),
    ...(nonEmpty(row.version) ? { legacyVersion: row.version.trim() } : {}),
    ...(nonEmpty(row.date) ? { legacyDate: row.date.trim() } : {}),
  };
}

export function migrateLegacyWorkMapping(
  rows: readonly LegacyWorkMappingRow[]
): CitationSourceMigrationResult {
  const errors: string[] = [];
  const groupedRows = new Map<string, LegacyWorkMappingRow[]>();

  rows.forEach((row, index) => {
    if (!row.canonicalCitation.trim() || !row.searchVariant.trim()) {
      errors.push(`Legacy row ${index + 1} is missing canonical citation or alias`);
      return;
    }
    if (
      normalizeCitationSourceText(row.searchMode) !== "textvergleich ohne groß-/kleinschreibung"
    ) {
      errors.push(`Legacy row ${index + 1} has an unsupported search mode`);
    }
    const key = [
      sourceKind(row.workType),
      legalArea(row.legalArea),
      normalizeCitationSourceText(row.canonicalCitation),
    ].join("|");
    const group = groupedRows.get(key);
    if (group) group.push(row);
    else groupedRows.set(key, [row]);
  });

  const sources: CitationSourceMaster[] = [];
  const aliases: CitationSourceAlias[] = [];
  const sourceIdKeys = new Map<string, string>();

  groupedRows.forEach((sourceRows, groupingKey) => {
    const first = sourceRows[0];
    const kind = sourceKind(first.workType);
    const area = legalArea(first.legalArea);
    const preferredName = first.canonicalCitation.trim();
    const canonicalSourceId = sourceId(kind, area, preferredName);
    const existingKey = sourceIdKeys.get(canonicalSourceId);
    if (existingKey && existingKey !== groupingKey) {
      errors.push(`canonicalSourceId collision: ${canonicalSourceId}`);
      return;
    }
    sourceIdKeys.set(canonicalSourceId, groupingKey);

    const examplePattern = sourceRows.map((row) => nonEmpty(row.examplePattern)).find(Boolean);
    const notes = sourceRows.map((row) => nonEmpty(row.notes)).find(Boolean);
    const hint = kind === "COMMENTARY" ? personStructureHint(sourceRows) : undefined;
    const versions = Array.from(
      new Set(sourceRows.map((row) => row.version.trim()).filter(Boolean))
    );
    const dates = Array.from(new Set(sourceRows.map((row) => row.date.trim()).filter(Boolean)));
    sources.push({
      schemaVersion: 1,
      canonicalSourceId,
      kind,
      preferredName,
      legalArea: area,
      ...(commentedLaw(area) ? { commentedLaw: commentedLaw(area) } : {}),
      applicableCitationTypes:
        kind === "COMMENTARY" ? ["COMMENTARY"] : ["JOURNAL_ARTICLE", "CASE_LAW", "CASE_NOTE"],
      active: sourceRows.some((row) => yes(row.active)),
      ...(examplePattern ? { examplePattern } : {}),
      ...(notes ? { notes } : {}),
      ...(hint ? { personStructureHint: hint } : {}),
      workOverride: workOverride(canonicalSourceId, kind, preferredName),
      legacyMetadata: {
        legacyWorkType: first.workType.trim(),
        legacyLegalArea: first.legalArea.trim(),
        legacyVersions: versions,
        legacyDates: dates,
      },
    });
    sourceRows.forEach((row) => aliases.push(aliasFromRow(row, canonicalSourceId)));
  });

  const normalizedAliases = new Map<string, Set<string>>();
  aliases
    .filter((alias) => alias.active)
    .forEach((alias) => {
      const normalized = normalizeCitationSourceText(alias.alias);
      const sourceIds = normalizedAliases.get(normalized) ?? new Set<string>();
      sourceIds.add(alias.canonicalSourceId);
      normalizedAliases.set(normalized, sourceIds);
    });
  normalizedAliases.forEach((sourceIds, alias) => {
    if (sourceIds.size > 1) {
      errors.push(`Alias conflict for "${alias}": ${Array.from(sourceIds).sort().join(", ")}`);
    }
  });

  sources.sort((left, right) => left.canonicalSourceId.localeCompare(right.canonicalSourceId));
  const report = {
    legacyRows: rows.length,
    canonicalSources: sources.length,
    commentarySources: sources.filter((source) => source.kind === "COMMENTARY").length,
    journalSources: sources.filter((source) => source.kind === "JOURNAL").length,
    aliases: aliases.length,
    uncertainAliases: aliases.filter((alias) => alias.legacySafetyLevel === "UNCERTAIN").length,
    expected: { ...KNOWN_LEGACY_STATISTICS },
    differsFromKnownLegacyStatistics: false,
  };
  report.differsFromKnownLegacyStatistics = (
    Object.keys(KNOWN_LEGACY_STATISTICS) as Array<keyof typeof KNOWN_LEGACY_STATISTICS>
  ).some((key) => report[key] !== KNOWN_LEGACY_STATISTICS[key]);

  return {
    success: errors.length === 0,
    data: { schemaVersion: 1, sources, aliases },
    errors,
    report,
  };
}
