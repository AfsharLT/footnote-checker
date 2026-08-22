import type { FootnoteSnapshot, FormattingRun } from "../../taskpane/taskpane";
import { isRangeProtected } from "../protected-ranges";
import { mappedCommentaryBearbeiterCandidates } from "./helpers";
import type {
  DocumentFootnoteFormattingBaseline,
  FormattingBaselineProperty,
  FormattingBaselineValue,
  RuleContext,
  RuleFindingCandidate,
} from "./types";

export const FORMATTING_RULE_IDS = [
  "FORMAT_FONT_NAME",
  "FORMAT_FONT_SIZE",
  "FORMAT_BOLD",
  "FORMAT_ITALIC_REVIEW",
  "FORMAT_UNDERLINE",
  "FORMAT_STRIKE",
  "FORMAT_SUPERSCRIPT",
  "FORMAT_SUBSCRIPT",
  "FORMAT_CHARACTER_SPACING",
] as const;

type FormattingRuleId = (typeof FORMATTING_RULE_IDS)[number];

export interface FormattingBaseline {
  property: FormattingBaselineProperty;
  value: FormattingBaselineValue;
  source: "LOCAL_DOMINANT_FORMAT" | "DOCUMENT_FOOTNOTE_FORMAT";
  confidence: "HIGH";
}

export interface FormattingRuleOutput {
  context: RuleContext;
  ruleId: FormattingRuleId;
  priority: number;
  candidate: RuleFindingCandidate;
}

interface SemanticFormattingRange {
  start: number;
  end: number;
  role: "author" | "bearbeiter" | "editor" | "workTitle";
  expected: Partial<Record<"italic" | "bold" | "underline", boolean>>;
}

export const REGISTERED_FORMATTING_RULES: ReadonlyArray<{
  property: FormattingBaselineProperty;
  ruleId: FormattingRuleId;
  priority: number;
  automatic: boolean;
}> = [
  { property: "fontName", ruleId: "FORMAT_FONT_NAME", priority: 210, automatic: true },
  { property: "fontSize", ruleId: "FORMAT_FONT_SIZE", priority: 211, automatic: true },
  { property: "bold", ruleId: "FORMAT_BOLD", priority: 212, automatic: true },
  { property: "italic", ruleId: "FORMAT_ITALIC_REVIEW", priority: 213, automatic: false },
  { property: "underline", ruleId: "FORMAT_UNDERLINE", priority: 214, automatic: true },
  {
    property: "strikeThrough",
    ruleId: "FORMAT_STRIKE",
    priority: 215,
    automatic: true,
  },
  { property: "superscript", ruleId: "FORMAT_SUPERSCRIPT", priority: 216, automatic: true },
  { property: "subscript", ruleId: "FORMAT_SUBSCRIPT", priority: 217, automatic: true },
  {
    property: "characterSpacing",
    ruleId: "FORMAT_CHARACTER_SPACING",
    priority: 218,
    automatic: true,
  },
];

function knownFormattingValue(value: unknown): value is FormattingBaselineValue {
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && value.length > 0 && value.toLowerCase() !== "mixed";
}

function formattingValuesEqual(
  property: FormattingBaselineProperty,
  left: FormattingBaselineValue,
  right: FormattingBaselineValue
): boolean {
  return property === "fontName" && typeof left === "string" && typeof right === "string"
    ? left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0
    : left === right;
}

function mergedCoverage(
  runs: readonly FormattingRun[],
  property: FormattingBaselineProperty
): number {
  const ranges = runs
    .filter((run) => knownFormattingValue(run[property]))
    .map((run) => ({ start: run.start, end: run.end }))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  let coverage = 0;
  let start = -1;
  let end = -1;
  for (const range of ranges) {
    if (range.end <= range.start) continue;
    if (start < 0) {
      start = range.start;
      end = range.end;
    } else if (range.start <= end) {
      end = Math.max(end, range.end);
    } else {
      coverage += end - start;
      start = range.start;
      end = range.end;
    }
  }
  return start < 0 ? 0 : coverage + end - start;
}

