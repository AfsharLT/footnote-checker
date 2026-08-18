import {
  encodeSemicolonCsvRow,
  parseLegacyWorkMappingCsv,
  parseSemicolonCsv,
} from "../../src/citation-mapping/csv";
import { migrateLegacyWorkMapping } from "../../src/citation-mapping/legacy";
import {
  exportCitationSourceMappingCsv,
  parseCitationSourceMappingCsv,
} from "../../src/citation-mapping/normalized-csv";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parserSample = '\ufeffA;B;C\r\n1;"Wert; mit Semikolon";"Zitat ""innen"""\r\n2;München;\r\n';
const parsedSample = parseSemicolonCsv(parserSample);
assert(parsedSample.success, "Quoted CSV fixture must parse");
assert(parsedSample.rows.length === 3, "CRLF and trailing newline parsing mismatch");
assert(parsedSample.rows[1][1] === "Wert; mit Semikolon", "Quoted semicolon missing");
assert(parsedSample.rows[1][2] === 'Zitat "innen"', "Escaped quote missing");
assert(parsedSample.rows[2][1] === "München", "Umlaut missing");
assert(parsedSample.rows[2][2] === "", "Empty cell missing");

const multiline = parseSemicolonCsv('A;B\n"erste\nzweite";x');
assert(multiline.rows[1][0] === "erste\nzweite", "Quoted newline missing");
assert(!parseSemicolonCsv('A;"offen').success, "Unterminated quote must fail");

const header = Array.from({ length: 18 }, (_, index) => `Spalte ${index + 1}`);
const legacyRows = [
  [
    "M-1",
    "Kommentar StGB",
    "StGB",
    "MüKoStGB",
    "MüKo-StGB",
    "Textvergleich ohne Groß-/Kleinschreibung",
    "Ja",
    "Analysieren",
    "Prüfen",
    "Korrigieren",
    "Wahrscheinlich",
    "Nein",
    "CODE-1",
    "MüKoStGB/Bearbeiter, § 13 Rn. 12.",
    "Hinweis; mit Semikolon",
    "Ja",
    "4.5",
    "2026-07-26",
  ],
  [
    "M-2",
    "Kommentar StGB",
    "StGB",
    "MüKoStGB",
    "MK-StGB",
    "Textvergleich ohne Groß-/Kleinschreibung",
    "Ja",
    "Analysieren",
    "Prüfen",
    "Korrigieren",
    "Wahrscheinlich",
    "Nein",
    "CODE-1",
    "MüKoStGB/Bearbeiter, § 13 Rn. 12.",
    "",
    "Ja",
    "4.5",
    "2026-07-26",
  ],
  [
    "J-1",
    "Zeitschrift",
    "Allgemein",
    "NJW",
    "NJW.",
    "Textvergleich ohne Groß-/Kleinschreibung",
    "Ja",
    "Analyse Journal",
    "Review Journal",
    "Keine Korrektur",
    "Unsicher",
    "Nein",
    "",
    "Autor, NJW 2024, 1234 (1236).",
    'Hinweis mit "Zitat"',
    "Ja",
    "4.5",
    "2026-07-26",
  ],
];
const legacyCsv = [header, ...legacyRows].map(encodeSemicolonCsvRow).join("\r\n");
const parsedLegacy = parseLegacyWorkMappingCsv(`\ufeff${legacyCsv}`);
assert(parsedLegacy.success, "Legacy CSV must parse");
assert(parsedLegacy.rows.length === 3, "Every legacy row must survive");
assert(parsedLegacy.rows[0].notes === "Hinweis; mit Semikolon", "Quoted legacy note missing");

const migrated = migrateLegacyWorkMapping(parsedLegacy.rows);
assert(migrated.success, `Legacy migration failed: ${migrated.errors.join(", ")}`);
assert(migrated.data.sources.length === 2, "Aliases must group into two masters");
assert(migrated.data.aliases.length === 3, "All explicit aliases must survive");
assert(migrated.report.commentarySources === 1, "Commentary count mismatch");
assert(migrated.report.journalSources === 1, "Journal count mismatch");
assert(migrated.report.uncertainAliases === 1, "Uncertain count mismatch");
assert(migrated.report.differsFromKnownLegacyStatistics, "Small fixture must report divergence");
const commentary = migrated.data.sources.find((source) => source.kind === "COMMENTARY");
assert(commentary?.canonicalSourceId === "commentary-stgb-muekostgb", "Stable slug mismatch");
assert(commentary.commentedLaw === "StGB", "Commented law missing");
assert(commentary.personStructureHint === "WORK_THEN_BEARBEITER", "Person hint missing");
assert(commentary.examplePattern?.includes("/Bearbeiter"), "Example pattern missing");
const firstAlias = migrated.data.aliases.find((alias) => alias.legacyMappingId === "M-1");
assert(firstAlias?.legacyActions?.analysis === "Analysieren", "Legacy analysis action missing");
assert(firstAlias?.legacyCommentCode === "CODE-1", "Legacy comment code missing");
assert(firstAlias?.legacyAutoCorrectionAllowed === false, "Legacy correction flag missing");

const migratedRoundtrip = parseCitationSourceMappingCsv(
  exportCitationSourceMappingCsv(migrated.data)
);
assert(migratedRoundtrip.success, "Migrated mapping CSV must roundtrip");
const roundtrippedFirstAlias = migratedRoundtrip.data.aliases.find(
  (alias) => alias.legacyMappingId === "M-1"
);
assert(
  roundtrippedFirstAlias?.legacyActions?.analysis === "Analysieren",
  "Roundtrip must preserve the legacy analysis action"
);
assert(
  roundtrippedFirstAlias?.legacyActions?.review === "Prüfen",
  "Roundtrip must preserve the legacy review action"
);
assert(
  roundtrippedFirstAlias?.legacyActions?.correction === "Korrigieren",
  "Roundtrip must preserve the legacy correction action"
);
assert(
  roundtrippedFirstAlias?.legacyAutoCorrectionAllowed === false,
  "Roundtrip must preserve the legacy correction flag"
);
assert(
  roundtrippedFirstAlias?.legacyCommentCode === "CODE-1",
  "Roundtrip must preserve the legacy comment code"
);

const collisionRows = parsedLegacy.rows.slice(0, 1).map((row) => ({
  ...row,
  canonicalCitation: "A-B",
  searchVariant: "Alias A",
}));
collisionRows.push({
  ...collisionRows[0],
  mappingId: "M-COLLISION",
  canonicalCitation: "A B",
  searchVariant: "Collision Alias",
});
assert(!migrateLegacyWorkMapping(collisionRows).success, "Slug collision must be reported");
