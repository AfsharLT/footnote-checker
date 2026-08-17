import type { TextPatternMatch } from "./types";

// The candidate expression deliberately stops at whitespace, markup delimiters,
// and quotation marks. Boundary cleanup below handles sentence punctuation.
const URL_CANDIDATE_PATTERN =
  /(?:https?:\/\/|www\.)[^\s<>"'\u00ab\u00bb\u2018\u2019\u201c\u201d\u2026]+/gi;
const INVALID_START_BOUNDARY_PATTERN = /[A-Za-z0-9_@]/;
const SIMPLE_TRAILING_PUNCTUATION = new Set([".", ",", ";", ":"]);
const CLOSING_DELIMITERS = [")", "]", "}"] as const;

interface DelimiterBalance {
  opening: string;
  openingCount: number;
  closingCount: number;
}

function createDelimiterBalances(value: string): Record<string, DelimiterBalance> {
  const balances: Record<string, DelimiterBalance> = {
    ")": { opening: "(", openingCount: 0, closingCount: 0 },
    "]": { opening: "[", openingCount: 0, closingCount: 0 },
    "}": { opening: "{", openingCount: 0, closingCount: 0 },
  };

  for (const character of value) {
    for (const closing of CLOSING_DELIMITERS) {
      const balance = balances[closing];

      if (character === balance.opening) {
        balance.openingCount += 1;
      } else if (character === closing) {
        balance.closingCount += 1;
      }
    }
  }

  return balances;
}

function trimUrlBoundary(candidate: string): string {
  const balances = createDelimiterBalances(candidate);
  let end = candidate.length;

  while (end > 0) {
    const lastCharacter = candidate[end - 1];

    if (SIMPLE_TRAILING_PUNCTUATION.has(lastCharacter)) {
      end -= 1;
      continue;
    }

    const delimiterBalance = balances[lastCharacter];

    if (delimiterBalance && delimiterBalance.closingCount > delimiterBalance.openingCount) {
      delimiterBalance.closingCount -= 1;
      end -= 1;
      continue;
    }

    break;
  }

  return candidate.slice(0, end);
}

function hasValidStartBoundary(text: string, start: number): boolean {
  return start === 0 || !INVALID_START_BOUNDARY_PATTERN.test(text[start - 1]);
}

function hasUrlPayload(candidate: string): boolean {
  const prefixMatch = /^(?:https?:\/\/|www\.)/i.exec(candidate);
  return prefixMatch !== null && candidate.length > prefixMatch[0].length;
}

export function findPlainTextUrls(text: string): TextPatternMatch[] {
  const matches: TextPatternMatch[] = [];
  URL_CANDIDATE_PATTERN.lastIndex = 0;
  let candidateMatch = URL_CANDIDATE_PATTERN.exec(text);

  while (candidateMatch) {
    const start = candidateMatch.index;
    const trimmedCandidate = trimUrlBoundary(candidateMatch[0]);

    if (hasValidStartBoundary(text, start) && hasUrlPayload(trimmedCandidate)) {
      matches.push({
        type: "plainTextUrl",
        start,
        end: start + trimmedCandidate.length,
        text: trimmedCandidate,
      });
    }

    candidateMatch = URL_CANDIDATE_PATTERN.exec(text);
  }

  return matches;
}