export function deriveFormattingBaseline(
  footnote: FootnoteSnapshot,
  property: FormattingBaselineProperty
): FormattingBaseline | undefined {
  const baseValue = footnote.baseCharacterFormat?.[property];
  if (knownFormattingValue(baseValue)) {
    return {
      property,
      value: baseValue,
      source: "LOCAL_DOMINANT_FORMAT",
      confidence: "HIGH",
    };
  }

  // Formatting runs only contain serialized, safely mapped data. If the Word
  // range itself is mixed, infer a dominant value only when explicit runs cover
  // the complete content; otherwise inherited/style values would be guesses.
  const runs = footnote.formattingRuns ?? [];
  const contentLength = footnote.contentText.length;
  if (contentLength === 0 || mergedCoverage(runs, property) < contentLength) {
    return undefined;
  }
  const coverageByValue = new Map<string, { value: FormattingBaselineValue; coverage: number }>();
  for (const run of runs) {
    const value = run[property];
    if (!knownFormattingValue(value) || run.end <= run.start) continue;
    const key = `${typeof value}:${String(value).toLocaleLowerCase("de-DE")}`;
    const entry = coverageByValue.get(key);
    if (entry) entry.coverage += run.end - run.start;
    else coverageByValue.set(key, { value, coverage: run.end - run.start });
  }
  const ordered = [...coverageByValue.values()].sort(
    (left, right) => right.coverage - left.coverage
  );
  if (
    ordered.length === 0 ||
    ordered[0].coverage <= contentLength / 2 ||
    ordered[0].coverage === ordered[1]?.coverage
  ) {
    return undefined;
  }
  return {
    property,
    value: ordered[0].value,
    source: "LOCAL_DOMINANT_FORMAT",
    confidence: "HIGH",
  };
}

function formattingValueKey(value: FormattingBaselineValue): string {
  return `${typeof value}:${String(value).toLocaleLowerCase("de-DE")}`;
}

export function deriveDocumentFootnoteFormattingBaseline(
  footnotes: readonly FootnoteSnapshot[]
): DocumentFootnoteFormattingBaseline {
  const baseline: DocumentFootnoteFormattingBaseline = {};
  for (const definition of REGISTERED_FORMATTING_RULES) {
    const coverageByValue = new Map<
      string,
      {
        value: FormattingBaselineValue;
        characterCoverage: number;
        footnoteCoverage: number;
      }
    >();
    let knownCharacterCoverage = 0;
    let knownFootnoteCoverage = 0;
    for (const footnote of footnotes) {
      const representative = deriveFormattingBaseline(footnote, definition.property);
      const length = footnote.contentText.length;
      if (!representative || length === 0) continue;
      knownCharacterCoverage += length;
      knownFootnoteCoverage += 1;
      const key = formattingValueKey(representative.value);
      const current = coverageByValue.get(key);
      if (current) {
        current.characterCoverage += length;
        current.footnoteCoverage += 1;
      } else {
        coverageByValue.set(key, {
          value: representative.value,
          characterCoverage: length,
          footnoteCoverage: 1,
        });
      }
    }
    const ordered = [...coverageByValue.values()].sort(
      (left, right) =>
        right.footnoteCoverage - left.footnoteCoverage ||
        right.characterCoverage - left.characterCoverage
    );
    const winner = ordered[0];
    if (
      !winner ||
      winner.footnoteCoverage <= knownFootnoteCoverage / 2 ||
      (ordered[1] !== undefined && winner.footnoteCoverage === ordered[1].footnoteCoverage)
    ) {
      continue;
    }
    baseline[definition.property] = {
      ...winner,
      confidence: "HIGH",
      knownCharacterCoverage,
      knownFootnoteCoverage,
    };
  }
  return baseline;
}

function addSemanticRange(
  output: SemanticFormattingRange[],
  target: { start: number; end: number } | undefined,
  role: SemanticFormattingRange["role"],
  expected: SemanticFormattingRange["expected"]
): void {
  if (target && target.start < target.end) output.push({ ...target, role, expected });
}

