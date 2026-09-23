import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createDefaultCitationSourceMapping } from "../../src/citation-mapping/default-mapping";
import {
  addCitationSourceAlias,
  filterCitationSources,
  removeUserCitationSourceAlias,
  updateCitationSource,
} from "../../src/settings-ui/state";
import {
  exportCitationSourceMappingCsv,
  parseCitationSourceMappingCsv,
} from "../../src/citation-mapping/normalized-csv";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const source = readFileSync(
  join(process.cwd(), "src/taskpane/components/SettingsPanel.tsx"),
  "utf8"
);
const css = readFileSync(join(process.cwd(), "src/taskpane/styles.css"), "utf8");
const sourceEditor = source.slice(
  source.indexOf("function SourceEditor"),
  source.indexOf("function NewSourceEditor")
);

assert(!sourceEditor.includes('label="Kanonische Quellen-ID"'), "Canonical ID must be hidden");
assert(sourceEditor.includes('label="Name der Quelle"'), "Product source name field missing");
assert(sourceEditor.includes('label="Bevorzugte Zitierweise"'), "Preferred citation field missing");
assert(
  sourceEditor.includes("Ein abschließender Punkt ist nicht erforderlich"),
  "Period helper missing"
);
for (const visible of [
  'label="Art"',
  'label="Rechtsgebiet"',
  'label="Kommentiertes Gesetz"',
  'label="Quelle aktiv"',
  'label="Personenstruktur"',
  "Alias-Text / Erkennungsmuster",
  "{Bearbeiter}",
  "Alias entfernen",
]) {
  assert(sourceEditor.includes(visible), `Simplified literature control missing: ${visible}`);
}
for (const visible of [
  "Quellenspezifische Einstellungen",
  'label="Bearbeiter kursiv"',
  'label="Herausgeber kursiv"',
]) {
  assert(source.includes(visible), `Simplified source setting missing: ${visible}`);
}
for (const hidden of [
  "Bevorzugter Werkname",
  "Bevorzugte vollständige Zitierform",
  "Personentrenner-Override",
  "Randnummer-Abkürzung-Override",
  'label="Abgleichsmodus"',
  'label="Ganzwortsuche"',
  'label="Altdaten-Sicherheit"',
  "Match Mode:",
  "Altdaten-Kennung:",
]) {
  assert(!sourceEditor.includes(hidden), `Technical control must be hidden: ${hidden}`);
}
assert(
  css.includes(".fc-settings-source-card") &&
    css.includes(".fc-settings-alias-card") &&
    css.includes("@media (max-width: 519px)") &&
    css.includes("@media (max-width: 399px)"),
  "Literature editor must retain responsive 520/400/320 behavior"
);

let mapping = createDefaultCitationSourceMapping();
const lk = mapping.sources.find((candidate) => candidate.preferredName === "LK-StGB")!;
mapping = updateCitationSource(mapping, lk.canonicalSourceId, {
  preferredName: "LK-StGB Test",
  examplePattern: "LK-StGB/{Bearbeiter}, § 13 Rn. 12",
});
const aliasResult = addCitationSourceAlias(
  mapping,
  lk.canonicalSourceId,
  "{Bearbeiter}, in: LK-StGB Test"
);
assert(aliasResult.success, "Bearbeiter placeholder alias must be accepted");
mapping = aliasResult.value;
assert(
  filterCitationSources(mapping, {
    search: lk.canonicalSourceId,
    kind: "ALL",
    legalArea: "ALL",
    status: "ALL",
    safety: "ALL",
    personStructureHint: "ALL",
  }).length === 1,
  "Search by hidden canonical ID must remain compatible"
);
const serialized = exportCitationSourceMappingCsv(mapping);
const imported = parseCitationSourceMappingCsv(serialized);
assert(imported.success, "Simplified editor data must remain CSV-compatible");
const importedSource = imported.data.sources.find(
  (candidate) => candidate.canonicalSourceId === lk.canonicalSourceId
);
assert(
  importedSource?.preferredName === "LK-StGB Test" &&
    importedSource.examplePattern === "LK-StGB/{Bearbeiter}, § 13 Rn. 12" &&
    importedSource.commentedLaw === lk.commentedLaw,
  "Load/save must preserve source identity, citation template and commented law"
);
const aliasIndex = mapping.aliases.findIndex(
  (candidate) => candidate.alias === "{Bearbeiter}, in: LK-StGB Test"
);
const removed = removeUserCitationSourceAlias(mapping, aliasIndex);
assert(removed.success, "Alias entfernen must remove a user alias without removing its source");
assert(
  removed.value.sources.some((candidate) => candidate.canonicalSourceId === lk.canonicalSourceId),
  "Alias removal must not remove the source"
);

console.log("POC 17.2.3 literature simplification tests passed.");
