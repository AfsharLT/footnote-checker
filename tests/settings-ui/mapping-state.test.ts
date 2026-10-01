import { createDefaultCitationSourceMapping } from "../../src/citation-mapping/default-mapping";
import {
  loadCitationSourceMapping,
  resetCitationSourceMapping,
  saveCitationSourceMapping,
} from "../../src/citation-mapping/storage";
import type { CitationSourceMappingStorage } from "../../src/citation-mapping/types";
import { validateCitationSourceMappingData } from "../../src/citation-mapping/validation";
import {
  DEFAULT_MAPPING_FILTERS,
  addCitationSource,
  addCitationSourceAlias,
  filterCitationSources,
  findAliasConflicts,
  removeCitationSource,
  removeUserCitationSourceAlias,
  restoreDefaultCitationSources,
  updateCitationSource,
  updateCitationSourceAlias,
} from "../../src/settings-ui/state";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

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

let mapping = createDefaultCitationSourceMapping();
assert(
  mapping.sources.every((source) => source.sourceOrigin === "DEFAULT"),
  "Bundled sources must be marked as DEFAULT"
);
assert(
  filterCitationSources(mapping, { ...DEFAULT_MAPPING_FILTERS, search: "MüKoStGB" }).length === 1,
  "Preferred-name search failed"
);
assert(
  filterCitationSources(mapping, { ...DEFAULT_MAPPING_FILTERS, search: "Palandt" })[0]
    .preferredName === "Grüneberg",
  "Alias search failed"
);
assert(
  filterCitationSources(mapping, { ...DEFAULT_MAPPING_FILTERS, kind: "COMMENTARY" }).length === 23,
  "Commentary filter failed"
);
assert(
  filterCitationSources(mapping, { ...DEFAULT_MAPPING_FILTERS, kind: "JOURNAL" }).length === 10,
  "Journal filter failed"
);
assert(
  filterCitationSources(mapping, {
    ...DEFAULT_MAPPING_FILTERS,
    legalArea: "OEFFENTLICHES_RECHT",
  }).length === 2,
  "Legal-area filter failed"
);
assert(
  filterCitationSources(mapping, { ...DEFAULT_MAPPING_FILTERS, safety: "UNCERTAIN" }).length === 3,
  "Uncertain filter failed"
);

const mueko = mapping.sources.find((source) => source.preferredName === "MüKoStGB");
assert(mueko !== undefined, "MüKoStGB source missing");
const aliasAddition = addCitationSourceAlias(mapping, mueko.canonicalSourceId, "MüKo Strafrecht");
assert(aliasAddition.success, "User alias must be addable");
mapping = aliasAddition.value;
const userAliasIndex = mapping.aliases.findIndex((alias) => alias.alias === "MüKo Strafrecht");
assert(userAliasIndex >= 0, "Added user alias missing");
const userRemoval = removeUserCitationSourceAlias(mapping, userAliasIndex);
assert(userRemoval.success, "User alias must be removable");
mapping = userRemoval.value;

const legacyAliasIndex = mapping.aliases.findIndex((alias) => alias.alias === "MüKo-StGB");
assert(
  legacyAliasIndex >= 0 && Boolean(mapping.aliases[legacyAliasIndex].legacyMappingId),
  "Legacy alias missing"
);
assert(
  !removeUserCitationSourceAlias(mapping, legacyAliasIndex).success,
  "Legacy alias must not be physically removed"
);
mapping = updateCitationSourceAlias(mapping, legacyAliasIndex, { active: false });
assert(!mapping.aliases[legacyAliasIndex].active, "Legacy alias must be deactivatable");