function semanticFormattingRanges(contexts: readonly RuleContext[]): SemanticFormattingRange[] {
  const output: SemanticFormattingRange[] = [];
  for (const context of contexts) {
    if (
      context.effectiveCitationType === "COMMENTARY" &&
      context.sourceMapping?.personStructureHint === "WORK_THEN_BEARBEITER"
    ) {
      const commentarySettings = context.resolvedSettings.settings as {
        bearbeiterFormatting: SemanticFormattingRange["expected"];
      };
      mappedCommentaryBearbeiterCandidates(context).forEach((candidate) =>
        addSemanticRange(output, candidate, "bearbeiter", commentarySettings.bearbeiterFormatting)
      );
    }
    const extraction = context.extraction;
    if (!extraction) continue;
    if (extraction.type === "COMMENTARY") {
      const settings = context.resolvedSettings.settings as {
        bearbeiterFormatting: SemanticFormattingRange["expected"];
        editorFormatting: SemanticFormattingRange["expected"];
      };
      extraction.data.persons.forEach((person) => {
        if (person.role === "bearbeiter") {
          addSemanticRange(output, person, "bearbeiter", settings.bearbeiterFormatting);
        } else if (person.role === "editor") {
          addSemanticRange(output, person, "editor", settings.editorFormatting);
        }
      });
      addSemanticRange(
        output,
        extraction.data.work,
        "workTitle",
        context.resolvedSettings.formatting.workTitle
      );
    } else if (extraction.type === "BOOK") {
      const settings = context.resolvedSettings.settings as {
        authorFormatting: SemanticFormattingRange["expected"];
      };
      extraction.data.authors.forEach((author) =>
        addSemanticRange(output, author, "author", settings.authorFormatting)
      );
      addSemanticRange(
        output,
        extraction.data.title,
        "workTitle",
        context.resolvedSettings.formatting.workTitle
      );
    } else if (extraction.type === "JOURNAL_ARTICLE") {
      const settings = context.resolvedSettings.settings as {
        authorFormatting: SemanticFormattingRange["expected"];
      };
      extraction.data.authors.forEach((author) =>
        addSemanticRange(output, author, "author", settings.authorFormatting)
      );
    } else if (extraction.type === "BOOK_CHAPTER") {
      const settings = context.resolvedSettings.settings as {
        authorFormatting: SemanticFormattingRange["expected"];
        editorFormatting: SemanticFormattingRange["expected"];
      };
      extraction.data.authors.forEach((author) =>
        addSemanticRange(output, author, "author", settings.authorFormatting)
      );
      extraction.data.editors.forEach((editor) =>
        addSemanticRange(output, editor, "editor", settings.editorFormatting)
      );
      addSemanticRange(
        output,
        extraction.data.containerTitle,
        "workTitle",
        context.resolvedSettings.formatting.workTitle
      );
    } else if (extraction.type === "CASE_NOTE") {
      const settings = context.resolvedSettings.settings as {
        authorFormatting: SemanticFormattingRange["expected"];
      };
      extraction.data.authors.forEach((author) =>
        addSemanticRange(output, author, "author", settings.authorFormatting)
      );
    }
  }
  return output;
}

function message(property: FormattingBaselineProperty, manual: boolean): string {
  if (manual) {
    return "Die Kursivformatierung weicht vom umgebenden Fußnotenformat ab und sollte geprüft werden.";
  }
  const labels: Record<Exclude<FormattingBaselineProperty, "italic">, string> = {
    fontName: "Schriftart",
    fontSize: "Schriftgröße",
    bold: "Fettformatierung",
    underline: "Unterstreichung",
    strikeThrough: "Durchstreichung",
    superscript: "Hochstellung",
    subscript: "Tiefstellung",
    characterSpacing: "Zeichenabstand",
  };
  return `Die ${labels[property as keyof typeof labels]} weicht vom Fußnotenformat ab.`;
}

function boundariesForRun(
  run: FormattingRun,
  semanticRanges: readonly SemanticFormattingRange[],
  property: FormattingBaselineProperty
): number[] {
  const boundaries = new Set([run.start, run.end]);
  semanticRanges.forEach((range) => {
    if (!(property in range.expected)) return;
    if (range.start > run.start && range.start < run.end) boundaries.add(range.start);
    if (range.end > run.start && range.end < run.end) boundaries.add(range.end);
  });
  return [...boundaries].sort((left, right) => left - right);
}

