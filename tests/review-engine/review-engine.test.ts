import { analyzeFootnotes } from "../../src/footnote-engine/engine";
import { FORMATTING_RULE_IDS } from "../../src/footnote-engine/rules/formatting";
import { LOCAL_RULES, REGISTERED_DOCUMENT_RULES } from "../../src/footnote-engine/rules/registry";
import type { Finding } from "../../src/footnote-engine/types";
import {
  REVIEW_CLASS_LABELS,
  REVIEW_STATUS_LABELS,
  acceptAllAutomatic,
  missingReviewPolicyRuleIds,
  resetAllDecisions,
  runReviewEngine,
  setReviewStatus,
} from "../../src/review-engine";
import type { ReviewDecisionState, ReviewEngineResult, ReviewMode } from "../../src/review-engine";
import type { FootnoteSnapshot, FormattingRun } from "../../src/taskpane/taskpane";
import { canApplySingleReviewItem } from "../../src/write-back-engine";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function snapshot(
  contentText: string,
  ordinal = 1,
  formattingRuns: FormattingRun[] = []
): FootnoteSnapshot {
  return {
    id: `review-footnote-${ordinal}`,
    ordinal,
    displayLabel: String(ordinal),
    rawWordText: contentText,
    contentText,
    contentLength: contentText.length,
    originalTextHash: `review-hash-${ordinal}-${contentText.length}`,
    reference: { referenceText: String(ordinal) },
    locator: {
      ordinal,
      displayLabel: String(ordinal),
      originalTextHash: `review-hash-${ordinal}-${contentText.length}`,
      contextBefore: "",
      contextAfter: "",
    },
    paragraphCount: 1,
    paragraphs: [],
    hyperlinks: [],
    fields: [],
    bookmarks: [],
    contentControls: [],
    protectedRanges: [],
    readStatus: "complete",
    readWarnings: [],
    formattingRuns,
    paragraphFormats: [],
  };
}

function finding(
  footnote: FootnoteSnapshot,
  overrides: Partial<Finding> & Pick<Finding, "ruleId" | "category" | "start" | "end">
): Finding {
  const originalText =
    overrides.originalText ?? footnote.contentText.slice(overrides.start, overrides.end);
  return {
    findingId:
      overrides.findingId ??
      `finding:${footnote.id}:${overrides.ruleId}:${overrides.start}:${overrides.end}:${overrides.suggestedText ?? ""}`,
    footnoteId: footnote.id,
    footnoteOrdinal: footnote.ordinal,
    sourceTextHash: footnote.originalTextHash,
    originalText,
    severity: "warning",
    message: "Testfinding",
    ...overrides,
  };
}

function review(
  findings: readonly Finding[],
  footnotes: readonly FootnoteSnapshot[],
  mode: ReviewMode,
  decisionState: ReviewDecisionState = {}
): ReviewEngineResult {
  return runReviewEngine({ findings, footnotes, mode, decisionState });
}

function engineReview(
  footnotes: readonly FootnoteSnapshot[],
  mode: ReviewMode = "ANALYSIS"
): ReviewEngineResult {
  const engine = analyzeFootnotes(footnotes);
  return runReviewEngine({
    findings: engine.findings,
    footnotes,
    mode,
    protectedRangesByFootnoteId: new Map(
      engine.footnoteAnalyses.map((analysis) => [analysis.footnoteId, analysis.protectedRanges])
    ),
  });
}