const sourceAddition = addCitationSource(mapping, {
  preferredName: "Test Kommentar",
  kind: "COMMENTARY",
  legalArea: "STRAFRECHT",
  commentedLaw: "StGB",
  personStructureHint: "UNKNOWN",
});
assert(sourceAddition.success, "New source must be addable");
mapping = sourceAddition.value;
const addedSource = mapping.sources.find((source) => source.preferredName === "Test Kommentar");
assert(
  addedSource?.canonicalSourceId === "commentary-stgb-test-kommentar",
  "Stable source ID mismatch"
);
assert(addedSource?.sourceOrigin === "USER", "New sources must be marked as USER");
const originlessMapping = JSON.parse(JSON.stringify(mapping)) as typeof mapping;
originlessMapping.sources.forEach((source) => delete source.sourceOrigin);
const inferredOrigins = validateCitationSourceMappingData(originlessMapping);
assert(inferredOrigins.success, "Origin-less pre-fix mappings must remain valid");
assert(
  inferredOrigins.data.sources.find(
    (source) => source.canonicalSourceId === mueko.canonicalSourceId
  )?.sourceOrigin === "DEFAULT" &&
    inferredOrigins.data.sources.find(
      (source) => source.canonicalSourceId === addedSource.canonicalSourceId
    )?.sourceOrigin === "USER",
  "Missing origins must be inferred from bundled canonical IDs"
);
assert(
  !addCitationSource(mapping, {
    preferredName: "Test Kommentar",
    kind: "COMMENTARY",
    legalArea: "STRAFRECHT",
  }).success,
  "Canonical source ID collision must be rejected"
);
mapping = updateCitationSource(mapping, addedSource.canonicalSourceId, {
  preferredName: "Umbenannter Testkommentar",
});
assert(
  mapping.sources.some(
    (source) =>
      source.canonicalSourceId === "commentary-stgb-test-kommentar" &&
      source.preferredName === "Umbenannter Testkommentar"
  ),
  "Editing preferredName must not change canonicalSourceId"
);

const restoredWithUserSource = restoreDefaultCitationSources(
  updateCitationSource(mapping, mueko.canonicalSourceId, { preferredName: "Geänderter Standard" })
);
assert(
  restoredWithUserSource.sources.some(
    (source) => source.canonicalSourceId === addedSource.canonicalSourceId
  ),
  "Restoring defaults must preserve user sources"
);
assert(
  restoredWithUserSource.sources.some(
    (source) =>
      source.canonicalSourceId === mueko.canonicalSourceId && source.preferredName === "MüKoStGB"
  ),
  "Restoring defaults must reset changed default sources"
);

const removedUserSource = removeCitationSource(mapping, addedSource.canonicalSourceId);
assert(removedUserSource.success, "User source must be removable");
assert(
  !removedUserSource.value.sources.some(
    (source) => source.canonicalSourceId === addedSource.canonicalSourceId
  ) &&
    !removedUserSource.value.aliases.some(
      (alias) => alias.canonicalSourceId === addedSource.canonicalSourceId
    ),
  "Removing a source must also remove its aliases"
);
const removedDefaultSource = removeCitationSource(mapping, mueko.canonicalSourceId);
assert(removedDefaultSource.success, "Confirmed default source removal must be possible");
assert(
  restoreDefaultCitationSources(removedDefaultSource.value).sources.some(
    (source) => source.canonicalSourceId === mueko.canonicalSourceId
  ),
  "A removed default source must be restorable"
);

const njw = mapping.sources.find((source) => source.preferredName === "NJW");
assert(njw !== undefined, "NJW source missing");
const firstConflict = addCitationSourceAlias(mapping, addedSource.canonicalSourceId, "ABC");
assert(firstConflict.success, "First conflicting alias must be addable");
const secondConflict = addCitationSourceAlias(firstConflict.value, njw.canonicalSourceId, "ABC");
assert(secondConflict.success, "Second conflicting alias must remain addable");
mapping = secondConflict.value;
assert(findAliasConflicts(mapping).length === 1, "Alias conflict must be visible");
const validation = validateCitationSourceMappingData(mapping);
assert(validation.success, "Alias ambiguity must not be a fatal structural error");
assert(validation.warnings?.length === 1, "Alias ambiguity must produce a warning");

const storage = new TestStorage();
assert(saveCitationSourceMapping(mapping, storage).success, "Edited mapping must save");
assert(
  loadCitationSourceMapping(storage).sources.some(
    (source) =>
      source.preferredName === "Umbenannter Testkommentar" && source.sourceOrigin === "USER"
  ),
  "Saved mapping edit and source origin must survive reload"
);
resetCitationSourceMapping(storage);
assert(
  loadCitationSourceMapping(storage).sources.length ===
    createDefaultCitationSourceMapping().sources.length,
  "Mapping reset must restore default"
);
