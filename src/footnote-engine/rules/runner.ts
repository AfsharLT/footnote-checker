import { isRangeProtected } from "../protected-ranges";
import type { Finding } from "../types";
import { createFormattingRuleOutputs } from "./formatting";
import { REGISTERED_DOCUMENT_RULES, LOCAL_RULES } from "./registry";
import type {
  DocumentRuleContext,
  PrioritizedFinding,
  RuleContext,
  RuleFindingCandidate,
} from "./types";

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function candidateActionIdentity(candidate: RuleFindingCandidate): string {
  if (candidate.suggestedText !== undefined) return `text:${candidate.suggestedText}`;
  const property = candidate.metadata?.formattingProperty;
  const expected = candidate.metadata?.expected;
  return property === undefined
    ? "no-action"
    : `format:${String(property)}:${JSON.stringify(expected)}`;
}

function findingId(context: RuleContext, ruleId: string, candidate: RuleFindingCandidate): string {
  return [
    "finding",
    context.footnote.id,
    ruleId,
    candidate.start,
    candidate.end,
    context.footnote.originalTextHash,
    stableHash(candidateActionIdentity(candidate)),
  ].join(":");
}

function technicalFinding(
  context: RuleContext,
  ruleId: string,
  priority: number,
  reason: string,
  attemptedCandidate?: RuleFindingCandidate
): PrioritizedFinding {
  const start = context.segment?.coreStart ?? 0;
  const end = context.segment?.coreEnd ?? start;
  const candidate: RuleFindingCandidate = {
    category: "technical",
    start,
    end,
    originalText: context.footnote.contentText.slice(start, end),
    severity: "error",
    message: "Eine Regel hat ein technisch ungültiges Prüfergebnis erzeugt.",
    metadata: {
      originatingRuleId: ruleId,
      sourceRuleId: ruleId,
      reason,
      attemptedStart: attemptedCandidate?.start ?? null,
      attemptedEnd: attemptedCandidate?.end ?? null,
      attemptedOriginalText: attemptedCandidate?.originalText ?? null,
      expectedSlice:
        attemptedCandidate &&
        Number.isInteger(attemptedCandidate.start) &&
        Number.isInteger(attemptedCandidate.end) &&
        attemptedCandidate.start >= 0 &&
        attemptedCandidate.start <= attemptedCandidate.end &&
        attemptedCandidate.end <= context.footnote.contentText.length
          ? context.footnote.contentText.slice(attemptedCandidate.start, attemptedCandidate.end)
          : null,
      footnoteId: context.footnote.id,
      segmentId: context.segment?.segmentId ?? null,
    },
  };
  return {
    findingId: findingId(context, "RULE_OUTPUT_INVALID", candidate),
    footnoteId: context.footnote.id,
    footnoteOrdinal: context.footnote.ordinal,
    sourceTextHash: context.footnote.originalTextHash,
    ruleId: "RULE_OUTPUT_INVALID",
    priority,
    ...(context.segment ? { citationSegmentId: context.segment.segmentId } : {}),
    ...candidate,
  };
}

function validateCandidate(
  context: RuleContext,
  ruleId: string,
  priority: number,
  candidate: RuleFindingCandidate
): PrioritizedFinding | undefined {
  const { contentText } = context.footnote;
  const validOffsets =
    Number.isInteger(candidate.start) &&
    Number.isInteger(candidate.end) &&
    candidate.start >= 0 &&
    candidate.start <= candidate.end &&
    candidate.end <= contentText.length;
  const validSlice =
    validOffsets && candidate.originalText === contentText.slice(candidate.start, candidate.end);
  const validZeroLength =
    candidate.start !== candidate.end ||
    (candidate.suggestedText !== undefined && candidate.suggestedText.length > 0) ||
    ruleId === "EMPTY_FOOTNOTE";
  const protectedReplacement =
    candidate.suggestedText !== undefined &&
    isRangeProtected(candidate.start, candidate.end, context.protectedRanges);

  if (!validOffsets || !validSlice || !validZeroLength || protectedReplacement) return undefined;
  return {
    findingId: findingId(context, ruleId, candidate),
    footnoteId: context.footnote.id,
    footnoteOrdinal: context.footnote.ordinal,
    sourceTextHash: context.footnote.originalTextHash,
    ruleId,
    priority,
    ...(context.segment ? { citationSegmentId: context.segment.segmentId } : {}),
    ...candidate,
  };
}

function evaluateRule(
  context: RuleContext,
  rule: (typeof LOCAL_RULES)[number]
): PrioritizedFinding[] {
  try {
    return rule.evaluate(context).flatMap((candidate) => {
      const finding = validateCandidate(context, rule.ruleId, rule.priority, candidate);
      return finding
        ? [finding]
        : [technicalFinding(context, rule.ruleId, rule.priority, "validation", candidate)];
    });
  } catch (error) {
    return [
      technicalFinding(
        context,
        rule.ruleId,
        rule.priority,
        error instanceof Error ? error.message : "unknown"
      ),
    ];
  }
}

function compareFindings(left: Finding, right: Finding): number {
  return (
    left.footnoteOrdinal - right.footnoteOrdinal ||
    left.start - right.start ||
    left.end - right.end ||
    left.ruleId.localeCompare(right.ruleId) ||
    left.findingId.localeCompare(right.findingId)
  );
}