const finalPeriodFootnote = snapshot("Text");
const finalPeriodFinding = analyzeFootnotes([finalPeriodFootnote]).findings.find(
  (candidate) => candidate.ruleId === "FINAL_PERIOD"
);
assert(finalPeriodFinding?.severity === "error", "FINAL_PERIOD severity must remain error");
const finalAnalysis = review([finalPeriodFinding], [finalPeriodFootnote], "ANALYSIS");
const finalReview = review([finalPeriodFinding], [finalPeriodFootnote], "REVIEW");
const finalCorrection = review([finalPeriodFinding], [finalPeriodFootnote], "CORRECTION");
assert(finalAnalysis.items[0].reviewClass === "AUTO", "FINAL_PERIOD must be automatic");
assert(
  finalAnalysis.items[0].decision.effectiveStatus === "UNREVIEWED" &&
    finalReview.items[0].decision.effectiveStatus === "UNREVIEWED",
  "Analysis and review defaults must remain open"
);
assert(
  finalCorrection.items[0].decision.effectiveStatus === "ACCEPTED" &&
    finalCorrection.items[0].decision.source === "MODE_DEFAULT" &&
    finalCorrection.summary.correctionReady === 1,
  "Correction mode must stage safe automatic findings"
);
let decisions = setReviewStatus({}, finalCorrection.items[0], "REJECTED");
for (const mode of ["ANALYSIS", "REVIEW", "CORRECTION"] as const) {
  const decided = review([finalPeriodFinding], [finalPeriodFootnote], mode, decisions).items[0];
  assert(
    decided.decision.effectiveStatus === "REJECTED" && decided.decision.source === "USER",
    "Explicit user rejection must survive mode changes"
  );
}

const emptyFootnote = snapshot("", 2);
const emptyFinding = analyzeFootnotes([emptyFootnote]).findings.find(
  (candidate) => candidate.ruleId === "EMPTY_FOOTNOTE"
);
assert(emptyFinding?.severity === "error", "EMPTY_FOOTNOTE severity must remain error");
const emptyReview = review([emptyFinding], [emptyFootnote], "CORRECTION");
assert(
  emptyReview.items[0].reviewClass === "MANUAL" &&
    emptyReview.items[0].proposedAction === undefined &&
    emptyReview.summary.correctionReady === 0,
  "Empty footnotes must require a manual decision without invented action"
);

const bracketFootnote = snapshot("BGHSt 47, 45 (49.", 3);
const bracketReview = engineReview([bracketFootnote], "CORRECTION");
const bracketItem = bracketReview.items.find(
  (item) => item.finding.ruleId === "CITATION_PINPOINT_BRACKETS"
);
assert(
  bracketItem?.reviewClass === "AUTO" &&
    bracketItem.proposedAction?.type === "TEXT_INSERT" &&
    bracketItem.proposedAction.text === ")" &&
    bracketReview.summary.correctionReady === 1,
  "Safe pinpoint bracket insertion must be correction-ready"
);

