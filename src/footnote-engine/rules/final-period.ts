import { isRangeProtected } from "../protected-ranges";
import type { FootnoteRule, RuleFindingCandidate } from "./types";

const WHITESPACE_PATTERN = /\s/;
const ASCII_PERIOD = ".";
const UNICODE_ELLIPSIS = "\u2026";
const IGNORED_TECHNICAL_END_CHARACTERS = new Set(["\u200b", "\ufeff"]);

type FinalPeriodViolationType =
  "missing" | "multiple" | "spacedMultiple" | "ellipsis" | "mixedDotCluster";

export interface TrailingCharacterDiagnostic {
  character: string;
  codePoint: string;
}

export function describeTrailingCharacters(
  contentText: string,
  maximumCharacters = 8
): TrailingCharacterDiagnostic[] {
  const characters = Array.from(contentText);
  const selectedCharacters = characters.slice(-Math.max(0, Math.floor(maximumCharacters)));

  return selectedCharacters.map((character) => ({
    character,
    codePoint: `U+${character.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}`,
  }));
}

function isIgnoredEndCharacter(character: string): boolean {
  return WHITESPACE_PATTERN.test(character) || IGNORED_TECHNICAL_END_CHARACTERS.has(character);
}

function isPeriodClusterCharacter(character: string): boolean {
  return character === ASCII_PERIOD || character === UNICODE_ELLIPSIS;
}

function findRelevantEnd(contentText: string): number {
  let end = contentText.length;

  while (end > 0 && isIgnoredEndCharacter(contentText[end - 1])) {
    end -= 1;
  }

  return end;
}

function createMissingPeriodCandidate(position: number): RuleFindingCandidate {
  return {
    category: "punctuation",
    start: position,
    end: position,
    originalText: "",
    suggestedText: ".",
    severity: "error",
    message: "Die Fußnote muss mit genau einem Punkt enden.",
    metadata: { violationType: "missing" },
  };
}

function createEndClusterCandidate(
  contentText: string,
  start: number,
  end: number,
  violationType: Exclude<FinalPeriodViolationType, "missing">
): RuleFindingCandidate {
  return {
    category: "punctuation",
    start,
    end,
    originalText: contentText.slice(start, end),
    suggestedText: ".",
    severity: "error",
    message: "Die Fußnote muss mit genau einem Punkt enden.",
    metadata: { violationType },
  };
}

export const finalPeriodRule: FootnoteRule = {
  ruleId: "FINAL_PERIOD",
  category: "punctuation",
  priority: 30,
  scope: "footnote",

  evaluate(context) {
    const { contentText } = context.footnote;
    const protectedRanges = context.protectedRanges;
    const relevantEnd = findRelevantEnd(contentText);

    if (relevantEnd === 0) {
      return [];
    }

    const lastCharacterIndex = relevantEnd - 1;

    if (!isPeriodClusterCharacter(contentText[lastCharacterIndex])) {
      return isRangeProtected(relevantEnd, relevantEnd, protectedRanges)
        ? []
        : [createMissingPeriodCandidate(relevantEnd)];
    }

    let clusterStart = lastCharacterIndex;
    let precedingIndex = lastCharacterIndex - 1;
    let clusterCharacterCount = 1;
    let asciiPeriodCount = contentText[lastCharacterIndex] === ASCII_PERIOD ? 1 : 0;
    let ellipsisCount = contentText[lastCharacterIndex] === UNICODE_ELLIPSIS ? 1 : 0;
    let hasSpacing = false;

    while (precedingIndex >= 0) {
      let spacingBeforePeriod = false;

      while (precedingIndex >= 0 && WHITESPACE_PATTERN.test(contentText[precedingIndex])) {
        spacingBeforePeriod = true;
        precedingIndex -= 1;
      }

      if (precedingIndex < 0 || !isPeriodClusterCharacter(contentText[precedingIndex])) {
        break;
      }

      clusterStart = precedingIndex;
      clusterCharacterCount += 1;
      asciiPeriodCount += contentText[precedingIndex] === ASCII_PERIOD ? 1 : 0;
      ellipsisCount += contentText[precedingIndex] === UNICODE_ELLIPSIS ? 1 : 0;
      hasSpacing ||= spacingBeforePeriod;
      precedingIndex -= 1;
    }

    if (
      (clusterCharacterCount === 1 && asciiPeriodCount === 1) ||
      isRangeProtected(clusterStart, relevantEnd, protectedRanges)
    ) {
      return [];
    }

    const violationType: Exclude<FinalPeriodViolationType, "missing"> =
      asciiPeriodCount > 0 && ellipsisCount > 0
        ? "mixedDotCluster"
        : ellipsisCount > 0
          ? "ellipsis"
          : hasSpacing
            ? "spacedMultiple"
            : "multiple";

    return [createEndClusterCandidate(contentText, clusterStart, relevantEnd, violationType)];
  },
};
