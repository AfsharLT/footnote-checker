import type { AnalysisProtectedRange } from "./types";

export function isRangeProtected(
  start: number,
  end: number,
  protectedRanges: readonly AnalysisProtectedRange[]
): boolean {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end) {
    return false;
  }

  if (start === end) {
    return protectedRanges.some((range) => range.start <= start && start < range.end);
  }

  return protectedRanges.some((range) => start < range.end && end > range.start);
}
