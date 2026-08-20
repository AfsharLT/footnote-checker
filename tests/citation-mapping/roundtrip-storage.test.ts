import { createBuiltInCitationSourceMappingFixture } from "../../src/citation-mapping/fixture";
import { createDefaultCitationSourceMapping } from "../../src/citation-mapping/default-mapping";
import {
  exportCitationSourceMappingCsv,
  parseCitationSourceMappingCsv,
} from "../../src/citation-mapping/normalized-csv";
import {
  CITATION_SOURCE_MAPPING_STORAGE_KEY,
  loadCitationSourceMapping,
  resetCitationSourceMapping,
  saveCitationSourceMapping,
} from "../../src/citation-mapping/storage";
import type { CitationSourceMappingStorage } from "../../src/citation-mapping/types";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const fixture = createBuiltInCitationSourceMappingFixture();
const exported = exportCitationSourceMappingCsv(fixture);
const imported = parseCitationSourceMappingCsv(exported);
assert(imported.success, `Normalized CSV import failed: ${imported.errors.join(", ")}`);
assert(
  exportCitationSourceMappingCsv(imported.data) === exported,
  "Normalized CSV roundtrip mismatch"
);
assert(imported.data.sources.length === fixture.sources.length, "Roundtrip source count mismatch");
assert(imported.data.aliases.length === fixture.aliases.length, "Roundtrip alias count mismatch");
const palandt = imported.data.aliases.find((alias) => alias.alias === "Palandt");
assert(palandt?.legacySafetyLevel === "UNCERTAIN", "Roundtrip safety missing");
assert(palandt.notes?.includes("Historische"), "Roundtrip alias notes missing");
const mueko = imported.data.sources.find((source) => source.preferredName === "MüKoStGB");
assert(mueko?.personStructureHint === "WORK_THEN_BEARBEITER", "Roundtrip hint missing");
assert(mueko.examplePattern?.includes("§ 13"), "Roundtrip example missing");

const futureCsv = exported.replace(/^1;/m, "2;");
assert(!parseCitationSourceMappingCsv(futureCsv).success, "Future CSV schema must fail");
const conflictCsv = `${exported}\n1;journal-conflict;JOURNAL;GENERAL;;Conflict;NJW.;CASE_INSENSITIVE_TEXT;true;true;true;PROBABLE;UNKNOWN;;;;;;;false;;;;;`;
const conflictImport = parseCitationSourceMappingCsv(conflictCsv);
assert(conflictImport.success, "Structurally valid alias conflicts must remain importable");
assert(conflictImport.warnings?.length === 1, "Alias conflict must be reported as a warning");

class TestStorage implements CitationSourceMappingStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const storage = new TestStorage();
const fullDefault = createDefaultCitationSourceMapping();
assert(
  loadCitationSourceMapping(storage).sources.length === fullDefault.sources.length,
  "Missing storage must load the full legacy default"
);
const customized = createBuiltInCitationSourceMappingFixture();
customized.sources[0].preferredName = "Local preferred name";
assert(saveCitationSourceMapping(customized, storage).success, "Valid mapping must save");
assert(
  loadCitationSourceMapping(storage).sources[0].preferredName === "Local preferred name",
  "Saved mapping must load"
);

storage.setItem(CITATION_SOURCE_MAPPING_STORAGE_KEY, "{broken");
assert(
  loadCitationSourceMapping(storage).sources.length === fullDefault.sources.length,
  "Corrupt JSON must load the full legacy default"
);
storage.setItem(CITATION_SOURCE_MAPPING_STORAGE_KEY, JSON.stringify({ schemaVersion: 99 }));
assert(
  loadCitationSourceMapping(storage).sources.length === fullDefault.sources.length,
  "Future JSON schema must load the full legacy default"
);
saveCitationSourceMapping(customized, storage);
resetCitationSourceMapping(storage);
assert(
  loadCitationSourceMapping(storage).sources[0].preferredName !== "Local preferred name",
  "Reset must restore the full legacy default"
);
assert(
  loadCitationSourceMapping(storage).sources.length === 25 &&
    loadCitationSourceMapping(storage).aliases.length === 71,
  "Reset target must be the full legacy default"
);

resetCitationSourceMapping(null);
const memorySave = saveCitationSourceMapping(customized, null);
assert(memorySave.success && memorySave.usedMemoryFallback, "Missing localStorage must use memory");
assert(
  loadCitationSourceMapping(null).sources[0].preferredName === "Local preferred name",
  "Memory mapping must load"
);
resetCitationSourceMapping(null);
