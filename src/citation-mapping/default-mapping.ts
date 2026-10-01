import { parseLegacyWorkMappingCsv } from "./csv";
import { BUNDLED_LEGACY_WORK_MAPPING_CSV } from "./generated/legacy-work-mapping.generated";
import { migrateLegacyWorkMapping } from "./legacy";
import type { CitationSourceMappingData, CitationSourceMigrationReport } from "./types";
import { mergeCorpusCoverageSources } from "./corpus-coverage";

export const CITATION_SOURCE_MAPPING_DEFAULT_SOURCE = "bundled legacy CSV";

interface BundledLegacyMappingResult {
  data: CitationSourceMappingData;
  report: CitationSourceMigrationReport;
}

const LK_STRUCTURED_ALIASES = [
  { id: "BUILTIN-LK-PATTERN-001", alias: "{Bearbeiter}, in: Leipziger Kommentar StGB" },
  { id: "BUILTIN-LK-PATTERN-002", alias: "{Bearbeiter}, in: LK-StGB" },
  { id: "BUILTIN-LK-PATTERN-003", alias: "{Bearbeiter}/LK-StGB" },
] as const;

export function mergeBuiltInCitationSourceAdditions(
  mapping: CitationSourceMappingData
): CitationSourceMappingData {
  const lkSource = mapping.sources.find(
    (source) =>
      source.canonicalSourceId === "commentary-stgb-lk-stgb" || source.preferredName === "LK-StGB"
  );
  if (!lkSource) return mergeCorpusCoverageSources(mapping);
  const additions = LK_STRUCTURED_ALIASES.filter(
    ({ alias }) =>
      !mapping.aliases.some(
        (candidate) =>
          candidate.canonicalSourceId === lkSource.canonicalSourceId && candidate.alias === alias
      )
  );
  const withLk =
    additions.length === 0
      ? mapping
      : {
          ...mapping,
          aliases: [
            ...mapping.aliases,
            ...additions.map(({ id, alias }) => ({
              legacyMappingId: id,
              canonicalSourceId: lkSource.canonicalSourceId,
              alias,
              matchMode: "CASE_INSENSITIVE_TEXT" as const,
              wholeWord: true,
              active: true,
              legacySafetyLevel: "PROBABLE" as const,
            })),
          ],
        };
  return mergeCorpusCoverageSources(withLk);
}

export function migrateBundledLegacyCitationSourceMapping(): BundledLegacyMappingResult {
  const parsed = parseLegacyWorkMappingCsv(BUNDLED_LEGACY_WORK_MAPPING_CSV);
  if (!parsed.success) {
    throw new Error(`Bundled legacy mapping CSV is invalid: ${parsed.errors.join("; ")}`);
  }

  const migrated = migrateLegacyWorkMapping(parsed.rows);
  if (!migrated.success) {
    throw new Error(`Bundled legacy mapping migration failed: ${migrated.errors.join("; ")}`);
  }

  return { data: migrated.data, report: migrated.report };
}

export function createDefaultCitationSourceMapping(): CitationSourceMappingData {
  const mapping = migrateBundledLegacyCitationSourceMapping().data;
  return mergeBuiltInCitationSourceAdditions({
    ...mapping,
    sources: mapping.sources.map((source) => ({ ...source, sourceOrigin: "DEFAULT" })),
  });
}