const caseLawReview = engineReview([snapshot("BGH, Urteil vom 5.7.2025 - 3 StR 123/25.", 4)]);
for (const ruleId of [
  "CASE_LAW_DECISION_TYPE",
  "CASE_LAW_DATE_INTRODUCER",
  "CASE_LAW_DATE_FORMAT",
]) {
  assert(
    caseLawReview.items.find((item) => item.finding.ruleId === ruleId)?.reviewClass === "AUTO",
    `${ruleId} must be automatic when guards pass`
  );
}
const caseLawMulti = engineReview([
  snapshot(
    "BGH, Urteil vom 5.7.2025 – 3 StR 123/25 = NJW 2025, 1234 = BeckRS 2025, 12345.",
    40
  ),
]);
assert(
  ["CASE_LAW_DECISION_TYPE", "CASE_LAW_DATE_INTRODUCER", "CASE_LAW_DATE_FORMAT"].every(
    (ruleId) =>
      caseLawMulti.items.some(
        (item) => item.finding.ruleId === ruleId && item.reviewClass === "AUTO"
      )
  ) && !caseLawMulti.items.some((item) => item.finding.ruleId === "RULE_OUTPUT_INVALID"),
  "The complete case-law citation must expose all three safe automatic findings"
);
const shortYearReview = engineReview([snapshot("BGH, Urteil vom 5.7.25 – 3 StR 123/25.", 41)]);
const shortYearItem = shortYearReview.items.find(
  (item) => item.finding.ruleId === "CASE_LAW_DATE_FORMAT"
);
assert(
  shortYearItem?.reviewClass === "MANUAL" &&
    shortYearItem.proposedAction === undefined &&
    !shortYearItem.canAccept &&
    !canApplySingleReviewItem(shortYearItem),
  "A two-digit year must be visible for manual review without an invented replacement"
);
const fullYearCorrection = engineReview(
  [snapshot("BGH, Urt. v. 5.7.2025 – 3 StR 123/25.", 42)],
  "CORRECTION"
);
const fullYearDateItem = fullYearCorrection.items.find(
  (item) => item.finding.ruleId === "CASE_LAW_DATE_FORMAT"
);
assert(
  fullYearDateItem?.reviewClass === "AUTO" &&
    fullYearDateItem.proposedAction?.type === "TEXT_REPLACE" &&
    fullYearDateItem.proposedAction.replacementText === "05.07.2025" &&
    canApplySingleReviewItem(fullYearDateItem),
  "A deterministic four-digit date must remain accepted and individually applicable"
);
const muekoReview = engineReview([snapshot("MüKo-StGB/Fischer Rdnr. 4.", 5)]);
assert(
  muekoReview.items.find((item) => item.finding.ruleId === "COMMENTARY_WORK_NAME")?.reviewClass ===
    "AUTO",
  "Safe MüKo work-name mapping must be automatic"
);
assert(
  muekoReview.items.find((item) => item.finding.ruleId === "COMMENTARY_MARGIN_NUMBER_ABBREVIATION")
    ?.reviewClass === "AUTO",
  "Safe margin-number normalization must be automatic"
);
const muekoFormatted = snapshot("MüKo-StGB/Fischer Rn. 4.", 51, [
  { start: 0, end: 9, fontName: "Arial", fontSize: 10 },
]);
muekoFormatted.baseCharacterFormat = { fontName: "Aptos Serif", fontSize: 8 };
const muekoFormattedReview = engineReview([muekoFormatted], "CORRECTION");
const muekoCompatibleItems = muekoFormattedReview.items.filter((item) =>
  [
    "COMMENTARY_WORK_NAME",
    "FORMAT_FONT_NAME",
    "FORMAT_FONT_SIZE",
  ].includes(item.finding.ruleId)
);
assert(
  muekoCompatibleItems.length === 3 &&
    muekoCompatibleItems.every((item) => item.reviewClass === "AUTO") &&
    muekoFormattedReview.conflicts.length === 0,
  "Overlapping MüKo text replacement and formatting correction must remain compatible"
);
const palandtReview = engineReview([snapshot("Palandt/Reiter § 464 BGB Rn. 2.", 6)]);
assert(
  palandtReview.items.length === 1 &&
    palandtReview.items[0].finding.ruleId === "SOURCE_MAPPING_LEGACY_UNCERTAIN" &&
    palandtReview.items[0].reviewClass === "INFO" &&
    !palandtReview.items[0].canAccept,
  "Uncertain Palandt mapping must remain informational and non-actionable"
);

const authorText = "Roxin, Strafrecht AT, 5. Aufl. 2020.";
const authorFootnote = snapshot(authorText, 7, [
  { start: 0, end: authorText.length, italic: false, bold: false, underline: "None" },
]);
const authorItem = engineReview([authorFootnote]).items.find(
  (item) => item.finding.ruleId === "BOOK_AUTHOR_FORMATTING"
);

