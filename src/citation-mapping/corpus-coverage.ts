import type {
  CitationSourceAlias,
  CitationSourceKind,
  CitationSourceMappingData,
  CitationSourceMaster,
} from "./types";
import type { CitationType } from "../footnote-engine/types";

interface CorpusSourceDefinition {
  id: string;
  kind: CitationSourceKind;
  name: string;
  types: CitationType[];
  aliases: string[];
}

const book = (id: string, name: string, aliases: string[]): CorpusSourceDefinition => ({
  id: `book-${id}`,
  kind: "BOOK",
  name,
  types: ["BOOK"],
  aliases,
});

const festschrift = (id: string, name: string, aliases: string[]): CorpusSourceDefinition => ({
  id: `festschrift-${id}`,
  kind: "BOOK",
  name,
  types: ["FESTSCHRIFT_CONTRIBUTION"],
  aliases,
});

const journal = (id: string, name: string, aliases: string[] = []): CorpusSourceDefinition => ({
  id: `journal-${id}`,
  kind: "JOURNAL",
  name,
  types: ["JOURNAL_ARTICLE", "CASE_LAW", "CASE_NOTE", "FORTHCOMING"],
  aliases: [name, ...aliases],
});

export const POC_17_3_CORPUS_SOURCES: readonly CorpusSourceDefinition[] = [
  {
    id: "commentary-stgb-muekostgb",
    kind: "COMMENTARY",
    name: "MüKoStGB",
    types: ["COMMENTARY"],
    aliases: ["{Bearbeiter}, in: MüKo-StGB", "{Bearbeiter}, in: MüKoStGB"],
  },
  {
    id: "commentary-stgb-tuebinger-kommentar",
    kind: "COMMENTARY",
    name: "Tübinger Kommentar StGB",
    types: ["COMMENTARY"],
    aliases: ["Tübinger Kommentar StGB", "{Bearbeiter}, in: Tübinger Kommentar StGB"],
  },
  {
    id: "commentary-stgb-sk-stgb",
    kind: "COMMENTARY",
    name: "SK-StGB",
    types: ["COMMENTARY"],
    aliases: ["SK-StGB", "{Bearbeiter}, in: SK-StGB"],
  },
  {
    id: "decision-report-bghst-5-245",
    kind: "REPORT",
    name: "BGHSt 5, 245",
    types: ["CASE_LAW"],
    aliases: ["BGHSt. 5, 245", "BGHSt 5, 245"],
  },
  {
    id: "decision-report-bghst-24-356",
    kind: "REPORT",
    name: "BGHSt 24, 356",
    types: ["CASE_LAW"],
    aliases: ["BGHSt. 24, 356", "BGHSt 24, 356"],
  },
  {
    id: "decision-report-rgst-66-397",
    kind: "REPORT",
    name: "RGSt 66, 397",
    types: ["CASE_LAW"],
    aliases: ["RGSt. 66, 397", "RGSt 66, 397"],
  },
  journal("jr", "JR"),
  journal("jura", "Jura"),
  journal("ga", "GA"),
  journal("medstra", "medstra"),
  journal("hrrs", "HRRS"),
  journal("medr", "MedR"),
  book("renzikowski-notstand-und-notwehr", "Renzikowski, Notstand und Notwehr", [
    "Notstand und Notwehr",
    "Renzikowski, Notstand und Notwehr",
  ]),
  book("schmidhaeuser-strafrecht-at", "Schmidhäuser, Strafrecht Allgemeiner Teil", [
    "Schmidhäuser, Strafrecht Allgemeiner Teil",
  ]),
  book(
    "hruschka-strafrecht-logisch-analytisch",
    "Hruschka, Strafrecht nach logisch-analytischer Methode",
    [
      "Hruschka, Strafrecht nach logisch-analytischer Methode",
      "Strafrecht nach logisch-analytischer Methode",
    ]
  ),
  book("bernsmann-entschuldigung-notstand", "Bernsmann, Entschuldigung durch Notstand", [
    "Bernsmann, Entschuldigung durch Notstand",
    "Bernsmann, Notstand",
  ]),
  book("henkel-notstand", "Henkel, Der Notstand nach gegenwärtigem und künftigem Recht", [
    "Henkel, Der Notstand nach gegenwärtigem und künftigem Recht",
  ]),
  book("von-hippel-deutsches-strafrecht", "von Hippel, Deutsches Strafrecht", [
    "von Hippel, Deutsches Strafrecht",
  ]),
  book("pena-wasaff-entschuldigender-notstand", "Pena-Wasaff, Der entschuldigende Notstand", [
    "Pena-Wasaff, Der entschuldigende Notstand",
  ]),
  book("kuehl-at", "Kühl, AT", ["Kühl, AT"]),
  book(
    "bitzilekis-notwehrrecht",
    "Bitzilekis, Die neue Tendenz zur Einschränkung des Notwehrrechts",
    ["Bitzilekis, Die neue Tendenz zur Einschränkung des Notwehrrechts"]
  ),
  book("haas-notwehr-und-nothilfe", "Haas, Notwehr und Nothilfe", ["Haas, Notwehr und Nothilfe"]),
  book("englaender-nothilfe", "Engländer, Grund und Grenzen der Nothilfe", [
    "Engländer, Grund und Grenzen der Nothilfe",
    "Engländer, Nothilfe",
    "ders., Nothilfe",
  ]),
  book(
    "seesko-notwehr-erpressung",
    "Seesko, Notwehr gegen Erpressung durch Drohung mit erlaubtem Verhalten",
    ["Seesko, Notwehr gegen Erpressung durch Drohung mit erlaubtem Verhalten"]
  ),
  book("wagner-notwehrbegruendung", "Wagner, Notwehrbegründung", ["Wagner, Notwehrbegründung"]),
  book("rengier-at", "Rengier, AT", ["Rengier, AT"]),
  book("roxin-greco-at", "Roxin/Greco, AT", ["Roxin/Greco, AT", "Roxin/Greco, AT I"]),
  book("frister-at", "Frister, AT", ["Frister, AT"]),
  book("kindhaeuser-zimmermann-at", "Kindhäuser/Zimmermann, AT", ["Kindhäuser/Zimmermann, AT"]),
  book(
    "meissner-interessenabwaegungsformel",
    "Meißner, Die Interessenabwägungsformel in der Vorschrift über den rechtfertigenden Notstand",
    ["Meißner, Die Interessenabwägungsformel in der Vorschrift über den rechtfertigenden Notstand"]
  ),
  book("kueper-verschuldeter-notstand", "Küper, Der verschuldete Notstand", [
    "Küper, Der verschuldete Notstand",
    "Küper Der verschuldete Notstand",
  ]),
  book("pawlik-notstand", "Pawlik, Notstand", ["Pawlik, Notstand"]),
  book("heller-aufgedraengte-nothilfe", "Heller, Die aufgedrängte Nothilfe", [
    "Heller, Die aufgedrängte Nothilfe",
  ]),
  book("koch-nothilfe", "Koch, Nothilfe", ["Koch, Nothilfe", "Koch Nothilfe"]),
  book(
    "seeberg-aufgedraengte-nothilfe",
    "Seeberg, Aufgedrängte Nothilfe, Notwehr und Notwehrexzess",
    ["Seeberg, Aufgedrängte Nothilfe, Notwehr und Notwehrexzess"]
  ),
  book(
    "ingelfinger-toetungsverbot",
    "Ingelfinger, Grundlagen und Grenzbereiche des Tötungsverbots",
    ["Ingelfinger, Grundlagen und Grenzbereiche des Tötungsverbots"]
  ),
  book("dorneck-amhe-sterbehilfegesetz", "Dorneck et al., AMHE-Sterbehilfegesetz", [
    "Dorneck et al., AMHE-Sterbehilfegesetz",
  ]),
  book("zimmermann-rettungstoetungen", "Zimmermann, Rettungstötungen", [
    "Zimmermann, Rettungstötungen",
  ]),
  book("koehler-strafrecht-at", "Köhler, Strafrecht AT", ["Köhler, Strafrecht AT"]),
  book("kaufmann-unterlassungsdelikte", "Kaufmann, Dogmatik der Unterlassungsdelikte", [
    "Kaufmann, Dogmatik der Unterlassungsdelikte",
  ]),
  book("jescheck-weigend-strafrecht-at", "Jescheck/Weigend, Strafrecht Allgemeiner Teil", [
    "Jescheck/Weigend, Strafrecht Allgemeiner Teil",
  ]),
  book("jakobs-at", "Jakobs, AT", ["Jakobs, AT"]),
  book(
    "momsen-zumutbarkeit",
    "Momsen, Die Zumutbarkeit als Begrenzung strafrechtlicher Pflichten",
    ["Momsen, Die Zumutbarkeit als Begrenzung strafrechtlicher Pflichten"]
  ),
  book(
    "frister-voluntatives-schuldelement",
    "Frister, Die Struktur des voluntativen Schuldelements",
    ["Frister, Die Struktur des voluntativen Schuldelements"]
  ),
  book(
    "lugert-gefahrtragungspflicht",
    "Lugert, Zu den erhöht Gefahrtragungspflichtigen im differenzierten Notstand",
    ["Lugert, Zu den erhöht Gefahrtragungspflichtigen im differenzierten Notstand"]
  ),
  book("wessels-beulke-satzger-at", "Wessels/Beulke/Satzger, AT", ["Wessels/Beulke/Satzger, AT"]),
  festschrift("hassemer-bockelmann-1979-225", "Hassemer, Festschrift für Bockelmann", [
    "Hassemer, Festschrift für Bockelmann",
    "Hassemer, FS Bockelmann",
  ]),
  festschrift("hruschka-dreher-1977-189", "Hruschka, Festschrift für Dreher", [
    "Hruschka, Festschrift für Dreher",
    "Hruschka, FS Dreher",
  ]),
  festschrift("englaender-sancinetti-2020-297", "Engländer, Festschrift für Sancinetti", [
    "Engländer, Festschrift für Sancinetti",
    "ders., Festschrift für Sancinetti",
    "Engländer, FS Sancinetti",
  ]),
  festschrift("neumann-kuehl-2014-569", "Neumann, Festschrift für Kühl", [
    "Neumann, Festschrift für Kühl",
    "Neumann, FS Kühl",
  ]),
  festschrift("hirsch-welzel-1974-775", "Hirsch, Festschrift für Welzel", [
    "Hirsch, Festschrift für Welzel",
    "Hirsch, FS Welzel",
  ]),
  festschrift("neumann-roxin-2001-421", "Neumann, Festschrift für Roxin", [
    "Neumann, Festschrift für Roxin",
    "Neumann, FS Roxin",
  ]),
  festschrift("unknown-schuenemann-2015-583", "Festschrift für Schünemann", [
    "Festschrift für Schünemann",
    "FS Schünemann",
  ]),
  {
    id: "yearbook-hruschka-recht-und-ethik-2014-137",
    kind: "BOOK",
    name: "Hruschka, Jahrbuch für Recht und Ethik 2014",
    types: ["YEARBOOK_CONTRIBUTION"],
    aliases: ["Hruschka, Jahrbuch für Recht und Ethik 2014"],
  },
  {
    id: "yearbook-silva-sanchez-recht-und-ethik-2005-681",
    kind: "BOOK",
    name: "Silva Sánchez, Jahrbuch für Recht und Ethik 2005",
    types: ["YEARBOOK_CONTRIBUTION"],
    aliases: ["Silva Sánchez, Jahrbuch für Recht und Ethik 2005"],
  },
  {
    id: "manuscript-jansen",
    kind: "CUSTOM",
    name: "Jansen, Manuskript",
    types: ["MANUSCRIPT"],
    aliases: ["Jansen, (Manuskript)", "Jansen (Manuskript)"],
  },
];

