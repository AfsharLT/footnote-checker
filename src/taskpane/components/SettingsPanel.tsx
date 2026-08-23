import * as React from "react";
import { useMemo, useState } from "react";
import { Button, makeStyles, tokens } from "@fluentui/react-components";
import { ChevronDown, ChevronRight, Download, RotateCcw, Upload } from "lucide-react";
import { NeonButton } from "@/components/ui/neon-button";
import { BrandLogo } from "@/taskpane/components/BrandLogo";
import {
  exportCitationSourceMappingCsv,
  parseCitationSourceMappingCsv,
} from "../../citation-mapping/normalized-csv";
import { normalizeCitationSourceText } from "../../citation-mapping/normalization";
import type {
  CitationSourceAlias,
  CitationSourceKind,
  CitationSourceLegalArea,
  CitationSourceMappingData,
  CitationSourceMaster,
  CitationSourceMappingStorageResult,
  CommentaryPersonStructureHint,
  LegacySafetyLevel,
} from "../../citation-mapping/types";
import { validateCitationSourceMappingData } from "../../citation-mapping/validation";
import { createDefaultCitationStyleProfile } from "../../citation-settings/defaults";
import type {
  CharacterStylePreference,
  CitationAbbreviationConcept,
  CitationModifierConcept,
  CitationStyleProfile,
  CitationStyleStorageResult,
  WorkCitationOverride,
} from "../../citation-settings/types";
import {
  parseCitationStyleProfile,
  serializeCitationStyleProfile,
} from "../../citation-settings/validation";
import {
  DEFAULT_MAPPING_FILTERS,
  addAbbreviationVariant,
  addCitationSource,
  addCitationSourceAlias,
  addModifierVariant,
  cloneCitationSourceMapping,
  cloneCitationStyleProfile,
  filterCitationSources,
  findAliasConflicts,
  formatCitationStyleImportErrors,
  hasUnsavedChanges,
  removeAbbreviationVariant,
  removeModifierVariant,
  removeCitationSource,
  removeUserCitationSourceAlias,
  restoreDefaultCitationSources,
  updateCitationSource,
  updateCitationSourceAlias,
  validateSettingsWorkingCopy,
  type MappingFilters,
  type NewCitationSourceInput,
  type AliasConflict,
  type SettingsSection,
} from "../../settings-ui/state";

interface SettingsPanelProps {
  activeProfile: CitationStyleProfile;
  mappingData: CitationSourceMappingData;
  onSaveProfile(profile: CitationStyleProfile): CitationStyleStorageResult;
  onSaveMapping(mapping: CitationSourceMappingData): CitationSourceMappingStorageResult;
  onClose(): void;
}

interface Option<T extends string> {
  value: T;
  label: string;
}

const SECTION_OPTIONS: Array<Option<SettingsSection>> = [
  { value: "GENERAL", label: "Allgemein" },
  { value: "STATUTE", label: "Gesetze" },
  { value: "CASE_LAW", label: "Rechtsprechung" },
  { value: "COMMENTARY", label: "Kommentare" },
  { value: "BOOK", label: "Bücher" },
  { value: "JOURNAL_ARTICLE", label: "Zeitschriftenaufsätze" },
  { value: "OTHER_TYPES", label: "Weitere Quellentypen" },
  { value: "ABBREVIATIONS", label: "Abkürzungen & Modifier" },
  { value: "FORMATTING", label: "Formatierung" },
  { value: "MAPPING", label: "Werk- & Zeitschriften-Mapping" },
];

const LEGAL_AREA_OPTIONS: Array<Option<"ALL" | CitationSourceLegalArea>> = [
  { value: "ALL", label: "Alle Rechtsgebiete" },
  { value: "BGB", label: "BGB" },
  { value: "STGB", label: "StGB" },
  { value: "STPO", label: "StPO" },
  { value: "ZPO", label: "ZPO" },
  { value: "GG", label: "GG" },
  { value: "GENERAL", label: "Allgemein" },
  { value: "UNKNOWN", label: "Unbekannt" },
];

const PERSON_HINT_OPTIONS: Array<Option<CommentaryPersonStructureHint>> = [
  { value: "WORK_THEN_BEARBEITER", label: "Werk, danach Bearbeiter" },
  { value: "WORK_WITHOUT_BEARBEITER", label: "Werk ohne Bearbeitertrenner" },
  { value: "AMBIGUOUS", label: "Mehrdeutig" },
  { value: "UNKNOWN", label: "Unbekannt" },
];

const SOURCE_KIND_OPTIONS: Array<Option<CitationSourceKind>> = [
  { value: "COMMENTARY", label: "Kommentar" },
  { value: "JOURNAL", label: "Zeitschrift" },
  { value: "BOOK", label: "Buch / Lehrbuch" },
  { value: "REPORT", label: "Forschungsbericht" },
  { value: "CUSTOM", label: "Sonstige benutzerdefinierte Quelle" },
];

function sourceKindLabel(kind: CitationSourceKind): string {
  return SOURCE_KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
}

function isCustomSourceKind(kind: CitationSourceKind): boolean {
  return kind === "BOOK" || kind === "REPORT" || kind === "CUSTOM";
}

const ABBREVIATION_LABELS: Record<CitationAbbreviationConcept, string> = {
  JUDGMENT: "Urteil",
  ORDER: "Beschluss",
  DECISION: "Entscheidung",
  DATE_INTRODUCER: "Datumseinleiter",
  MARGIN_NUMBER: "Randnummer",
  PAGE: "Seite",
  PARAGRAPH: "Absatz",
  SENTENCE: "Satz",
  NUMBER: "Nummer",
  LETTER: "Buchstabe",
  HALF_SENTENCE: "Halbsatz",
  ALTERNATIVE: "Alternative",
  VARIANT: "Variante",
  FOLLOWING: "Folgende Stelle",
  FOLLOWING_MULTIPLE: "Fortfolgende Stellen",
  EDITION: "Auflage",
};

const MODIFIER_LABELS: Record<CitationModifierConcept, string> = {
  COMPARE: "Vergleich",
  SEE: "Siehe",
  DIFFERENT_VIEW: "Andere Ansicht",
  FURTHER_REFERENCES: "Weitere Nachweise",
  AGREEING: "Zustimmend",
  CRITICAL: "Kritisch",
};

