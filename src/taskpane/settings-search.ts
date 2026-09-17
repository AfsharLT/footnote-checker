export type SettingsTopLevelSection =
  "GENERAL" | "CITATION" | "LITERATURE" | "ABBREVIATIONS" | "HELP";

export type SettingsNestedSection =
  | "FORMATTING"
  | "CITATION_GENERAL"
  | "STATUTE"
  | "CASE_LAW"
  | "COMMENTARY"
  | "BOOK"
  | "JOURNAL_ARTICLE"
  | "FESTSCHRIFT"
  | "OTHER_TYPES";

export interface SettingsSearchEntry {
  id: string;
  topLevelSection: SettingsTopLevelSection;
  topLevelLabel: string;
  subsection?: SettingsNestedSection;
  subsectionLabel?: string;
  label: string;
  helperText?: string;
  aliases: readonly string[];
  targetElementId: string;
}

export const SETTINGS_TOP_LEVEL_SECTIONS: ReadonlyArray<{
  value: SettingsTopLevelSection;
  label: string;
}> = [
  { value: "GENERAL", label: "Allgemein" },
  { value: "CITATION", label: "Zitiereinstellungen" },
  { value: "LITERATURE", label: "Literaturverzeichnis" },
  { value: "ABBREVIATIONS", label: "Abkürzungsverzeichnis" },
  { value: "HELP", label: "Hilfe & Info" },
];

export const CITATION_SETTINGS_SECTIONS: ReadonlyArray<{
  value: Exclude<SettingsNestedSection, "FORMATTING">;
  label: string;
}> = [
  { value: "CITATION_GENERAL", label: "Allgemeine Zitiereinstellungen" },
  { value: "STATUTE", label: "Gesetze" },
  { value: "CASE_LAW", label: "Rechtsprechung" },
  { value: "COMMENTARY", label: "Kommentare" },
  { value: "BOOK", label: "Bücher" },
  { value: "JOURNAL_ARTICLE", label: "Zeitschriften & Aufsätze" },
  { value: "FESTSCHRIFT", label: "Festschriften" },
  { value: "OTHER_TYPES", label: "Weitere Quellentypen" },
];

export function settingsSubsectionTarget(section: SettingsNestedSection): string {
  return `fc-settings-subsection-${section.toLowerCase().replace(/_/g, "-")}`;
}

export function settingsFieldTarget(scope: string, label: string): string {
  const slug = normalizeSearchText(label)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `fc-setting-${scope.toLowerCase().replace(/_/g, "-")}-${slug}`;
}

const sectionLabels: Record<
  Exclude<SettingsNestedSection, "FORMATTING" | "FESTSCHRIFT">,
  readonly string[]
> = {
  CITATION_GENERAL: [
    "Zitattrenner",
    "Personentrenner",
    "Whitespace um Separatoren bereinigen",
    "Abschließender Punkt erforderlich",
    "Unbekannten Text erhalten",
    "Konservative Korrekturen bevorzugen",
  ],
  STATUTE: [
    "Normeinheit",
    "Absatzdarstellung",
    "Satzdarstellung",
    "Buchstabenstil",
    "Alternative",
    "Variante",
    "Mehrfachnorm-Trenner",
    "Abstand zwischen § und Normnummer",
  ],
  CASE_LAW: [
    "Urteil",
    "Beschluss",
    "Entscheidung",
    "Datumseinleiter",
    "Datumsformat",
    "Gericht anzeigen",
    "Entscheidungsart anzeigen",
    "Datum anzeigen",
    "Aktenzeichen anzeigen",
    "Separator vor Aktenzeichen",
    "Journal-Fundstelle",
    "Amtliche Sammlung",
    "Parallelfundstellen-Trenner",
    "Gericht bei Journalfundstelle anzeigen",
    "Gericht bei Datenbankfundstelle anzeigen, wenn vorhanden",
  ],
  COMMENTARY: [
    "Bevorzugten Werknamen verwenden",
    "Gesetzeseinstellungen übernehmen",
    "Herausgeber anzeigen, wenn vorhanden",
    "Auflage anzeigen, wenn vorhanden",
    "Band anzeigen, wenn vorhanden",
    "Jahr anzeigen, wenn vorhanden",
    "Randnummer-Abkürzung",
    "Personentrenner",
  ],
  BOOK: [
    "Kurztitel verwenden, wenn vorhanden",
    "Auflage anzeigen",
    "Band anzeigen",
    "Ort anzeigen",
    "Verlag anzeigen",
    "Jahr anzeigen",
    "Werkabschnitt",
    "Randnummer-Abkürzung",
    "Seiten-Abkürzung",
    "Personentrenner",
  ],
  JOURNAL_ARTICLE: [
    "Zeitschriftenabkürzung verwenden",
    "Jahr anzeigen",
    "Anfangsseite anzeigen",
    "Konkrete Fundstelle",
    "Personentrenner",
    "f. / ff. erhalten",
  ],
  OTHER_TYPES: [
    "Buchbeitrag",
    "Anmerkung",
    "Gesetzgebungsmaterial",
    "Onlinequelle",
    "Verwaltungsmaterial",
    "in-Token",
    "Organisation anzeigen",
    "URL anzeigen",
    "Abrufdatum anzeigen",
    "Abrufdatum-Label",
    "Behörde anzeigen",
    "Dokumenttyp anzeigen",
    "Bundestag-Präfix",
    "Bundesrat-Präfix",
    "Bevorzugter Marker",
    "Herausgeber anzeigen",
    "Auflage anzeigen",
    "Jahr anzeigen",
    "Journal-Fundstelle",
    "Fundstellenstil",
    "Seiten-Abkürzung",
    "Seitenpräfix anzeigen",
    "Personentrenner",
    "Titel anzeigen",
    "Aktenzeichen anzeigen",
    "Datumseinleiter",
    "Datumsformat",
  ],
};

