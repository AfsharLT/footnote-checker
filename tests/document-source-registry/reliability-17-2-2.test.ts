import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createDefaultCitationSourceMapping } from "../../src/citation-mapping/default-mapping";
import {
  normalizeCitationSourceLegalArea,
  validateCitationSourceMappingData,
} from "../../src/citation-mapping/validation";
import {
  buildDocumentSourceRegistry,
  promoteDocumentSources,
} from "../../src/document-source-registry";
import { analyzeFootnotes } from "../../src/footnote-engine/engine";
import type { FootnoteSnapshot } from "../../src/taskpane/taskpane";
import { hashFootnoteContentText } from "../../src/taskpane/taskpane";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function snapshot(ordinal: number, contentText: string): FootnoteSnapshot {
  return {
    id: `reliability-footnote-${ordinal}`,
    ordinal,
    displayLabel: String(ordinal),
    rawWordText: contentText,
    contentText,
    contentLength: contentText.length,
    originalTextHash: hashFootnoteContentText(contentText),
    reference: { referenceText: String(ordinal) },
    locator: {
      ordinal,
      displayLabel: String(ordinal),
      originalTextHash: hashFootnoteContentText(contentText),
      contextBefore: "",
      contextAfter: "",
    },
    paragraphCount: 1,
    paragraphs: [{ index: 0, start: 0, end: contentText.length }],
    hyperlinks: [],
    fields: [],
    bookmarks: [],
    contentControls: [],
    protectedRanges: [],
    readStatus: "complete",
    readWarnings: [],
    formattingRuns: [],
    paragraphFormats: [],
  };
}

function assertAccounting(result: ReturnType<typeof analyzeFootnotes>, expected: number): void {
  const registry = result.documentSourceRegistry!;
  assert(
    registry.accounting.citationItemsDetected === expected,
    `Expected ${expected} CitationItems`
  );
  assert(registry.accounting.accountedTotal === expected, "Every CitationItem must be accounted");
  assert(registry.accounting.invariantSatisfied, "Source accounting invariant must hold");
  assert(registry.auditRecords.length === expected, "Every CitationItem needs one audit record");
}

const persistentMapping = {
  schemaVersion: 1 as const,
  sources: [
    {
      schemaVersion: 1,
      canonicalSourceId: "book-testwerk",
      sourceOrigin: "USER" as const,
      kind: "BOOK" as const,
      preferredName: "Testwerk",
      preferredCitationText: "Autor, Testwerk, 2024",
      legalArea: "SONSTIGE" as const,
      applicableCitationTypes: ["BOOK" as const, "OTHER" as const],
      active: true,
    },
  ],
  aliases: [
    {
      canonicalSourceId: "book-testwerk",
      alias: "Testwerk",
      matchMode: "CASE_INSENSITIVE_TEXT" as const,
      wholeWord: true,
      active: true,
    },
  ],
};
const known = analyzeFootnotes([snapshot(1, "Autor, Testwerk, 2024, S. 10.")], {
  mappingData: persistentMapping,
});
assertAccounting(known, 1);
assert(
  known.documentSourceRegistry!.resolutions[0].finalState === "PERSISTENT_MATCH" &&
    known.documentSourceRegistry!.unpromotedConfirmedSourceCount === 0,
  "Persistent literature must resolve before document-local source creation"
);

const localInputs = [1, 2, 3].map((ordinal) =>
  snapshot(ordinal, `Neumann, Strafrecht AT, 5. Aufl. 2025, S. ${ordinal}.`)
);
const local = analyzeFootnotes(localInputs, {
  mappingData: { schemaVersion: 1, sources: [], aliases: [] },
});
const localSource = local.documentSourceRegistry!.sources[0];
assert(localSource?.status === "CONFIRMED_DOCUMENT_SOURCE", "Three occurrences must confirm");
const promotion = promoteDocumentSources(
  local.documentSourceRegistry!,
  { schemaVersion: 1, sources: [], aliases: [] },
  [localSource.documentSourceId]
);
assert(
  promotion.registry.unpromotedConfirmedSourceCount === 0 &&
    promotion.registry.resolutions.every(
      (resolution) => resolution.finalState === "PERSISTENT_MATCH"
    ),
  "Promotion must immediately update the in-memory registry and new-source queue"
);
const nextRun = analyzeFootnotes(localInputs, { mappingData: promotion.mapping });
assert(
  nextRun.documentSourceRegistry!.accounting.persistentMatched === 3 &&
    nextRun.documentSourceRegistry!.unpromotedConfirmedSourceCount === 0,
  "A promoted source must resolve persistently on the next run without becoming new again"
);
const duplicateAttempt = promoteDocumentSources(local.documentSourceRegistry!, promotion.mapping, [
  localSource.documentSourceId,
]);
assert(
  duplicateAttempt.items[0].status === "LINKED_EXISTING" &&
    duplicateAttempt.mapping.sources.length === 1,
  "Equivalent persistent literature must be linked instead of duplicated"
);