function source(definition: CorpusSourceDefinition): CitationSourceMaster {
  return {
    schemaVersion: 1,
    canonicalSourceId: definition.id,
    sourceOrigin: "DEFAULT",
    kind: definition.kind,
    preferredName: definition.name,
    legalArea: "STRAFRECHT",
    applicableCitationTypes: [...definition.types],
    active: true,
    notes: "POC 17.3: aus dem verifizierten realen Regressionskorpus.",
  };
}

function aliases(definition: CorpusSourceDefinition): CitationSourceAlias[] {
  return definition.aliases.map((alias) => ({
    canonicalSourceId: definition.id,
    alias,
    matchMode: "CASE_INSENSITIVE_TEXT",
    wholeWord: true,
    active: true,
    legacySafetyLevel: "PROBABLE",
  }));
}

export function mergeCorpusCoverageSources(
  mapping: CitationSourceMappingData
): CitationSourceMappingData {
  const existingSourceIds = new Set(
    mapping.sources.map((candidate) => candidate.canonicalSourceId)
  );
  const existingAliasKeys = new Set(
    mapping.aliases.map((candidate) => `${candidate.canonicalSourceId}\u0000${candidate.alias}`)
  );
  return {
    ...mapping,
    sources: [
      ...mapping.sources,
      ...POC_17_3_CORPUS_SOURCES.filter((definition) => !existingSourceIds.has(definition.id)).map(
        source
      ),
    ],
    aliases: [
      ...mapping.aliases,
      ...POC_17_3_CORPUS_SOURCES.flatMap(aliases).filter(
        (alias) => !existingAliasKeys.has(`${alias.canonicalSourceId}\u0000${alias.alias}`)
      ),
    ],
  };
}
