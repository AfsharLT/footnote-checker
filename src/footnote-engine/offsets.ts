import type { CitationSegment } from "./types";

export type SegmentOffsetBasis = "segment" | "core";

export function absoluteContentRangeFromSegment(
  segment: CitationSegment,
  relativeStart: number,
  relativeEnd: number,
  basis: SegmentOffsetBasis
): { start: number; end: number } | undefined {
  const sourceText = basis === "core" ? segment.coreText : segment.originalText;
  const absoluteBase = basis === "core" ? segment.coreStart : segment.start;
  if (
    !Number.isInteger(relativeStart) ||
    !Number.isInteger(relativeEnd) ||
    relativeStart < 0 ||
    relativeStart > relativeEnd ||
    relativeEnd > sourceText.length ||
    !Number.isInteger(absoluteBase)
  ) {
    return undefined;
  }
  return {
    start: absoluteBase + relativeStart,
    end: absoluteBase + relativeEnd,
  };
}
