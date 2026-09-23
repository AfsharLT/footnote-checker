import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { Button, makeStyles, tokens } from "@fluentui/react-components";
import { ChevronDown, ChevronRight, Download, RotateCcw, Search, Upload } from "lucide-react";
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
import {
  CITATION_SETTINGS_SECTIONS,
  SETTINGS_TOP_LEVEL_SECTIONS,
  formatSettingsSearchContext,
  resolveSettingsSearchSelection,
  searchSettings,
  settingsFieldTarget,
  settingsSubsectionTarget,
  type SettingsNestedSection,
  type SettingsSearchEntry,
  type SettingsTopLevelSection,
} from "../settings-search";

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
  { value: "ZIVILRECHT", label: "Zivilrecht" },
  { value: "STRAFRECHT", label: "Strafrecht" },
  { value: "PROZESSRECHT", label: "Prozessrecht" },
  { value: "OEFFENTLICHES_RECHT", label: "Öffentliches Recht" },
  { value: "EUROPARECHT", label: "Europarecht" },
  { value: "SONSTIGE", label: "Sonstige" },
];

function legalAreaLabel(value: CitationSourceLegalArea): string {
  return LEGAL_AREA_OPTIONS.find((option) => option.value === value)?.label ?? "Sonstige";
}

const PERSON_HINT_OPTIONS: Array<Option<CommentaryPersonStructureHint>> = [
  { value: "UNKNOWN", label: "Allgemeine Einstellung" },
  { value: "BEARBEITER_THEN_WORK", label: "Bearbeiter, dann Werk" },
  { value: "WORK_THEN_BEARBEITER", label: "Werk, danach Bearbeiter" },
  { value: "WORK_WITHOUT_BEARBEITER", label: "Werk ohne Bearbeiter" },
  { value: "EDITOR_STRUCTURE", label: "Herausgeberstruktur" },
  { value: "AMBIGUOUS", label: "Allgemeine Einstellung (mehrdeutig)" },
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

function withoutFinalCitationPeriod(value: string | undefined): string {
  return (value ?? "").replace(/\.\s*$/u, "");
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
  searchArea: { position: "relative", flex: "1 1 100%", minWidth: 0 },
  searchField: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: "8px",
    padding: "0 10px",
    border: "1px solid #aebfd6",
    borderRadius: "8px",
    backgroundColor: "#fff",
    color: tokens.colorNeutralForeground2,
  },
  searchInput: {
    width: "100%",
    minWidth: 0,
    height: "36px",
    border: 0,
    outline: 0,
    backgroundColor: "transparent",
    color: tokens.colorNeutralForeground1,
  },
  searchResults: {
    position: "absolute",
    zIndex: 30,
    top: "calc(100% + 5px)",
    right: 0,
    left: 0,
    display: "grid",
    maxHeight: "260px",
    overflowY: "auto",
    padding: "5px",
    border: "1px solid #c8d8ee",
    borderRadius: "8px",
    backgroundColor: "#fff",
    boxShadow: "0 10px 24px rgba(24, 39, 60, 0.16)",
  },
  searchResult: {
    width: "100%",
    padding: "8px 9px",
    border: 0,
    borderRadius: "6px",
    backgroundColor: "transparent",
    color: tokens.colorNeutralForeground1,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: tokens.fontSizeBase200,
    lineHeight: "18px",
    textAlign: "left",
  },
  searchEmpty: { margin: 0, padding: "9px", color: tokens.colorNeutralForeground2 },
  actionStatus: { marginLeft: "auto", fontSize: tokens.fontSizeBase200 },
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
  aliasCard: {
    display: "grid",
    gap: "10px",
    padding: "12px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "10px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  dangerButton: {
    justifySelf: "start",
    color: tokens.colorPaletteRedForeground1,
  },
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

const SettingsTargetContext = React.createContext<string | null>(null);

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
  const targetScope = React.useContext(SettingsTargetContext);
  const targetId = targetScope ? settingsFieldTarget(targetScope, props.label) : undefined;
  return (
    <label className={styles.field} id={targetId} tabIndex={targetId ? -1 : undefined}>
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
  const targetScope = React.useContext(SettingsTargetContext);
  const targetId = targetScope ? settingsFieldTarget(targetScope, props.label) : undefined;
  return (
    <label className={styles.field} id={targetId} tabIndex={targetId ? -1 : undefined}>
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

function CheckField(props: {
  label: string;
  checked: boolean;
  onChange(value: boolean): void;
  helpText?: string;
  targetId?: string;
}) {
  const styles = useStyles();
  const targetScope = React.useContext(SettingsTargetContext);
  const targetId =
    props.targetId ?? (targetScope ? settingsFieldTarget(targetScope, props.label) : undefined);
  return (
    <label
      className={`${styles.checkbox} ${props.helpText ? "fc-settings-product-setting" : ""}`}
      id={targetId}
      tabIndex={targetId ? -1 : undefined}
    >
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span>
        {props.label}
        {props.helpText && <span className={styles.help}>{props.helpText}</span>}
      </span>
    </label>
  );
}

function StyleEditor(props: {
  title: string;
  value: CharacterStylePreference;
  onChange(value: CharacterStylePreference): void;
  targetId?: string;
}) {
  const styles = useStyles();
  return (
    <div className={styles.card} id={props.targetId} tabIndex={props.targetId ? -1 : undefined}>
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
        <h2 className={styles.sectionTitle}>Allgemeine Zitiereinstellungen</h2>
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
              <details
                className={styles.card}
                id={settingsFieldTarget("ABBREVIATIONS", ABBREVIATION_LABELS[concept])}
                tabIndex={-1}
                key={concept}
              >
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
          <h2 className={styles.sectionTitle}>Modifier / Signalwörter</h2>
          <p className={styles.help}>
            Modifier bleiben getrennt von f. und ff.; diese gehören weiterhin zu den Abkürzungen.
          </p>
          {(Object.keys(props.profile.modifiers) as CitationModifierConcept[]).map((concept) => {
            const preference = props.profile.modifiers[concept];
            return (
              <details
                className={styles.card}
                id={settingsFieldTarget("ABBREVIATIONS", MODIFIER_LABELS[concept])}
                tabIndex={-1}
                key={concept}
              >
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
        targetId="fc-setting-formatting-author"
        value={props.profile.formatting.author}
        onChange={(value) => update((next) => (next.formatting.author = value))}
      />
      <StyleEditor
        title="Bearbeiter"
        targetId="fc-setting-formatting-bearbeiter"
        value={props.profile.formatting.bearbeiter}
        onChange={(value) => update((next) => (next.formatting.bearbeiter = value))}
      />
      <StyleEditor
        title="Herausgeber"
        targetId="fc-setting-formatting-editor"
        value={props.profile.formatting.editor}
        onChange={(value) => update((next) => (next.formatting.editor = value))}
      />
      <StyleEditor
        title="Werktitel"
        targetId="fc-setting-formatting-work-title"
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
      <span className={styles.help}>
        Sie können {"{Bearbeiter}"} als Platzhalter verwenden, z. B. „{"{Bearbeiter}"}, in:
        LK-StGB“.
      </span>
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
    return (
      <div className={styles.subsection}>
        <h4 className={styles.subsectionTitle}>Quellenspezifische Einstellungen</h4>
        <p className={styles.help}>
          Optional können Sie die allgemeinen Formatierungseinstellungen für diese Quelle
          überschreiben.
        </p>
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
      </div>
    );
  }
  const override = props.source.workOverride as WorkCitationOverride<"JOURNAL_ARTICLE">;
  return (
    <div className={styles.subsection}>
      <h4 className={styles.subsectionTitle}>Quellenspezifische Einstellungen</h4>
      <p className={styles.help}>
        Optional können Sie die allgemeine Fundstellenform für diese Quelle überschreiben.
      </p>
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
    <details className={`${styles.card} fc-settings-source-card`}>
      <summary>
        <span className={styles.cardTitle}>{props.source.preferredName}</span>
        <span className={styles.badge}>{sourceKindLabel(props.source.kind)}</span>
        <span className={styles.badge}>{legalAreaLabel(props.source.legalArea)}</span>
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
          label="Name der Quelle"
          value={props.source.preferredName}
          onChange={(preferredName) => update({ preferredName })}
          error={
            props.source.preferredName.trim() ? undefined : "Name der Quelle darf nicht leer sein."
          }
        />
        <TextField
          label="Bevorzugte Zitierweise"
          value={withoutFinalCitationPeriod(props.source.examplePattern)}
          placeholder={
            props.source.kind === "COMMENTARY"
              ? "z. B. LK-StGB/{Bearbeiter}, § 13 Rn. 12"
              : "z. B. Autor, NJW 2025, 1234 (1236)"
          }
          helpText="Beispiel dafür, wie die Quelle im Footnote Checker bevorzugt zitiert werden soll. Ein abschließender Punkt ist nicht erforderlich."
          onChange={(examplePattern) =>
            update({ examplePattern: withoutFinalCitationPeriod(examplePattern) || undefined })
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
            label="Personenstruktur"
            value={props.source.personStructureHint ?? "UNKNOWN"}
            options={PERSON_HINT_OPTIONS}
            onChange={(personStructureHint) => update({ personStructureHint })}
          />
        )}
        {props.source.kind === "COMMENTARY" && (
          <p className={styles.help}>
            Diese Auswahl unterstützt die Erkennung und Formatierung von Bearbeitern und
            Herausgebern.
          </p>
        )}
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
          <p className={styles.help}>
            Erkennungsmuster für alternative oder fehlerhafte Zitierweisen dieser Quelle.
          </p>
          {aliases.map(({ alias, index }) => (
            <div
              className={`${styles.aliasCard} fc-settings-alias-card`}
              key={`${alias.legacyMappingId ?? "user"}-${index}`}
            >
              <TextField
                label="Alias-Text / Erkennungsmuster"
                value={alias.alias}
                onChange={(value) =>
                  props.onChange(updateCitationSourceAlias(props.mapping, index, { alias: value }))
                }
                error={alias.alias.trim() ? undefined : "Aliastext darf nicht leer sein."}
                helpText="Sie können {Bearbeiter} als Platzhalter verwenden."
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
              <CheckField
                label="Aktiv"
                checked={alias.active}
                onChange={(active) =>
                  props.onChange(updateCitationSourceAlias(props.mapping, index, { active }))
                }
              />
              <Button
                className={styles.dangerButton}
                size="small"
                onClick={() => {
                  if (alias.legacyMappingId) {
                    props.onChange(
                      updateCitationSourceAlias(props.mapping, index, { active: false })
                    );
                    return;
                  }
                  const result = removeUserCitationSourceAlias(props.mapping, index);
                  if (result.success) props.onChange(result.value);
                }}
              >
                Alias entfernen
              </Button>
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
                  Diese Quelle stammt aus dem Standardverzeichnis. Sie kann später über
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
    legalArea: "SONSTIGE",
    personStructureHint: "UNKNOWN",
  });
  if (!open) return <Button onClick={() => setOpen(true)}>Quelle hinzufügen</Button>;
  return (
    <div className={styles.card}>
      <h3 className={styles.subsectionTitle}>Neue Quelle</h3>
      <TextField
        label="Name der Quelle"
        value={input.preferredName}
        onChange={(preferredName) => setInput({ ...input, preferredName })}
        error={
          error && !input.preferredName.trim() ? "Name der Quelle darf nicht leer sein." : undefined
        }
      />
      <TextField
        label="Bevorzugte Zitierweise"
        value={withoutFinalCitationPeriod(input.examplePattern)}
        placeholder={
          input.kind === "COMMENTARY"
            ? "z. B. LK-StGB/{Bearbeiter}, § 13 Rn. 12"
            : "z. B. Autor, NJW 2025, 1234 (1236)"
        }
        helpText="Beispiel dafür, wie die Quelle im Footnote Checker bevorzugt zitiert werden soll. Ein abschließender Punkt ist nicht erforderlich."
        onChange={(examplePattern) =>
          setInput({ ...input, examplePattern: withoutFinalCitationPeriod(examplePattern) })
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
          label="Personenstruktur"
          value={input.personStructureHint ?? "UNKNOWN"}
          options={PERSON_HINT_OPTIONS}
          onChange={(personStructureHint) => setInput({ ...input, personStructureHint })}
        />
      )}
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
      <h2 className={styles.sectionTitle}>Literaturverzeichnis</h2>
      <p className={styles.help}>Bekannte Werke, Zeitschriften, Quellen und Aliase verwalten.</p>
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

const LegacySettingsPanel: React.FC<SettingsPanelProps> = ({
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
                onClick={() =>
                  setSection((current) => (current === option.value ? null : option.value))
                }
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
          <h2 className={styles.sectionTitle}>Werk- &amp; Zeitschriften-Mapping verwalten</h2>
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
          <h2 className={styles.sectionTitle}>Zitiereinstellungen verwalten</h2>
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

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  activeProfile,
  mappingData,
  onSaveProfile,
  onSaveMapping,
  onClose,
}) => {
  const styles = useStyles();
  const [section, setSection] = useState<SettingsTopLevelSection | null>(null);
  const [nestedSection, setNestedSection] = useState<SettingsNestedSection | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingSearchTarget, setPendingSearchTarget] = useState<string | null>(null);
  const [profile, setProfile] = useState(() => cloneCitationStyleProfile(activeProfile));
  const [mapping, setMapping] = useState(() => cloneCitationSourceMapping(mappingData));
  const [profileMessage, setProfileMessage] = useState("");
  const [mappingMessage, setMappingMessage] = useState("");
  const [leaveWarning, setLeaveWarning] = useState(false);
  const [resetTarget, setResetTarget] = useState<"MAPPING" | "ALL" | null>(null);
  const [profileImport, setProfileImport] = useState<ReturnType<
    typeof parseCitationStyleProfile
  > | null>(null);
  const [mappingImport, setMappingImport] = useState<ReturnType<
    typeof parseCitationSourceMappingCsv
  > | null>(null);
  const profileDirty = hasUnsavedChanges(profile, activeProfile);
  const mappingDirty = hasUnsavedChanges(mapping, mappingData);
  const searchResults = useMemo(() => searchSettings(searchQuery), [searchQuery]);

  useEffect(() => {
    if (!pendingSearchTarget) return undefined;
    const target = document.getElementById(pendingSearchTarget);
    if (!target) return undefined;
    if (target instanceof HTMLDetailsElement) target.open = true;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.focus({ preventScroll: true });
    target.classList.remove("fc-settings-search-target");
    void target.offsetWidth;
    target.classList.add("fc-settings-search-target");
    const clearHighlight = () => target.classList.remove("fc-settings-search-target");
    target.addEventListener("animationend", clearHighlight, { once: true });
    setPendingSearchTarget(null);
    return () => target.removeEventListener("animationend", clearHighlight);
  }, [pendingSearchTarget, section, nestedSection]);

  const updateProfile = (next: CitationStyleProfile) => {
    setProfile(next);
    setProfileMessage("");
  };
  const saveProfile = (): boolean => {
    const errors = validateSettingsWorkingCopy(profile);
    if (errors.length > 0) {
      setProfileMessage(errors.join("\n"));
      return false;
    }
    const result = onSaveProfile(profile);
    setProfileMessage(
      result.success
        ? "Einstellungen wurden gespeichert."
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
      result.success
        ? "Literaturverzeichnis wurde gespeichert."
        : (result.error ?? "Speichern fehlgeschlagen.")
    );
    return result.success;
  };
  const saveAll = (): boolean => {
    const settingsSaved = !profileDirty || saveProfile();
    const literatureSaved = !mappingDirty || saveMapping();
    return settingsSaved && literatureSaved;
  };
  const requestClose = () => {
    if (profileDirty || mappingDirty) setLeaveWarning(true);
    else onClose();
  };
  const selectSearchResult = (entry: SettingsSearchEntry) => {
    const target = resolveSettingsSearchSelection(entry);
    setSection(target.topLevelSection);
    setNestedSection(target.nestedSection);
    setPendingSearchTarget(target.targetElementId);
    setSearchQuery("");
  };
  const profileSectionFor = (value: SettingsNestedSection): SettingsSection | null => {
    if (value === "CITATION_GENERAL") return "GENERAL";
    if (value === "FESTSCHRIFT") return null;
    return value;
  };
  const handleImport = async (file: File) => {
    const text = await readTextFile(file);
    if (file.name.toLocaleLowerCase("de-DE").endsWith(".csv")) {
      setMappingImport(parseCitationSourceMappingCsv(text));
      setSection("LITERATURE");
    } else {
      setProfileImport(parseCitationStyleProfile(text));
      setSection("CITATION");
    }
  };

  const nestedAccordion = (
    value: SettingsNestedSection,
    label: string,
    content: React.ReactNode
  ) => {
    const isOpen = nestedSection === value;
    const contentId = settingsSubsectionTarget(value);
    return (
      <section className="fc-settings-nested-item" key={value}>
        <button
          className="fc-settings-nested-trigger"
          type="button"
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={() => setNestedSection((current) => (current === value ? null : value))}
        >
          {isOpen ? (
            <ChevronDown size={16} aria-hidden="true" />
          ) : (
            <ChevronRight size={16} aria-hidden="true" />
          )}
          <span>{label}</span>
        </button>
        {isOpen && (
          <div className="fc-settings-nested-content" id={contentId} tabIndex={-1}>
            {content}
          </div>
        )}
      </section>
    );
  };

  const topLevelContent = (value: SettingsTopLevelSection): React.ReactNode => {
    if (value === "GENERAL") {
      return (
        <div className="fc-settings-section-stack">
          <section className="fc-settings-product-card">
            <CheckField
              targetId="fc-setting-auto-close-inactive-footnotes"
              label="Nicht aktive Fußnoten automatisch schließen"
              helpText="Wenn Sie eine andere Fußnote öffnen, wird die zuvor geöffnete Fußnote automatisch geschlossen."
              checked={profile.global.autoCloseInactiveFootnotes}
              onChange={(checked) => {
                const next = cloneCitationStyleProfile(profile);
                next.global.autoCloseInactiveFootnotes = checked;
                updateProfile(next);
              }}
            />
          </section>
          {nestedAccordion(
            "FORMATTING",
            "Formatierung",
            <SettingsTargetContext.Provider value="FORMATTING">
              <ProfileEditor section="FORMATTING" profile={profile} onChange={updateProfile} />
            </SettingsTargetContext.Provider>
          )}
        </div>
      );
    }
    if (value === "CITATION") {
      return (
        <div className="fc-settings-nested-list">
          {CITATION_SETTINGS_SECTIONS.map((nested) => {
            const profileSection = profileSectionFor(nested.value);
            return nestedAccordion(
              nested.value,
              nested.label,
              profileSection ? (
                <SettingsTargetContext.Provider value={nested.value}>
                  <ProfileEditor
                    section={profileSection}
                    profile={profile}
                    onChange={updateProfile}
                  />
                </SettingsTargetContext.Provider>
              ) : (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Festschriften</h2>
                  <p className={styles.help}>
                    Festschrift-spezifische Einstellungen werden in einem späteren Schritt ergänzt.
                  </p>
                </section>
              )
            );
          })}
        </div>
      );
    }
    if (value === "LITERATURE") {
      return (
        <div id="fc-settings-literature" tabIndex={-1}>
          <MappingEditor
            mapping={mapping}
            onChange={(next) => {
              setMapping(next);
              setMappingMessage("");
            }}
          />
          <section className={`${styles.section} fc-settings-directory-actions`}>
            <h2 className={styles.sectionTitle}>Literaturdaten verwalten</h2>
            <div className={styles.actionBar}>
              <Button appearance="primary" disabled={!mappingDirty} onClick={saveMapping}>
                Literaturverzeichnis speichern
              </Button>
              <Button
                disabled={!mappingDirty}
                onClick={() => {
                  setMapping(cloneCitationSourceMapping(mappingData));
                  setMappingMessage("Ungespeicherte Änderungen wurden verworfen.");
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
                    "footnote-checker-literaturverzeichnis.csv",
                    exportCitationSourceMappingCsv(mapping),
                    "text/csv;charset=utf-8"
                  )
                }
              >
                Exportieren
              </Button>
              <label className={styles.fileAction}>
                Importieren
                <input
                  className={styles.hiddenInput}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    try {
                      await handleImport(file);
                    } catch (error) {
                      setMappingMessage(
                        error instanceof Error
                          ? error.message
                          : "Datei konnte nicht gelesen werden."
                      );
                    }
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
            {mappingMessage && <p className={styles.message}>{mappingMessage}</p>}
          </section>
        </div>
      );
    }
    if (value === "ABBREVIATIONS") {
      return (
        <div id="fc-settings-abbreviations" tabIndex={-1}>
          <ProfileEditor section="ABBREVIATIONS" profile={profile} onChange={updateProfile} />
        </div>
      );
    }
    return (
      <section className={styles.section} id="fc-settings-help" tabIndex={-1}>
        <h2 className={styles.sectionTitle}>Hilfe &amp; Info</h2>
        <p className={styles.help}>
          Weitere Informationen und Hilfestellungen werden hier ergänzt.
        </p>
      </section>
    );
  };

  return (
    <div className={`${styles.panel} fc-settings-shell`}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <BrandLogo className={styles.logo} size={36} />
          <div>
            <h1 className={styles.title}>Footnote Checker</h1>
            <p className={styles.subtitle}>Einstellungen</p>
          </div>
        </div>
        <NeonButton variant="ghost" size="sm" onClick={requestClose}>
          ← Analyse
        </NeonButton>
      </header>

      <div
        className={`${styles.stickyActionBar} fc-settings-action-card`}
        aria-label="Aktionen für Einstellungen"
      >
        <div className={styles.searchArea}>
          <label className={`${styles.searchField} fc-settings-search-field`}>
            <Search size={16} aria-hidden="true" />
            <span className="fc-visually-hidden">Einstellungen durchsuchen</span>
            <input
              className={styles.searchInput}
              type="search"
              role="combobox"
              value={searchQuery}
              placeholder="Einstellungen durchsuchen …"
              autoComplete="off"
              aria-controls="fc-settings-search-results"
              aria-expanded={searchQuery.trim().length > 0}
              aria-autocomplete="list"
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearchQuery("");
              }}
            />
          </label>
          {searchQuery.trim() && (
            <div
              className={styles.searchResults}
              id="fc-settings-search-results"
              role="listbox"
              aria-label="Suchergebnisse"
            >
              {searchResults.length > 0 ? (
                searchResults.map((result) => (
                  <button
                    className={styles.searchResult}
                    type="button"
                    role="option"
                    aria-selected="false"
                    key={result.id}
                    onClick={() => selectSearchResult(result)}
                  >
                    {formatSettingsSearchContext(result)}
                  </button>
                ))
              ) : (
                <p className={styles.searchEmpty}>Keine passende Einstellung gefunden.</p>
              )}
            </div>
          )}
        </div>
        <NeonButton
          variant="primary"
          size="sm"
          disabled={!profileDirty && !mappingDirty}
          onClick={saveAll}
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
            accept=".json,.csv,application/json,text/csv"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                await handleImport(file);
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
        <NeonButton variant="ghost" size="sm" onClick={() => setResetTarget("ALL")}>
          <RotateCcw size={14} aria-hidden="true" /> Standard wiederherstellen
        </NeonButton>
        <span
          className={`${styles.actionStatus} ${
            profileDirty || mappingDirty ? styles.statusDirty : styles.statusSaved
          }`}
        >
          {profileDirty || mappingDirty ? "Ungespeicherte Änderungen" : "Alles gespeichert"}
        </span>
      </div>

      {leaveWarning && (
        <div className={styles.dialog} role="dialog" aria-label="Ungespeicherte Änderungen">
          <strong>Es gibt ungespeicherte Änderungen.</strong>
          <div className={styles.actionBar}>
            <Button appearance="primary" onClick={() => saveAll() && onClose()}>
              Speichern und zurück
            </Button>
            <Button onClick={onClose}>Verwerfen und zurück</Button>
            <Button onClick={() => setLeaveWarning(false)}>Abbrechen</Button>
          </div>
        </div>
      )}

      <div className={styles.accordion} aria-label="Einstellungsbereiche">
        {SETTINGS_TOP_LEVEL_SECTIONS.map((option) => {
          const isOpen = section === option.value;
          const contentId = `fc-settings-section-${option.value.toLowerCase()}`;
          return (
            <section className={`${styles.accordionItem} fc-settings-top-level`} key={option.value}>
              <button
                className={styles.accordionTrigger}
                type="button"
                aria-expanded={isOpen}
                aria-controls={contentId}
                onClick={() =>
                  setSection((current) => (current === option.value ? null : option.value))
                }
              >
                {isOpen ? (
                  <ChevronDown size={17} aria-hidden="true" />
                ) : (
                  <ChevronRight size={17} aria-hidden="true" />
                )}
                <span>{option.label}</span>
              </button>
              {isOpen && (
                <div className={styles.accordionContent} id={contentId}>
                  {topLevelContent(option.value)}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {profileMessage && <p className={styles.message}>{profileMessage}</p>}
      {profileImport && (
        <section className={styles.section}>
          <div className={styles.card}>
            <h3 className={styles.subsectionTitle}>Import-Vorschau</h3>
            <p>Schema: {profileImport.profile.schemaVersion}</p>
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
        </section>
      )}

      {mappingImport && (
        <section className={styles.section}>
          <div className={styles.card}>
            <h3 className={styles.subsectionTitle}>Import-Vorschau Literaturverzeichnis</h3>
            <p>
              Schema: {mappingImport.data.schemaVersion} · Quellen:{" "}
              {mappingImport.data.sources.length}
              {" · "}Aliase: {mappingImport.data.aliases.length}
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
                Literaturdaten übernehmen
              </Button>
              <Button onClick={() => setMappingImport(null)}>Abbrechen</Button>
            </div>
          </div>
        </section>
      )}

      {resetTarget && (
        <div className={styles.dialog} role="dialog" aria-label="Standard wiederherstellen">
          <strong>
            {resetTarget === "MAPPING"
              ? "Standardquellen wirklich wiederherstellen?"
              : "Alle Einstellungen wirklich auf Standard zurücksetzen?"}
          </strong>
          <p className={styles.help}>
            {resetTarget === "MAPPING"
              ? "Standardquellen werden auf den gebündelten Stand gebracht. Eigene und importierte Quellen bleiben erhalten. Dauerhaft wird dies erst mit dem Speichern."
              : "Zitiereinstellungen und Standardquellen werden als Arbeitskopie zurückgesetzt. Eigene Literaturquellen bleiben erhalten. Dauerhaft wird dies erst mit dem Speichern."}
          </p>
          <div className={styles.actionBar}>
            <Button
              appearance="primary"
              onClick={() => {
                if (resetTarget === "ALL") setProfile(createDefaultCitationStyleProfile());
                setMapping(restoreDefaultCitationSources(mapping));
                setResetTarget(null);
              }}
            >
              {resetTarget === "MAPPING" ? "Standardquellen wiederherstellen" : "Zurücksetzen"}
            </Button>
            <Button onClick={() => setResetTarget(null)}>Abbrechen</Button>
          </div>
        </div>
      )}
    </div>
  );
};
