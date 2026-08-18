import type { CitationSegment, CitationType } from "../footnote-engine/types";
import { normalizeCitationSourceText } from "./normalization";
import type {
  CitationSegmentSourceMapping,
  CitationSourceAlias,
  CitationSourceMappingData,
  CitationSourceMappingResolution,
  CitationSourceMaster,
} from "./types";

interface AliasIndexEntry {
  alias: CitationSourceAlias;
  source: CitationSourceMaster;
}

export interface CitationSourceMappingIndex {
  sourcesById: ReadonlyMap<string, CitationSourceMaster>;
  preferredNames: ReadonlyMap<string, readonly CitationSourceMaster[]>;
  aliases: ReadonlyMap<string, readonly AliasIndexEntry[]>;
  fallbackPreferredNames: readonly CitationSourceMaster[];
  fallbackAliases: readonly AliasIndexEntry[];
}

export interface ResolveCitationSourceInput {
  text?: string;
  citationType: CitationType;
  fallbackCoreText?: string;
  allowCoreTextFallback?: boolean;
}

function appendMapValue<T>(map: Map<string, T[]>, key: string, value: T): void {
  const values = map.get(key);
  if (values) values.push(value);
  else map.set(key, [value]);
}

export function createCitationSourceMappingIndex(
  data: CitationSourceMappingData
): CitationSourceMappingIndex {
  const sourcesById = new Map(
    data.sources
      .filter((source) => source.active)
      .map((source) => [source.canonicalSourceId, source])
  );
  const preferredNames = new Map<string, CitationSourceMaster[]>();
  const aliases = new Map<string, AliasIndexEntry[]>();

  sourcesById.forEach((source) => {
    appendMapValue(preferredNames, normalizeCitationSourceText(source.preferredName), source);
  });
  data.aliases
    .filter((alias) => alias.active)
    .forEach((alias) => {
      const source = sourcesById.get(alias.canonicalSourceId);
      if (source) {
        appendMapValue(aliases, normalizeCitationSourceText(alias.alias), { alias, source });
      }
    });

  return {
    sourcesById,
    preferredNames,
    aliases,
    fallbackPreferredNames: Array.from(sourcesById.values()).sort(
      (left, right) => right.preferredName.length - left.preferredName.length
    ),
    fallbackAliases: Array.from(aliases.values())
      .flat()
      .sort((left, right) => right.alias.alias.length - left.alias.alias.length),
  };
}

function appliesTo(source: CitationSourceMaster, citationType: CitationType): boolean {
  return source.applicableCitationTypes.includes(citationType);
}

function uniqueSources(sources: readonly CitationSourceMaster[]): CitationSourceMaster[] {
  return Array.from(new Map(sources.map((source) => [source.canonicalSourceId, source])).values());
}

function ambiguous(sources: readonly CitationSourceMaster[]): CitationSourceMappingResolution {
  return {
    status: "AMBIGUOUS",
    candidateCanonicalSourceIds: uniqueSources(sources)
      .map((source) => source.canonicalSourceId)
      .sort(),
  };
}

function matched(
  source: CitationSourceMaster,
  matchedText: string,
  matchSource: "PREFERRED_NAME" | "ALIAS" | "FALLBACK_CORE_TEXT",
  alias?: CitationSourceAlias
): CitationSourceMappingResolution {
  return {
    status: "MATCHED",
    canonicalSourceId: source.canonicalSourceId,
    kind: source.kind,
    preferredName: source.preferredName,
    matchedText,
    ...(alias ? { matchedAlias: alias.alias } : {}),
    matchSource,
    legalArea: source.legalArea,
    ...(source.commentedLaw ? { commentedLaw: source.commentedLaw } : {}),
    ...(alias?.legacySafetyLevel ? { legacySafetyLevel: alias.legacySafetyLevel } : {}),
    ...(source.personStructureHint ? { personStructureHint: source.personStructureHint } : {}),
    ...(source.examplePattern ? { examplePattern: source.examplePattern } : {}),
    ...((alias?.notes ?? source.notes) ? { notes: alias?.notes ?? source.notes } : {}),
    ...(source.workOverride ? { workOverride: source.workOverride } : {}),
  };
}

function isWordCharacter(value: string | undefined): boolean {
  return value !== undefined && /[0-9A-Za-zÀ-ÖØ-öø-ÿ]/.test(value);
}

function containsWholeValue(coreText: string, candidate: string, wholeWord: boolean): boolean {
  let cursor = coreText.indexOf(candidate);
  while (cursor >= 0) {
    const end = cursor + candidate.length;
    if (!wholeWord || (!isWordCharacter(coreText[cursor - 1]) && !isWordCharacter(coreText[end]))) {
      return true;
    }
    cursor = coreText.indexOf(candidate, cursor + 1);
  }
  return false;
}