export function createFormattingRuleOutputs(
  footnoteContext: RuleContext,
  segmentContexts: readonly RuleContext[],
  documentBaseline: DocumentFootnoteFormattingBaseline
): FormattingRuleOutput[] {
  const footnote = footnoteContext.footnote;
  const semanticRanges = semanticFormattingRanges(segmentContexts);
  const output: FormattingRuleOutput[] = [];

  const addOutput = (
    definition: (typeof REGISTERED_FORMATTING_RULES)[number],
    start: number,
    end: number,
    actual: FormattingBaselineValue,
    baseline: FormattingBaseline
  ): void => {
    const protectedRange = isRangeProtected(start, end, footnoteContext.protectedRanges);
    output.push({
      context: footnoteContext,
      ruleId: definition.ruleId,
      priority: definition.priority,
      candidate: {
        category: "formatting",
        start,
        end,
        originalText: footnote.contentText.slice(start, end),
        severity: "warning",
        message: message(definition.property, !definition.automatic),
        metadata: {
          formattingProperty: definition.property,
          expected: baseline.value,
          ...(definition.property === "italic" ? { expectedBaseline: baseline.value } : {}),
          actual,
          role: definition.automatic ? "technical" : "unknown",
          semanticRole: definition.automatic ? undefined : "unknown",
          baselineSource: baseline.source,
          baselineConfidence: baseline.confidence,
          ...(baseline.source === "DOCUMENT_FOOTNOTE_FORMAT"
            ? {
                baselineCharacterCoverage: documentBaseline[definition.property]?.characterCoverage,
                baselineFootnoteCoverage: documentBaseline[definition.property]?.footnoteCoverage,
              }
            : {}),
          ...(protectedRange ? { protectedRange: true } : {}),
        },
      },
    });
  };

  for (const definition of REGISTERED_FORMATTING_RULES) {
    const localBaseline = deriveFormattingBaseline(footnote, definition.property);
    const documentProperty = documentBaseline[definition.property];
    const documentFormattingBaseline: FormattingBaseline | undefined = documentProperty
      ? {
          property: definition.property,
          value: documentProperty.value,
          source: "DOCUMENT_FOOTNOTE_FORMAT",
          confidence: documentProperty.confidence,
        }
      : undefined;
    const hasExplicitPropertyRun = (footnote.formattingRuns ?? []).some((run) =>
      knownFormattingValue(run[definition.property])
    );

    if (
      !hasExplicitPropertyRun &&
      localBaseline &&
      documentFormattingBaseline &&
      !formattingValuesEqual(
        definition.property,
        localBaseline.value,
        documentFormattingBaseline.value
      ) &&
      footnote.contentText.length > 0
    ) {
      const wholeFootnoteRun: FormattingRun = {
        start: 0,
        end: footnote.contentText.length,
      };
      const boundaries = boundariesForRun(wholeFootnoteRun, semanticRanges, definition.property);
      for (let index = 0; index < boundaries.length - 1; index += 1) {
        const start = boundaries[index];
        const end = boundaries[index + 1];
        const semanticRange = semanticRanges.find(
          (range) =>
            range.start <= start && range.end >= end && definition.property in range.expected
        );
        if (!semanticRange) {
          addOutput(definition, start, end, localBaseline.value, documentFormattingBaseline);
        }
      }
    }

    for (const run of footnote.formattingRuns ?? []) {
      if (
        !Number.isInteger(run.start) ||
        !Number.isInteger(run.end) ||
        run.start < 0 ||
        run.start >= run.end ||
        run.end > footnote.contentText.length
      ) {
        continue;
      }
      const actual = run[definition.property];
      if (!knownFormattingValue(actual)) continue;
      const baseline =
        localBaseline && !formattingValuesEqual(definition.property, actual, localBaseline.value)
          ? localBaseline
          : documentFormattingBaseline &&
              !formattingValuesEqual(definition.property, actual, documentFormattingBaseline.value)
            ? documentFormattingBaseline
            : undefined;
      if (!baseline) continue;
      const boundaries = boundariesForRun(run, semanticRanges, definition.property);
      for (let index = 0; index < boundaries.length - 1; index += 1) {
        const start = boundaries[index];
        const end = boundaries[index + 1];
        if (start >= end) continue;
        const semanticRange = semanticRanges.find(
          (range) =>
            range.start <= start && range.end >= end && definition.property in range.expected
        );
        if (semanticRange) continue;
        addOutput(definition, start, end, actual, baseline);
      }
    }
  }
  return output;
}