const technicalFormatText = "0123456789abcdefghij-rest.";
const technicalFormatFootnote = snapshot(technicalFormatText, 70, [
  { start: 10, end: 20, fontName: "Arial", fontSize: 10, bold: true },
]);
technicalFormatFootnote.baseCharacterFormat = {
  fontName: "Aptos Serif",
  fontSize: 8,
  bold: false,
};
const technicalFormatReview = engineReview([technicalFormatFootnote]);
for (const [ruleId, property, expected] of [
  ["FORMAT_FONT_NAME", "fontName", "Aptos Serif"],
  ["FORMAT_FONT_SIZE", "fontSize", 8],
] as const) {
  const item = technicalFormatReview.items.find((candidate) => candidate.finding.ruleId === ruleId);
  assert(
    item?.reviewClass === "AUTO" &&
      item.proposedAction?.type === "FORMAT_CHANGE" &&
      item.proposedAction.changes[property] === expected,
    `${ruleId} must produce an independent automatic format action`
  );
}
assert(
  technicalFormatReview.conflicts.length === 0,
  "Independent formatting properties on one range must not conflict"
);
const genericBoldItem = technicalFormatReview.items.find(
  (item) => item.finding.ruleId === "FORMAT_BOLD"
);
assert(
  genericBoldItem?.reviewClass === "AUTO" &&
    genericBoldItem.proposedAction?.type === "FORMAT_CHANGE" &&
    genericBoldItem.proposedAction.changes.bold === false,
  "A bold outlier with a safe technical baseline must remain a separate automatic finding"
);

const additionalFormatFootnote = snapshot("Formatwerte.", 701, [
  {
    start: 0,
    end: 6,
    underline: "Single",
    strikeThrough: true,
    superscript: true,
    characterSpacing: 1.5,
  },
  { start: 7, end: 11, subscript: true },
]);
additionalFormatFootnote.baseCharacterFormat = {
  underline: "None",
  strikeThrough: false,
  superscript: false,
  subscript: false,
  characterSpacing: 0,
};
const additionalFormatItems = engineReview([additionalFormatFootnote]).items.filter((item) =>
  [
    "FORMAT_UNDERLINE",
    "FORMAT_STRIKE",
    "FORMAT_SUPERSCRIPT",
    "FORMAT_SUBSCRIPT",
    "FORMAT_CHARACTER_SPACING",
  ].includes(item.finding.ruleId)
);
assert(
  additionalFormatItems.length === 5 &&
    additionalFormatItems.every(
      (item) => item.reviewClass === "AUTO" && item.proposedAction?.type === "FORMAT_CHANGE"
    ),
  "Every safely baselined technical formatting property must build its own automatic action"
);

const unknownItalicFootnote = snapshot("Unbekannte Quelle XYZ.", 71, [
  { start: 11, end: 17, italic: true },
]);
unknownItalicFootnote.baseCharacterFormat = { italic: false };
const unknownItalicItem = engineReview([unknownItalicFootnote]).items.find(
  (item) => item.finding.ruleId === "FORMAT_ITALIC_REVIEW"
);
assert(
  unknownItalicItem?.reviewClass === "MANUAL" &&
    unknownItalicItem.proposedAction === undefined &&
    !unknownItalicItem.canAccept,
  "Unknown italic semantics must be manual and must not stage a format action"
);

const bearbeiterText = "MüKo-StGB/Fischer, § 263 Rn. 4.";
const bearbeiterFootnote = snapshot(bearbeiterText, 72, [
  { start: 0, end: bearbeiterText.length, italic: false },
]);
bearbeiterFootnote.baseCharacterFormat = { italic: false };
const bearbeiterItem = engineReview([bearbeiterFootnote]).items.find(
  (item) =>
    item.finding.ruleId === "COMMENTARY_FORMATTING" &&
    item.finding.metadata?.role === "bearbeiter"
);
assert(
  bearbeiterItem?.reviewClass === "MANUAL" &&
    bearbeiterItem.proposedAction?.type === "FORMAT_CHANGE" &&
    bearbeiterItem.proposedAction.changes.italic === true,
  "A mapping-hint bearbeiter deviation must remain visible for manual review"
);