function resolveFallback(
  index: CitationSourceMappingIndex,
  coreText: string,
  citationType: CitationType
): CitationSourceMappingResolution {
  const normalizedCore = normalizeCitationSourceText(coreText);
  const preferredMatches = index.fallbackPreferredNames.filter(
    (source) =>
      appliesTo(source, citationType) &&
      containsWholeValue(normalizedCore, normalizeCitationSourceText(source.preferredName), true)
  );
  const preferredSources = uniqueSources(preferredMatches);
  if (preferredSources.length > 1) return ambiguous(preferredSources);
  if (preferredSources.length === 1) {
    return matched(preferredSources[0], coreText, "FALLBACK_CORE_TEXT");
  }

  const aliasMatches = index.fallbackAliases.filter(
    ({ alias, source }) =>
      appliesTo(source, citationType) &&
      containsWholeValue(normalizedCore, normalizeCitationSourceText(alias.alias), alias.wholeWord)
  );
  const aliasSources = uniqueSources(aliasMatches.map((entry) => entry.source));
  if (aliasSources.length > 1) return ambiguous(aliasSources);
  if (aliasSources.length === 1) {
    const entry = aliasMatches.find(
      (candidate) => candidate.source.canonicalSourceId === aliasSources[0].canonicalSourceId
    );
    if (entry) return matched(entry.source, coreText, "FALLBACK_CORE_TEXT", entry.alias);
  }
  return { status: "UNMATCHED" };
}

export function resolveCitationSource(
  index: CitationSourceMappingIndex,
  input: ResolveCitationSourceInput
): CitationSourceMappingResolution {
  if (input.text !== undefined) {
    const normalized = normalizeCitationSourceText(input.text);
    const preferred = uniqueSources(
      (index.preferredNames.get(normalized) ?? []).filter((source) =>
        appliesTo(source, input.citationType)
      )
    );
    if (preferred.length > 1) return ambiguous(preferred);
    if (preferred.length === 1) return matched(preferred[0], input.text, "PREFERRED_NAME");

    const aliasEntries = (index.aliases.get(normalized) ?? []).filter(({ source }) =>
      appliesTo(source, input.citationType)
    );
    const aliasSources = uniqueSources(aliasEntries.map((entry) => entry.source));
    if (aliasSources.length > 1) return ambiguous(aliasSources);
    if (aliasSources.length === 1) {
      return matched(aliasSources[0], input.text, "ALIAS", aliasEntries[0].alias);
    }
    return { status: "UNMATCHED" };
  }

  return input.allowCoreTextFallback && input.fallbackCoreText
    ? resolveFallback(index, input.fallbackCoreText, input.citationType)
    : { status: "UNMATCHED" };
}

export function resolveCitationSegmentSources(
  segment: CitationSegment,
  index: CitationSourceMappingIndex,
  allowCoreTextFallback = false
): CitationSegmentSourceMapping[] {
  const extraction = segment.extraction;
  if (extraction?.type === "COMMENTARY") {
    return [
      {
        target: "PRIMARY_SOURCE",
        resolution: resolveCitationSource(index, {
          text: extraction.data.work?.value,
          citationType: "COMMENTARY",
          fallbackCoreText: segment.coreText,
          allowCoreTextFallback,
        }),
      },
    ];
  }
  if (extraction?.type === "JOURNAL_ARTICLE") {
    return [
      {
        target: "PRIMARY_SOURCE",
        resolution: resolveCitationSource(index, {
          text: extraction.data.journal?.value,
          citationType: "JOURNAL_ARTICLE",
          fallbackCoreText: segment.coreText,
          allowCoreTextFallback,
        }),
      },
    ];
  }
  if (extraction?.type === "CASE_NOTE") {
    return [
      {
        target: "PRIMARY_SOURCE",
        resolution: resolveCitationSource(index, {
          text: extraction.data.journal?.value,
          citationType: "CASE_NOTE",
          fallbackCoreText: segment.coreText,
          allowCoreTextFallback,
        }),
      },
    ];
  }
  if (extraction?.type === "CASE_LAW") {
    return extraction.data.parallelCitations.flatMap((publication, publicationIndex) =>
      publication.kind === "journal"
        ? [
            {
              target: "JOURNAL_PUBLICATION" as const,
              publicationIndex,
              resolution: resolveCitationSource(index, {
                text: publication.journal.value,
                citationType: "CASE_LAW",
              }),
            },
          ]
        : []
    );
  }
  return allowCoreTextFallback
    ? [
        {
          target: "PRIMARY_SOURCE",
          resolution: resolveCitationSource(index, {
            citationType: segment.classification.type,
            fallbackCoreText: segment.coreText,
            allowCoreTextFallback,
          }),
        },
      ]
    : [];
}
