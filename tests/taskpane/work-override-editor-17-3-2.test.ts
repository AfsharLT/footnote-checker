import * as React from "react";
import { createDefaultCitationStyleProfile } from "../../src/citation-settings/defaults";
import type { CitationStyleProfile } from "../../src/citation-settings/types";
import {
  exportCitationSourceMappingCsv,
  parseCitationSourceMappingCsv,
} from "../../src/citation-mapping/normalized-csv";
import { parseCitationSourceMapping } from "../../src/citation-mapping/validation";
import type { CitationSourceMappingData } from "../../src/citation-mapping/types";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const initial: CitationSourceMappingData = {
  schemaVersion: 1,
  sources: [
    {
      schemaVersion: 1,
      canonicalSourceId: "commentary-without-override",
      kind: "COMMENTARY",
      preferredName: "Kommentar ohne Override",
      legalArea: "STRAFRECHT",
      applicableCitationTypes: ["COMMENTARY"],
      active: true,
    },
    {
      schemaVersion: 1,
      canonicalSourceId: "commentary-with-override",
      kind: "COMMENTARY",
      preferredName: "Kommentar mit Override",
      legalArea: "STRAFRECHT",
      applicableCitationTypes: ["COMMENTARY"],
      active: true,
      workOverride: {
        canonicalWorkId: "commentary-with-override",
        citationType: "COMMENTARY",
        formatting: { bearbeiter: { italic: false } },
        citationSettingsOverride: { personSeparator: " / " },
      },
    },
    {
      schemaVersion: 1,
      canonicalSourceId: "journal-without-override",
      kind: "JOURNAL",
      preferredName: "Journal ohne Override",
      legalArea: "SONSTIGE",
      applicableCitationTypes: ["JOURNAL_ARTICLE"],
      active: true,
    },
    {
      schemaVersion: 1,
      canonicalSourceId: "commentary-without-formatting",
      kind: "COMMENTARY",
      preferredName: "Kommentar Teiloverride",
      legalArea: "STRAFRECHT",
      applicableCitationTypes: ["COMMENTARY"],
      active: true,
      workOverride: {
        canonicalWorkId: "commentary-without-formatting",
        citationType: "COMMENTARY",
        preferredName: "Sondername",
        citationSettingsOverride: { marginNumberAbbreviation: "Rdn." },
      },
    },
    {
      schemaVersion: 1,
      canonicalSourceId: "commentary-with-empty-override",
      kind: "COMMENTARY",
      preferredName: "Kommentar leerer Override",
      legalArea: "STRAFRECHT",
      applicableCitationTypes: ["COMMENTARY"],
      active: true,
      workOverride: {
        canonicalWorkId: "commentary-with-empty-override",
        citationType: "COMMENTARY",
        formatting: {},
        citationSettingsOverride: {},
      },
    },
  ],
  aliases: [
    "commentary-without-override",
    "commentary-with-override",
    "journal-without-override",
    "commentary-without-formatting",
    "commentary-with-empty-override",
  ].map((canonicalSourceId) => ({
    canonicalSourceId,
    alias: canonicalSourceId,
    matchMode: "CASE_INSENSITIVE_TEXT",
    wholeWord: true,
    active: true,
  })),
};

const legacy = parseCitationSourceMapping(JSON.stringify(initial));
assert(legacy.success, "An older mapping without overrides must remain valid");
assert(
  legacy.data.sources[0].workOverride === undefined &&
    legacy.data.sources[2].workOverride === undefined,
  "Validation must preserve ordinary inheritance without creating overrides"
);
const imported = parseCitationSourceMappingCsv(exportCitationSourceMappingCsv(initial));
assert(imported.success, "CSV import must accept empty override columns");
assert(
  imported.data.sources.find((source) => source.canonicalSourceId === "commentary-without-override")
    ?.workOverride === undefined &&
    imported.data.sources.find((source) => source.canonicalSourceId === "journal-without-override")
      ?.workOverride === undefined,
  "CSV roundtrip must keep empty override columns empty"
);