const protectedFormatFootnote = snapshot("Formatbereich.", 73, [
  { start: 0, end: 6, fontSize: 10 },
]);
protectedFormatFootnote.baseCharacterFormat = { fontSize: 8 };
protectedFormatFootnote.protectedRanges = [{ type: "field", start: 0, end: 6 }];
const protectedFormatItem = engineReview([protectedFormatFootnote]).items.find(
  (item) => item.finding.ruleId === "FORMAT_FONT_SIZE"
);
assert(
  protectedFormatItem?.reviewClass === "TECHNICAL" &&
    protectedFormatItem.classificationReason === "PROTECTED_RANGE",
  "A formatting outlier over a protected range must never remain automatic"
);

const documentNormalOne = snapshot("Erste Fußnote.", 74);
documentNormalOne.baseCharacterFormat = { fontName: "Aptos Serif", fontSize: 8, italic: false };
documentNormalOne.paragraphs = [
  { index: 0, start: 0, end: documentNormalOne.contentText.length },
];
const documentNormalTwo = snapshot("Zweite Fußnote.", 75);
documentNormalTwo.baseCharacterFormat = { fontName: "Aptos Serif", fontSize: 8, italic: false };
documentNormalTwo.paragraphs = [
  { index: 0, start: 0, end: documentNormalTwo.contentText.length },
];
const documentOutlier = snapshot("Falsch formatierte Fußnote.", 76);
documentOutlier.baseCharacterFormat = { fontName: "Arial", fontSize: 10 };
documentOutlier.paragraphs = [{ index: 0, start: 0, end: documentOutlier.contentText.length }];
const documentFormatReview = engineReview([
  documentNormalOne,
  documentNormalTwo,
  documentOutlier,
]);
const documentOutlierItems = documentFormatReview.items.filter(
  (item) => item.finding.footnoteId === documentOutlier.id && item.finding.category === "formatting"
);
assert(
  documentOutlierItems.length === 2 &&
    documentOutlierItems.every(
      (item) => item.reviewClass === "AUTO" && item.proposedAction?.type === "FORMAT_CHANGE"
    ),
  "Whole-footnote font and size outliers must reach Review as two automatic format actions"
);

const mappedBearbeiterText = "MüKo-StGB/Fischer Rn. 4.";
const mappedBearbeiterFootnote = snapshot(mappedBearbeiterText, 77);
mappedBearbeiterFootnote.baseCharacterFormat = { italic: null };
const mappedBearbeiterReview = engineReview([
  documentNormalOne,
  documentNormalTwo,
  mappedBearbeiterFootnote,
]);
const mappedBearbeiterItem = mappedBearbeiterReview.items.find(
  (item) =>
    item.finding.ruleId === "COMMENTARY_FORMATTING" &&
    item.finding.metadata?.roleResolutionSource === "SOURCE_MAPPING_HINT"
);
assert(
  mappedBearbeiterItem?.finding.originalText === "Fischer" &&
    mappedBearbeiterItem.reviewClass === "MANUAL" &&
    mappedBearbeiterItem.proposedAction?.type === "FORMAT_CHANGE" &&
    mappedBearbeiterItem.proposedAction.changes.italic === true,
  "A mapping-hint MüKo bearbeiter must create a manual proposed italic action"
);

const multiBearbeiterText = "MüKo-StGB/Regge/Pegel, § 185 Rn. 39.";
const multiBearbeiterFootnote = snapshot(multiBearbeiterText, 78);
multiBearbeiterFootnote.baseCharacterFormat = { italic: false };
const multiBearbeiterReview = engineReview([multiBearbeiterFootnote]);
const multiBearbeiterItems = multiBearbeiterReview.items.filter(
  (item) =>
    item.finding.ruleId === "COMMENTARY_FORMATTING" &&
    item.finding.metadata?.roleResolutionSource === "SOURCE_MAPPING_HINT"
);
assert(
  multiBearbeiterItems.length === 2 &&
    multiBearbeiterItems.every(
      (item) => item.reviewClass === "MANUAL" && item.proposedAction?.type === "FORMAT_CHANGE"
    ) &&
    multiBearbeiterItems.map((item) => item.finding.originalText).join("/") === "Regge/Pegel",
  "All mapping-hint bearbeiters must reach Review as separate manual actions"
);