function citationEntry(
  subsection: Exclude<SettingsNestedSection, "FORMATTING">,
  subsectionLabel: string,
  label: string
): SettingsSearchEntry {
  return {
    id: `citation.${subsection.toLowerCase()}.${normalizeSearchText(label).replace(/\s+/g, "-")}`,
    topLevelSection: "CITATION",
    topLevelLabel: "Zitiereinstellungen",
    subsection,
    subsectionLabel,
    label,
    aliases: [],
    targetElementId:
      label === "Buchbeitrag" ||
      label === "Anmerkung" ||
      label === "Gesetzgebungsmaterial" ||
      label === "Onlinequelle" ||
      label === "Verwaltungsmaterial"
        ? settingsSubsectionTarget(subsection)
        : settingsFieldTarget(subsection, label),
  };
}

const citationEntries = CITATION_SETTINGS_SECTIONS.flatMap((section) => {
  if (section.value === "FESTSCHRIFT") {
    return [
      citationEntry(
        section.value,
        section.label,
        "Festschrift-spezifische Einstellungen werden in einem späteren Schritt ergänzt."
      ),
    ];
  }
  return sectionLabels[section.value].map((label) =>
    citationEntry(section.value, section.label, label)
  );
});

const formattingEntries: SettingsSearchEntry[] = [
  ["author", "Autor", ["Autor kursiv", "Verfasser", "Kursivschrift"]],
  ["bearbeiter", "Bearbeiter", ["Bearbeiter kursiv"]],
  ["editor", "Herausgeber", ["Herausgeber kursiv"]],
  ["work-title", "Werktitel", ["Werk", "Titel", "Werktitel kursiv"]],
].map(([id, label, aliases]) => ({
  id: `general.formatting.${id as string}`,
  topLevelSection: "GENERAL" as const,
  topLevelLabel: "Allgemein",
  subsection: "FORMATTING" as const,
  subsectionLabel: "Formatierung",
  label: label as string,
  aliases: aliases as string[],
  targetElementId: `fc-setting-formatting-${id as string}`,
}));

const abbreviationEntries: SettingsSearchEntry[] = [
  "Urteil",
  "Beschluss",
  "Entscheidung",
  "Datumseinleiter",
  "Randnummer",
  "Seite",
  "Absatz",
  "Satz",
  "Nummer",
  "Buchstabe",
  "Halbsatz",
  "Alternative",
  "Variante",
  "Folgende Stelle",
  "Fortfolgende Stellen",
  "Auflage",
  "Vergleich",
  "Siehe",
  "Andere Ansicht",
  "Weitere Nachweise",
  "Zustimmend",
  "Kritisch",
].map((label) => ({
  id: `abbreviations.${normalizeSearchText(label).replace(/\s+/g, "-")}`,
  topLevelSection: "ABBREVIATIONS" as const,
  topLevelLabel: "Abkürzungsverzeichnis",
  label,
  helperText: "Bevorzugte Ausgabe und erkannte Varianten",
  aliases: ["Abkürzung", "Modifier", "Signalwort"],
  targetElementId: settingsFieldTarget("ABBREVIATIONS", label),
}));

