import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CITATION_SETTINGS_SECTIONS,
  SETTINGS_SEARCH_INDEX,
  SETTINGS_TOP_LEVEL_SECTIONS,
  resolveSettingsSearchSelection,
  searchSettings,
} from "../../src/taskpane/settings-search";
import { createDefaultCitationStyleProfile } from "../../src/citation-settings/defaults";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const source = readFileSync(
  join(process.cwd(), "src/taskpane/components/SettingsPanel.tsx"),
  "utf8"
);
const activePanel = source.slice(source.indexOf("export const SettingsPanel"));
const css = readFileSync(join(process.cwd(), "src/taskpane/styles.css"), "utf8");

assert(SETTINGS_TOP_LEVEL_SECTIONS.length === 5, "Settings must have exactly five top-level sections");
assert(
  SETTINGS_TOP_LEVEL_SECTIONS.map(({ label }) => label).join("|") ===
    "Allgemein|Zitiereinstellungen|Literaturverzeichnis|Abkürzungsverzeichnis|Hilfe & Info",
  "The five top-level labels and their order must stay stable"
);
assert(
  activePanel.includes('useState<SettingsTopLevelSection | null>(null)'),
  "All top-level sections must initially be collapsed"
);
assert(
  activePanel.includes('<p className={styles.subtitle}>Einstellungen</p>'),
  "The Settings page title must be Einstellungen"
);

const defaultSettings = createDefaultCitationStyleProfile();
assert(
  defaultSettings.global.autoCloseInactiveFootnotes === true,
  "Auto-close must remain enabled by default"
);
assert(
  activePanel.includes('label="Nicht aktive Fußnoten automatisch schließen"') &&
    activePanel.includes("Wenn Sie eine andere Fußnote öffnen") &&
    css.includes(".fc-settings-product-setting > span") &&
    css.includes("display: grid"),
  "Auto-close label and helper text must render as separate lines"
);
assert(
  activePanel.includes('"FORMATTING",\n            "Formatierung"'),
  "Formatting must be a nested section under Allgemein"
);
assert(
  !activePanel.includes('label="Profilname"') &&
    !activePanel.includes("Dark mode") &&
    !activePanel.includes("Light mode"),
  "Profiles and theme controls must not be present in the active Settings UI"
);

assert(
  CITATION_SETTINGS_SECTIONS.map(({ label }) => label).join("|") ===
    "Allgemeine Zitiereinstellungen|Gesetze|Rechtsprechung|Kommentare|Bücher|Zeitschriften & Aufsätze|Festschriften|Weitere Quellentypen",
  "Citation settings must expose the requested eight nested categories"
);
assert(
  activePanel.includes("Festschrift-spezifische Einstellungen werden in einem späteren Schritt ergänzt."),
  "Festschriften must have a non-invented placeholder"
);
assert(
  activePanel.includes("<MappingEditor") &&
    activePanel.includes("Literaturverzeichnis speichern") &&
    activePanel.includes("exportCitationSourceMappingCsv") &&
    activePanel.includes("parseCitationSourceMappingCsv"),
  "Literaturverzeichnis must retain mapping editing and import/export"
);
assert(
  activePanel.includes('section="ABBREVIATIONS"') &&
    source.includes("addAbbreviationVariant") &&
    source.includes("addModifierVariant"),
  "Abbreviations and modifiers must retain their editors"
);
assert(
  activePanel.includes("Weitere Informationen und Hilfestellungen werden hier ergänzt."),
  "Hilfe & Info must render its placeholder"
);

const autoCloseByLabel = searchSettings("Nicht aktive Fußnoten");
const autoCloseByHelper = searchSettings("zuvor geöffnete Fußnote");
const autoCloseByAlias = searchSettings("Fußnote schließen");
const authorItalic = searchSettings("Autor kursiv");
assert(autoCloseByLabel[0]?.id === "general.autoCloseInactiveFootnotes", "Search must match labels");
assert(autoCloseByHelper[0]?.id === "general.autoCloseInactiveFootnotes", "Search must match helper text");
assert(autoCloseByAlias[0]?.id === "general.autoCloseInactiveFootnotes", "Search must match aliases");
assert(authorItalic.some(({ id }) => id === "general.formatting.author"), "Search must find formatting settings");
assert(searchSettings("sicher-kein-treffer").length === 0, "Search must return an empty result set");
assert(SETTINGS_SEARCH_INDEX.length >= 70, "The local search index must cover the visible settings groups");

const authorTarget = resolveSettingsSearchSelection(
  authorItalic.find(({ id }) => id === "general.formatting.author")!
);
assert(
  authorTarget.topLevelSection === "GENERAL" &&
    authorTarget.nestedSection === "FORMATTING" &&
    authorTarget.targetElementId === "fc-setting-formatting-author",
  "Search selection must resolve section, nested accordion and exact focus target"
);
assert(
  activePanel.includes('scrollIntoView({ behavior: "smooth", block: "center" })') &&
    activePanel.includes('target.focus({ preventScroll: true })') &&
    css.includes(".fc-settings-search-target"),
  "Search navigation must center, focus and highlight its target"
);
assert(
  activePanel.includes("Keine passende Einstellung gefunden."),
  "Search must expose a clear no-result state"
);

for (const action of [
  "Einstellungen speichern",
  "Exportieren",
  "Importieren",
  "Änderungen verwerfen",
  "Standard wiederherstellen",
]) {
  assert(activePanel.includes(action), `The global action card must retain ${action}`);
}
assert(
  activePanel.includes("fc-settings-action-card") && css.includes(".fc-settings-action-card"),
  "The search/action card must remain styled as a sticky Settings control"
);
assert(
  css.includes("@media (max-width: 519px)") &&
    css.includes("@media (max-width: 399px)") &&
    css.includes(".fc-settings-nested-trigger:focus-visible"),
  "Settings must retain 520/400/320 responsive behavior and visible keyboard focus"
);

console.log("Settings information architecture tests passed.");