const journalAuthorsText = "Müller/Meier, NJW 2025, 100 (105).";
const journalAuthorsFootnote = snapshot(journalAuthorsText, 79);
journalAuthorsFootnote.baseCharacterFormat = { italic: false };
const journalAuthorsReview = engineReview([journalAuthorsFootnote]);
const journalAuthorItems = journalAuthorsReview.items.filter(
  (item) => item.finding.ruleId === "JOURNAL_AUTHOR_FORMATTING"
);
assert(
  journalAuthorItems.length === 2 &&
    journalAuthorItems.every(
      (item) =>
        item.reviewClass === "AUTO" &&
        item.proposedAction?.type === "FORMAT_CHANGE" &&
        item.proposedAction.changes.italic === true
    ) &&
    !journalAuthorsReview.items.some(
      (item) => item.finding.ruleId === "FORMAT_ITALIC_REVIEW"
    ),
  "All parser-safe journal authors must be automatic without duplicate generic italic findings"
);
assert(
  authorItem?.reviewClass === "AUTO" &&
    authorItem.proposedAction?.type === "FORMAT_CHANGE" &&
    authorItem.proposedAction.changes.italic === true,
  "Known author italic change must be automatic"
);

const formattingFootnote = snapshot("Bearbeiter", 8);
const safeBold = finding(formattingFootnote, {
  ruleId: "COMMENTARY_FORMATTING",
  category: "formatting",
  start: 0,
  end: formattingFootnote.contentText.length,
  metadata: {
    role: "bearbeiter",
    formattingProperty: "bold",
    expected: true,
    actual: false,
    baselineSource: "ROLE_SETTING",
    baselineConfidence: "SAFE",
  },
});
const parserSafeBearbeiterItalic = finding(formattingFootnote, {
  findingId: "parser-safe-bearbeiter-italic",
  ruleId: "COMMENTARY_FORMATTING",
  category: "formatting",
  start: 0,
  end: formattingFootnote.contentText.length,
  metadata: {
    role: "bearbeiter",
    semanticRole: "bearbeiter",
    roleResolutionSource: "PARSER",
    formattingProperty: "italic",
    expected: true,
    actual: false,
    baselineSource: "ROLE_SETTING",
    baselineConfidence: "SAFE",
  },
});
const unknownItalic = finding(formattingFootnote, {
  findingId: "unknown-italic",
  ruleId: "COMMENTARY_FORMATTING",
  category: "formatting",
  start: 0,
  end: formattingFootnote.contentText.length,
  metadata: {
    role: "unknown",
    formattingProperty: "italic",
    expected: true,
    actual: false,
    baselineSource: "LOCAL_DOMINANT_FORMAT",
    baselineConfidence: "HIGH",
  },
});
const fontSize = finding(formattingFootnote, {
  findingId: "font-size",
  ruleId: "COMMENTARY_FORMATTING",
  category: "formatting",
  start: 0,
  end: formattingFootnote.contentText.length,
  metadata: {
    role: "bearbeiter",
    formattingProperty: "fontSize",
    expected: 8,
    actual: 10,
    baselineSource: "LOCAL_DOMINANT_FORMAT",
    baselineConfidence: "HIGH",
  },
});
const mixed = finding(formattingFootnote, {
  findingId: "mixed-formatting",
  ruleId: "COMMENTARY_FORMATTING",
  category: "formatting",
  start: 0,
  end: formattingFootnote.contentText.length,
  metadata: {
    role: "bearbeiter",
    formattingProperty: "bold",
    expected: true,
    actual: "mixed",
    baselineSource: "ROLE_SETTING",
    baselineConfidence: "SAFE",
  },
});
const formattingReview = review(
  [safeBold, parserSafeBearbeiterItalic, unknownItalic, fontSize, mixed],
  [formattingFootnote],
  "ANALYSIS"
);
assert(
  formattingReview.items.find((item) => item.finding.findingId === safeBold.findingId)
    ?.reviewClass === "AUTO",
  "Known bearbeiter bold change must be automatic"
);
const parserSafeBearbeiterItem = formattingReview.items.find(
  (item) => item.finding.findingId === parserSafeBearbeiterItalic.findingId
);
assert(
  parserSafeBearbeiterItem?.reviewClass === "AUTO" &&
    parserSafeBearbeiterItem.proposedAction?.type === "FORMAT_CHANGE" &&
    parserSafeBearbeiterItem.proposedAction.changes.italic === true,
  "A parser-safe bearbeiter italic deviation must be an automatic format action"
);
assert(
  formattingReview.items.find((item) => item.finding.findingId === unknownItalic.findingId)
    ?.reviewClass === "MANUAL",
  "Unknown-role italic change must never be automatic"
);
assert(
  formattingReview.items.find((item) => item.finding.findingId === fontSize.findingId)
    ?.reviewClass === "AUTO",
  "Explicit font-size change must be automatic"
);
assert(
  formattingReview.items.find((item) => item.finding.findingId === mixed.findingId)?.reviewClass ===
    "TECHNICAL",
  "Mixed formatting must be technical"
);

