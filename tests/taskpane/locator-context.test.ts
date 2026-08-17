import {
  createLocatorContextFragment,
  normalizeFootnoteReferencesInContext,
  normalizeLocatorContext,
  WORD_NOTE_REFERENCE_MARK,
} from "../../src/taskpane/locator-context";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function normalize(
  rawText: string,
  referenceIds: readonly (string | undefined)[] | undefined,
  ordinals: ReadonlyArray<readonly [string, number | undefined]>,
  side: "before" | "after" = "before"
): string {
  const fragment = createLocatorContextFragment(rawText, referenceIds, side);
  return normalizeLocatorContext(fragment, new Map(ordinals));
}

function runLocatorContextTests(): void {
  const unchanged = "§ 212 StGB – Äußerung „unverändert“";
  assert(normalize(unchanged, [], []) === unchanged, "Marker-free context must remain unchanged");

  assert(
    normalize(`Davor ${WORD_NOTE_REFERENCE_MARK} danach`, ["id-9"], [["id-9", 9]]) ===
      "Davor [FN 9] danach",
    "A contextBefore reference must use its mapped ordinal"
  );
  assert(
    normalize(`Davor ${WORD_NOTE_REFERENCE_MARK} danach`, ["id-10"], [["id-10", 10]], "after") ===
      "Davor [FN 10] danach",
    "A contextAfter reference must use its mapped ordinal"
  );
  assert(
    normalize(
      `${WORD_NOTE_REFERENCE_MARK} A ${WORD_NOTE_REFERENCE_MARK} B ${WORD_NOTE_REFERENCE_MARK}`,
      ["id-2", "id-4", "id-8"],
      [
        ["id-2", 2],
        ["id-4", 4],
        ["id-8", 8],
      ]
    ) === "[FN 2] A [FN 4] B [FN 8]",
    "Multiple references must retain their document order"
  );
  assert(
    normalize(`A ${WORD_NOTE_REFERENCE_MARK} B`, ["unknown"], []) === "A [FN] B",
    "An unknown reference ID must use the fallback token"
  );
  assert(
    normalize(`A ${WORD_NOTE_REFERENCE_MARK} B`, [], [["id-1", 1]]) === "A [FN] B",
    "A marker/ID count mismatch must never guess an ordinal"
  );
  assert(
    normalize(`§ Ä „${WORD_NOTE_REFERENCE_MARK}“ ü`, ["id-11"], [["id-11", 11]]) ===
      "§ Ä „[FN 11]“ ü",
    "Characters adjacent to a token must remain unchanged"
  );

  const chunkOrdinals = new Map<string, number | undefined>();
  for (let ordinal = 1; ordinal <= 1200; ordinal += 1) {
    chunkOrdinals.set(`id-${ordinal}`, ordinal);
  }
  const chunkFragment = createLocatorContextFragment(
    `${WORD_NOTE_REFERENCE_MARK} ${WORD_NOTE_REFERENCE_MARK} ${WORD_NOTE_REFERENCE_MARK}`,
    ["id-150", "id-151", "id-1200"],
    "before"
  );
  assert(
    normalizeLocatorContext(chunkFragment, chunkOrdinals) === "[FN 150] [FN 151] [FN 1200]",
    "Ordinals across chunk boundaries must not shift"
  );

  const longPrefix = `${"x".repeat(70)}${WORD_NOTE_REFERENCE_MARK} Ende`;
  assert(
    normalize(longPrefix, ["id-12"], [["id-12", 12]]) === `${"x".repeat(54)}[FN 12] Ende`,
    "Before-context truncation must keep reference IDs aligned"
  );

  const safeFallback = normalizeFootnoteReferencesInContext(
    `Davor ${WORD_NOTE_REFERENCE_MARK} und ${WORD_NOTE_REFERENCE_MARK} danach`,
    "before"
  );
  assert(
    safeFallback.text === "Davor [FN] und [FN] danach",
    "The Reader-safe path must replace every marker with a fallback token"
  );
  assert(safeFallback.usedFallbackToken, "The Reader-safe path must report fallback token usage");
  assert(!safeFallback.failed, "Normal fallback tokenization must not be treated as a failure");

  const safeUnchanged = normalizeFootnoteReferencesInContext(unchanged, "after");
  assert(safeUnchanged.text === unchanged, "Reader-safe marker-free context must remain unchanged");
  assert(!safeUnchanged.usedFallbackToken, "Marker-free context must not report fallback usage");
}

runLocatorContextTests();
