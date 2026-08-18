import { parseLegacyWorkMappingCsv } from "./csv";
import { BUNDLED_LEGACY_WORK_MAPPING_CSV } from "./generated/legacy-work-mapping.generated";
import { migrateLegacyWorkMapping } from "./legacy";
import type { CitationSourceMappingData, CitationSourceMigrationReport } from "./types";

export const CITATION_SOURCE_MAPPING_DEFAULT_SOURCE = "bundled legacy CSV";

interface BundledLegacyMappingResult {
  data: CitationSourceMappingData;
  report: CitationSourceMigrationReport;
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
  return migrateBundledLegacyCitationSourceMapping().data;
}