const protectedFootnote = snapshot("Text", 9);
protectedFootnote.protectedRanges = [{ type: "field", start: 0, end: 4 }];
const protectedFinding = finding(protectedFootnote, {
  ruleId: "STATUTE_ABBREVIATION_STYLE",
  category: "citation",
  start: 0,
  end: 4,
  suggestedText: "Norm",
});
const protectedItem = review([protectedFinding], [protectedFootnote], "CORRECTION").items[0];
assert(
  protectedItem.reviewClass === "TECHNICAL" &&
    protectedItem.classificationReason === "PROTECTED_RANGE" &&
    protectedItem.decision.effectiveStatus === "UNREVIEWED",
  "Protected automatic targets must be downgraded"
);

const staleFootnote = snapshot("Text", 10);
const staleFinding = {
  ...finding(staleFootnote, {
    ruleId: "FINAL_PERIOD",
    category: "punctuation",
    start: 4,
    end: 4,
    suggestedText: ".",
  }),
  sourceTextHash: "stale-hash",
};
const staleItem = review([staleFinding], [staleFootnote], "CORRECTION").items[0];
assert(
  staleItem.reviewClass === "TECHNICAL" && staleItem.classificationReason === "SOURCE_CHANGED",
  "Stale source hashes must be technical"
);

const conflictFootnote = snapshot("Token", 11);
const conflictLeft = finding(conflictFootnote, {
  findingId: "conflict-left",
  ruleId: "STATUTE_ABBREVIATION_STYLE",
  category: "citation",
  start: 0,
  end: 5,
  suggestedText: "Links",
});
const conflictRight = finding(conflictFootnote, {
  findingId: "conflict-right",
  ruleId: "CASE_LAW_DECISION_TYPE",
  category: "citation",
  start: 0,
  end: 5,
  suggestedText: "Rechts",
});
const conflictReview = review([conflictLeft, conflictRight], [conflictFootnote], "CORRECTION");
assert(
  conflictReview.conflicts.length === 1 &&
    conflictReview.items.every(
      (item) => item.reviewClass === "TECHNICAL" && item.conflicts.length === 1
    ) &&
    conflictReview.summary.correctionReady === 0,
  "Conflicting replacements must form a technical conflict group"
);

const formatConflictLeft = finding(conflictFootnote, {
  findingId: "format-conflict-left",
  ruleId: "FORMAT_FONT_NAME",
  category: "formatting",
  start: 0,
  end: 5,
  metadata: { formattingProperty: "fontName", expected: "Aptos Serif", actual: "Arial" },
});
const formatConflictRight = finding(conflictFootnote, {
  findingId: "format-conflict-right",
  ruleId: "FORMAT_FONT_NAME",
  category: "formatting",
  start: 0,
  end: 5,
  metadata: { formattingProperty: "fontName", expected: "Times New Roman", actual: "Arial" },
});
const formatConflictReview = review(
  [formatConflictLeft, formatConflictRight],
  [conflictFootnote],
  "CORRECTION"
);
assert(
  formatConflictReview.conflicts.length === 1 &&
    formatConflictReview.items.every((item) => item.reviewClass === "TECHNICAL"),
  "Contradictory formatting values for the same property must remain a technical conflict"
);