const literatureEntries: SettingsSearchEntry[] = [
  "Suche nach Name, Alias oder ID",
  "Quelle hinzufügen",
  "Bevorzugter Name",
  "Bevorzugte vollständige Zitierform",
  "Art",
  "Rechtsgebiet",
  "Kommentiertes Gesetz",
  "Personenstruktur-Hinweis",
  "Beispiel-Sollmuster",
  "Aliase",
  "Altdaten-Sicherheit",
  "Werk-spezifische Overrides",
].map((label) => ({
  id: `literature.${normalizeSearchText(label).replace(/\s+/g, "-")}`,
  topLevelSection: "LITERATURE" as const,
  topLevelLabel: "Literaturverzeichnis",
  label,
  aliases: ["Werk", "Zeitschrift", "Mapping", "Quelle"],
  targetElementId: "fc-settings-literature",
}));

export const SETTINGS_SEARCH_INDEX: readonly SettingsSearchEntry[] = [
  {
    id: "general.autoCloseInactiveFootnotes",
    topLevelSection: "GENERAL",
    topLevelLabel: "Allgemein",
    label: "Nicht aktive Fußnoten automatisch schließen",
    helperText:
      "Wenn Sie eine andere Fußnote öffnen, wird die zuvor geöffnete Fußnote automatisch geschlossen.",
    aliases: ["Fußnote schließen", "automatisch schließen", "Accordion"],
    targetElementId: "fc-setting-auto-close-inactive-footnotes",
  },
  ...literatureEntries,
  {
    id: "general.formatting",
    topLevelSection: "GENERAL",
    topLevelLabel: "Allgemein",
    subsection: "FORMATTING",
    subsectionLabel: "Formatierung",
    label: "Formatierung",
    aliases: ["Schrift", "kursiv", "fett", "unterstrichen"],
    targetElementId: settingsSubsectionTarget("FORMATTING"),
  },
  ...abbreviationEntries,
  ...formattingEntries,
  ...citationEntries,
  {
    id: "literature.directory",
    topLevelSection: "LITERATURE",
    topLevelLabel: "Literaturverzeichnis",
    label: "Literaturverzeichnis",
    helperText: "Bekannte Werke, Zeitschriften, Quellen und Aliase verwalten.",
    aliases: ["Werk", "Zeitschrift", "Mapping", "Quelle", "Alias"],
    targetElementId: "fc-settings-literature",
  },
  {
    id: "abbreviations.directory",
    topLevelSection: "ABBREVIATIONS",
    topLevelLabel: "Abkürzungsverzeichnis",
    label: "Abkürzungen und Signalwörter",
    helperText: "Bevorzugte Ausgaben, erkannte Varianten und Modifier verwalten.",
    aliases: ["Modifier", "Signalwort", "Randnummer", "Rn.", "Urteil", "Beschluss"],
    targetElementId: "fc-settings-abbreviations",
  },
  {
    id: "help.info",
    topLevelSection: "HELP",
    topLevelLabel: "Hilfe & Info",
    label: "Hilfe & Info",
    helperText: "Weitere Informationen und Hilfestellungen werden hier ergänzt.",
    aliases: ["Support", "Dokumentation", "Datenschutz", "Lizenz", "Version"],
    targetElementId: "fc-settings-help",
  },
];

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-DE")
    .trim();
}

export function searchSettings(query: string): SettingsSearchEntry[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  return SETTINGS_SEARCH_INDEX.filter((entry) => {
    const haystack = normalizeSearchText(
      [entry.topLevelLabel, entry.subsectionLabel, entry.label, entry.helperText, ...entry.aliases]
        .filter(Boolean)
        .join(" ")
    );
    return terms.every((term) => haystack.includes(term));
  }).slice(0, 12);
}

export function formatSettingsSearchContext(entry: SettingsSearchEntry): string {
  return [entry.topLevelLabel, entry.subsectionLabel, entry.label]
    .filter((part, index, parts) => part && parts.indexOf(part) === index)
    .join(" → ");
}

export function resolveSettingsSearchSelection(entry: SettingsSearchEntry): {
  topLevelSection: SettingsTopLevelSection;
  nestedSection: SettingsNestedSection | null;
  targetElementId: string;
} {
  return {
    topLevelSection: entry.topLevelSection,
    nestedSection: entry.subsection ?? null,
    targetElementId: entry.targetElementId,
  };
}