const lk = analyzeFootnotes(
  [snapshot(15, "Zieschang, in: Leipziger Kommentar StGB, 13. Aufl. 2019, § 34 Rdn. 76.")],
  { mappingData: createDefaultCitationSourceMapping() }
);
assertAccounting(lk, 1);
assert(
  lk.documentSourceRegistry!.resolutions[0].finalState === "PERSISTENT_MATCH" &&
    lk.documentSourceRegistry!.resolutions[0].persistentSourceId?.includes("lk-stgb"),
  "Leipziger Kommentar full-title/Bearbeiter citation must resolve through persistent aliases"
);
for (const citation of [
  "LK-StGB/Zieschang, § 34 Rn. 76.",
  "Zieschang, in: LK StGB, § 34 Rn. 76.",
]) {
  const result = analyzeFootnotes([snapshot(15, citation)], {
    mappingData: createDefaultCitationSourceMapping(),
  });
  assert(
    result.documentSourceRegistry!.resolutions[0].finalState === "PERSISTENT_MATCH",
    `${citation} must resolve through preferred-name or alias metadata`
  );
}

const footnote15Text = [
  "Engländer, in: Matt/Renzikowski StGB (Anm. 1), § 34 Rdn. 38, 42",
  "Erb, in: MüKo-StGB (Anm. 1), § 34 Rdn. 186",
  "Küper Der verschuldete Notstand, 1982, S. 111",
  "Momsen/Savic, in: BeckOK-StGB (Anm. 1), § 34 Rdn. 13",
  "Neumann, in: NK-StGB (Anm. 1), § 34 Rdn. 95",
  "Pawlik, Notstand (Anm. 9), S. 295 ff.",
  "Zieschang, in: Leipziger Kommentar StGB, 13. Aufl. 2019, § 34 Rdn. 76.",
].join("; ");
const footnote15 = analyzeFootnotes([snapshot(15, footnote15Text)], {
  mappingData: createDefaultCitationSourceMapping(),
});
assertAccounting(footnote15, 7);
for (const name of [
  "Engländer",
  "Erb",
  "Küper",
  "Momsen/Savic",
  "Neumann",
  "Pawlik",
  "Zieschang",
]) {
  assert(
    footnote15.documentSourceRegistry!.auditRecords.some((record) =>
      record.rawSourceText.includes(name)
    ),
    `${name} must be visible in the Footnote 15 audit`
  );
}

const erb = analyzeFootnotes(
  [
    snapshot(1, "Erb, GA 2020, 605 (611)."),
    snapshot(2, "Erb, GA 2020, 605 (607)."),
    snapshot(3, "Erb, GA 2020, 605 (608 ff.)."),
  ],
  { mappingData: { schemaVersion: 1, sources: [], aliases: [] } }
);
assert(
  erb.documentSourceRegistry!.sources.length === 1 &&
    erb.documentSourceRegistry!.sources[0].observedVariants.length === 1 &&
    erb.documentSourceRegistry!.sources[0].canonicalDisplayCitation === "Erb, GA 2020, 605",
  "Journal pinpoints must not affect Erb/GA source identity or variants"
);

for (const [legacy, expected] of [
  ["BGB", "ZIVILRECHT"],
  ["STGB", "STRAFRECHT"],
  ["STPO", "PROZESSRECHT"],
  ["ZPO", "PROZESSRECHT"],
  ["GG", "OEFFENTLICHES_RECHT"],
  ["GENERAL", "SONSTIGE"],
] as const) {
  assert(normalizeCitationSourceLegalArea(legacy) === expected, `${legacy} migration failed`);
}
const migratedLegacy = validateCitationSourceMappingData({
  schemaVersion: 1,
  sources: [
    {
      schemaVersion: 1,
      canonicalSourceId: "commentary-stgb-existing",
      kind: "COMMENTARY",
      preferredName: "Bestehender Kommentar",
      legalArea: "STGB",
      commentedLaw: "StGB",
      applicableCitationTypes: ["COMMENTARY"],
      active: true,
    },
  ],
  aliases: [],
});
assert(
  migratedLegacy.success &&
    migratedLegacy.data.sources[0].legalArea === "STRAFRECHT" &&
    migratedLegacy.data.sources[0].commentedLaw === "StGB" &&
    migratedLegacy.data.sources[0].canonicalSourceId === "commentary-stgb-existing",
  "Legacy legal-area migration must preserve source identity and commented-law metadata"
);

const workspace = readFileSync(
  join(process.cwd(), "src/taskpane/components/ReviewWorkspace.tsx"),
  "utf8"
);
const styles = readFileSync(join(process.cwd(), "src/taskpane/styles.css"), "utf8");
assert(
  workspace.includes("terminalDecision") &&
    workspace.includes('writeBackResult?.status === "APPLIED"'),
  "Completed review states must use the terminal-state UI"
);
assert(
  workspace.includes("aria-pressed={acceptedSelected}") &&
    styles.includes(".fc-review-action--selected") &&
    styles.includes("background: transparent") &&
    !styles.includes(".fc-review-action--selected { background: black"),
  "Selected acceptance must be an accessible transparent outline state"
);

console.log("POC 17.2.2 registry reliability, accounting, persistence and UX tests passed.");