async function runUiTest() {
  const parsed = require("linkedom").parseHTML("<html><body><div id='root'></div></body></html>");
  const window = parsed.window as Window & typeof globalThis;
  const document = parsed.document as Document;
  Object.assign(globalThis, {
    window,
    document,
    HTMLElement: window.HTMLElement,
    HTMLDetailsElement: window.HTMLDetailsElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import("react-dom/client");
  const { Simulate } = await import("react-dom/test-utils");
  const { act } = React;
  const { SettingsPanel } = await import("../../src/taskpane/components/SettingsPanel");
  const container = document.getElementById("root");
  assert(container !== null, "Test root missing");
  const root = createRoot(container);
  let saved: CitationSourceMappingData | undefined;
  let savedProfile: CitationStyleProfile | undefined;
  const unchangedMapping = JSON.stringify(legacy.data);
  const render = (mappingData: CitationSourceMappingData) =>
    React.createElement(SettingsPanel, {
      activeProfile: createDefaultCitationStyleProfile(),
      mappingData,
      onSaveProfile: (profile: CitationStyleProfile) => {
        savedProfile = profile;
        return { success: true, usedMemoryFallback: false };
      },
      onSaveMapping: (mapping: CitationSourceMappingData) => {
        saved = mapping;
        return { success: true, usedMemoryFallback: false };
      },
      onClose: () => undefined,
    });
  await act(async () => root.render(render(legacy.data)));
  const literature = Array.from(container.querySelectorAll(".fc-settings-top-level button")).find(
    (button) => button.textContent?.trim() === "Literaturverzeichnis"
  );
  assert(literature !== undefined, "Literature accordion trigger missing");
  await act(async () => (literature as HTMLButtonElement).click());
  assert(saved === undefined, "Opening the editor must not save anything");
  assert(
    JSON.stringify(legacy.data) === unchangedMapping,
    "Opening the editor must not mutate the supplied mapping"
  );

  function card(name: string): Element {
    const match = Array.from(container.querySelectorAll(".fc-settings-source-card")).find(
      (element) => element.querySelector("summary")?.textContent?.includes(name)
    );
    assert(match !== undefined, `Source card missing: ${name}`);
    return match;
  }
  function field(sourceName: string, label: string): HTMLSelectElement {
    const match = Array.from(card(sourceName).querySelectorAll("label"))
      .find((element) => element.textContent?.includes(label))
      ?.querySelector("select");
    assert(match !== undefined, `Missing ${label} on ${sourceName}`);
    return match as HTMLSelectElement;
  }
  async function choose(sourceName: string, label: string, value: string) {
    const select = field(sourceName, label);
    await act(async () => {
      select.value = value;
      Simulate.change(select, { target: { value } as unknown as EventTarget });
    });
  }

  assert(
    field("Kommentar ohne Override", "Bearbeiter kursiv").value === "inherit",
    "Inherited formatting must render"
  );
  assert(
    field("Kommentar mit Override", "Bearbeiter kursiv").value === "false",
    "Existing formatting must render"
  );
  assert(
    field("Journal ohne Override", "Fundstellenstil-Override").value === "inherit",
    "Inherited pinpoint style must render"
  );
  assert(
    field("Kommentar Teiloverride", "Bearbeiter kursiv").value === "inherit",
    "Missing formatting subtree must inherit"
  );
  await choose("Kommentar ohne Override", "Bearbeiter kursiv", "true");
  assert(
    container.textContent?.includes("Ungespeicherte Änderungen"),
    "Editor selection must mark mapping dirty"
  );
  await choose("Kommentar mit Override", "Herausgeber kursiv", "true");
  await choose("Kommentar Teiloverride", "Bearbeiter kursiv", "true");
  await choose("Journal ohne Override", "Fundstellenstil-Override", "comma");
  const save = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === "Literaturverzeichnis speichern"
  );
  assert(save !== undefined, "Literature save control missing");
  await act(async () => save.click());
  assert(saved !== undefined, "Explicit changes must reach the save callback");
  const journalOverride = saved.sources[2].workOverride;
  assert(
    saved.sources[0].workOverride?.formatting?.bearbeiter?.italic === true &&
      saved.sources[1].workOverride?.formatting?.editor?.italic === true &&
      saved.sources[1].workOverride?.citationSettingsOverride?.personSeparator === " / " &&
      saved.sources[3].workOverride?.formatting?.bearbeiter?.italic === true &&
      saved.sources[3].workOverride?.preferredName === "Sondername" &&
      saved.sources[3].workOverride?.citationSettingsOverride !== undefined &&
      "marginNumberAbbreviation" in saved.sources[3].workOverride.citationSettingsOverride &&
      saved.sources[3].workOverride.citationSettingsOverride.marginNumberAbbreviation === "Rdn." &&
      journalOverride?.citationSettingsOverride !== undefined &&
      "pinpointStyle" in journalOverride.citationSettingsOverride &&
      journalOverride.citationSettingsOverride.pinpointStyle === "comma",
    "First edit must create an override and existing fields must survive"
  );

  await choose("Kommentar ohne Override", "Bearbeiter kursiv", "inherit");
  await choose("Journal ohne Override", "Fundstellenstil-Override", "inherit");
  await choose("Kommentar leerer Override", "Bearbeiter kursiv", "inherit");
  await act(async () => save.click());
  assert(
    saved.sources[0].workOverride === undefined &&
      saved.sources[2].workOverride === undefined &&
      saved.sources[4].workOverride === undefined,
    "Resetting the final field must restore inheritance"
  );
  const reloaded = parseCitationSourceMapping(JSON.stringify(saved));
  assert(
    reloaded.success &&
      reloaded.data.sources[0].workOverride === undefined &&
      reloaded.data.sources[1].workOverride?.formatting?.editor?.italic === true &&
      reloaded.data.sources[3].workOverride?.formatting?.bearbeiter?.italic === true,
    "Inherited and existing override values must survive reload"
  );
  const citation = Array.from(container.querySelectorAll(".fc-settings-top-level button")).find(
    (button) => button.textContent?.trim() === "Zitiereinstellungen"
  );
  assert(citation !== undefined, "Citation settings accordion trigger missing");
  await act(async () => (citation as HTMLButtonElement).click());
  const festschrift = Array.from(container.querySelectorAll(".fc-settings-nested-trigger")).find(
    (button) => button.textContent?.trim() === "Festschriften"
  );
  assert(festschrift !== undefined, "Festschrift settings trigger missing");
  await act(async () => (festschrift as HTMLButtonElement).click());
  const pinpointSelect = Array.from(container.querySelectorAll("label"))
    .find((label) => label.textContent?.includes("Konkrete Fundstelle"))
    ?.querySelector("select");
  assert(pinpointSelect !== undefined, "Festschrift pinpoint style must be editable");
  await act(async () => {
    pinpointSelect.value = "parentheses";
    Simulate.change(pinpointSelect, {
      target: { value: "parentheses" } as unknown as EventTarget,
    });
  });
  const saveSettings = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === "Einstellungen speichern"
  );
  assert(saveSettings !== undefined, "Settings save control missing");
  await act(async () => saveSettings.click());
  assert(
    savedProfile?.bookChapter.pinpointStyle === "parentheses",
    "Festschrift style must be saved"
  );
  await act(async () => (literature as HTMLButtonElement).click());
  const removeSource = Array.from(card("Kommentar ohne Override").querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === "Quelle entfernen"
  );
  assert(removeSource !== undefined, "Source removal control missing");
  await act(async () => removeSource.click());
  const confirmRemoval = card("Kommentar ohne Override").querySelector(
    '[role="dialog"] button'
  );
  assert(confirmRemoval !== null, "Local source removal confirmation missing");
  await act(async () => (confirmRemoval as HTMLButtonElement).click());
  assert(
    !Array.from(container.querySelectorAll(".fc-settings-source-card")).some((element) =>
      element.querySelector("summary")?.textContent?.includes("Kommentar ohne Override")
    ) && field("Kommentar mit Override", "Bearbeiter kursiv").value === "false",
    "Removing one source must not crash or disturb a different editor"
  );
  await act(async () => root.unmount());
}

void runUiTest().then(
  () => console.log("POC 17.3.2 WorkOverrideEditor render, interaction and reload tests passed."),
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
