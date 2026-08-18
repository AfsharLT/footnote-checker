import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseLegacyWorkMappingCsv } from "../../src/citation-mapping/csv";
import {
  CITATION_SOURCE_MAPPING_DEFAULT_SOURCE,
  createDefaultCitationSourceMapping,
  migrateBundledLegacyCitationSourceMapping,
} from "../../src/citation-mapping/default-mapping";
import {
  BUNDLED_LEGACY_WORK_MAPPING_CSV,
  BUNDLED_LEGACY_WORK_MAPPING_SHA256,
} from "../../src/citation-mapping/generated/legacy-work-mapping.generated";
import { migrateLegacyWorkMapping } from "../../src/citation-mapping/legacy";
import {
  createCitationSourceMappingIndex,
  resolveCitationSegmentSources,
  resolveCitationSource,
} from "../../src/citation-mapping/resolver";
import type { CitationSegment } from "../../src/footnote-engine/types";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const sourceCsv = readFileSync(
  resolve(process.cwd(), "src/citation-mapping/data/legacy-work-mapping.csv"),
  "utf8"
);
assert(
  sourceCsv === BUNDLED_LEGACY_WORK_MAPPING_CSV,
  "Generated mapping resource must exactly match the source CSV"
);
assert(
  BUNDLED_LEGACY_WORK_MAPPING_SHA256 ===
    "b48a90244126a85e56a89c53051c08e70983ec829211e272e7950cc7390e75f8",
  "Bundled source CSV hash mismatch"
);
assert(
  CITATION_SOURCE_MAPPING_DEFAULT_SOURCE === "bundled legacy CSV",
  "Default source label mismatch"
);

const parsed = parseLegacyWorkMappingCsv(sourceCsv);
assert(parsed.success, `Full legacy CSV parse failed: ${parsed.errors.join("; ")}`);
assert(parsed.rows.length === 71, "Full legacy CSV must contain 71 data rows");

const migrated = migrateLegacyWorkMapping(parsed.rows);
assert(migrated.success, `Full legacy migration failed: ${migrated.errors.join("; ")}`);
assert(!migrated.report.differsFromKnownLegacyStatistics, "Legacy statistics must match");
assert(migrated.report.canonicalSources === 25, "Expected 25 canonical sources");
assert(migrated.report.commentarySources === 21, "Expected 21 commentaries");
assert(migrated.report.journalSources === 4, "Expected four journals");
assert(migrated.report.aliases === 71, "Expected 71 aliases");
assert(migrated.report.uncertainAliases === 7, "Expected seven uncertain aliases");

const bundled = migrateBundledLegacyCitationSourceMapping();
assert(bundled.report.legacyRows === 71, "Bundled migration must read all rows");
const defaults = createDefaultCitationSourceMapping();
assert(defaults.sources.length === 25, "Full default must contain 25 sources");
assert(defaults.aliases.length === 71, "Full default must contain 71 aliases");

const expectedPreferredNames = [
  "MüKoBGB",
  "BeckOK BGB",
  "BeckOGK",
  "Staudinger",
  "Erman",
  "Grüneberg",
  "MüKoStGB",
  "LK-StGB",
  "Schönke/Schröder",
  "Fischer",
  "BeckOK StGB",
  "NK-StGB",
  "SSW-StGB",
  "Meyer-Goßner/Schmitt",
  "KK-StPO",
  "LR-StPO",
  "MüKoStPO",
  "BeckOK StPO",
  "Zöller",
  "Maunz/Dürig",
  "Jarass/Pieroth",
  "NJW",
  "NStZ",
  "JuS",
  "wistra",
].sort();
assert(
  defaults.sources
    .map((source) => source.preferredName)
    .sort()
    .join("\n") === expectedPreferredNames.join("\n"),
  "Canonical source list differs from the legacy CSV expectation"
);

const sourceIds = new Set(defaults.sources.map((source) => source.canonicalSourceId));
assert(sourceIds.size === 25, "canonicalSourceIds must be unique");
assert(
  defaults.aliases.every((alias) => sourceIds.has(alias.canonicalSourceId)),
  "Every alias must reference an existing master"
);
assert(
  defaults.aliases.filter((alias) => alias.legacySafetyLevel === "UNCERTAIN").length === 7,
  "Full default must retain seven uncertain aliases"
);

const index = createCitationSourceMappingIndex(defaults);
for (const [input, expectedName, expectedSafety] of [
  ["MüKo-StGB", "MüKoStGB", "PROBABLE"],
  ["Palandt", "Grüneberg", "UNCERTAIN"],
  ["JuS", "JuS", undefined],
  ["Neue Juristische Wochenschrift", "NJW", "PROBABLE"],
  ["M/D", "Maunz/Dürig", "PROBABLE"],
] as Array<[string, string, "PROBABLE" | "UNCERTAIN" | undefined]>) {
  const citationType =
    expectedName === "JuS" || expectedName === "NJW" ? "JOURNAL_ARTICLE" : "COMMENTARY";
  const resolution = resolveCitationSource(index, { text: input, citationType });
  assert(
    resolution.status === "MATCHED" && resolution.preferredName === expectedName,
    `${input} full-default mapping failed`
  );
  assert(
    resolution.legacySafetyLevel === expectedSafety,
    `${input} legacy safety metadata mismatch`
  );
}
assert(
  resolveCitationSource(index, { text: "ZJS", citationType: "JOURNAL_ARTICLE" }).status ===
    "UNMATCHED",
  "ZJS must remain unmatched"
);

const bookSegment = {
  classification: { type: "BOOK" },
  extraction: { type: "BOOK", data: {} },
} as CitationSegment;
assert(
  resolveCitationSegmentSources(bookSegment, index).length === 0,
  "BOOK must not receive a mapping without book mapping data"
);
