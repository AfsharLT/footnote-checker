export interface TextRangeResolution {
  query: string;
  occurrenceIndex: number;
  occurrenceCount: number;
  start: number;
  end: number;
  boundary: "WHOLE" | "START" | "END";
}

function nonOverlappingOccurrences(text: string, query: string): number[] {
  if (!query) return [];
  const starts: number[] = [];
  let cursor = 0;
  while (cursor <= text.length - query.length) {
    const found = text.indexOf(query, cursor);
    if (found < 0) break;
    starts.push(found);
    cursor = found + Math.max(1, query.length);
  }
  return starts;
}

export function resolveTextSearch(
  contentText: string,
  start: number,
  end: number,
  originalText: string
): TextRangeResolution | undefined {
  if (
    !originalText ||
    start < 0 ||
    start >= end ||
    end > contentText.length ||
    contentText.slice(start, end) !== originalText
  ) {
    return undefined;
  }
  const occurrences = nonOverlappingOccurrences(contentText, originalText);
  const occurrenceIndex = occurrences.indexOf(start);
  return occurrenceIndex >= 0
    ? {
        query: originalText,
        occurrenceIndex,
        occurrenceCount: occurrences.length,
        start,
        end,
        boundary: "WHOLE",
      }
    : undefined;
}

function uniqueAnchor(
  contentText: string,
  position: number,
  direction: "BEFORE" | "AFTER"
): TextRangeResolution | undefined {
  const available = direction === "BEFORE" ? position : contentText.length - position;
  for (let length = 1; length <= Math.min(64, available); length += 1) {
    const start = direction === "BEFORE" ? position - length : position;
    const end = start + length;
    const query = contentText.slice(start, end);
    if (contentText.indexOf(query) === start && contentText.lastIndexOf(query) === start) {
      return {
        query,
        occurrenceIndex: 0,
        occurrenceCount: 1,
        start: position,
        end: position,
        boundary: direction === "BEFORE" ? "END" : "START",
      };
    }
  }
  return undefined;
}

export function resolveInsertSearch(
  contentText: string,
  position: number
): TextRangeResolution | undefined {
  if (!Number.isInteger(position) || position < 0 || position > contentText.length) {
    return undefined;
  }
  return (
    uniqueAnchor(contentText, position, "BEFORE") ?? uniqueAnchor(contentText, position, "AFTER")
  );
}
