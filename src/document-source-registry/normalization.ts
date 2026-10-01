const SAFE_ABBREVIATIONS: ReadonlyArray<[RegExp, string]> = [
  [/\bauflage\b/giu, "aufl"],
  [/\baufl\.?(?=\s|$)/giu, "aufl"],
  [/\bherausgeber\b/giu, "hrsg"],
  [/\bhrsg\.?(?=\s|$)/giu, "hrsg"],
  [/\bstrafgesetzbuch\b/giu, "stgb"],
  [/\bbürgerliches\s+gesetzbuch\b/giu, "bgb"],
  [/\bstrafprozessordnung\b/giu, "stpo"],
  [/\bzivilprozessordnung\b/giu, "zpo"],
  [/\bgrundgesetz\b/giu, "gg"],
];

export function normalizeIdentityText(value: string): string {
  let normalized = value
    .normalize("NFC")
    .replace(/[\u00a0\u2007\u202f\u2009]/g, " ")
    .toLocaleLowerCase("de-DE");
  for (const [pattern, replacement] of SAFE_ABBREVIATIONS) {
    pattern.lastIndex = 0;
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized
    .replace(/[„“”‚‘’'"()[\]{}]/g, " ")
    .replace(/[,:;/–—-]+/g, " ")
    .replace(/\.+(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePersonName(value: string): string {
  return normalizeIdentityText(value)
    .replace(/\b(?:ders|dies)\b/g, "")
    .trim();
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution =
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        substitution
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function tokenDice(left: string, right: string): number {
  const leftTokens = new Set(normalizeIdentityText(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeIdentityText(right).split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let overlap = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) overlap += 1;
  });
  return (2 * overlap) / (leftTokens.size + rightTokens.size);
}

export function deterministicStringSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeIdentityText(left);
  const normalizedRight = normalizeIdentityText(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  const editSimilarity =
    1 -
    levenshteinDistance(normalizedLeft, normalizedRight) /
      Math.max(normalizedLeft.length, normalizedRight.length);
  return Number(Math.max(editSimilarity, tokenDice(normalizedLeft, normalizedRight)).toFixed(4));
}

export function stableDocumentSourceId(normalizedCore: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalizedCore.length; index += 1) {
    hash ^= normalizedCore.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `document-source-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
