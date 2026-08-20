import { createDefaultCitationSourceMapping } from "../../src/citation-mapping/default-mapping";
import {
  exportCitationSourceMappingCsv,
  parseCitationSourceMappingCsv,
} from "../../src/citation-mapping/normalized-csv";
import { formatCitationStyleImportErrors, updateCitationSource } from "../../src/settings-ui/state";
import { createDefaultCitationStyleProfile } from "../../src/citation-settings/defaults";
import type { WorkCitationOverride } from "../../src/citation-settings/types";
import {
  parseCitationStyleProfile,
  serializeCitationStyleProfile,
} from "../../src/citation-settings/validation";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const profile = createDefaultCitationStyleProfile();
const defaultRoundtrip = parseCitationStyleProfile(
  serializeCitationStyleProfile(createDefaultCitationStyleProfile())
);
assert(defaultRoundtrip.success, "Default settings JSON roundtrip must be valid");
profile.name = "Import-/Export-Test";
profile.caseLaw.decisionTypeOutput.JUDGMENT = "U.";
const profileRoundtrip = parseCitationStyleProfile(serializeCitationStyleProfile(profile));
assert(profileRoundtrip.success, "Settings JSON roundtrip must be valid");
assert(
  serializeCitationStyleProfile(profileRoundtrip.profile) ===
    serializeCitationStyleProfile(profile),
  "Settings JSON roundtrip must be semantically equal"
);
const browserExportEquivalent = serializeCitationStyleProfile(profile);
const activeBeforeImport = createDefaultCitationStyleProfile();
const activeJsonBeforeImport = serializeCitationStyleProfile(activeBeforeImport);
const importedWorkingCopy = parseCitationStyleProfile(browserExportEquivalent);
assert(importedWorkingCopy.success, "Valid import must produce a working copy");
assert(
  serializeCitationStyleProfile(activeBeforeImport) === activeJsonBeforeImport &&
    importedWorkingCopy.profile.name === "Import-/Export-Test",
  "Valid import must not mutate the active profile before save"
);
assert(
  parseCitationStyleProfile(browserExportEquivalent).success,
  "Browser-export-equivalent JSON string must import"
);
assert(
  parseCitationStyleProfile(`\uFEFF${browserExportEquivalent}`).success,
  "UTF-8 BOM must not invalidate settings JSON"
);
assert(
  parseCitationStyleProfile(`\n  ${browserExportEquivalent}\n`).success,
  "Surrounding whitespace must not invalidate settings JSON"
);
const futureSchema = parseCitationStyleProfile(JSON.stringify({ ...profile, schemaVersion: 999 }));
assert(!futureSchema.success, "Unsupported settings schema must fail");
assert(
  formatCitationStyleImportErrors(futureSchema.errors).includes(
    "Diese Settings-Datei verwendet eine nicht unterstützte Schema-Version."
  ),
  "Unsupported schema must have a German UI message"
);
const currentProfile = createDefaultCitationStyleProfile();
const invalidProfileImport = parseCitationStyleProfile("{invalid");
assert(!invalidProfileImport.success, "Invalid settings import must fail without crashing");
assert(
  currentProfile.caseLaw.decisionTypeOutput.JUDGMENT === "Urt.",
  "Invalid import must not mutate current settings"
);

let mapping = createDefaultCitationSourceMapping();
const commentary = mapping.sources.find((source) => source.preferredName === "MüKoStGB");
assert(commentary !== undefined, "Commentary source missing");
mapping = updateCitationSource(mapping, commentary.canonicalSourceId, {
  workOverride: {
    canonicalWorkId: commentary.canonicalSourceId,
    citationType: "COMMENTARY",
    preferredName: "MüKoStGB",
    formatting: { bearbeiter: { italic: false }, editor: { italic: true } },
    citationSettingsOverride: { personSeparator: " / ", marginNumberAbbreviation: "Rdnr." },
  },
});
const journal = mapping.sources.find((source) => source.preferredName === "NJW");
assert(journal !== undefined, "Journal source missing");
mapping = updateCitationSource(mapping, journal.canonicalSourceId, {
  workOverride: {
    canonicalWorkId: journal.canonicalSourceId,
    citationType: "JOURNAL_ARTICLE",
    preferredName: "NJW",
    citationSettingsOverride: { pinpointStyle: "comma" },
  },
});
const mappingRoundtrip = parseCitationSourceMappingCsv(exportCitationSourceMappingCsv(mapping));
assert(mappingRoundtrip.success, "Mapping CSV roundtrip must be valid");
assert(
  mappingRoundtrip.data.sources.every((source) => source.sourceOrigin === "IMPORTED"),
  "CSV-imported sources must be marked as IMPORTED"
);
const commentaryOverride = mappingRoundtrip.data.sources.find(
  (source) => source.canonicalSourceId === commentary.canonicalSourceId
)?.workOverride as WorkCitationOverride<"COMMENTARY">;
assert(commentaryOverride.formatting?.bearbeiter?.italic === false, "Bearbeiter override lost");
assert(commentaryOverride.formatting?.editor?.italic === true, "Editor override lost");
assert(
  commentaryOverride.citationSettingsOverride?.personSeparator === " / " &&
    commentaryOverride.citationSettingsOverride.marginNumberAbbreviation === "Rdnr.",
  "Commentary settings overrides lost"
);
const journalOverride = mappingRoundtrip.data.sources.find(
  (source) => source.canonicalSourceId === journal.canonicalSourceId
)?.workOverride as WorkCitationOverride<"JOURNAL_ARTICLE">;
assert(
  journalOverride.citationSettingsOverride?.pinpointStyle === "comma",
  "Journal pinpoint override lost"
);
const currentMappingCount = mapping.sources.length;
const invalidMappingImport = parseCitationSourceMappingCsv("broken");
assert(!invalidMappingImport.success, "Invalid mapping CSV must fail without crashing");
assert(mapping.sources.length === currentMappingCount, "Invalid import must not mutate mapping");