const useStyles = makeStyles({
  panel: { display: "grid", gap: "16px", paddingBottom: "20px" },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    paddingBottom: "14px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  identity: { display: "flex", alignItems: "center", gap: "10px", minWidth: 0 },
  logo: { width: "36px", height: "36px", objectFit: "contain", flexShrink: 0 },
  title: { margin: 0, color: "#003381", fontSize: "21px", lineHeight: "26px" },
  subtitle: { margin: "4px 0", color: tokens.colorNeutralForeground2 },
  stickyActionBar: {
    position: "sticky",
    top: "0px",
    zIndex: 20,
    alignSelf: "start",
    display: "flex",
    width: "100%",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "8px",
    padding: "10px",
    border: "1px solid #c8d8ee",
    borderRadius: "10px",
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    boxShadow: "0 5px 18px rgba(0, 51, 129, 0.08)",
  },
  hiddenInput: { display: "none" },
  fileAction: {
    display: "inline-flex",
    minHeight: "32px",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    padding: "6px 10px",
    border: "1px solid #c8d8ee",
    borderRadius: "8px",
    backgroundColor: "#fff",
    color: "#003381",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 600,
  },
  profileCard: {
    display: "grid",
    gap: "10px",
    padding: "14px",
    border: "1px solid #d8e2ef",
    borderRadius: "10px",
    backgroundColor: "#f8fafc",
  },
  accordion: { display: "grid", gap: "8px" },
  accordionItem: {
    overflow: "hidden",
    border: "1px solid #d8e2ef",
    borderRadius: "10px",
    backgroundColor: "#fff",
  },
  accordionTrigger: {
    display: "flex",
    width: "100%",
    minHeight: "44px",
    alignItems: "center",
    gap: "8px",
    padding: "10px 12px",
    border: 0,
    backgroundColor: "#fff",
    color: "#003381",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "14px",
    fontWeight: 650,
    textAlign: "left",
  },
  accordionContent: {
    padding: "0 10px 10px",
    borderTop: "1px solid #e8eef6",
    backgroundColor: "#fbfcfe",
  },
  section: {
    display: "grid",
    gap: "14px",
    padding: "16px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  sectionTitle: { margin: 0, color: "#003381", fontSize: "18px" },
  subsection: {
    display: "grid",
    gap: "10px",
    paddingTop: "12px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  subsectionTitle: { margin: 0, fontSize: "15px", color: tokens.colorNeutralForeground1 },
  field: { display: "grid", gap: "5px" },
  label: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  input: {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    padding: "8px 10px",
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
  },
  textarea: { minHeight: "72px", resize: "vertical" },
  checkbox: {
    display: "flex",
    gap: "8px",
    alignItems: "flex-start",
    fontSize: tokens.fontSizeBase300,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
    gap: "10px",
  },
  actionBar: { display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" },
  statusSaved: {
    color: tokens.colorPaletteGreenForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  statusDirty: {
    color: tokens.colorPaletteDarkOrangeForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  message: {
    margin: 0,
    padding: "10px",
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralBackground2,
    whiteSpace: "pre-wrap",
  },
  error: { color: tokens.colorPaletteRedForeground1 },
  warning: { color: tokens.colorPaletteDarkOrangeForeground1 },
  help: { margin: 0, color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200 },
  card: {
    padding: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  cardTitle: { fontWeight: tokens.fontWeightSemibold, color: "#003381" },
  summary: { display: "flex", flexWrap: "wrap", gap: "8px 16px", fontSize: tokens.fontSizeBase300 },
  badge: {
    display: "inline-block",
    marginLeft: "6px",
    padding: "2px 6px",
    borderRadius: "999px",
    backgroundColor: tokens.colorNeutralBackground4,
    fontSize: tokens.fontSizeBase100,
  },
  chipList: { display: "flex", flexWrap: "wrap", gap: "6px" },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 7px",
    borderRadius: "999px",
    backgroundColor: tokens.colorNeutralBackground4,
  },
  compactButton: { minWidth: "auto" },
  dialog: {
    display: "grid",
    gap: "12px",
    padding: "16px",
    border: `2px solid ${tokens.colorPaletteDarkOrangeBorder1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
});

function TextField(props: {
  label: string;
  value: string;
  onChange(value: string): void;
  readOnly?: boolean;
  multiline?: boolean;
  type?: "text" | "search";
  placeholder?: string;
  helpText?: string;
  error?: string;
}) {
  const styles = useStyles();
  return (
    <label className={styles.field}>
      <span className={styles.label}>{props.label}</span>
      {props.multiline ? (
        <textarea
          className={`${styles.input} ${styles.textarea}`}
          value={props.value}
          readOnly={props.readOnly}
          placeholder={props.placeholder}
          onChange={(event) => props.onChange(event.target.value)}
        />
      ) : (
        <input
          className={styles.input}
          type={props.type ?? "text"}
          value={props.value}
          readOnly={props.readOnly}
          placeholder={props.placeholder}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
      {props.helpText && <span className={styles.help}>{props.helpText}</span>}
      {props.error && <span className={styles.error}>{props.error}</span>}
    </label>
  );
}

function SelectField<T extends string>(props: {
  label: string;
  value: T;
  options: Array<Option<T>>;
  onChange(value: T): void;
  disabled?: boolean;
}) {
  const styles = useStyles();
  return (
    <label className={styles.field}>
      <span className={styles.label}>{props.label}</span>
      <select
        className={styles.input}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value as T)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckField(props: { label: string; checked: boolean; onChange(value: boolean): void }) {
  const styles = useStyles();
  return (
    <label className={styles.checkbox}>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span>{props.label}</span>
    </label>
  );
}

function StyleEditor(props: {
  title: string;
  value: CharacterStylePreference;
  onChange(value: CharacterStylePreference): void;
}) {
  const styles = useStyles();
  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>{props.title}</div>
      <div className={styles.grid}>
        {(["italic", "bold", "underline"] as const).map((property) => (
          <CheckField
            key={property}
            label={{ italic: "Kursiv", bold: "Fett", underline: "Unterstrichen" }[property]}
            checked={props.value[property] ?? false}
            onChange={(value) => props.onChange({ ...props.value, [property]: value })}
          />
        ))}
      </div>
    </div>
  );
}

function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Datei konnte nicht gelesen werden."));
    reader.readAsText(file, "UTF-8");
  });
}

function downloadText(filename: string, text: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function VariantEditor(props: {
  variants: string[];
  onAdd(value: string): string | undefined;
  onRemove(index: number): void;
}) {
  const styles = useStyles();
  const [candidate, setCandidate] = useState("");
  const [error, setError] = useState("");
  return (
    <div className={styles.field}>
      <span className={styles.label}>Erkannte Varianten</span>
      <div className={styles.chipList}>
        {props.variants.map((variant, index) => (
          <span className={styles.chip} key={`${variant}-${index}`}>
            {variant}
            <button
              type="button"
              aria-label={`${variant} entfernen`}
              onClick={() => props.onRemove(index)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className={styles.actionBar}>
        <input
          className={styles.input}
          value={candidate}
          aria-label="Neue erkannte Variante"
          onChange={(event) => setCandidate(event.target.value)}
        />
        <Button
          size="small"
          onClick={() => {
            const nextError = props.onAdd(candidate);
            setError(nextError ?? "");
            if (!nextError) setCandidate("");
          }}
        >
          Variante hinzufügen
        </Button>
      </div>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}

function ProfileEditor(props: {
  section: SettingsSection;
  profile: CitationStyleProfile;
  onChange(profile: CitationStyleProfile): void;
}) {
  const styles = useStyles();
  const update = (change: (next: CitationStyleProfile) => void) => {
    const next = cloneCitationStyleProfile(props.profile);
    change(next);
    props.onChange(next);
  };
  const pinpointOptions: Array<Option<"parentheses" | "comma">> = [
    { value: "parentheses", label: "Klammern" },
    { value: "comma", label: "Komma" },
  ];

  if (props.section === "GENERAL") {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Allgemeine Einstellungen</h2>
        <div className={styles.grid}>
          <TextField
            label="Zitattrenner"
            value={props.profile.global.citationSeparator}
            onChange={(value) => update((next) => (next.global.citationSeparator = value))}
          />
          <TextField
            label="Personentrenner"
            value={props.profile.global.personSeparator}
            onChange={(value) => update((next) => (next.global.personSeparator = value))}
          />
        </div>
        <CheckField
          label="Whitespace um Separatoren bereinigen"
          checked={props.profile.global.trimAroundSeparators}
          onChange={(value) => update((next) => (next.global.trimAroundSeparators = value))}
        />
        <CheckField
          label="Abschließender Punkt erforderlich"
          checked={props.profile.global.finalPeriodRequired}
          onChange={(value) => update((next) => (next.global.finalPeriodRequired = value))}
        />
        <CheckField
          label="Unbekannten Text erhalten"
          checked={props.profile.global.preserveUnknownText}
          onChange={(value) => update((next) => (next.global.preserveUnknownText = value))}
        />
        <CheckField
          label="Konservative Korrekturen bevorzugen"
          checked={props.profile.global.preferConservativeCorrections}
          onChange={(value) =>
            update((next) => (next.global.preferConservativeCorrections = value))
          }
        />
      </section>
    );
  }

  if (props.section === "STATUTE") {
    const statute = props.profile.statute;
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Gesetze</h2>
        <div className={styles.grid}>
          <SelectField
            label="Normeinheit"
            value={statute.sectionSymbolStyle}
            options={[
              { value: "sectionSymbol", label: "§" },
              { value: "article", label: "Art." },
            ]}
            onChange={(value) => update((next) => (next.statute.sectionSymbolStyle = value))}
          />
          <SelectField
            label="Absatzdarstellung"
            value={statute.paragraphStyle}
            options={[
              { value: "abbreviation", label: "Abs. 1" },
              { value: "roman", label: "I" },
            ]}
            onChange={(value) => update((next) => (next.statute.paragraphStyle = value))}
          />
          <SelectField
            label="Satzdarstellung"
            value={statute.sentenceStyle}
            options={[
              { value: "abbreviation", label: "S. 1" },
              { value: "bareNumberAfterRomanParagraph", label: "Kurzform nach römischem Absatz" },
            ]}
            onChange={(value) => update((next) => (next.statute.sentenceStyle = value))}
          />
          <SelectField
            label="Buchstabenstil"
            value={statute.letterStyle}
            options={[
              { value: "Buchst.", label: "Buchst. a" },
              { value: "lit.", label: "lit. a" },
            ]}
            onChange={(value) => update((next) => (next.statute.letterStyle = value))}
          />
          <SelectField
            label="Alternative"
            value={statute.alternativeStyle}
            options={[
              { value: "numberBeforeAbbreviation", label: "1. Alt." },
              { value: "abbreviationBeforeNumber", label: "Alt. 1" },
            ]}
            onChange={(value) => update((next) => (next.statute.alternativeStyle = value))}
          />
          <SelectField
            label="Variante"
            value={statute.variantStyle}
            options={[
              { value: "numberBeforeAbbreviation", label: "1. Var." },
              { value: "abbreviationBeforeNumber", label: "Var. 1" },
            ]}
            onChange={(value) => update((next) => (next.statute.variantStyle = value))}
          />
          <TextField
            label="Mehrfachnorm-Trenner"
            value={statute.separatorBetweenMultipleSections}
            onChange={(value) =>
              update((next) => (next.statute.separatorBetweenMultipleSections = value))
            }
          />
        </div>
        <CheckField
          label="Abstand zwischen § und Normnummer"
          checked={statute.spaceBetweenUnitAndSection}
          onChange={(value) => update((next) => (next.statute.spaceBetweenUnitAndSection = value))}
        />
        <p className={styles.help}>
          Die Ausgaben für f. und ff. werden getrennt unter Abkürzungen gepflegt.
        </p>
      </section>
    );
  }

  if (props.section === "CASE_LAW") {
    const caseLaw = props.profile.caseLaw;
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Rechtsprechung</h2>
        <div className={styles.grid}>
          <TextField
            label="Urteil"
            value={caseLaw.decisionTypeOutput.JUDGMENT}
            onChange={(value) =>
              update((next) => (next.caseLaw.decisionTypeOutput.JUDGMENT = value))
            }
          />
          <TextField
            label="Beschluss"
            value={caseLaw.decisionTypeOutput.ORDER}
            onChange={(value) => update((next) => (next.caseLaw.decisionTypeOutput.ORDER = value))}
          />
          <TextField
            label="Entscheidung"
            value={caseLaw.decisionTypeOutput.DECISION}
            onChange={(value) =>
              update((next) => (next.caseLaw.decisionTypeOutput.DECISION = value))
            }
          />
          <TextField
            label="Datumseinleiter"
            value={caseLaw.dateIntroducer}
            onChange={(value) => update((next) => (next.caseLaw.dateIntroducer = value))}
          />
          <SelectField
            label="Datumsformat"
            value={caseLaw.dateFormat}
            options={
              ["DD.MM.YYYY", "D.M.YYYY", "DD.MM.YY", "D.M.YY"].map((value) => ({
                value,
                label: value,
              })) as Array<Option<typeof caseLaw.dateFormat>>
            }
            onChange={(value) => update((next) => (next.caseLaw.dateFormat = value))}
          />
        </div>
        <div className={styles.subsection}>
          <h3 className={styles.subsectionTitle}>Direktzitat</h3>
          <CheckField
            label="Gericht anzeigen"
            checked={caseLaw.directCitation.includeCourt}
            onChange={(value) =>
              update((next) => (next.caseLaw.directCitation.includeCourt = value))
            }
          />
          <CheckField
            label="Entscheidungsart anzeigen"
            checked={caseLaw.directCitation.includeDecisionType}
            onChange={(value) =>
              update((next) => (next.caseLaw.directCitation.includeDecisionType = value))
            }
          />
          <CheckField
            label="Datum anzeigen"
            checked={caseLaw.directCitation.includeDate}
            onChange={(value) =>
              update((next) => (next.caseLaw.directCitation.includeDate = value))
            }
          />
          <CheckField
            label="Aktenzeichen anzeigen"
            checked={caseLaw.directCitation.includeDocketNumber}
            onChange={(value) =>
              update((next) => (next.caseLaw.directCitation.includeDocketNumber = value))
            }
          />
          <TextField
            label="Separator vor Aktenzeichen"
            value={caseLaw.directCitation.separatorBeforeDocket}
            onChange={(value) =>
              update((next) => (next.caseLaw.directCitation.separatorBeforeDocket = value))
            }
          />
        </div>
        <div className={styles.grid}>
          <SelectField
            label="Journal-Fundstelle"
            value={caseLaw.journalCitation.pinpointStyle}
            options={pinpointOptions}
            onChange={(value) =>
              update((next) => (next.caseLaw.journalCitation.pinpointStyle = value))
            }
          />
          <SelectField
            label="Amtliche Sammlung"
            value={caseLaw.officialCollectionCitation.pinpointStyle}
            options={pinpointOptions}
            onChange={(value) =>
              update((next) => (next.caseLaw.officialCollectionCitation.pinpointStyle = value))
            }
          />
          <TextField
            label="Parallelfundstellen-Trenner"
            value={caseLaw.hybridCitation.parallelCitationSeparator}
            onChange={(value) =>
              update((next) => (next.caseLaw.hybridCitation.parallelCitationSeparator = value))
            }
          />
        </div>
        <CheckField
          label="Gericht bei Journalfundstelle anzeigen"
          checked={caseLaw.journalCitation.includeCourt}
          onChange={(value) =>
            update((next) => (next.caseLaw.journalCitation.includeCourt = value))
          }
        />
        <CheckField
          label="Gericht bei Datenbankfundstelle anzeigen, wenn vorhanden"
          checked={caseLaw.databaseCitation.includeCourtWhenAvailable}
          onChange={(value) =>
            update((next) => (next.caseLaw.databaseCitation.includeCourtWhenAvailable = value))
          }
        />
      </section>
    );
  }

  if (props.section === "COMMENTARY") {
    const commentary = props.profile.commentary;
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Kommentare</h2>
        <div className={styles.grid}>
          <TextField
            label="Personentrenner"
            value={commentary.personSeparator}
            onChange={(value) => update((next) => (next.commentary.personSeparator = value))}
          />
          <TextField
            label="Randnummer-Abkürzung"
            value={commentary.marginNumberAbbreviation}
            onChange={(value) =>
              update((next) => (next.commentary.marginNumberAbbreviation = value))
            }
          />
        </div>
        <CheckField
          label="Herausgeber anzeigen, wenn vorhanden"
          checked={commentary.includeEditorsWhenPresent}
          onChange={(value) =>
            update((next) => (next.commentary.includeEditorsWhenPresent = value))
          }
        />
        <CheckField
          label="Auflage anzeigen, wenn vorhanden"
          checked={commentary.includeEditionWhenPresent}
          onChange={(value) =>
            update((next) => (next.commentary.includeEditionWhenPresent = value))
          }
        />
        <CheckField
          label="Jahr anzeigen, wenn vorhanden"
          checked={commentary.includeYearWhenPresent}
          onChange={(value) => update((next) => (next.commentary.includeYearWhenPresent = value))}
        />
        <CheckField
          label="Band anzeigen, wenn vorhanden"
          checked={commentary.includeVolumeWhenPresent}
          onChange={(value) => update((next) => (next.commentary.includeVolumeWhenPresent = value))}
        />
        <CheckField
          label="Bevorzugten Werknamen verwenden"
          checked={commentary.usePreferredWorkName}
          onChange={(value) => update((next) => (next.commentary.usePreferredWorkName = value))}
        />
        <CheckField
          label="Gesetzeseinstellungen übernehmen"
          checked={commentary.inheritStatuteSettings}
          onChange={(value) => update((next) => (next.commentary.inheritStatuteSettings = value))}
        />
        <StyleEditor
          title="Bearbeiter-Formatierung"
          value={commentary.bearbeiterFormatting}
          onChange={(value) => update((next) => (next.commentary.bearbeiterFormatting = value))}
        />
        <StyleEditor
          title="Herausgeber-Formatierung"
          value={commentary.editorFormatting}
          onChange={(value) => update((next) => (next.commentary.editorFormatting = value))}
        />
      </section>
    );
  }

  if (props.section === "BOOK") {
    const book = props.profile.book;
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Bücher</h2>
        <div className={styles.grid}>
          <TextField
            label="Personentrenner"
            value={book.personSeparator}
            onChange={(value) => update((next) => (next.book.personSeparator = value))}
          />
          <TextField
            label="Randnummer-Abkürzung"
            value={book.marginNumberAbbreviation}
            onChange={(value) => update((next) => (next.book.marginNumberAbbreviation = value))}
          />
          <TextField
            label="Seiten-Abkürzung"
            value={book.pageAbbreviation}
            onChange={(value) => update((next) => (next.book.pageAbbreviation = value))}
          />
          <TextField label="Werkabschnitt" value="§" readOnly onChange={() => undefined} />
        </div>
        <CheckField
          label="Kurztitel verwenden, wenn vorhanden"
          checked={book.useShortTitleWhenAvailable}
          onChange={(value) => update((next) => (next.book.useShortTitleWhenAvailable = value))}
        />
        <CheckField
          label="Auflage anzeigen"
          checked={book.includeEditionWhenPresent}
          onChange={(value) => update((next) => (next.book.includeEditionWhenPresent = value))}
        />
        <CheckField
          label="Jahr anzeigen"
          checked={book.includeYearWhenPresent}
          onChange={(value) => update((next) => (next.book.includeYearWhenPresent = value))}
        />
        <CheckField
          label="Ort anzeigen"
          checked={book.includePlaceWhenPresent}
          onChange={(value) => update((next) => (next.book.includePlaceWhenPresent = value))}
        />
        <CheckField
          label="Verlag anzeigen"
          checked={book.includePublisherWhenPresent}
          onChange={(value) => update((next) => (next.book.includePublisherWhenPresent = value))}
        />
        <CheckField
          label="Band anzeigen"
          checked={book.includeVolumeWhenPresent}
          onChange={(value) => update((next) => (next.book.includeVolumeWhenPresent = value))}
        />
        <StyleEditor
          title="Autorformatierung"
          value={book.authorFormatting}
          onChange={(value) => update((next) => (next.book.authorFormatting = value))}
        />
      </section>
    );
  }

  if (props.section === "JOURNAL_ARTICLE") {
    const journal = props.profile.journalArticle;
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Zeitschriftenaufsätze</h2>
        <TextField
          label="Personentrenner"
          value={journal.personSeparator}
          onChange={(value) => update((next) => (next.journalArticle.personSeparator = value))}
        />
        <CheckField
          label="Zeitschriftenabkürzung verwenden"
          checked={journal.useJournalAbbreviation}
          onChange={(value) =>
            update((next) => (next.journalArticle.useJournalAbbreviation = value))
          }
        />
        <CheckField
          label="Jahr anzeigen"
          checked={journal.includeYear}
          onChange={(value) => update((next) => (next.journalArticle.includeYear = value))}
        />
        <CheckField
          label="Anfangsseite anzeigen"
          checked={journal.includeFirstPage}
          onChange={(value) => update((next) => (next.journalArticle.includeFirstPage = value))}
        />
        <SelectField
          label="Konkrete Fundstelle"
          value={journal.pinpointStyle}
          options={pinpointOptions}
          onChange={(value) => update((next) => (next.journalArticle.pinpointStyle = value))}
        />
        <CheckField
          label="f. / ff. erhalten"
          checked={journal.preserveFollowingSuffix}
          onChange={(value) =>
            update((next) => (next.journalArticle.preserveFollowingSuffix = value))
          }
        />
        <StyleEditor
          title="Autorformatierung"
          value={journal.authorFormatting}
          onChange={(value) => update((next) => (next.journalArticle.authorFormatting = value))}
        />
      </section>
    );
  }

  if (props.section === "OTHER_TYPES") {
    const chapter = props.profile.bookChapter;
    const note = props.profile.caseNote;
    const legislative = props.profile.legislativeMaterial;
    const online = props.profile.onlineSource;
    const administrative = props.profile.administrativeMaterial;
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Weitere Quellentypen</h2>
        <details open className={styles.card}>
          <summary className={styles.cardTitle}>Buchbeitrag</summary>
          <div className={styles.subsection}>
            <TextField
              label="Personentrenner"
              value={chapter.personSeparator}
              onChange={(value) => update((next) => (next.bookChapter.personSeparator = value))}
            />
            <TextField
              label="in-Token"
              value={chapter.inToken}
              onChange={(value) => update((next) => (next.bookChapter.inToken = value))}
            />
            <TextField
              label="Seiten-Abkürzung"
              value={chapter.pageAbbreviation}
              onChange={(value) => update((next) => (next.bookChapter.pageAbbreviation = value))}
            />
            <SelectField
              label="Fundstellenstil"
              value={chapter.pinpointStyle}
              options={[...pinpointOptions, { value: "pagePrefix", label: "Seitenpräfix" }]}
              onChange={(value) => update((next) => (next.bookChapter.pinpointStyle = value))}
            />
            <CheckField
              label="Herausgeber anzeigen"
              checked={chapter.includeEditorsWhenPresent}
              onChange={(value) =>
                update((next) => (next.bookChapter.includeEditorsWhenPresent = value))
              }
            />
            <CheckField
              label="Auflage anzeigen"
              checked={chapter.includeEditionWhenPresent}
              onChange={(value) =>
                update((next) => (next.bookChapter.includeEditionWhenPresent = value))
              }
            />
            <CheckField
              label="Jahr anzeigen"
              checked={chapter.includeYearWhenPresent}
              onChange={(value) =>
                update((next) => (next.bookChapter.includeYearWhenPresent = value))
              }
            />
            <StyleEditor
              title="Autorformatierung"
              value={chapter.authorFormatting}
              onChange={(value) => update((next) => (next.bookChapter.authorFormatting = value))}
            />
            <StyleEditor
              title="Herausgeberformatierung"
              value={chapter.editorFormatting}
              onChange={(value) => update((next) => (next.bookChapter.editorFormatting = value))}
            />
          </div>
        </details>
        <details className={styles.card}>
          <summary className={styles.cardTitle}>Anmerkung</summary>
          <div className={styles.subsection}>
            <TextField
              label="Personentrenner"
              value={note.personSeparator}
              onChange={(value) => update((next) => (next.caseNote.personSeparator = value))}
            />
            <TextField
              label="Bevorzugter Marker"
              value={note.preferredNoteMarker}
              onChange={(value) => update((next) => (next.caseNote.preferredNoteMarker = value))}
            />
            <SelectField
              label="Journal-Fundstelle"
              value={note.journalPinpointStyle}
              options={pinpointOptions}
              onChange={(value) => update((next) => (next.caseNote.journalPinpointStyle = value))}
            />
            <StyleEditor
              title="Autorformatierung"
              value={note.authorFormatting}
              onChange={(value) => update((next) => (next.caseNote.authorFormatting = value))}
            />
          </div>
        </details>
        <details className={styles.card}>
          <summary className={styles.cardTitle}>Gesetzgebungsmaterial</summary>
          <div className={styles.subsection}>
            <TextField
              label="Bundestag-Präfix"
              value={legislative.BundestagDocumentPrefix}
              onChange={(value) =>
                update((next) => (next.legislativeMaterial.BundestagDocumentPrefix = value))
              }
            />
            <TextField
              label="Bundesrat-Präfix"
              value={legislative.BundesratDocumentPrefix}
              onChange={(value) =>
                update((next) => (next.legislativeMaterial.BundesratDocumentPrefix = value))
              }
            />
            <TextField
              label="Seiten-Abkürzung"
              value={legislative.pageAbbreviation}
              onChange={(value) =>
                update((next) => (next.legislativeMaterial.pageAbbreviation = value))
              }
            />
            <CheckField
              label="Seitenpräfix anzeigen"
              checked={legislative.includePagePrefix}
              onChange={(value) =>
                update((next) => (next.legislativeMaterial.includePagePrefix = value))
              }
            />
          </div>
        </details>
        <details className={styles.card}>
          <summary className={styles.cardTitle}>Onlinequelle</summary>
          <div className={styles.subsection}>
            <CheckField
              label="Organisation anzeigen"
              checked={online.includeOrganizationWhenPresent}
              onChange={(value) =>
                update((next) => (next.onlineSource.includeOrganizationWhenPresent = value))
              }
            />
            <CheckField
              label="Titel anzeigen"
              checked={online.includeTitleWhenPresent}
              onChange={(value) =>
                update((next) => (next.onlineSource.includeTitleWhenPresent = value))
              }
            />
            <CheckField
              label="URL anzeigen"
              checked={online.includeUrl}
              onChange={(value) => update((next) => (next.onlineSource.includeUrl = value))}
            />
            <CheckField
              label="Abrufdatum anzeigen"
              checked={online.includeAccessDateWhenPresent}
              onChange={(value) =>
                update((next) => (next.onlineSource.includeAccessDateWhenPresent = value))
              }
            />
            <TextField
              label="Abrufdatum-Label"
              value={online.accessDateLabel}
              onChange={(value) => update((next) => (next.onlineSource.accessDateLabel = value))}
            />
            <SelectField
              label="Datumsformat"
              value={online.dateFormat}
              options={[
                { value: "DD.MM.YYYY", label: "DD.MM.YYYY" },
                { value: "D.M.YYYY", label: "D.M.YYYY" },
              ]}
              onChange={(value) => update((next) => (next.onlineSource.dateFormat = value))}
            />
          </div>
        </details>
        <details className={styles.card}>
          <summary className={styles.cardTitle}>Verwaltungsmaterial</summary>
          <div className={styles.subsection}>
            <CheckField
              label="Behörde anzeigen"
              checked={administrative.includeAuthority}
              onChange={(value) =>
                update((next) => (next.administrativeMaterial.includeAuthority = value))
              }
            />
            <CheckField
              label="Dokumenttyp anzeigen"
              checked={administrative.includeDocumentType}
              onChange={(value) =>
                update((next) => (next.administrativeMaterial.includeDocumentType = value))
              }
            />
            <CheckField
              label="Datum anzeigen"
              checked={administrative.includeDate}
              onChange={(value) =>
                update((next) => (next.administrativeMaterial.includeDate = value))
              }
            />
            <CheckField
              label="Aktenzeichen anzeigen"
              checked={administrative.includeFileNumber}
              onChange={(value) =>
                update((next) => (next.administrativeMaterial.includeFileNumber = value))
              }
            />
            <TextField
              label="Datumseinleiter"
              value={administrative.dateIntroducer}
              onChange={(value) =>
                update((next) => (next.administrativeMaterial.dateIntroducer = value))
              }
            />
            <SelectField
              label="Datumsformat"
              value={administrative.dateFormat}
              options={[
                { value: "DD.MM.YYYY", label: "DD.MM.YYYY" },
                { value: "D.M.YYYY", label: "D.M.YYYY" },
              ]}
              onChange={(value) =>
                update((next) => (next.administrativeMaterial.dateFormat = value))
              }
            />
          </div>
        </details>
      </section>
    );
  }

  if (props.section === "ABBREVIATIONS") {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Abkürzungen</h2>
        {(Object.keys(props.profile.abbreviations) as CitationAbbreviationConcept[]).map(
          (concept) => {
            const preference = props.profile.abbreviations[concept];
            return (
              <details className={styles.card} key={concept}>
                <summary className={styles.cardTitle}>{ABBREVIATION_LABELS[concept]}</summary>
                <div className={styles.subsection}>
                  <TextField
                    label="Bevorzugte Ausgabe"
                    value={preference.preferredOutput}
                    error={
                      preference.preferredOutput.trim()
                        ? undefined
                        : "Bevorzugte Ausgabe darf nicht leer sein."
                    }
                    onChange={(value) =>
                      update((next) => (next.abbreviations[concept].preferredOutput = value))
                    }
                  />
                  <VariantEditor
                    variants={preference.recognizedVariants}
                    onAdd={(value) => {
                      const result = addAbbreviationVariant(props.profile, concept, value);
                      if (result.success) props.onChange(result.value);
                      return result.error;
                    }}
                    onRemove={(index) =>
                      props.onChange(removeAbbreviationVariant(props.profile, concept, index))
                    }
                  />
                </div>
              </details>
            );
          }
        )}
        <div className={styles.subsection}>
          <h2 className={styles.sectionTitle}>Zitationszusätze</h2>
          <p className={styles.help}>
            Modifier bleiben getrennt von f. und ff.; diese gehören weiterhin zu den Abkürzungen.
          </p>
          {(Object.keys(props.profile.modifiers) as CitationModifierConcept[]).map((concept) => {
            const preference = props.profile.modifiers[concept];
            return (
              <details className={styles.card} key={concept}>
                <summary className={styles.cardTitle}>{MODIFIER_LABELS[concept]}</summary>
                <div className={styles.subsection}>
                  <TextField
                    label="Semantisches Konzept"
                    value={preference.normalizedConcept}
                    readOnly
                    onChange={() => undefined}
                  />
                  <TextField
                    label="Bevorzugte Ausgabe"
                    value={preference.preferredOutput}
                    error={
                      preference.preferredOutput.trim()
                        ? undefined
                        : "Bevorzugte Ausgabe darf nicht leer sein."
                    }
                    onChange={(value) =>
                      update((next) => (next.modifiers[concept].preferredOutput = value))
                    }
                  />
                  <VariantEditor
                    variants={preference.recognizedVariants}
                    onAdd={(value) => {
                      const result = addModifierVariant(props.profile, concept, value);
                      if (result.success) props.onChange(result.value);
                      return result.error;
                    }}
                    onRemove={(index) =>
                      props.onChange(removeModifierVariant(props.profile, concept, index))
                    }
                  />
                </div>
              </details>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Rollenbezogene Formatierung</h2>
      <StyleEditor
        title="Autor"
        value={props.profile.formatting.author}
        onChange={(value) => update((next) => (next.formatting.author = value))}
      />
      <StyleEditor
        title="Bearbeiter"
        value={props.profile.formatting.bearbeiter}
        onChange={(value) => update((next) => (next.formatting.bearbeiter = value))}
      />
      <StyleEditor
        title="Herausgeber"
        value={props.profile.formatting.editor}
        onChange={(value) => update((next) => (next.formatting.editor = value))}
      />
      <StyleEditor
        title="Werktitel"
        value={props.profile.formatting.workTitle}
        onChange={(value) => update((next) => (next.formatting.workTitle = value))}
      />
    </section>
  );
}

function AliasAdder(props: { onAdd(alias: string): string | undefined }) {
  const styles = useStyles();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  return (
    <div className={styles.field}>
      <span className={styles.label}>Neuen Alias hinzufügen</span>
      <div className={styles.actionBar}>
        <input
          className={styles.input}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button
          size="small"
          onClick={() => {
            const nextError = props.onAdd(value);
            setError(nextError ?? "");
            if (!nextError) setValue("");
          }}
        >
          Alias hinzufügen
        </Button>
      </div>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}

function WorkOverrideEditor(props: {
  source: CitationSourceMaster;
  onChange(override: CitationSourceMaster["workOverride"]): void;
}) {
  const styles = useStyles();
  if (props.source.kind === "COMMENTARY") {
    const override = props.source.workOverride as WorkCitationOverride<"COMMENTARY">;
    const setItalic = (role: "bearbeiter" | "editor", value: "inherit" | "true" | "false") => {
      const formatting = { ...override.formatting };
      if (value === "inherit") delete formatting[role];
      else formatting[role] = { ...formatting[role], italic: value === "true" };
      props.onChange({ ...override, formatting });
    };
    const setTextOverride = (
      property: "personSeparator" | "marginNumberAbbreviation",
      value: string
    ) => {
      const settings = { ...override.citationSettingsOverride };
      if (value === "") delete settings[property];
      else settings[property] = value;
      props.onChange({ ...override, citationSettingsOverride: settings });
    };
    return (
      <div className={styles.subsection}>
        <h4 className={styles.subsectionTitle}>Werk-spezifische Overrides</h4>
        <p className={styles.help}>
          Werk-spezifische Einstellungen überschreiben die allgemeinen Einstellungen dieses
          Quellentyps. Wenn keine werksspezifische Einstellung gesetzt ist, gilt die allgemeine
          Einstellung für diesen Quellentyp.
        </p>
        <TextField
          label="Bevorzugter Werkname"
          value={override.preferredName ?? ""}
          onChange={(value) => props.onChange({ ...override, preferredName: value || undefined })}
        />
        <SelectField
          label="Bearbeiter kursiv"
          value={
            override.formatting?.bearbeiter?.italic === undefined
              ? "inherit"
              : (String(override.formatting.bearbeiter.italic) as "true" | "false")
          }
          options={[
            { value: "inherit", label: "Allgemeine Einstellung verwenden" },
            { value: "true", label: "Ja" },
            { value: "false", label: "Nein" },
          ]}
          onChange={(value) => setItalic("bearbeiter", value)}
        />
        <SelectField
          label="Herausgeber kursiv"
          value={
            override.formatting?.editor?.italic === undefined
              ? "inherit"
              : (String(override.formatting.editor.italic) as "true" | "false")
          }
          options={[
            { value: "inherit", label: "Allgemeine Einstellung verwenden" },
            { value: "true", label: "Ja" },
            { value: "false", label: "Nein" },
          ]}
          onChange={(value) => setItalic("editor", value)}
        />
        <TextField
          label="Personentrenner-Override"
          value={override.citationSettingsOverride?.personSeparator ?? ""}
          onChange={(value) => setTextOverride("personSeparator", value)}
        />
        <TextField
          label="Randnummer-Abkürzung-Override"
          value={override.citationSettingsOverride?.marginNumberAbbreviation ?? ""}
          onChange={(value) => setTextOverride("marginNumberAbbreviation", value)}
        />
      </div>
    );
  }
  const override = props.source.workOverride as WorkCitationOverride<"JOURNAL_ARTICLE">;
  return (
    <div className={styles.subsection}>
      <h4 className={styles.subsectionTitle}>Zeitschriften-spezifische Overrides</h4>
      <p className={styles.help}>
        Werk-spezifische Einstellungen überschreiben die allgemeinen Einstellungen dieses
        Quellentyps. Wenn keine werksspezifische Einstellung gesetzt ist, gilt die allgemeine
        Einstellung für diesen Quellentyp.
      </p>
      <TextField
        label="Bevorzugter Name"
        value={override.preferredName ?? ""}
        onChange={(value) => props.onChange({ ...override, preferredName: value || undefined })}
      />
      <SelectField
        label="Fundstellenstil-Override"
        value={override.citationSettingsOverride?.pinpointStyle ?? "inherit"}
        options={[
          { value: "inherit", label: "Allgemeine Einstellung verwenden" },
          { value: "parentheses", label: "Klammern" },
          { value: "comma", label: "Komma" },
        ]}
        onChange={(value) =>
          props.onChange({
            ...override,
            citationSettingsOverride: value === "inherit" ? {} : { pinpointStyle: value },
          })
        }
      />
    </div>
  );
}

function SourceEditor(props: {
  source: CitationSourceMaster;
  mapping: CitationSourceMappingData;
  conflicts: AliasConflict[];
  onChange(mapping: CitationSourceMappingData): void;
}) {
  const styles = useStyles();
  const [removeConfirmation, setRemoveConfirmation] = useState(false);
  const aliases = props.mapping.aliases
    .map((alias, index) => ({ alias, index }))
    .filter(({ alias }) => alias.canonicalSourceId === props.source.canonicalSourceId);
  const sourceConflicts = props.conflicts.filter((conflict) =>
    conflict.canonicalSourceIds.includes(props.source.canonicalSourceId)
  );
  const update = (changes: Parameters<typeof updateCitationSource>[2]) =>
    props.onChange(updateCitationSource(props.mapping, props.source.canonicalSourceId, changes));
  return (
    <details className={styles.card}>
      <summary>
        <span className={styles.cardTitle}>{props.source.preferredName}</span>
        <span className={styles.badge}>{sourceKindLabel(props.source.kind)}</span>
        <span className={styles.badge}>{props.source.legalArea}</span>
        <span className={styles.badge}>{aliases.length} Aliase</span>
        <span className={styles.badge}>
          {props.source.sourceOrigin === "DEFAULT"
            ? "Standardquelle"
            : props.source.sourceOrigin === "IMPORTED"
              ? "Importiert"
              : "Benutzerquelle"}
        </span>
        {sourceConflicts.length > 0 && (
          <span className={styles.badge}>
            {sourceConflicts.length} Alias-Konflikt
            {sourceConflicts.length === 1 ? "" : "e"}
          </span>
        )}
        {!props.source.active && <span className={styles.badge}>Inaktiv</span>}
        {aliases.some(({ alias }) => alias.legacySafetyLevel === "UNCERTAIN") && (
          <span className={styles.badge}>Altdaten: Unsicher</span>
        )}
      </summary>
      <div className={styles.subsection}>
        <TextField
          label="Kanonische Quellen-ID"
          value={props.source.canonicalSourceId}
          readOnly
          onChange={() => undefined}
        />
        <TextField
          label="Bevorzugter Name"
          value={props.source.preferredName}
          onChange={(preferredName) => update({ preferredName })}
          error={
            props.source.preferredName.trim() ? undefined : "Bevorzugter Name darf nicht leer sein."
          }
        />
        <div className={styles.grid}>
          <SelectField
            label="Art"
            value={props.source.kind}
            options={SOURCE_KIND_OPTIONS}
            onChange={(kind) => update({ kind })}
          />
          <SelectField
            label="Rechtsgebiet"
            value={props.source.legalArea}
            options={
              LEGAL_AREA_OPTIONS.filter((option) => option.value !== "ALL") as Array<
                Option<CitationSourceLegalArea>
              >
            }
            onChange={(legalArea) => update({ legalArea })}
          />
        </div>
        {props.source.kind === "COMMENTARY" && (
          <TextField
            label="Kommentiertes Gesetz"
            value={props.source.commentedLaw ?? ""}
            onChange={(commentedLaw) => update({ commentedLaw: commentedLaw || undefined })}
          />
        )}
        <CheckField
          label="Quelle aktiv"
          checked={props.source.active}
          onChange={(active) => update({ active })}
        />
        {props.source.kind === "COMMENTARY" && (
          <SelectField
            label="Personenstruktur-Hinweis"
            value={props.source.personStructureHint ?? "UNKNOWN"}
            options={PERSON_HINT_OPTIONS}
            onChange={(personStructureHint) => update({ personStructureHint })}
          />
        )}
        {props.source.kind === "COMMENTARY" && (
          <p className={styles.help}>
            Der Hinweis unterstützt spätere Regeln, entscheidet aber nicht automatisch über die
            tatsächliche Personenrolle im Zitat.
          </p>
        )}
        {isCustomSourceKind(props.source.kind) && (
          <>
            <p className={styles.help}>
              Benutzerdefinierte Quellen können über einen eindeutigen Namen oder Marker erkannt
              werden. Verwenden Sie möglichst spezifische Bezeichnungen, um Fehlzuordnungen zu
              vermeiden.
            </p>
            <TextField
              label="Bevorzugte vollständige Zitierform"
              value={props.source.preferredCitationText ?? ""}
              placeholder="z. B. Gabriel, Digitale Plattformen: Grundlagen und Erscheinungsformen, Forschungsbericht Nr. 16, S. 40."
              helpText="Optional. Wenn angegeben, kann die vollständige Zitierform direkt mit dem Zitat verglichen werden."
              onChange={(preferredCitationText) =>
                update({ preferredCitationText: preferredCitationText || undefined })
              }
            />
          </>
        )}
        <TextField
          label="Beispiel-Sollmuster"
          value={props.source.examplePattern ?? ""}
          placeholder={
            props.source.kind === "COMMENTARY"
              ? "z. B. MüKoStGB/Bearbeiter, § 263 Rn. 12."
              : "z. B. Autor, NJW 2025, 1234 (1236)."
          }
          helpText="Optionales Beispiel dafür, wie die Quelle typischerweise zitiert werden soll."
          onChange={(examplePattern) => update({ examplePattern: examplePattern || undefined })}
        />
        <TextField
          label="Hinweise"
          value={props.source.notes ?? ""}
          multiline
          onChange={(notes) => update({ notes: notes || undefined })}
        />
        {(props.source.kind === "COMMENTARY" || props.source.kind === "JOURNAL") && (
          <WorkOverrideEditor
            source={props.source}
            onChange={(workOverride) => update({ workOverride })}
          />
        )}
        <div className={styles.subsection}>
          <h4 className={styles.subsectionTitle}>Aliase</h4>
          {aliases.map(({ alias, index }) => (
            <div className={styles.card} key={`${alias.legacyMappingId ?? "user"}-${index}`}>
              <TextField
                label="Aliastext"
                value={alias.alias}
                onChange={(value) =>
                  props.onChange(updateCitationSourceAlias(props.mapping, index, { alias: value }))
                }
                error={alias.alias.trim() ? undefined : "Aliastext darf nicht leer sein."}
              />
              {sourceConflicts
                .filter(
                  (conflict) =>
                    conflict.normalizedAlias === normalizeCitationSourceText(alias.alias)
                )
                .map((conflict) => {
                  const otherSources = conflict.canonicalSourceIds
                    .filter((sourceId) => sourceId !== props.source.canonicalSourceId)
                    .map(
                      (sourceId) =>
                        props.mapping.sources.find(
                          (source) => source.canonicalSourceId === sourceId
                        )?.preferredName ?? sourceId
                    );
                  return (
                    <p className={styles.warning} key={conflict.normalizedAlias}>
                      Alias-Konflikt: „{alias.alias}“ wird auch von „{otherSources.join("“, „")}“
                      verwendet. Der Resolver behandelt diesen Alias als mehrdeutig.
                    </p>
                  );
                })}
              <div className={styles.grid}>
                <SelectField
                  label="Abgleichsmodus"
                  value={alias.matchMode}
                  options={[
                    { value: "CASE_INSENSITIVE_TEXT", label: "Exakter Alias" },
                    ...(isCustomSourceKind(props.source.kind)
                      ? [{ value: "WHOLE_WORD_MARKER" as const, label: "Ganzwort-Marker im Zitat" }]
                      : []),
                  ]}
                  onChange={(matchMode) =>
                    props.onChange(updateCitationSourceAlias(props.mapping, index, { matchMode }))
                  }
                />
                <CheckField
                  label="Aktiv"
                  checked={alias.active}
                  onChange={(active) =>
                    props.onChange(updateCitationSourceAlias(props.mapping, index, { active }))
                  }
                />
                <CheckField
                  label="Ganzwortsuche"
                  checked={alias.wholeWord}
                  onChange={(wholeWord) =>
                    props.onChange(updateCitationSourceAlias(props.mapping, index, { wholeWord }))
                  }
                />
                <SelectField
                  label="Altdaten-Sicherheit"
                  value={alias.legacySafetyLevel ?? "PROBABLE"}
                  options={[
                    { value: "PROBABLE", label: "Wahrscheinlich" },
                    { value: "UNCERTAIN", label: "Unsicher" },
                  ]}
                  onChange={(legacySafetyLevel) =>
                    props.onChange(
                      updateCitationSourceAlias(props.mapping, index, { legacySafetyLevel })
                    )
                  }
                />
              </div>
              <p className={styles.help}>
                Match Mode:{" "}
                {alias.matchMode === "WHOLE_WORD_MARKER"
                  ? "Ganzwort-Marker im Zitat"
                  : "Exakter Alias"}{" "}
                · Ursprung: {alias.legacyMappingId ? "Altdaten" : "Benutzer"}
              </p>
              {alias.legacyMappingId && (
                <p className={styles.help}>Altdaten-Mapping-ID: {alias.legacyMappingId}</p>
              )}
              {alias.notes && <p className={styles.help}>{alias.notes}</p>}
              {alias.legacyMappingId ? (
                <Button
                  size="small"
                  onClick={() =>
                    props.onChange(
                      updateCitationSourceAlias(props.mapping, index, { active: false })
                    )
                  }
                >
                  Altdaten-Alias deaktivieren
                </Button>
              ) : (
                <Button
                  size="small"
                  onClick={() => {
                    const result = removeUserCitationSourceAlias(props.mapping, index);
                    if (result.success) props.onChange(result.value);
                  }}
                >
                  Benutzer-Alias entfernen
                </Button>
              )}
            </div>
          ))}
          <AliasAdder
            onAdd={(alias) => {
              const result = addCitationSourceAlias(
                props.mapping,
                props.source.canonicalSourceId,
                alias
              );
              if (result.success) props.onChange(result.value);
              return result.error;
            }}
          />
        </div>
        <div className={styles.subsection}>
          <Button onClick={() => setRemoveConfirmation(true)}>Quelle entfernen</Button>
          {removeConfirmation && (
            <div className={styles.dialog} role="dialog" aria-label="Quelle wirklich entfernen?">
              <strong>Quelle wirklich entfernen?</strong>
              <p className={styles.help}>
                {props.source.preferredName} mit {aliases.length}{" "}
                {aliases.length === 1 ? "Alias" : "Aliasen"} wird dauerhaft aus der Arbeitskopie
                entfernt.
              </p>
              {props.source.sourceOrigin === "DEFAULT" && (
                <p className={styles.warning}>
                  Diese Quelle stammt aus dem Standard-Mapping. Sie kann später über
                  „Standardquellen wiederherstellen“ erneut hinzugefügt werden.
                </p>
              )}
              <div className={styles.actionBar}>
                <Button
                  appearance="primary"
                  onClick={() => {
                    const result = removeCitationSource(
                      props.mapping,
                      props.source.canonicalSourceId
                    );
                    if (result.success) props.onChange(result.value);
                  }}
                >
                  Entfernen
                </Button>
                <Button onClick={() => setRemoveConfirmation(false)}>Abbrechen</Button>
              </div>
            </div>
          )}
        </div>
        {props.source.legacyMetadata && (
          <details>
            <summary>Altdaten-Metadaten</summary>
            <p className={styles.help}>
              Werktyp: {props.source.legacyMetadata.legacyWorkType ?? "–"}
            </p>
            <p className={styles.help}>
              Rechtsgebiet: {props.source.legacyMetadata.legacyLegalArea ?? "–"}
            </p>
            <p className={styles.help}>
              Versionen: {props.source.legacyMetadata.legacyVersions.join(", ") || "–"}
            </p>
            <p className={styles.help}>
              Stände: {props.source.legacyMetadata.legacyDates.join(", ") || "–"}
            </p>
          </details>
        )}
      </div>
    </details>
  );
}

function NewSourceEditor(props: {
  mapping: CitationSourceMappingData;
  onChange(mapping: CitationSourceMappingData): void;
}) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState<NewCitationSourceInput>({
    preferredName: "",
    kind: "COMMENTARY",
    legalArea: "UNKNOWN",
    personStructureHint: "UNKNOWN",
  });
  if (!open) return <Button onClick={() => setOpen(true)}>Quelle hinzufügen</Button>;
  return (
    <div className={styles.card}>
      <h3 className={styles.subsectionTitle}>Neue Quelle</h3>
      <TextField
        label="Bevorzugter Name"
        value={input.preferredName}
        onChange={(preferredName) => setInput({ ...input, preferredName })}
        error={
          error && !input.preferredName.trim() ? "Bevorzugter Name darf nicht leer sein." : undefined
        }
      />
      <SelectField
        label="Art"
        value={input.kind}
        options={SOURCE_KIND_OPTIONS}
        onChange={(kind) => setInput({ ...input, kind })}
      />
      <SelectField
        label="Rechtsgebiet"
        value={input.legalArea}
        options={
          LEGAL_AREA_OPTIONS.filter((option) => option.value !== "ALL") as Array<
            Option<CitationSourceLegalArea>
          >
        }
        onChange={(legalArea) => setInput({ ...input, legalArea })}
      />
      {input.kind === "COMMENTARY" && (
        <TextField
          label="Kommentiertes Gesetz"
          value={input.commentedLaw ?? ""}
          onChange={(commentedLaw) => setInput({ ...input, commentedLaw })}
        />
      )}
      {input.kind === "COMMENTARY" && (
        <SelectField
          label="Personenstruktur-Hinweis"
          value={input.personStructureHint ?? "UNKNOWN"}
          options={PERSON_HINT_OPTIONS}
          onChange={(personStructureHint) => setInput({ ...input, personStructureHint })}
        />
      )}
      {isCustomSourceKind(input.kind) && (
        <>
          <p className={styles.help}>
            Benutzerdefinierte Quellen können über einen eindeutigen Namen oder Marker erkannt
            werden. Verwenden Sie möglichst spezifische Bezeichnungen, um Fehlzuordnungen zu
            vermeiden.
          </p>
          <TextField
            label="Bevorzugte vollständige Zitierform"
            value={input.preferredCitationText ?? ""}
            placeholder="z. B. Gabriel, Digitale Plattformen: Grundlagen und Erscheinungsformen, Forschungsbericht Nr. 16, S. 40."
            helpText="Optional. Wenn angegeben, kann die vollständige Zitierform direkt mit dem Zitat verglichen werden."
            onChange={(preferredCitationText) => setInput({ ...input, preferredCitationText })}
          />
        </>
      )}
      <TextField
        label="Beispiel-Sollmuster"
        value={input.examplePattern ?? ""}
        placeholder={
          input.kind === "COMMENTARY"
            ? "z. B. MüKoStGB/Bearbeiter, § 263 Rn. 12."
            : "z. B. Autor, NJW 2025, 1234 (1236)."
        }
        helpText="Optionales Beispiel dafür, wie die Quelle typischerweise zitiert werden soll."
        onChange={(examplePattern) => setInput({ ...input, examplePattern })}
      />
      <TextField
        label="Hinweise"
        value={input.notes ?? ""}
        multiline
        onChange={(notes) => setInput({ ...input, notes })}
      />
      {error && <p className={`${styles.message} ${styles.error}`}>{error}</p>}
      <div className={styles.actionBar}>
        <Button
          appearance="primary"
          onClick={() => {
            const result = addCitationSource(props.mapping, input);
            if (result.success) {
              props.onChange(result.value);
              setOpen(false);
              setError("");
            } else setError(result.error ?? "Quelle konnte nicht angelegt werden.");
          }}
        >
          Quelle übernehmen
        </Button>
        <Button
          onClick={() => {
            setOpen(false);
            setError("");
          }}
        >
          Abbrechen
        </Button>
      </div>
    </div>
  );
}

function MappingEditor(props: {
  mapping: CitationSourceMappingData;
  onChange(mapping: CitationSourceMappingData): void;
}) {
  const styles = useStyles();
  const [filters, setFilters] = useState<MappingFilters>(DEFAULT_MAPPING_FILTERS);
  const filtered = useMemo(
    () => filterCitationSources(props.mapping, filters),
    [props.mapping, filters]
  );
  const conflicts = useMemo(() => findAliasConflicts(props.mapping), [props.mapping]);
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Werk- & Zeitschriften-Mapping</h2>
      <div className={styles.summary}>
        <span>Quellen: {props.mapping.sources.length}</span>
        <span>
          Kommentare:{" "}
          {props.mapping.sources.filter((source) => source.kind === "COMMENTARY").length}
        </span>
        <span>
          Zeitschriften:{" "}
          {props.mapping.sources.filter((source) => source.kind === "JOURNAL").length}
        </span>
        <span>Aliase: {props.mapping.aliases.length}</span>
        <span>
          Altdaten unsicher:{" "}
          {props.mapping.aliases.filter((alias) => alias.legacySafetyLevel === "UNCERTAIN").length}
        </span>
      </div>
      <TextField
        type="search"
        label="Suche nach Name, Alias oder ID"
        value={filters.search}
        onChange={(search) => setFilters({ ...filters, search })}
      />
      <div className={styles.grid}>
        <SelectField
          label="Art"
          value={filters.kind}
          options={[
            { value: "ALL", label: "Alle Arten" },
            { value: "COMMENTARY", label: "Kommentar" },
            { value: "JOURNAL", label: "Zeitschrift" },
            { value: "BOOK", label: "Buch / Lehrbuch" },
            { value: "REPORT", label: "Forschungsbericht" },
            { value: "CUSTOM", label: "Sonstige benutzerdefinierte Quelle" },
          ]}
          onChange={(kind) => setFilters({ ...filters, kind })}
        />
        <SelectField
          label="Rechtsgebiet"
          value={filters.legalArea}
          options={LEGAL_AREA_OPTIONS}
          onChange={(legalArea) => setFilters({ ...filters, legalArea })}
        />
        <SelectField
          label="Status"
          value={filters.status}
          options={[
            { value: "ALL", label: "Alle" },
            { value: "ACTIVE", label: "Aktiv" },
            { value: "INACTIVE", label: "Inaktiv" },
          ]}
          onChange={(status) => setFilters({ ...filters, status })}
        />
        <SelectField
          label="Altdaten-Sicherheit"
          value={filters.safety}
          options={[
            { value: "ALL", label: "Alle" },
            { value: "PROBABLE", label: "Wahrscheinlich" },
            { value: "UNCERTAIN", label: "Unsicher" },
          ]}
          onChange={(safety) => setFilters({ ...filters, safety })}
        />
        <SelectField
          label="Personenstruktur"
          value={filters.personStructureHint}
          options={[{ value: "ALL", label: "Alle" }, ...PERSON_HINT_OPTIONS]}
          onChange={(personStructureHint) => setFilters({ ...filters, personStructureHint })}
        />
      </div>
      <NewSourceEditor mapping={props.mapping} onChange={props.onChange} />
      <p className={styles.help}>{filtered.length} Quelle(n) entsprechen der Auswahl.</p>
      {filtered.map((source) => (
        <SourceEditor
          key={source.canonicalSourceId}
          source={source}
          mapping={props.mapping}
          conflicts={conflicts}
          onChange={props.onChange}
        />
      ))}
    </section>
  );
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  activeProfile,
  mappingData,
  onSaveProfile,
  onSaveMapping,
  onClose,
}) => {
  const styles = useStyles();
  const [section, setSection] = useState<SettingsSection | null>("GENERAL");
  const [profile, setProfile] = useState(() => cloneCitationStyleProfile(activeProfile));
  const [mapping, setMapping] = useState(() => cloneCitationSourceMapping(mappingData));
  const [profileMessage, setProfileMessage] = useState("");
  const [mappingMessage, setMappingMessage] = useState("");
  const [leaveWarning, setLeaveWarning] = useState(false);
  const [resetTarget, setResetTarget] = useState<"PROFILE" | "MAPPING" | null>(null);
  const [profileImport, setProfileImport] = useState<ReturnType<
    typeof parseCitationStyleProfile
  > | null>(null);
  const [mappingImport, setMappingImport] = useState<ReturnType<
    typeof parseCitationSourceMappingCsv
  > | null>(null);
  const profileDirty = hasUnsavedChanges(profile, activeProfile);
  const mappingDirty = hasUnsavedChanges(mapping, mappingData);

  const saveProfile = (): boolean => {
    const errors = validateSettingsWorkingCopy(profile);
    if (errors.length > 0) {
      setProfileMessage(errors.join("\n"));
      return false;
    }
    const result = onSaveProfile(profile);
    setProfileMessage(
      result.success
        ? "Zitiereinstellungen wurden gespeichert."
        : (result.error ?? "Speichern fehlgeschlagen.")
    );
    return result.success;
  };
  const saveMapping = (): boolean => {
    const validation = validateCitationSourceMappingData(mapping);
    if (!validation.success) {
      setMappingMessage(validation.errors.join("\n"));
      return false;
    }
    const result = onSaveMapping(mapping);
    setMappingMessage(
      result.success ? "Mapping wurde gespeichert." : (result.error ?? "Speichern fehlgeschlagen.")
    );
    return result.success;
  };
  const requestClose = () => {
    if (profileDirty || mappingDirty) setLeaveWarning(true);
    else onClose();
  };

  return (
    <div className={`${styles.panel} fc-settings-shell`}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <BrandLogo className={styles.logo} size={36} />
          <div>
            <h1 className={styles.title}>Footnote Checker</h1>
            <p className={styles.subtitle}>Zitiereinstellungen</p>
          </div>
        </div>
        <NeonButton variant="ghost" size="sm" onClick={requestClose}>
          ← Analyse
        </NeonButton>
      </header>

      <div className={styles.stickyActionBar} aria-label="Aktionen für Zitiereinstellungen">
        <NeonButton
          variant="primary"
          size="sm"
          disabled={!profileDirty && !mappingDirty}
          onClick={() => {
            if (profileDirty) saveProfile();
            if (mappingDirty) saveMapping();
          }}
        >
          Einstellungen speichern
        </NeonButton>
        <NeonButton
          variant="secondary"
          size="sm"
          onClick={() =>
            downloadText(
              "footnote-checker-citation-settings.json",
              serializeCitationStyleProfile(profile),
              "application/json;charset=utf-8"
            )
          }
        >
          <Download size={14} aria-hidden="true" /> Exportieren
        </NeonButton>
        <label className={styles.fileAction}>
          <Upload size={14} aria-hidden="true" /> Importieren
          <input
            className={styles.hiddenInput}
            type="file"
            accept=".json,application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                setProfileImport(parseCitationStyleProfile(await readTextFile(file)));
                setSection("GENERAL");
              } catch (error) {
                setProfileMessage(
                  error instanceof Error ? error.message : "Datei konnte nicht gelesen werden."
                );
              }
              event.target.value = "";
            }}
          />
        </label>
        <NeonButton
          variant="secondary"
          size="sm"
          disabled={!profileDirty && !mappingDirty}
          onClick={() => {
            setProfile(cloneCitationStyleProfile(activeProfile));
            setMapping(cloneCitationSourceMapping(mappingData));
            setProfileMessage("Ungespeicherte Änderungen wurden verworfen.");
            setMappingMessage("");
          }}
        >
          Änderungen verwerfen
        </NeonButton>
        <NeonButton variant="ghost" size="sm" onClick={() => setResetTarget("PROFILE")}>
          <RotateCcw size={14} aria-hidden="true" /> Standard wiederherstellen
        </NeonButton>
      </div>

      <section className={styles.profileCard} aria-label="Aktives Zitierprofil">
        <TextField
          label="Profilname"
          value={profile.name}
          error={profile.name.trim() ? undefined : "Profilname darf nicht leer sein."}
          onChange={(name) => setProfile({ ...profile, name })}
        />
        <p className={styles.subtitle}>
          Profil-ID: {profile.id} · Schema: {profile.schemaVersion}
        </p>
        <p className={profileDirty ? styles.statusDirty : styles.statusSaved}>
          {profileDirty
            ? "Zitiereinstellungen: Ungespeicherte Änderungen"
            : "Zitiereinstellungen: Gespeichert"}
        </p>
        <p className={mappingDirty ? styles.statusDirty : styles.statusSaved}>
          {mappingDirty
            ? "Werk- & Zeitschriften-Mapping: Ungespeicherte Änderungen"
            : "Werk- & Zeitschriften-Mapping: Gespeichert"}
        </p>
      </section>

      {leaveWarning && (
        <div className={styles.dialog} role="dialog" aria-label="Ungespeicherte Änderungen">
          <strong>Es gibt ungespeicherte Änderungen.</strong>
          <div className={styles.actionBar}>
            <Button
              appearance="primary"
              onClick={() => {
                const profileSaved = !profileDirty || saveProfile();
                const mappingSaved = !mappingDirty || saveMapping();
                if (profileSaved && mappingSaved) onClose();
              }}
            >
              Speichern und zurück
            </Button>
            <Button onClick={onClose}>Verwerfen und zurück</Button>
            <Button onClick={() => setLeaveWarning(false)}>Abbrechen</Button>
          </div>
        </div>
      )}

      <div className={styles.accordion} aria-label="Einstellungsbereiche">
        {SECTION_OPTIONS.map((option) => {
          const isOpen = section === option.value;
          return (
            <section className={styles.accordionItem} key={option.value}>
              <button
                className={styles.accordionTrigger}
                type="button"
                aria-expanded={isOpen}
                onClick={() => setSection((current) => (current === option.value ? null : option.value))}
              >
                {isOpen ? (
                  <ChevronDown size={17} aria-hidden="true" />
                ) : (
                  <ChevronRight size={17} aria-hidden="true" />
                )}
                <span>{option.label}</span>
              </button>
              {isOpen && (
                <div className={styles.accordionContent}>
                  {option.value === "MAPPING" ? (
                    <MappingEditor
                      mapping={mapping}
                      onChange={(next) => {
                        setMapping(next);
                        setMappingMessage("");
                      }}
                    />
                  ) : (
                    <ProfileEditor
                      section={option.value}
                      profile={profile}
                      onChange={(next) => {
                        setProfile(next);
                        setProfileMessage("");
                      }}
                    />
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {section === "MAPPING" ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Werk- &amp; Zeitschriften-Mapping verwalten
          </h2>
          <div className={styles.actionBar}>
            <Button appearance="primary" disabled={!mappingDirty} onClick={saveMapping}>
              Mapping speichern
            </Button>
            <Button
              disabled={!mappingDirty}
              onClick={() => {
                setMapping(cloneCitationSourceMapping(mappingData));
                setMappingMessage("Ungespeicherte Mapping-Änderungen wurden verworfen.");
              }}
            >
              Änderungen verwerfen
            </Button>
            <Button onClick={() => setResetTarget("MAPPING")}>
              Standardquellen wiederherstellen
            </Button>
            <Button
              onClick={() =>
                downloadText(
                  "footnote-checker-work-mapping.csv",
                  exportCitationSourceMappingCsv(mapping),
                  "text/csv;charset=utf-8"
                )
              }
            >
              Exportieren
            </Button>
            <label>
              <span className={styles.label}>Importieren</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    setMappingImport(parseCitationSourceMappingCsv(await readTextFile(file)));
                  } catch (error) {
                    setMappingMessage(
                      error instanceof Error ? error.message : "Datei konnte nicht gelesen werden."
                    );
                  }
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          {mappingMessage && <p className={styles.message}>{mappingMessage}</p>}
          {mappingImport && (
            <div className={styles.card}>
              <h3 className={styles.subsectionTitle}>Import-Vorschau</h3>
              <p>
                Schema: {mappingImport.data.schemaVersion} · Quellen:{" "}
                {mappingImport.data.sources.length} · Kommentare:{" "}
                {mappingImport.data.sources.filter((source) => source.kind === "COMMENTARY").length}{" "}
                · Zeitschriften:{" "}
                {mappingImport.data.sources.filter((source) => source.kind === "JOURNAL").length} ·
                Aliase: {mappingImport.data.aliases.length} · Unsicher:{" "}
                {
                  mappingImport.data.aliases.filter(
                    (alias) => alias.legacySafetyLevel === "UNCERTAIN"
                  ).length
                }
              </p>
              <p className={mappingImport.success ? styles.statusSaved : styles.error}>
                {mappingImport.success ? "Datei ist strukturell gültig." : "Datei ist ungültig."}
              </p>
              {mappingImport.errors.map((error) => (
                <p className={styles.error} key={error}>
                  {error}
                </p>
              ))}
              {mappingImport.warnings?.map((warning) => (
                <p className={styles.warning} key={warning}>
                  {warning}
                </p>
              ))}
              <div className={styles.actionBar}>
                <Button
                  appearance="primary"
                  disabled={!mappingImport.success}
                  onClick={() => {
                    if (mappingImport.success) {
                      setMapping(cloneCitationSourceMapping(mappingImport.data));
                      setMappingImport(null);
                      setMappingMessage("Import wurde als ungespeicherte Arbeitskopie übernommen.");
                    }
                  }}
                >
                  Aktuelles Mapping ersetzen
                </Button>
                <Button onClick={() => setMappingImport(null)}>Abbrechen</Button>
              </div>
            </div>
          )}
        </section>
      ) : section ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Zitiereinstellungen verwalten
          </h2>
          <div className={styles.actionBar}>
            <Button appearance="primary" disabled={!profileDirty} onClick={saveProfile}>
              Speichern
            </Button>
            <Button
              disabled={!profileDirty}
              onClick={() => {
                setProfile(cloneCitationStyleProfile(activeProfile));
                setProfileMessage("Ungespeicherte Zitiereinstellungen wurden verworfen.");
              }}
            >
              Änderungen verwerfen
            </Button>
            <Button onClick={() => setResetTarget("PROFILE")}>Auf Standard zurücksetzen</Button>
            <Button
              onClick={() =>
                downloadText(
                  "footnote-checker-citation-settings.json",
                  serializeCitationStyleProfile(profile),
                  "application/json;charset=utf-8"
                )
              }
            >
              Exportieren
            </Button>
            <label>
              <span className={styles.label}>Importieren</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    setProfileImport(parseCitationStyleProfile(await readTextFile(file)));
                  } catch (error) {
                    setProfileMessage(
                      error instanceof Error ? error.message : "Datei konnte nicht gelesen werden."
                    );
                  }
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          {profileMessage && <p className={styles.message}>{profileMessage}</p>}
          {profileImport && (
            <div className={styles.card}>
              <h3 className={styles.subsectionTitle}>Import-Vorschau</h3>
              <p>
                Profil: {profileImport.profile.name} · Schema: {profileImport.profile.schemaVersion}
              </p>
              <p className={profileImport.success ? styles.statusSaved : styles.error}>
                {profileImport.success
                  ? "Datei ist gültig."
                  : "Die Datei mit Zitiereinstellungen ist ungültig."}
              </p>
              {formatCitationStyleImportErrors(profileImport.errors).map((error) => (
                <p className={styles.error} key={error}>
                  {error}
                </p>
              ))}
              <div className={styles.actionBar}>
                <Button
                  appearance="primary"
                  disabled={!profileImport.success}
                  onClick={() => {
                    if (profileImport.success) {
                      setProfile(cloneCitationStyleProfile(profileImport.profile));
                      setProfileImport(null);
                      setProfileMessage("Import wurde als ungespeicherte Arbeitskopie übernommen.");
                    }
                  }}
                >
                  Import übernehmen
                </Button>
                <Button onClick={() => setProfileImport(null)}>Abbrechen</Button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {resetTarget && (
        <div className={styles.dialog} role="dialog" aria-label="Standard wiederherstellen">
          <strong>
            {resetTarget === "PROFILE"
              ? "Zitiereinstellungen wirklich als Arbeitskopie auf Standard zurücksetzen?"
              : "Standardquellen wirklich wiederherstellen?"}
          </strong>
          <p className={styles.help}>
            {resetTarget === "PROFILE"
              ? "Die Änderung wird erst mit dem Speichern-Button dauerhaft."
              : "Standardquellen werden auf den gebündelten Stand gebracht. Benutzerseitig angelegte und importierte Quellen bleiben erhalten. Dauerhaft wird dies erst mit „Mapping speichern“."}
          </p>
          <div className={styles.actionBar}>
            <Button
              appearance="primary"
              onClick={() => {
                if (resetTarget === "PROFILE") setProfile(createDefaultCitationStyleProfile());
                else setMapping(restoreDefaultCitationSources(mapping));
                setResetTarget(null);
              }}
            >
              {resetTarget === "PROFILE" ? "Zurücksetzen" : "Standardquellen wiederherstellen"}
            </Button>
            <Button onClick={() => setResetTarget(null)}>Abbrechen</Button>
          </div>
        </div>
      )}
    </div>
  );
};
