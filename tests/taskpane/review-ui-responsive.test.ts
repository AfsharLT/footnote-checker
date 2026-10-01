import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const css = readFileSync(join(process.cwd(), "src/taskpane/styles.css"), "utf8");
const workspace = readFileSync(
  join(process.cwd(), "src/taskpane/components/ReviewWorkspace.tsx"),
  "utf8"
);
const settings = readFileSync(
  join(process.cwd(), "src/taskpane/components/SettingsPanel.tsx"),
  "utf8"
);
const app = readFileSync(join(process.cwd(), "src/taskpane/components/App.tsx"), "utf8");
const brandLogo = readFileSync(
  join(process.cwd(), "src/taskpane/components/BrandLogo.tsx"),
  "utf8"
);
const collapsible = readFileSync(
  join(process.cwd(), "src/components/ui/collapsible.tsx"),
  "utf8"
);
const webpack = readFileSync(join(process.cwd(), "webpack.config.js"), "utf8");
const manifest = readFileSync(join(process.cwd(), "manifest.xml"), "utf8");
const writeBackStatus = readFileSync(
  join(process.cwd(), "src/write-back-engine/status.ts"),
  "utf8"
);
const writeBackOfficeAdapter = readFileSync(
  join(process.cwd(), "src/write-back-engine/office-adapter.ts"),
  "utf8"
);
const correctionAutoApply = readFileSync(
  join(process.cwd(), "src/write-back-engine/correction-auto-apply.ts"),
  "utf8"
);
const batchRunner = readFileSync(
  join(process.cwd(), "src/write-back-engine/batch-runner.ts"),
  "utf8"
);
const batchPlanner = readFileSync(
  join(process.cwd(), "src/write-back-engine/batch-planner.ts"),
  "utf8"
);

function cssRule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  assert(start >= 0, `CSS rule ${selector} must exist`);
  const end = css.indexOf("}", start);
  assert(end >= 0, `CSS rule ${selector} must be closed`);
  return css.slice(start, end + 1);
}

