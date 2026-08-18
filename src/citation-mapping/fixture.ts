import type {
  CitationSourceAlias,
  CitationSourceKind,
  CitationSourceLegalArea,
  CitationSourceMappingData,
  CitationSourceMaster,
  CommentaryPersonStructureHint,
  LegacySafetyLevel,
} from "./types";
import { createCanonicalSourceSlug } from "./normalization";

interface FixtureSource {
  kind: CitationSourceKind;
  preferredName: string;
  legalArea: CitationSourceLegalArea;
  aliases: string[];
  safety?: LegacySafetyLevel;
  notes?: string;
  examplePattern?: string;
  personStructureHint?: CommentaryPersonStructureHint;
}

const FIXTURE_SOURCES: readonly FixtureSource[] = [
  {
    kind: "COMMENTARY",
    preferredName: "MüKoBGB",
    legalArea: "BGB",
    aliases: ["Münchener Kommentar zum BGB", "MünchKomm BGB", "MüKo BGB", "MüKo-BGB", "MK-BGB"],
    examplePattern: "MüKoBGB/Bearbeiter, 9. Aufl. 2022, § 823 Rn. 12.",
    personStructureHint: "WORK_THEN_BEARBEITER",
  },
  {
    kind: "COMMENTARY",
    preferredName: "MüKoStGB",
    legalArea: "STGB",
    aliases: ["Münchener Kommentar zum StGB", "MüKo StGB", "MüKo-StGB", "MK-StGB"],
    examplePattern: "MüKoStGB/Bearbeiter, § 13 Rn. 12.",
    personStructureHint: "WORK_THEN_BEARBEITER",
  },
  {
    kind: "COMMENTARY",
    preferredName: "BeckOK StGB",
    legalArea: "STGB",
    aliases: ["Beck Online-Kommentar StGB", "BeckOK-StGB", "Beck OK StGB"],
  },
  {
    kind: "COMMENTARY",
    preferredName: "LK-StGB",
    legalArea: "STGB",
    aliases: ["Leipziger Kommentar", "Leipziger Kommentar StGB", "LK StGB"],
  },
  {
    kind: "COMMENTARY",
    preferredName: "Schönke/Schröder",
    legalArea: "STGB",
    aliases: ["S/S", "Schönke-Schröder", "Schönke Schröder"],
  },
  {
    kind: "COMMENTARY",
    preferredName: "Meyer-Goßner/Schmitt",
    legalArea: "STPO",
    aliases: ["Meyer-Gossner/Schmitt", "M-G/S", "Meyer-Goßner Schmitt"],
  },
  {
    kind: "COMMENTARY",
    preferredName: "LR-StPO",
    legalArea: "STPO",
    aliases: ["Löwe-Rosenberg", "Loewe-Rosenberg", "LR StPO"],
  },
  {
    kind: "COMMENTARY",
    preferredName: "Maunz/Dürig",
    legalArea: "GG",
    aliases: ["Maunz-Dürig", "Maunz Dürig", "M/D"],
  },
  {
    kind: "COMMENTARY",
    preferredName: "Staudinger",
    legalArea: "BGB",
    aliases: ["J. von Staudingers Kommentar", "Staudinger BGB"],
    safety: "UNCERTAIN",
    notes: "Staudinger-Zitate können editionsspezifisch sein.",
    personStructureHint: "AMBIGUOUS",
  },
  {
    kind: "COMMENTARY",
    preferredName: "Grüneberg",
    legalArea: "BGB",
    aliases: ["Palandt", "Palandt/Grüneberg", "Grüneberg BGB"],
    safety: "UNCERTAIN",
    notes: "Historische Auflagen können andere Bezeichnung rechtfertigen.",
    personStructureHint: "AMBIGUOUS",
  },
  {
    kind: "COMMENTARY",
    preferredName: "Fischer",
    legalArea: "STGB",
    aliases: ["Fischer StGB", "Fischer, StGB"],
    safety: "UNCERTAIN",
    notes: "Einzelautor-Kommentar ohne Bearbeitertrenner.",
    examplePattern: "Fischer, StGB, § 13 Rn. 12.",
    personStructureHint: "WORK_WITHOUT_BEARBEITER",
  },
  {
    kind: "JOURNAL",
    preferredName: "NJW",
    legalArea: "GENERAL",
    aliases: ["Neue Juristische Wochenschrift", "NJW."],
    examplePattern: "Autor, NJW 2024, 1234 (1236).",
  },
  {
    kind: "JOURNAL",
    preferredName: "NStZ",
    legalArea: "GENERAL",
    aliases: ["Neue Zeitschrift für Strafrecht", "NStz", "NStZ."],
  },
  {
    kind: "JOURNAL",
    preferredName: "JuS",
    legalArea: "GENERAL",
    aliases: ["Juristische Schulung", "Jus", "JuS."],
  },
  {
    kind: "JOURNAL",
    preferredName: "wistra",
    legalArea: "GENERAL",
    aliases: ["Wirtschaft und Steuerstrafrecht", "Wistra", "wistra."],
  },
];

function sourceId(source: FixtureSource): string {
  return source.kind === "JOURNAL"
    ? `journal-${createCanonicalSourceSlug(source.preferredName)}`
    : `commentary-${source.legalArea.toLowerCase()}-${createCanonicalSourceSlug(source.preferredName)}`;
}

function commentedLaw(area: CitationSourceLegalArea): string | undefined {
  return { BGB: "BGB", STGB: "StGB", STPO: "StPO", ZPO: "ZPO", GG: "GG" }[
    area as "BGB" | "STGB" | "STPO" | "ZPO" | "GG"
  ];
}

export function createBuiltInCitationSourceMappingFixture(): CitationSourceMappingData {
  const sources: CitationSourceMaster[] = FIXTURE_SOURCES.map((source) => {
    const canonicalSourceId = sourceId(source);
    return {
      schemaVersion: 1,
      canonicalSourceId,
      kind: source.kind,
      preferredName: source.preferredName,
      legalArea: source.legalArea,
      ...(commentedLaw(source.legalArea) ? { commentedLaw: commentedLaw(source.legalArea) } : {}),
      applicableCitationTypes:
        source.kind === "COMMENTARY"
          ? ["COMMENTARY"]
          : ["JOURNAL_ARTICLE", "CASE_LAW", "CASE_NOTE"],
      active: true,
      ...(source.examplePattern ? { examplePattern: source.examplePattern } : {}),
      ...(source.notes ? { notes: source.notes } : {}),
      personStructureHint: source.personStructureHint ?? "UNKNOWN",
      workOverride: {
        canonicalWorkId: canonicalSourceId,
        citationType: source.kind === "COMMENTARY" ? "COMMENTARY" : "JOURNAL_ARTICLE",
        preferredName: source.preferredName,
      },
    };
  });
  const aliases: CitationSourceAlias[] = FIXTURE_SOURCES.flatMap((source) => {
    const canonicalSourceId = sourceId(source);
    return source.aliases.map((alias) => ({
      canonicalSourceId,
      alias,
      matchMode: "CASE_INSENSITIVE_TEXT" as const,
      wholeWord: true,
      active: true,
      legacySafetyLevel: source.safety ?? "PROBABLE",
      ...(source.notes ? { notes: source.notes } : {}),
    }));
  });
  return { schemaVersion: 1, sources, aliases };
}