function deduplicateAndResolve(findings: readonly PrioritizedFinding[]): Finding[] {
  const exact = new Map<string, PrioritizedFinding>();
  for (const finding of findings) {
    const key = [
      finding.footnoteId,
      finding.ruleId,
      finding.start,
      finding.end,
      finding.suggestedText ?? "",
      finding.metadata?.formattingProperty ?? "",
      JSON.stringify(finding.metadata?.expected ?? null),
    ].join("\u0000");
    const previous = exact.get(key);
    if (!previous || finding.priority < previous.priority) exact.set(key, finding);
  }

  const replacementGroups = new Map<string, PrioritizedFinding[]>();
  const output: PrioritizedFinding[] = [];
  for (const finding of exact.values()) {
    if (finding.suggestedText === undefined) {
      output.push(finding);
      continue;
    }
    const key = [finding.footnoteId, finding.start, finding.end].join("\u0000");
    const group = replacementGroups.get(key);
    if (group) group.push(finding);
    else replacementGroups.set(key, [finding]);
  }

  replacementGroups.forEach((group) => {
    const suggestions = new Set(group.map((finding) => finding.suggestedText));
    const ordered = [...group].sort(
      (left, right) => left.priority - right.priority || left.ruleId.localeCompare(right.ruleId)
    );
    if (suggestions.size === 1) {
      output.push(...ordered);
      return;
    }
    const first = ordered[0];
    const conflict: PrioritizedFinding = {
      ...first,
      findingId: [
        "finding",
        first.footnoteId,
        "RULE_REPLACEMENT_CONFLICT",
        first.start,
        first.end,
        first.sourceTextHash,
        stableHash(ordered.map((finding) => finding.suggestedText).join("|")),
      ].join(":"),
      ruleId: "RULE_REPLACEMENT_CONFLICT",
      category: "technical",
      severity: "info",
      message:
        "Mehrere Regeln schlagen für denselben Textbereich unterschiedliche Ersetzungen vor.",
      metadata: {
        conflictingRuleIds: ordered.map((finding) => finding.ruleId),
        suggestedAlternatives: [...suggestions].sort(),
      },
    };
    delete conflict.suggestedText;
    output.push(conflict);
  });

  return output
    .map((finding) => {
      const validated: Partial<PrioritizedFinding> = { ...finding };
      delete validated.priority;
      return validated as Finding;
    })
    .sort(compareFindings);
}

export function runRules(
  footnoteContexts: readonly RuleContext[],
  segmentContexts: readonly RuleContext[],
  document: Omit<DocumentRuleContext, "findingsSoFar" | "occurrences">
): Finding[] {
  const findings: PrioritizedFinding[] = [];
  const emptyFootnoteIds = new Set<string>();
  for (const context of footnoteContexts) {
    for (const rule of LOCAL_RULES) {
      if (rule.scope !== "footnote") continue;
      const evaluated = evaluateRule(context, rule);
      findings.push(...evaluated);
      if (evaluated.some((finding) => finding.ruleId === "EMPTY_FOOTNOTE")) {
        emptyFootnoteIds.add(context.footnote.id);
      }
    }
  }

  for (const context of segmentContexts) {
    if (emptyFootnoteIds.has(context.footnote.id)) continue;
    for (const rule of LOCAL_RULES) {
      if (rule.scope !== "segment") continue;
      if (
        rule.supportedCitationTypes &&
        !rule.supportedCitationTypes.includes(context.effectiveCitationType)
      ) {
        continue;
      }
      findings.push(...evaluateRule(context, rule));
    }
  }

  const segmentsByFootnote = new Map<string, RuleContext[]>();
  for (const context of segmentContexts) {
    const contexts = segmentsByFootnote.get(context.footnote.id);
    if (contexts) contexts.push(context);
    else segmentsByFootnote.set(context.footnote.id, [context]);
  }
  for (const context of footnoteContexts) {
    const outputs = createFormattingRuleOutputs(
      context,
      segmentsByFootnote.get(context.footnote.id) ?? [],
      context.documentFormattingBaseline
    );
    for (const output of outputs) {
      const finding = validateCandidate(
        output.context,
        output.ruleId,
        output.priority,
        output.candidate
      );
      findings.push(
        finding ??
          technicalFinding(
            output.context,
            output.ruleId,
            output.priority,
            "validation",
            output.candidate
          )
      );
    }
  }

  let validatedSoFar = deduplicateAndResolve(findings);
  for (const rule of REGISTERED_DOCUMENT_RULES) {
    const context: DocumentRuleContext = {
      ...document,
      occurrences: segmentContexts,
      findingsSoFar: validatedSoFar,
    };
    for (const output of rule.evaluate(context)) {
      const ruleContext = segmentContexts.find(
        (candidate) => candidate.footnote.id === output.footnote.id
      );
      if (!ruleContext) continue;
      const finding = validateCandidate(
        ruleContext,
        output.ruleId,
        output.priority,
        output.candidate
      );
      if (finding) findings.push(finding);
      else
        findings.push(technicalFinding(ruleContext, output.ruleId, output.priority, "validation"));
    }
    validatedSoFar = deduplicateAndResolve(findings);
  }
  return validatedSoFar;
}