assert(css.includes("overflow-x: hidden"), "The task pane root must prevent horizontal overflow");
assert(css.includes("@media (max-width: 399px)"), "A compact layout must cover a 320 px task pane");
assert(css.includes("@media (max-width: 519px)"), "A medium layout must cover a 400 px task pane");
assert(css.includes("grid-template-columns: repeat(2, minmax(0, 1fr))"), "Summary and filters must collapse to two columns below 520 px");
assert(css.includes(".fc-finding__actions { display: grid; grid-template-columns: 1fr; }"), "Finding actions must stack at narrow widths");
assert(css.includes(".fc-filters-mobile { display: block; }"), "Filters must become collapsible below 400 px");
assert(css.includes("max-width: 720px") && css.includes("min-width: 0"), "The default 520 px layout must remain fluid without fixed minimum width");
assert(
  css.includes(".fc-search > div:focus-within") &&
    !css.includes(".fc-search input:focus-visible"),
  "Search focus styling must use one shared focus ring without a nested input border"
);
assert(
  css.includes(".fc-sticky-actions") && css.includes("position: sticky") && css.includes("z-index: 20"),
  "Review and correction action summaries must remain sticky below the app header"
);
const rootProviderRule = cssRule(".fc-root-provider");
const appRule = cssRule(".fc-app");
const shellRule = cssRule(".fc-shell");
assert(
  css.includes("html,\nbody,\n#container") &&
    css.includes("height: 100%") &&
    rootProviderRule.includes("height: 100%") &&
    rootProviderRule.includes("overflow: hidden") &&
    appRule.includes("height: 100%") &&
    appRule.includes("min-height: 0") &&
    appRule.includes("overflow: hidden") &&
    shellRule.includes("flex: 1 1 auto") &&
    shellRule.includes("min-height: 0") &&
    shellRule.includes("overflow-y: auto") &&
    shellRule.includes("overflow-x: hidden"),
  "The task pane must have one explicit vertical scroll owner with an unbroken height chain"
);
assert(
  !/(^|[;\s])(transform|filter|contain)\s*:/.test(
    `${rootProviderRule}\n${appRule}\n${shellRule}`
  ),
  "Direct sticky ancestors must not create a transform, filter or containment context"
);
assert(
  app.includes('className="fc-shell fc-shell--settings"') &&
    workspace.includes('className="fc-shell"') && workspace.includes("ref={scrollOwnerRef}") &&
    settings.includes('position: "sticky"') &&
    settings.includes('top: "0px"'),
  "Settings and review sticky bars must live inside the same real scroll viewport"
);
assert(
  workspace.includes("createClosedFootnoteState") &&
    workspace.includes("open={openFootnotes.has(group.footnote.id)}") &&
    !workspace.includes("defaultOpen={index < 5}") &&
    collapsible.includes('typeof children === "function" ? children() : children'),
  "Result groups must render lazily and default to collapsed"
);
assert(
  brandLogo.includes('"assets/fnc-logo-160.png"') &&
    workspace.includes("<BrandLogo") &&
    settings.includes("<BrandLogo") &&
    !workspace.includes("logo-filled.png") &&
    !settings.includes("logo-filled.png") &&
    settings.includes('aria-label="Einstellungsbereiche"') &&
    settings.includes("ChevronDown") &&
    settings.includes("position: \"sticky\"") &&
    settings.includes("Einstellungen speichern"),
  "Settings must use the branded logo, sticky actions and vertical accordion"
);
assert(
  webpack.includes('from: "assets/*"') &&
    manifest.includes("assets/fnc-icon-16.png") &&
    manifest.includes("assets/fnc-icon-32.png") &&
    manifest.includes("assets/fnc-icon-80.png"),
  "Webpack and the ribbon manifest must continue to deliver the Footnote Checker assets"
);
assert(
  workspace.includes("if (!action) return null") &&
    workspace.includes('"Datumsformat prüfen"') &&
    workspace.includes('"Durchführen"') &&
    workspace.includes("Ausgewählte Änderungen durchführen") &&
    !workspace.includes("Alle Findings durchführen"),
  "Manual dates must render one explanation and review write-back must use the selected-items batch action"
);
assert(
  writeBackStatus.includes('PENDING: "Ausstehend"') &&
    writeBackStatus.includes('APPLIED: "Durchgeführt"') &&
    writeBackStatus.includes('FAILED: "Fehlgeschlagen"') &&
    writeBackStatus.includes('STALE: "Erneut prüfen"') &&
    ["pending", "applied", "failed", "stale"].every((status) =>
      css.includes(`.fc-writeback-badge--${status}`)
    ),
  "All write-back states must have visible labels and distinct subtle status badges"
);
assert(
  app.includes("applySingleReviewItem") &&
    app.includes("writeBackInFlightRef") &&
    !app.includes("Word.run") &&
    !workspace.includes("Word.run") &&
    writeBackOfficeAdapter.includes("Word.run"),
  "React must delegate one guarded write-back to the central engine and never access Word directly"
);
assert(
  app.includes("runWriteBackBatch") &&
    app.includes("createWriteBackPlan") &&
    app.includes('mode === "CORRECTION"') &&
    workspace.includes("Sichere Korrekturen werden durchgeführt …") &&
    workspace.includes("batchSummary?.applied") &&
    batchPlanner.includes('mode === "CORRECTION"') &&
    batchPlanner.includes('item.reviewClass === "AUTO"') &&
    batchRunner.includes("await applySingleReviewItem") &&
    correctionAutoApply.includes("runWriteBackBatch") &&
    !batchRunner.includes("Word.run"),
  "Correction mode and its compatibility wrapper must use the central guarded batch engine"
);
assert(
  workspace.includes("Detailbericht exportieren") &&
    workspace.includes("Korrekturlauf abgeschlossen") &&
    app.includes("serializeWriteBackReportCsv") &&
    app.includes("new Blob") &&
    !app.includes("fetch("),
  "The local CSV report and compact batch completion summary must remain available without networking"
);
assert(
  workspace.includes("(props.currentPlan?.totals.eligible ?? 0) === 0") &&
    workspace.includes("disabled={props.isLoading || isMutationRunning") &&
    workspace.includes("Änderungen werden durchgeführt …"),
  "The review batch action must be disabled without eligible selections and during mutations"
);
assert(
  writeBackStatus.includes('"Bereits erledigt"') &&
    workspace.includes("writeBackResultLabel"),
  "Already-resolved actions must remain green APPLIED items with a distinct visible label"
);

console.log(
  "POC 13.4 scroll-owner, sticky, logo and responsive checks passed for 320 px, 400 px and 520 px layouts."
);