const consistencyFinding = finding(conflictFootnote, {
  findingId: "consistency",
  ruleId: "SOURCE_NAME_CONSISTENCY",
  category: "citation",
  start: 0,
  end: 5,
});
assert(
  review([consistencyFinding], [conflictFootnote], "CORRECTION").items[0].reviewClass === "MANUAL",
  "Consistency findings must require a manual decision"
);

const allCurrentRuleIds = [
  ...LOCAL_RULES.map((rule) => rule.ruleId),
  ...FORMATTING_RULE_IDS,
  ...REGISTERED_DOCUMENT_RULES.map((rule) => rule.ruleId),
  "RULE_OUTPUT_INVALID",
  "RULE_REPLACEMENT_CONFLICT",
];
assert(
  missingReviewPolicyRuleIds(allCurrentRuleIds).length === 0,
  "Every current rule must have an explicit review policy"
);
const unknownActionable = finding(conflictFootnote, {
  findingId: "unknown-actionable",
  ruleId: "FUTURE_ACTIONABLE_RULE",
  category: "citation",
  start: 0,
  end: 5,
  suggestedText: "Future",
});
const unknownInfo = finding(conflictFootnote, {
  findingId: "unknown-info",
  ruleId: "FUTURE_INFO_RULE",
  category: "citation",
  start: 0,
  end: 5,
});
const unknownReview = review([unknownActionable, unknownInfo], [conflictFootnote], "CORRECTION");
assert(
  unknownReview.items[0].reviewClass === "MANUAL" && unknownReview.items[1].reviewClass === "INFO",
  "Unknown rules must never become automatic"
);

decisions = acceptAllAutomatic({}, finalCorrection.items);
assert(
  decisions[finalPeriodFinding.findingId]?.status === "ACCEPTED",
  "Bulk helper must accept automatic items"
);
assert(Object.keys(resetAllDecisions()).length === 0, "Reset helper must clear decisions");
const changedFinding = { ...finalPeriodFinding, sourceTextHash: "new-hash" };
const changedFootnote = { ...finalPeriodFootnote, originalTextHash: "new-hash" };
const reanalyzed = review([changedFinding], [changedFootnote], "CORRECTION", decisions).items[0];
assert(
  reanalyzed.decision.source === "MODE_DEFAULT" &&
    reanalyzed.decision.effectiveStatus === "ACCEPTED",
  "Stale explicit decisions must be discarded before applying mode defaults"
);

assert(REVIEW_CLASS_LABELS.AUTO === "Automatisch", "German review class label missing");
assert(REVIEW_STATUS_LABELS.DEFERRED === "Später prüfen", "German status label missing");

const massFootnotes = Array.from({ length: 1200 }, (_, index) => snapshot("Text", index + 1000));
const massFindings = massFootnotes.map((footnote, index) =>
  finding(footnote, {
    findingId: `mass-${index}`,
    ruleId: "FINAL_PERIOD",
    category: "punctuation",
    start: 4,
    end: 4,
    suggestedText: ".",
    severity: "error",
  })
);
const massStartedAt = Date.now();
const massReview = review(massFindings, massFootnotes, "CORRECTION");
const massElapsed = Date.now() - massStartedAt;
assert(
  massReview.items.length === 1200 && massReview.summary.correctionReady === 1200,
  "Review Engine must process every mass-test finding"
);
assert(massElapsed < 10_000, `Review Engine mass test too slow: ${massElapsed} ms`);
console.log(`POC 12 performance: 1200 findings in ${massElapsed} ms`);
