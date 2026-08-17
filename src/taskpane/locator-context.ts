export const WORD_NOTE_REFERENCE_MARK = "\u0002";

export type LocatorContextSide = "before" | "after";

export interface LocatorContextFragment {
  text: string;
  referenceIds?: Array<string | undefined>;
}

export interface LocatorContextNormalizationResult {
  text: string;
  usedFallbackToken: boolean;
  failed: boolean;
}

function countReferenceMarkers(characters: readonly string[]): number {
  let count = 0;

  for (const character of characters) {
    if (character === WORD_NOTE_REFERENCE_MARK) {
      count += 1;
    }
  }

  return count;
}

export function createLocatorContextFragment(
  rawText: string,
  referenceIds: readonly (string | undefined)[] | undefined,
  side: LocatorContextSide,
  maximumCharacters = 60
): LocatorContextFragment {
  const characters = Array.from(rawText);
  const boundedMaximum = Math.max(0, Math.floor(maximumCharacters));
  const start = side === "before" ? Math.max(0, characters.length - boundedMaximum) : 0;
  const end = side === "after" ? Math.min(characters.length, boundedMaximum) : characters.length;
  const selectedCharacters = characters.slice(start, end);
  const fullMarkerCount = countReferenceMarkers(characters);
  const selectedMarkerCount = countReferenceMarkers(selectedCharacters);
  const idsAreReliable = referenceIds !== undefined && referenceIds.length === fullMarkerCount;

  if (!idsAreReliable || selectedMarkerCount === 0) {
    return { text: selectedCharacters.join("") };
  }

  const excludedMarkerCount = countReferenceMarkers(characters.slice(0, start));

  return {
    text: selectedCharacters.join(""),
    referenceIds: referenceIds.slice(
      excludedMarkerCount,
      excludedMarkerCount + selectedMarkerCount
    ),
  };
}

export function normalizeLocatorContext(
  fragment: LocatorContextFragment,
  ordinalByReferenceId: ReadonlyMap<string, number | undefined>
): string {
  const characters = Array.from(fragment.text);
  const markerCount = countReferenceMarkers(characters);
  const idsAreReliable =
    fragment.referenceIds !== undefined && fragment.referenceIds.length === markerCount;
  let markerIndex = 0;

  return characters
    .map((character) => {
      if (character !== WORD_NOTE_REFERENCE_MARK) {
        return character;
      }

      const referenceId = idsAreReliable ? fragment.referenceIds?.[markerIndex] : undefined;
      const ordinal = referenceId ? ordinalByReferenceId.get(referenceId) : undefined;
      markerIndex += 1;

      return ordinal !== undefined ? `[FN ${ordinal}]` : "[FN]";
    })
    .join("");
}

export function normalizeFootnoteReferencesInContext(
  rawText: string,
  side: LocatorContextSide,
  maximumCharacters = 60
): LocatorContextNormalizationResult {
  try {
    const fragment = createLocatorContextFragment(rawText, undefined, side, maximumCharacters);
    const usedFallbackToken = fragment.text.includes(WORD_NOTE_REFERENCE_MARK);

    return {
      text: normalizeLocatorContext(fragment, new Map()),
      usedFallbackToken,
      failed: false,
    };
  } catch {
    const boundedMaximum = Math.max(0, Math.floor(maximumCharacters));
    const fallbackText =
      side === "before" ? rawText.slice(-boundedMaximum) : rawText.slice(0, boundedMaximum);

    return {
      text: fallbackText.split(WORD_NOTE_REFERENCE_MARK).join("[FN]"),
      usedFallbackToken: fallbackText.includes(WORD_NOTE_REFERENCE_MARK),
      failed: true,
    };
  }
}
