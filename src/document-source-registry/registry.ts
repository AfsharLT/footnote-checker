import { finishWork, type WorkProgress } from "../footnote-engine/cooperative";
/* global performance */

import type { CitationSourceMappingData, CitationSourceMaster } from "../citation-mapping/types";
import { normalizeCitationSourceText } from "../citation-mapping/normalization";
import {
  compileStructuredAlias,
  type CompiledStructuredAlias,
} from "../citation-mapping/structured-alias";
import type {
  CitationExtractionResult,
  CitationItem,
  CitationLocator,
  CitationSegment,
  CitationType,
  FootnoteParseResult,
  PersonReference,
} from "../footnote-engine/types";
import type { FootnoteSnapshot } from "../taskpane/taskpane";
import {
  deterministicStringSimilarity,
  normalizeIdentityText,
  normalizePersonName,
  stableDocumentSourceId,
} from "./normalization";
import type {
  DocumentSource,
  DocumentSourceOccurrence,
  DocumentSourceRegistry,
  DocumentSourceVariant,
  SourceFingerprint,
  SourceResolution,
  SourceSimilarityResult,
} from "./types";

export interface RegistrySegmentAnalysis {
  footnoteId: string;
  segmentId: string;
  effectiveClassification: { effectiveType: CitationType };
}

export interface BuildDocumentSourceRegistryInput {
  footnotes: readonly FootnoteSnapshot[];
  parseResults: readonly FootnoteParseResult[];
  segmentAnalyses: readonly RegistrySegmentAnalysis[];
  mappingData?: CitationSourceMappingData;
}

interface ItemRecord {
  item: CitationItem;
  segment?: CitationSegment;
  sourceType: CitationType;
  footnoteOrdinal: number;
  fingerprint?: SourceFingerprint;
  canEstablishIdentity: boolean;
  specialReference: "ANM" | "DERS_DIES" | "EBENDA" | null;
  localFailure?: string;
}

interface PersistentSourceIndex {
  sourcesById: ReadonlyMap<string, CitationSourceMaster>;
  exactValues: ReadonlyMap<string, ReadonlySet<string>>;
  tokenBlocks: ReadonlyMap<string, ReadonlySet<string>>;
  entriesById: ReadonlyMap<string, { source: CitationSourceMaster; values: readonly string[] }>;
  structuredAliases: readonly {
    source: CitationSourceMaster;
    compiled: CompiledStructuredAlias;
  }[];
}

interface RegistryBuildState {
  sources: Map<string, DocumentSource>;
  fingerprintsBySource: Map<string, SourceFingerprint[]>;
  exactIndex: Map<string, Set<string>>;
  normalizedIndex: Map<string, Set<string>>;
  blockIndex: Map<string, Set<string>>;
  resolutions: SourceResolution[];
  resolutionByItemId: Map<string, SourceResolution>;
}

const FUZZY_MATCH_MINIMUM = 0.87;
const AMBIGUOUS_MATCH_MINIMUM = 0.72;
const UNIQUE_MATCH_MARGIN = 0.05;

function persistentSourceIndex(
  mappingData: CitationSourceMappingData | undefined
): PersistentSourceIndex {
  const activeSources = (mappingData?.sources ?? []).filter((source) => source.active);
  const sourcesById = new Map(activeSources.map((source) => [source.canonicalSourceId, source]));
  const valuesById = new Map<string, Set<string>>();
  const structuredAliases: Array<{
    source: CitationSourceMaster;
    compiled: CompiledStructuredAlias;
  }> = [];
  const add = (sourceId: string, value: string | undefined) => {
    if (!value) return;
    const normalized = normalizeIdentityText(value);
    if (!normalized) return;
    const values = valuesById.get(sourceId) ?? new Set<string>();
    values.add(normalized);
    valuesById.set(sourceId, values);
  };
  activeSources.forEach((source) => {
    add(source.canonicalSourceId, source.preferredName);
    add(source.canonicalSourceId, source.preferredCitationText);
    add(source.canonicalSourceId, source.workOverride?.preferredName);
  });
  (mappingData?.aliases ?? [])
    .filter((alias) => alias.active && sourcesById.has(alias.canonicalSourceId))
    .forEach((alias) => {
      const source = sourcesById.get(alias.canonicalSourceId)!;
      const compiled = compileStructuredAlias(alias.alias);
      if (compiled) structuredAliases.push({ source, compiled });
      else add(alias.canonicalSourceId, alias.alias);
    });
  const exactValues = new Map<string, Set<string>>();
  const tokenBlocks = new Map<string, Set<string>>();
  valuesById.forEach((values, sourceId) => {
    values.forEach((value) => {
      const ids = exactValues.get(value) ?? new Set<string>();
      ids.add(sourceId);
      exactValues.set(value, ids);
      value
        .split(" ")
        .filter((token) => token.length >= 3)
        .forEach((token) => {
          const key = token.slice(0, 4);
          const blockedIds = tokenBlocks.get(key) ?? new Set<string>();
          blockedIds.add(sourceId);
          tokenBlocks.set(key, blockedIds);
        });
    });
  });
  const entries = activeSources.map((source) => ({
    source,
    values: [...(valuesById.get(source.canonicalSourceId) ?? [])],
  }));
  return {
    sourcesById,
    exactValues,
    tokenBlocks,
    entriesById: new Map(entries.map((entry) => [entry.source.canonicalSourceId, entry])),
    structuredAliases,
  };
}

function persistentSourceCompatible(source: CitationSourceMaster, record: ItemRecord): boolean {
  if (source.applicableCitationTypes.includes(record.sourceType)) return true;
  const raw = record.item.rawText;
  if (source.kind === "COMMENTARY") {
    return /\bin\s*:/iu.test(raw) && /(?:§§?|Art\.)\s*\d/iu.test(raw);
  }
  if (source.kind === "JOURNAL") {
    return /\b(?:19|20)\d{2}\s*,\s*\d+/u.test(raw);
  }
  return source.kind === "BOOK" && record.sourceType === "OTHER";
}

function persistentQueryValues(fingerprint: SourceFingerprint): string[] {
  const work = fingerprint.normalizedWorkTitle ?? fingerprint.normalizedContainerTitle;
  const authorWork =
    fingerprint.normalizedAuthors.length > 0 && work
      ? `${fingerprint.normalizedAuthors.join(" ")} ${work}`
      : undefined;
  const authorWorkYear =
    authorWork && fingerprint.year ? `${authorWork} ${fingerprint.year}` : undefined;
  return [
    authorWorkYear,
    authorWork,
    fingerprint.normalizedWorkTitle,
    fingerprint.shortTitle,
    fingerprint.normalizedContainerTitle,
    fingerprint.normalizedBibliographicCore,
  ].filter((value): value is string => Boolean(value));
}

function containsIdentityValue(haystack: string, needle: string): boolean {
  if (needle.length < 3) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

function resolvePersistentRecord(
  record: ItemRecord,
  index: PersistentSourceIndex
): { source?: CitationSourceMaster; ambiguousIds?: string[]; score?: number } {
  const fingerprint = record.fingerprint;
  if (!fingerprint || fingerprint.warnings.includes("SUSPICIOUS_NARRATIVE_PREFIX")) return {};
  const structuredMatches = index.structuredAliases
    .filter(
      ({ source, compiled }) =>
        persistentSourceCompatible(source, record) && Boolean(compiled.match(record.item.rawText))
    )
    .map(({ source }) => source);
  const structuredSources = Array.from(
    new Map(structuredMatches.map((source) => [source.canonicalSourceId, source])).values()
  );
  if (structuredSources.length === 1) return { source: structuredSources[0], score: 1 };
  if (structuredSources.length > 1) {
    return { ambiguousIds: structuredSources.map((source) => source.canonicalSourceId).sort() };
  }
  const queries = persistentQueryValues(fingerprint);
  const blockedIds = new Set<string>();
  queries.forEach((query) =>
    query
      .split(" ")
      .filter((token) => token.length >= 3)
      .forEach((token) =>
        (index.tokenBlocks.get(token.slice(0, 4)) ?? []).forEach((sourceId) =>
          blockedIds.add(sourceId)
        )
      )
  );
  const directIds = new Set<string>();
  for (const query of queries) {
    (index.exactValues.get(query) ?? []).forEach((sourceId) => directIds.add(sourceId));
    [...blockedIds]
      .map((sourceId) => index.entriesById.get(sourceId))
      .filter((entry): entry is { source: CitationSourceMaster; values: readonly string[] } =>
        Boolean(entry)
      )
      .forEach(({ source, values }) => {
        if (values.some((value) => containsIdentityValue(query, value))) {
          directIds.add(source.canonicalSourceId);
        }
      });
  }
  const direct = [...directIds]
    .map((sourceId) => index.sourcesById.get(sourceId))
    .filter((source): source is CitationSourceMaster => Boolean(source))
    .filter((source) => persistentSourceCompatible(source, record));
  if (direct.length === 1) return { source: direct[0], score: 1 };
  if (direct.length > 1)
    return { ambiguousIds: direct.map((source) => source.canonicalSourceId).sort() };

  const ranked = [...blockedIds]
    .map((sourceId) => index.entriesById.get(sourceId))
    .filter((entry): entry is { source: CitationSourceMaster; values: readonly string[] } =>
      Boolean(entry)
    )
    .filter(({ source }) => persistentSourceCompatible(source, record))
    .map(({ source, values }) => ({
      source,
      score: Math.max(
        0,
        ...queries.flatMap((query) =>
          values.map((value) => deterministicStringSimilarity(query, value))
        )
      ),
    }))
    .filter(({ score }) => score >= AMBIGUOUS_MATCH_MINIMUM)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.source.canonicalSourceId.localeCompare(right.source.canonicalSourceId)
    );
  if (
    ranked[0]?.score >= FUZZY_MATCH_MINIMUM &&
    (!ranked[1] || ranked[0].score - ranked[1].score >= UNIQUE_MATCH_MARGIN)
  ) {
    return { source: ranked[0].source, score: ranked[0].score };
  }
  return ranked.length > 0
    ? { ambiguousIds: ranked.map(({ source }) => source.canonicalSourceId), score: ranked[0].score }
    : {};
}

function timestamp(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function componentValue(component: { value: string } | undefined): string | undefined {
  return component?.value?.trim() || undefined;
}

function people(persons: readonly PersonReference[]): string[] {
  return persons
    .map((person) => normalizePersonName(person.normalizedName ?? person.rawText))
    .filter(Boolean);
}

function hasStrongMissingBookSeparator(text: string): boolean {
  return /^(?:[„“”‚‘’'"([{]\s*)?\p{Lu}[\p{L}'’.-]*(?:\/\p{Lu}[\p{L}'’.-]*)*\s+\p{Lu}[\p{L}][^,]{2,},\s*(?:19|20)\d{2},\s*(?:S\.|Seite)\s*\d/iu.test(
    text
  );
}

function sourceTypeFor(
  item: CitationItem,
  segment: CitationSegment | undefined,
  segmentAnalyses: readonly RegistrySegmentAnalysis[]
): CitationType {
  const effective = segment
    ? segmentAnalyses.find(
        (analysis) =>
          analysis.footnoteId === item.footnoteId && analysis.segmentId === segment.segmentId
      )?.effectiveClassification.effectiveType
    : undefined;
  const resolved = effective ?? item.citationType ?? segment?.classification.type ?? "OTHER";
  if (resolved === "OTHER" && hasStrongMissingBookSeparator(item.rawText)) {
    return "BOOK";
  }
  return resolved;
}

function overlappingSegment(
  item: CitationItem,
  parseResult: FootnoteParseResult
): CitationSegment | undefined {
  return parseResult.segments
    .filter((segment) => segment.start < item.end && segment.end > item.start)
    .sort(
      (left, right) =>
        Math.min(right.end, item.end) -
        Math.max(right.start, item.start) -
        (Math.min(left.end, item.end) - Math.max(left.start, item.start))
    )[0];
}

function locatorStart(
  locators: readonly CitationLocator[],
  item: CitationItem
): number | undefined {
  return locators
    .filter((locator) => locator.start >= item.start && locator.start < item.end)
    .map((locator) => locator.start)
    .sort((left, right) => left - right)[0];
}

function statuteStart(
  extraction: CitationExtractionResult,
  item: CitationItem
): number | undefined {
  if (extraction.type !== "COMMENTARY" || !extraction.data.statuteReference) return undefined;
  const reference = extraction.data.statuteReference;
  const candidates = [
    reference.unitType?.start,
    ...reference.sections.map((section) => section.section.start),
  ].filter(
    (value): value is number => value !== undefined && value >= item.start && value < item.end
  );
  return candidates.sort((left, right) => left - right)[0];
}

function extractionLocatorStart(
  extraction: CitationExtractionResult | undefined,
  item: CitationItem
): number | undefined {
  if (!extraction) return undefined;
  if (extraction.type === "COMMENTARY") {
    return [statuteStart(extraction, item), locatorStart(extraction.data.marginNumbers, item)]
      .filter((value): value is number => value !== undefined)
      .sort((left, right) => left - right)[0];
  }
  if (extraction.type === "BOOK") {
    return locatorStart(
      [
        ...extraction.data.marginNumbers,
        ...extraction.data.pages,
        ...(extraction.data.structuralLocators ?? []),
      ],
      item
    );
  }
  if (extraction.type === "JOURNAL_ARTICLE") {
    return locatorStart(extraction.data.pinpointPages, item);
  }
  if (extraction.type === "BOOK_CHAPTER") {
    return locatorStart([...extraction.data.pinpointPages, ...extraction.data.marginNumbers], item);
  }
  if (
    extraction.type === "FESTSCHRIFT_CONTRIBUTION" ||
    extraction.type === "YEARBOOK_CONTRIBUTION"
  ) {
    return locatorStart(
      [extraction.data.firstPage, ...extraction.data.pinpointPages].filter(
        (value): value is CitationLocator => Boolean(value)
      ),
      item
    );
  }
  if (extraction.type === "CASE_NOTE") {
    return locatorStart(extraction.data.pinpointPages, item);
  }
  if (extraction.type === "LEGISLATIVE_MATERIAL") {
    return locatorStart(extraction.data.pages, item);
  }
  return undefined;
}

function suspiciousNarrativePrefix(rawText: string): boolean {
  const colon = rawText.indexOf(":");
  if (colon < 12) return false;
  const prefix = rawText.slice(0, colon).trim();
  const suffix = rawText.slice(colon + 1).trim();
  const knownQualifier =
    /^(?:vgl\.|s\.|s\.\s*auch|dagegen|kritisch|abweichend|ähnlich|hierzu|näher|so)$/iu.test(prefix);
  return (
    !knownQualifier &&
    prefix.split(/\s+/).length >= 3 &&
    /[a-zäöüß]/u.test(prefix) &&
    /^[A-ZÄÖÜ][\p{L}\p{M}'’-]+(?:\/|,)/u.test(suffix)
  );
}

function bibliographicCore(
  item: CitationItem,
  extraction: CitationExtractionResult | undefined
): { raw: string; suspiciousPrefix: boolean } {
  const suspiciousPrefix = suspiciousNarrativePrefix(item.rawText);
  let absoluteStart = item.start;
  if (suspiciousPrefix) {
    absoluteStart += item.rawText.indexOf(":") + 1;
    while (absoluteStart < item.end && /\s/.test(item.rawText[absoluteStart - item.start])) {
      absoluteStart += 1;
    }
  }
  let absoluteEnd = extractionLocatorStart(extraction, item) ?? item.end;
  const heuristicText = item.rawText.slice(absoluteStart - item.start);
  const heuristicLocator =
    /(?:^|[,;]\s+|\s+)(?:§§?|Art\.|Rn\.|Rdn\.?|Rdnr\.|S\.|Seite)\s*\d/iu.exec(heuristicText);
  if (heuristicLocator) {
    absoluteEnd = Math.min(absoluteEnd, absoluteStart + heuristicLocator.index);
  }
  let raw = item.rawText.slice(absoluteStart - item.start, absoluteEnd - item.start);
  raw = raw
    .replace(/\(\s*Anm\.\s*\d+\s*\)/giu, "")
    .replace(/^[,;:()[\]\s]+|[,;:()[\]\s.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { raw, suspiciousPrefix };
}

function heuristicFields(rawCore: string): {
  authors: string[];
  workTitle?: string;
  year?: string;
  edition?: string;
} {
  const commaParts = rawCore
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const missingBookSeparator =
    /^(\p{Lu}[\p{L}'’.-]*(?:\/\p{Lu}[\p{L}'’.-]*)*)\s+(\p{Lu}[\p{L}].+),\s*((?:19|20)\d{2})$/iu.exec(
      rawCore
    );
  const leading = missingBookSeparator?.[1] ?? commaParts[0] ?? "";
  const authors = /^(?:ders\.|dies\.|ebd\.|ebenda)$/iu.test(leading)
    ? []
    : leading
        .split(/\s*\/\s*|\s+und\s+/u)
        .map(normalizePersonName)
        .filter(Boolean);
  const year = /\b(?:19|20)\d{2}\b/u.exec(rawCore)?.[0];
  const edition = /\b(\d+)\.\s*(?:Aufl\.|Auflage)\b/iu.exec(rawCore)?.[1];
  const titleCandidate =
    missingBookSeparator?.[2] ??
    commaParts.find(
      (part, index) =>
        index > 0 && !/^(?:19|20)\d{2}$/u.test(part) && !/^\d+\.\s*(?:Aufl\.|Auflage)/iu.test(part)
    );
  return { authors, ...(titleCandidate ? { workTitle: titleCandidate } : {}), year, edition };
}

export function createSourceFingerprint(
  item: CitationItem,
  segment: CitationSegment | undefined,
  sourceType: CitationType
): SourceFingerprint | undefined {
  const extraction = segment?.extraction;
  const { raw, suspiciousPrefix } = bibliographicCore(item, extraction);
  if (!raw) return undefined;
  const heuristic = heuristicFields(raw);
  let normalizedAuthors = heuristic.authors;
  let normalizedEditors: string[] = [];
  let normalizedWorkTitle = heuristic.workTitle
    ? normalizeIdentityText(heuristic.workTitle)
    : undefined;
  let shortTitle: string | undefined;
  let normalizedContainerTitle: string | undefined;
  let edition = heuristic.edition;
  let year = heuristic.year;
  let publisher: string | undefined;
  let volume: string | undefined;
  let journalStartPage: string | undefined;

  if (extraction?.type === "COMMENTARY") {
    normalizedAuthors = [];
    normalizedEditors = people(extraction.data.editors);
    normalizedWorkTitle = componentValue(extraction.data.work)
      ? normalizeIdentityText(extraction.data.work!.value)
      : normalizedWorkTitle;
    normalizedContainerTitle = componentValue(extraction.data.commentedLaw)
      ? normalizeIdentityText(extraction.data.commentedLaw!.value)
      : undefined;
    edition = componentValue(extraction.data.edition) ?? edition;
    year = componentValue(extraction.data.year) ?? year;
    volume = componentValue(extraction.data.volume);
  } else if (extraction?.type === "BOOK") {
    normalizedAuthors = people(extraction.data.authors);
    normalizedWorkTitle = componentValue(extraction.data.title)
      ? normalizeIdentityText(extraction.data.title!.value)
      : normalizedWorkTitle;
    shortTitle = componentValue(extraction.data.shortTitle)
      ? normalizeIdentityText(extraction.data.shortTitle!.value)
      : undefined;
    edition = componentValue(extraction.data.edition) ?? edition;
    year = componentValue(extraction.data.year) ?? year;
    publisher = componentValue(extraction.data.publisher)
      ? normalizeIdentityText(extraction.data.publisher!.value)
      : undefined;
    volume = componentValue(extraction.data.volume);
  } else if (extraction?.type === "JOURNAL_ARTICLE") {
    normalizedAuthors = people(extraction.data.authors);
    normalizedWorkTitle = componentValue(extraction.data.title)
      ? normalizeIdentityText(extraction.data.title!.value)
      : normalizedWorkTitle;
    normalizedContainerTitle = componentValue(extraction.data.journal)
      ? normalizeIdentityText(extraction.data.journal!.value)
      : undefined;
    year = componentValue(extraction.data.year) ?? year;
    volume = componentValue(extraction.data.volume);
    journalStartPage = extraction.data.firstPage?.value;
  } else if (extraction?.type === "BOOK_CHAPTER") {
    normalizedAuthors = people(extraction.data.authors);
    normalizedEditors = people(extraction.data.editors);
    normalizedWorkTitle = componentValue(extraction.data.chapterTitle)
      ? normalizeIdentityText(extraction.data.chapterTitle!.value)
      : normalizedWorkTitle;
    normalizedContainerTitle = componentValue(extraction.data.containerTitle)
      ? normalizeIdentityText(extraction.data.containerTitle!.value)
      : undefined;
    edition = componentValue(extraction.data.edition) ?? edition;
    year = componentValue(extraction.data.year) ?? year;
    volume = componentValue(extraction.data.volume);
    journalStartPage = componentValue(extraction.data.firstPage);
  } else if (extraction?.type === "FESTSCHRIFT_CONTRIBUTION") {
    normalizedAuthors = people(extraction.data.authors);
    normalizedWorkTitle = normalizeIdentityText(extraction.data.containerTitle.value);
    normalizedContainerTitle = normalizedWorkTitle;
    year = componentValue(extraction.data.year) ?? year;
    journalStartPage = extraction.data.firstPage?.value;
  } else if (extraction?.type === "YEARBOOK_CONTRIBUTION") {
    normalizedAuthors = people(extraction.data.authors);
    normalizedWorkTitle = normalizeIdentityText(extraction.data.containerTitle.value);
    normalizedContainerTitle = normalizedWorkTitle;
    year = componentValue(extraction.data.year) ?? year;
    journalStartPage = extraction.data.firstPage?.value;
  } else if (extraction?.type === "MANUSCRIPT") {
    normalizedAuthors = people(extraction.data.authors);
    normalizedWorkTitle = "manuskript";
  } else if (extraction?.type === "FORTHCOMING") {
    normalizedContainerTitle = componentValue(extraction.data.publicationSource)
      ? normalizeIdentityText(extraction.data.publicationSource!.value)
      : undefined;
    normalizedWorkTitle = normalizedContainerTitle;
    year = componentValue(extraction.data.year) ?? year;
  } else if (extraction?.type === "CASE_NOTE") {
    normalizedAuthors = people(extraction.data.authors);
    normalizedContainerTitle = componentValue(extraction.data.journal)
      ? normalizeIdentityText(extraction.data.journal!.value)
      : undefined;
    year = componentValue(extraction.data.year) ?? year;
    journalStartPage = extraction.data.firstPage?.value;
  } else if (extraction?.type === "ONLINE_SOURCE") {
    normalizedAuthors = people(extraction.data.authors);
    normalizedWorkTitle = componentValue(extraction.data.title)
      ? normalizeIdentityText(extraction.data.title!.value)
      : normalizedWorkTitle;
    normalizedContainerTitle = componentValue(extraction.data.siteName)
      ? normalizeIdentityText(extraction.data.siteName!.value)
      : componentValue(extraction.data.organization)
        ? normalizeIdentityText(extraction.data.organization!.value)
        : undefined;
    year = componentValue(extraction.data.publicationDate)?.slice(-4) ?? year;
  }

  const warnings: string[] = [];
  if (suspiciousPrefix) warnings.push("SUSPICIOUS_NARRATIVE_PREFIX");
  if (item.status !== "recognized" || item.confidence !== "high") {
    warnings.push("CITATION_ITEM_NOT_CLEAN");
  }
  if (
    extraction?.status === "unresolved" &&
    !(sourceType === "BOOK" && hasStrongMissingBookSeparator(item.rawText))
  ) {
    warnings.push("EXTRACTION_UNRESOLVED");
  }
  if (extraction?.status === "partial") warnings.push("EXTRACTION_PARTIAL");
  const hasIdentityAnchor =
    normalizedAuthors.length > 0 || Boolean(normalizedWorkTitle || normalizedContainerTitle);
  if (!hasIdentityAnchor) warnings.push("IDENTITY_FIELDS_MISSING");
  const normalizedBibliographicCore = normalizeIdentityText(raw);
  const confidence =
    warnings.length === 0
      ? "high"
      : hasIdentityAnchor && !warnings.includes("SUSPICIOUS_NARRATIVE_PREFIX")
        ? "medium"
        : "low";
  return {
    normalizedAuthors,
    normalizedEditors,
    ...(normalizedWorkTitle ? { normalizedWorkTitle } : {}),
    ...(shortTitle ? { shortTitle } : {}),
    ...(normalizedContainerTitle ? { normalizedContainerTitle } : {}),
    ...(edition ? { edition: normalizeIdentityText(edition) } : {}),
    ...(year ? { year } : {}),
    sourceType,
    ...(publisher ? { publisher } : {}),
    ...(volume ? { volume: normalizeIdentityText(volume) } : {}),
    ...(journalStartPage ? { journalStartPage } : {}),
    rawBibliographicCore: raw,
    normalizedBibliographicCore,
    confidence,
    warnings,
  };
}

function compatibleSourceTypes(left: CitationType, right: CitationType): boolean {
  return left === right;
}

function averageBestNameSimilarity(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const scores = left.map((name) =>
    Math.max(...right.map((candidate) => deterministicStringSimilarity(name, candidate)))
  );
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export function compareSourceFingerprints(
  left: SourceFingerprint,
  right: SourceFingerprint
): SourceSimilarityResult {
  const hardConflicts: string[] = [];
  if (!compatibleSourceTypes(left.sourceType, right.sourceType)) {
    hardConflicts.push("INCOMPATIBLE_SOURCE_TYPE");
  }
  if (left.year && right.year && left.year !== right.year) hardConflicts.push("CONFLICTING_YEAR");
  if (left.edition && right.edition && left.edition !== right.edition) {
    hardConflicts.push("CONFLICTING_EDITION");
  }
  const authorScore = averageBestNameSimilarity(left.normalizedAuthors, right.normalizedAuthors);
  if (
    left.normalizedAuthors.length > 0 &&
    right.normalizedAuthors.length > 0 &&
    authorScore < 0.55
  ) {
    hardConflicts.push("CONFLICTING_AUTHOR");
  }
  const workScore = deterministicStringSimilarity(
    left.normalizedWorkTitle ?? left.shortTitle ?? "",
    right.normalizedWorkTitle ?? right.shortTitle ?? ""
  );
  if (left.normalizedWorkTitle && right.normalizedWorkTitle) {
    const leftTokens = left.normalizedWorkTitle.split(" ");
    const rightTokens = right.normalizedWorkTitle.split(" ");
    const differingTokens = leftTokens.filter((token, index) => token !== rightTokens[index]);
    const shortDistinctiveTokenConflict =
      leftTokens.length === rightTokens.length &&
      differingTokens.length === 1 &&
      (() => {
        const differingIndex = leftTokens.findIndex((token, index) => token !== rightTokens[index]);
        const leftToken = differingTokens[0] ?? "";
        const rightToken = rightTokens[differingIndex] ?? "";
        return (
          (/^\d+$/u.test(leftToken) && /^\d+$/u.test(rightToken)) ||
          Math.max(leftToken.length, rightToken.length) <= 3
        );
      })();
    if (workScore < 0.75 || shortDistinctiveTokenConflict) {
      hardConflicts.push("CONFLICTING_WORK_TITLE");
    }
  }
  const containerScore = deterministicStringSimilarity(
    left.normalizedContainerTitle ?? "",
    right.normalizedContainerTitle ?? ""
  );
  const fieldScores: Record<string, number> = {
    authors: Number(authorScore.toFixed(4)),
    workTitle: workScore,
    containerTitle: containerScore,
    bibliographicCore: deterministicStringSimilarity(
      left.normalizedBibliographicCore,
      right.normalizedBibliographicCore
    ),
  };
  if (hardConflicts.length > 0) return { score: 0, fieldScores, hardConflicts };

  const weighted: Array<[number, number]> = [];
  if (left.normalizedAuthors.length > 0 && right.normalizedAuthors.length > 0) {
    weighted.push([authorScore, 0.3]);
  }
  if (
    (left.normalizedWorkTitle || left.shortTitle) &&
    (right.normalizedWorkTitle || right.shortTitle)
  ) {
    weighted.push([workScore, 0.38]);
  }
  if (left.normalizedContainerTitle && right.normalizedContainerTitle) {
    weighted.push([containerScore, 0.2]);
  }
  if (left.year && right.year) weighted.push([1, 0.06]);
  if (left.edition && right.edition) weighted.push([1, 0.06]);
  if (left.volume && right.volume) {
    weighted.push([left.volume === right.volume ? 1 : 0, 0.04]);
  }
  if (left.journalStartPage && right.journalStartPage) {
    weighted.push([left.journalStartPage === right.journalStartPage ? 1 : 0, 0.08]);
  }
  if (weighted.length === 0) weighted.push([fieldScores.bibliographicCore, 1]);
  else weighted.push([fieldScores.bibliographicCore, 0.12]);
  const weight = weighted.reduce((sum, [, current]) => sum + current, 0);
  const score = weighted.reduce((sum, [value, current]) => sum + value * current, 0) / weight;
  return { score: Number(score.toFixed(4)), fieldScores, hardConflicts };
}

function occurrence(record: ItemRecord): DocumentSourceOccurrence {
  return {
    footnoteId: record.item.footnoteId,
    footnoteOrdinal: record.footnoteOrdinal,
    citationItemId: record.item.id,
    start: record.item.start,
    end: record.item.end,
  };
}

function compareOccurrence(
  left: DocumentSourceOccurrence,
  right: DocumentSourceOccurrence
): number {
  return (
    left.footnoteOrdinal - right.footnoteOrdinal ||
    left.start - right.start ||
    left.citationItemId.localeCompare(right.citationItemId)
  );
}

function sourceIdFor(fingerprint: SourceFingerprint, state: RegistryBuildState): string {
  const base = stableDocumentSourceId(fingerprint.normalizedBibliographicCore);
  let candidate = base;
  let suffix = 2;
  while (
    state.sources.has(candidate) &&
    state.sources.get(candidate)?.canonicalFingerprint.normalizedBibliographicCore !==
      fingerprint.normalizedBibliographicCore
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function addToIndex(index: Map<string, Set<string>>, key: string, sourceId: string): void {
  if (!key) return;
  const values = index.get(key) ?? new Set<string>();
  values.add(sourceId);
  index.set(key, values);
}

function blockKeys(fingerprint: SourceFingerprint): string[] {
  const type = fingerprint.sourceType;
  const author = fingerprint.normalizedAuthors[0] ?? fingerprint.normalizedEditors[0];
  const work = fingerprint.normalizedWorkTitle ?? fingerprint.shortTitle;
  const container = fingerprint.normalizedContainerTitle;
  const keys: string[] = [];
  if (author) {
    const token = author.split(" ")[0];
    keys.push(`${type}|author:${token.slice(0, 4)}`);
    if (fingerprint.year) keys.push(`${type}|year:${fingerprint.year}|a:${token[0]}`);
  }
  if (work) keys.push(`${type}|work:${work.split(" ")[0].slice(0, 6)}`);
  if (container) keys.push(`${type}|container:${container.split(" ")[0].slice(0, 6)}`);
  if (fingerprint.year) keys.push(`${type}|year:${fingerprint.year}`);
  return [...new Set(keys)];
}

function indexFingerprint(
  sourceId: string,
  fingerprint: SourceFingerprint,
  state: RegistryBuildState
): void {
  addToIndex(state.exactIndex, fingerprint.rawBibliographicCore.normalize("NFC"), sourceId);
  addToIndex(state.normalizedIndex, fingerprint.normalizedBibliographicCore, sourceId);
  blockKeys(fingerprint).forEach((key) => addToIndex(state.blockIndex, key, sourceId));
  const existing = state.fingerprintsBySource.get(sourceId) ?? [];
  if (
    !existing.some(
      (candidate) =>
        candidate.normalizedBibliographicCore === fingerprint.normalizedBibliographicCore &&
        candidate.rawBibliographicCore === fingerprint.rawBibliographicCore
    )
  ) {
    existing.push(fingerprint);
    state.fingerprintsBySource.set(sourceId, existing);
  }
}

function selectCanonicalVariant(source: DocumentSource, state: RegistryBuildState): void {
  const eligible = source.observedVariants.filter((variant) => variant.eligibleForCanonical);
  const candidates = eligible.length > 0 ? eligible : source.observedVariants;
  candidates.sort(
    (left, right) =>
      right.occurrenceCount - left.occurrenceCount ||
      compareOccurrence(left.firstOccurrence, right.firstOccurrence) ||
      left.rawBibliographicCore.localeCompare(right.rawBibliographicCore, "de")
  );
  const selected = candidates[0];
  if (!selected) return;
  source.canonicalDisplayCitation = selected.rawBibliographicCore;
  source.canonicalVariant = {
    normalizedBibliographicCore: selected.normalizedBibliographicCore,
    occurrenceCount: selected.occurrenceCount,
    firstOccurrence: selected.firstOccurrence,
    selectionReason: "MOST_FREQUENT_THEN_EARLIEST",
  };
  const fingerprint = (state.fingerprintsBySource.get(source.documentSourceId) ?? []).find(
    (candidate) =>
      candidate.rawBibliographicCore === selected.rawBibliographicCore &&
      candidate.normalizedBibliographicCore === selected.normalizedBibliographicCore
  );
  if (fingerprint) source.canonicalFingerprint = fingerprint;
}

function addObservation(
  source: DocumentSource,
  record: ItemRecord,
  eligible: boolean,
  state: RegistryBuildState
): void {
  const fingerprint = record.fingerprint;
  if (!fingerprint) return;
  if (!source.citationItemIds.includes(record.item.id)) source.citationItemIds.push(record.item.id);
  source.occurrenceCount = source.citationItemIds.length;
  if (eligible) source.trainingOccurrenceCount += 1;
  let variant = source.observedVariants.find(
    (candidate) =>
      candidate.rawBibliographicCore === fingerprint.rawBibliographicCore &&
      candidate.normalizedBibliographicCore === fingerprint.normalizedBibliographicCore
  );
  if (!variant) {
    variant = {
      rawBibliographicCore: fingerprint.rawBibliographicCore,
      normalizedBibliographicCore: fingerprint.normalizedBibliographicCore,
      occurrenceCount: 0,
      firstOccurrence: occurrence(record),
      eligibleForCanonical: eligible,
    };
    source.observedVariants.push(variant);
  }
  variant.occurrenceCount += 1;
  variant.eligibleForCanonical ||= eligible;
  source.warnings = [...new Set([...source.warnings, ...fingerprint.warnings])];
  if (source.status !== "AMBIGUOUS" && source.trainingOccurrenceCount >= 3) {
    source.status = "CONFIRMED_DOCUMENT_SOURCE";
  }
  indexFingerprint(source.documentSourceId, fingerprint, state);
  selectCanonicalVariant(source, state);
}

function createSource(record: ItemRecord, state: RegistryBuildState): DocumentSource {
  const fingerprint = record.fingerprint!;
  const first = occurrence(record);
  const id = sourceIdFor(fingerprint, state);
  const variant: DocumentSourceVariant = {
    rawBibliographicCore: fingerprint.rawBibliographicCore,
    normalizedBibliographicCore: fingerprint.normalizedBibliographicCore,
    occurrenceCount: 1,
    firstOccurrence: first,
    eligibleForCanonical: true,
  };
  const source: DocumentSource = {
    documentSourceId: id,
    canonicalFingerprint: fingerprint,
    canonicalDisplayCitation: fingerprint.rawBibliographicCore,
    observedVariants: [variant],
    citationItemIds: [record.item.id],
    occurrenceCount: 1,
    trainingOccurrenceCount: 1,
    status: "CANDIDATE",
    firstOccurrence: first,
    canonicalVariant: {
      normalizedBibliographicCore: fingerprint.normalizedBibliographicCore,
      occurrenceCount: 1,
      firstOccurrence: first,
      selectionReason: "MOST_FREQUENT_THEN_EARLIEST",
    },
    warnings: [...fingerprint.warnings],
  };
  state.sources.set(id, source);
  indexFingerprint(id, fingerprint, state);
  return source;
}

function candidateIdsFor(fingerprint: SourceFingerprint, state: RegistryBuildState): string[] {
  const buckets = blockKeys(fingerprint)
    .map((key) => ({ key, values: state.blockIndex.get(key) }))
    .filter(
      (bucket): bucket is { key: string; values: Set<string> } =>
        bucket.values !== undefined && bucket.values.size > 0
    )
    .sort(
      (left, right) => left.values.size - right.values.size || left.key.localeCompare(right.key)
    );
  return buckets.length > 0 ? [...buckets[0].values].sort() : [];
}

function finalStateForResolution(
  resolution: SourceResolution["resolution"]
): SourceResolution["finalState"] {
  if (resolution === "PERSISTENT_MATCH") return "PERSISTENT_MATCH";
  if (["EXACT", "NORMALIZED", "FUZZY", "NEW"].includes(resolution)) return "DOCUMENT_MATCH";
  if (resolution === "AMBIGUOUS") return "AMBIGUOUS";
  if (resolution === "NON_SOURCE") return "NON_SOURCE";
  if (resolution === "FAILED_LOCAL") return "FAILED_LOCAL";
  return "UNRESOLVED";
}

function addResolution(
  state: RegistryBuildState,
  resolution: Omit<SourceResolution, "finalState"> & { finalState?: SourceResolution["finalState"] }
): void {
  const complete: SourceResolution = {
    ...resolution,
    finalState: resolution.finalState ?? finalStateForResolution(resolution.resolution),
  };
  state.resolutions.push(complete);
  state.resolutionByItemId.set(complete.citationItemId, complete);
}

function resolutionForMatch(
  record: ItemRecord,
  source: DocumentSource,
  resolution: "EXACT" | "NORMALIZED" | "FUZZY",
  strategy: SourceResolution["explanation"]["strategy"],
  similarity?: SourceSimilarityResult
): SourceResolution {
  return {
    citationItemId: record.item.id,
    documentSourceId: source.documentSourceId,
    resolution,
    finalState: "DOCUMENT_MATCH",
    ...(similarity
      ? { similarityScore: similarity.score, fieldScores: similarity.fieldScores }
      : {}),
    confidence: record.fingerprint?.confidence ?? "low",
    canEstablishIdentity: record.canEstablishIdentity,
    warnings: [...(record.fingerprint?.warnings ?? [])],
    ...(record.fingerprint
      ? {
          observedBibliographicCore: record.fingerprint.rawBibliographicCore,
          normalizedBibliographicCore: record.fingerprint.normalizedBibliographicCore,
        }
      : {}),
    explanation: { strategy },
  };
}

function hardConflictReasons(
  fingerprint: SourceFingerprint,
  source: DocumentSource,
  state: RegistryBuildState
): string[] {
  const reasons = new Set<string>();
  for (const candidate of state.fingerprintsBySource.get(source.documentSourceId) ?? [
    source.canonicalFingerprint,
  ]) {
    compareSourceFingerprints(fingerprint, candidate).hardConflicts.forEach((reason) =>
      reasons.add(reason)
    );
  }
  return [...reasons];
}

function processPersistentRecord(
  record: ItemRecord,
  state: RegistryBuildState,
  persistentIndex: PersistentSourceIndex
): boolean {
  const fingerprint = record.fingerprint;
  if (!fingerprint) return false;
  const persistent = resolvePersistentRecord(record, persistentIndex);
  if (persistent.source) {
    addResolution(state, {
      citationItemId: record.item.id,
      persistentSourceId: persistent.source.canonicalSourceId,
      resolution: "PERSISTENT_MATCH",
      confidence: fingerprint.confidence,
      canEstablishIdentity: record.canEstablishIdentity,
      warnings: [...fingerprint.warnings],
      observedBibliographicCore: fingerprint.rawBibliographicCore,
      normalizedBibliographicCore: fingerprint.normalizedBibliographicCore,
      ...(persistent.score !== undefined ? { similarityScore: persistent.score } : {}),
      explanation: {
        strategy: "PERSISTENT_INDEX",
        candidateDocumentSourceIds: [persistent.source.canonicalSourceId],
      },
    });
    return true;
  }
  if (persistent.ambiguousIds?.length) {
    addResolution(state, {
      citationItemId: record.item.id,
      resolution: "AMBIGUOUS",
      confidence: "low",
      canEstablishIdentity: false,
      warnings: ["PERSISTENT_MATCH_AMBIGUOUS"],
      observedBibliographicCore: fingerprint.rawBibliographicCore,
      normalizedBibliographicCore: fingerprint.normalizedBibliographicCore,
      ...(persistent.score !== undefined ? { similarityScore: persistent.score } : {}),
      explanation: {
        strategy: "PERSISTENT_INDEX",
        candidateDocumentSourceIds: persistent.ambiguousIds,
      },
    });
    return true;
  }
  return false;
}

function processRegularRecord(
  record: ItemRecord,
  state: RegistryBuildState,
  persistentIndex: PersistentSourceIndex
): void {
  if (record.localFailure) {
    addResolution(state, {
      citationItemId: record.item.id,
      resolution: "FAILED_LOCAL",
      confidence: "low",
      canEstablishIdentity: false,
      warnings: ["LOCAL_SOURCE_RESOLUTION_FAILED"],
      explanation: {
        strategy: "INSUFFICIENT_EVIDENCE",
        hardConflictReasons: [record.localFailure],
      },
    });
    return;
  }
  const fingerprint = record.fingerprint;
  if (!fingerprint) {
    addResolution(state, {
      citationItemId: record.item.id,
      resolution: "UNRESOLVED",
      confidence: "low",
      canEstablishIdentity: false,
      warnings: ["FINGERPRINT_NOT_AVAILABLE"],
      explanation: { strategy: "INSUFFICIENT_EVIDENCE" },
    });
    return;
  }

  if (processPersistentRecord(record, state, persistentIndex)) return;

  const exactIds = [
    ...(state.exactIndex.get(fingerprint.rawBibliographicCore.normalize("NFC")) ?? []),
  ];
  const normalizedIds = [
    ...(state.normalizedIndex.get(fingerprint.normalizedBibliographicCore) ?? []),
  ];
  const directIds = exactIds.length > 0 ? exactIds : normalizedIds;
  if (directIds.length === 1) {
    const source = state.sources.get(directIds[0])!;
    const conflicts = hardConflictReasons(fingerprint, source, state);
    if (conflicts.length === 0) {
      addObservation(source, record, record.canEstablishIdentity, state);
      addResolution(
        state,
        resolutionForMatch(
          record,
          source,
          exactIds.length > 0 ? "EXACT" : "NORMALIZED",
          exactIds.length > 0 ? "EXACT_CORE" : "NORMALIZED_CORE"
        )
      );
      return;
    }
    source.status = "AMBIGUOUS";
    source.warnings = [...new Set([...source.warnings, ...conflicts])];
    addResolution(state, {
      citationItemId: record.item.id,
      resolution: "AMBIGUOUS",
      confidence: "low",
      canEstablishIdentity: false,
      warnings: conflicts,
      observedBibliographicCore: fingerprint.rawBibliographicCore,
      normalizedBibliographicCore: fingerprint.normalizedBibliographicCore,
      explanation: {
        strategy: exactIds.length > 0 ? "EXACT_CORE" : "NORMALIZED_CORE",
        candidateDocumentSourceIds: [source.documentSourceId],
        hardConflictReasons: conflicts,
      },
    });
    return;
  }
  if (directIds.length > 1) {
    addResolution(state, {
      citationItemId: record.item.id,
      resolution: "AMBIGUOUS",
      confidence: "low",
      canEstablishIdentity: false,
      warnings: ["MULTIPLE_DIRECT_MATCHES"],
      explanation: {
        strategy: exactIds.length > 0 ? "EXACT_CORE" : "NORMALIZED_CORE",
        candidateDocumentSourceIds: directIds.sort(),
      },
    });
    return;
  }

  const ranked = candidateIdsFor(fingerprint, state)
    .map((sourceId) => {
      const source = state.sources.get(sourceId)!;
      const comparisons = (
        state.fingerprintsBySource.get(sourceId) ?? [source.canonicalFingerprint]
      )
        .map((candidate) => compareSourceFingerprints(fingerprint, candidate))
        .sort((left, right) => right.score - left.score);
      return { source, similarity: comparisons[0] };
    })
    .filter(({ similarity }) => similarity.hardConflicts.length === 0)
    .sort(
      (left, right) =>
        right.similarity.score - left.similarity.score ||
        left.source.documentSourceId.localeCompare(right.source.documentSourceId)
    );
  const best = ranked[0];
  const second = ranked[1];
  if (
    best &&
    best.similarity.score >= FUZZY_MATCH_MINIMUM &&
    (!second || best.similarity.score - second.similarity.score >= UNIQUE_MATCH_MARGIN)
  ) {
    addObservation(best.source, record, record.canEstablishIdentity, state);
    addResolution(
      state,
      resolutionForMatch(record, best.source, "FUZZY", "STRUCTURED_SIMILARITY", best.similarity)
    );
    return;
  }
  if (best && best.similarity.score >= AMBIGUOUS_MATCH_MINIMUM) {
    addResolution(state, {
      citationItemId: record.item.id,
      resolution: "AMBIGUOUS",
      similarityScore: best.similarity.score,
      fieldScores: best.similarity.fieldScores,
      confidence: "low",
      canEstablishIdentity: false,
      warnings: ["SIMILARITY_NOT_UNIQUE"],
      explanation: {
        strategy: "STRUCTURED_SIMILARITY",
        candidateDocumentSourceIds: ranked
          .filter(({ similarity }) => similarity.score >= AMBIGUOUS_MATCH_MINIMUM)
          .map(({ source }) => source.documentSourceId),
      },
    });
    return;
  }
  if (!record.canEstablishIdentity) {
    addResolution(state, {
      citationItemId: record.item.id,
      resolution: "UNRESOLVED",
      confidence: fingerprint.confidence,
      canEstablishIdentity: false,
      warnings: [...fingerprint.warnings],
      explanation: { strategy: "INSUFFICIENT_EVIDENCE" },
    });
    return;
  }
  const source = createSource(record, state);
  addResolution(state, {
    citationItemId: record.item.id,
    documentSourceId: source.documentSourceId,
    resolution: "NEW",
    confidence: fingerprint.confidence,
    canEstablishIdentity: true,
    warnings: [...fingerprint.warnings],
    observedBibliographicCore: fingerprint.rawBibliographicCore,
    normalizedBibliographicCore: fingerprint.normalizedBibliographicCore,
    explanation: { strategy: "NEW_SOURCE" },
  });
}

function evidenceSimilarity(
  fingerprint: SourceFingerprint,
  source: DocumentSource
): SourceSimilarityResult {
  return compareSourceFingerprints(fingerprint, source.canonicalFingerprint);
}

function linkSpecialRecord(
  record: ItemRecord,
  source: DocumentSource,
  strategy: "ANM_REFERENCE" | "IMMEDIATE_CONTEXT",
  similarity: SourceSimilarityResult | undefined,
  state: RegistryBuildState
): void {
  addObservation(source, record, false, state);
  addResolution(state, {
    citationItemId: record.item.id,
    documentSourceId: source.documentSourceId,
    resolution: similarity && similarity.score < 1 ? "FUZZY" : "NORMALIZED",
    ...(similarity
      ? { similarityScore: similarity.score, fieldScores: similarity.fieldScores }
      : {}),
    confidence: "high",
    canEstablishIdentity: false,
    warnings: [...(record.fingerprint?.warnings ?? [])],
    ...(record.fingerprint
      ? {
          observedBibliographicCore: record.fingerprint.rawBibliographicCore,
          normalizedBibliographicCore: record.fingerprint.normalizedBibliographicCore,
        }
      : {}),
    explanation: { strategy },
  });
}

function unresolvedSpecial(
  record: ItemRecord,
  resolution: "AMBIGUOUS" | "UNRESOLVED",
  strategy: "ANM_REFERENCE" | "IMMEDIATE_CONTEXT",
  candidateIds: string[],
  state: RegistryBuildState
): void {
  addResolution(state, {
    citationItemId: record.item.id,
    resolution,
    confidence: "low",
    canEstablishIdentity: false,
    warnings: [resolution === "AMBIGUOUS" ? "REFERENCE_AMBIGUOUS" : "REFERENCE_NOT_RESOLVED"],
    explanation: {
      strategy,
      ...(candidateIds.length > 0 ? { candidateDocumentSourceIds: candidateIds } : {}),
    },
  });
}

function sourceIdsInFootnote(
  footnoteId: string,
  records: readonly ItemRecord[],
  state: RegistryBuildState
): string[] {
  return [
    ...new Set(
      records
        .filter((record) => record.item.footnoteId === footnoteId)
        .map((record) => state.resolutionByItemId.get(record.item.id)?.documentSourceId)
        .filter((value): value is string => Boolean(value))
    ),
  ];
}

function resolveSpecialRecords(
  records: readonly ItemRecord[],
  footnoteIdByOrdinal: ReadonlyMap<number, string>,
  state: RegistryBuildState,
  persistentIndex: PersistentSourceIndex
): void {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record.specialReference) continue;
    if (state.resolutionByItemId.has(record.item.id)) continue;
    const fingerprint = record.fingerprint;
    if (record.specialReference === "ANM") {
      const referencedOrdinal = record.item.internalReferences[0]?.referencedOrdinal;
      const referencedFootnoteId = referencedOrdinal
        ? footnoteIdByOrdinal.get(referencedOrdinal)
        : undefined;
      const candidateIds = referencedFootnoteId
        ? sourceIdsInFootnote(referencedFootnoteId, records, state)
        : [];
      const ranked = fingerprint
        ? candidateIds
            .map((sourceId) => ({
              source: state.sources.get(sourceId)!,
              similarity: evidenceSimilarity(fingerprint, state.sources.get(sourceId)!),
            }))
            .filter(({ similarity }) => similarity.hardConflicts.length === 0)
            .sort((left, right) => right.similarity.score - left.similarity.score)
        : [];
      const best = ranked[0];
      const second = ranked[1];
      const hasIdentityEvidence = Boolean(
        fingerprint &&
        (fingerprint.normalizedAuthors.length > 0 ||
          fingerprint.normalizedWorkTitle ||
          fingerprint.normalizedContainerTitle)
      );
      if (
        best &&
        hasIdentityEvidence &&
        best.similarity.score >= AMBIGUOUS_MATCH_MINIMUM &&
        (!second || best.similarity.score - second.similarity.score >= 0.08)
      ) {
        linkSpecialRecord(record, best.source, "ANM_REFERENCE", best.similarity, state);
      } else {
        unresolvedSpecial(
          record,
          candidateIds.length > 1 || (best?.similarity.score ?? 0) >= AMBIGUOUS_MATCH_MINIMUM
            ? "AMBIGUOUS"
            : "UNRESOLVED",
          "ANM_REFERENCE",
          candidateIds,
          state
        );
      }
      continue;
    }

    const previous = [...records.slice(0, index)]
      .reverse()
      .map((candidate) => state.resolutionByItemId.get(candidate.item.id))
      .find((resolution) => resolution?.documentSourceId || resolution?.persistentSourceId);
    const previousSource = previous?.documentSourceId
      ? state.sources.get(previous.documentSourceId)
      : undefined;
    const previousPersistentSource = previous?.persistentSourceId
      ? persistentIndex.sourcesById.get(previous.persistentSourceId)
      : undefined;
    if (!previousSource && !previousPersistentSource) {
      unresolvedSpecial(record, "UNRESOLVED", "IMMEDIATE_CONTEXT", [], state);
      continue;
    }
    const withoutSignal = record.item.rawText
      .replace(/^(?:ders\.|dies\.|ebenda|ebd\.)\s*,?\s*/iu, "")
      .replace(/(?:^|[,;]\s+|\s+)(?:§§?|Art\.|Rn\.|Rdn\.?|Rdnr\.|S\.|Seite)\s*\d.*$/iu, "")
      .replace(/[\s,;.]+$/g, "")
      .trim();
    if (!withoutSignal) {
      if (previousSource) {
        linkSpecialRecord(record, previousSource, "IMMEDIATE_CONTEXT", undefined, state);
      } else {
        addResolution(state, {
          citationItemId: record.item.id,
          persistentSourceId: previousPersistentSource!.canonicalSourceId,
          resolution: "PERSISTENT_MATCH",
          confidence: "high",
          canEstablishIdentity: false,
          warnings: [...(record.fingerprint?.warnings ?? [])],
          explanation: {
            strategy: "IMMEDIATE_CONTEXT",
            candidateDocumentSourceIds: [previousPersistentSource!.canonicalSourceId],
          },
        });
      }
      continue;
    }
    if (fingerprint && record.specialReference === "DERS_DIES") {
      const previousAuthors = previousSource
        ? previousSource.canonicalFingerprint.normalizedAuthors
        : previousPersistentSource
          ? [normalizePersonName(previousPersistentSource.preferredName.split(",")[0])]
          : [];
      const inferred: SourceFingerprint = {
        ...fingerprint,
        normalizedAuthors: [...previousAuthors],
      };
      if (
        previousAuthors.length > 0 &&
        processPersistentRecord({ ...record, fingerprint: inferred }, state, persistentIndex)
      ) {
        const inferredResolution = state.resolutionByItemId.get(record.item.id);
        if (inferredResolution?.finalState === "PERSISTENT_MATCH") {
          inferredResolution.explanation = {
            ...inferredResolution.explanation,
            strategy: "IMMEDIATE_CONTEXT",
          };
        }
        continue;
      }
      const candidates = [...state.sources.values()]
        .filter((source) =>
          source.canonicalFingerprint.normalizedAuthors.some((author) =>
            inferred.normalizedAuthors.includes(author)
          )
        )
        .map((source) => ({ source, similarity: evidenceSimilarity(inferred, source) }))
        .filter(({ similarity }) => similarity.hardConflicts.length === 0)
        .sort((left, right) => right.similarity.score - left.similarity.score);
      if (
        candidates[0] &&
        candidates[0].similarity.score >= FUZZY_MATCH_MINIMUM &&
        (!candidates[1] ||
          candidates[0].similarity.score - candidates[1].similarity.score >= UNIQUE_MATCH_MARGIN)
      ) {
        linkSpecialRecord(
          record,
          candidates[0].source,
          "IMMEDIATE_CONTEXT",
          candidates[0].similarity,
          state
        );
        continue;
      }
      unresolvedSpecial(
        record,
        candidates.length > 1 ? "AMBIGUOUS" : "UNRESOLVED",
        "IMMEDIATE_CONTEXT",
        candidates.map(({ source }) => source.documentSourceId),
        state
      );
      continue;
    }
    unresolvedSpecial(
      record,
      "AMBIGUOUS",
      "IMMEDIATE_CONTEXT",
      [previousSource?.documentSourceId ?? previousPersistentSource!.canonicalSourceId],
      state
    );
  }
}

function clearPersistentLiteratureMatch(
  source: DocumentSource,
  mappingData: CitationSourceMappingData | undefined
): string | undefined {
  if (!mappingData) return undefined;
  const fingerprint = source.canonicalFingerprint;
  const keys = new Set(
    [
      fingerprint.normalizedBibliographicCore,
      fingerprint.normalizedWorkTitle,
      fingerprint.shortTitle,
      fingerprint.normalizedContainerTitle,
    ].filter((value): value is string => Boolean(value))
  );
  const matchingIds = mappingData.sources
    .filter((candidate) => candidate.active)
    .filter((candidate) => {
      const values = [candidate.preferredName, candidate.preferredCitationText]
        .filter((value): value is string => Boolean(value))
        .map((value) => normalizeCitationSourceText(value));
      mappingData.aliases
        .filter((alias) => alias.active && alias.canonicalSourceId === candidate.canonicalSourceId)
        .forEach((alias) => values.push(normalizeCitationSourceText(alias.alias)));
      return values.some((value) => keys.has(value));
    })
    .map((candidate) => candidate.canonicalSourceId);
  return matchingIds.length === 1 ? matchingIds[0] : undefined;
}

function itemRecords(input: BuildDocumentSourceRegistryInput): ItemRecord[] {
  const ordinalByFootnoteId = new Map(
    input.footnotes.map((footnote) => [footnote.id, footnote.ordinal])
  );
  const records: ItemRecord[] = [];
  for (const parseResult of input.parseResults) {
    for (const sequence of parseResult.sequences ?? []) {
      for (const item of sequence.items) {
        const segment = overlappingSegment(item, parseResult);
        const sourceType = sourceTypeFor(item, segment, input.segmentAnalyses);
        let fingerprint: SourceFingerprint | undefined;
        let localFailure: string | undefined;
        try {
          fingerprint = createSourceFingerprint(item, segment, sourceType);
        } catch (error) {
          localFailure = error instanceof Error ? error.message : "UNKNOWN_LOCAL_FAILURE";
        }
        const lower = item.rawText.trim().toLocaleLowerCase("de-DE");
        const specialReference = /^(?:ders\.|dies\.)/u.test(lower)
          ? "DERS_DIES"
          : item.internalReferences.length > 0
            ? "ANM"
            : /^(?:ebenda|ebd\.)/u.test(lower)
              ? "EBENDA"
              : null;
        const supportedSource = !["STATUTE", "CASE_LAW"].includes(sourceType);
        const canEstablishIdentity = Boolean(
          supportedSource &&
          !specialReference &&
          fingerprint?.confidence === "high" &&
          !fingerprint.warnings.includes("SUSPICIOUS_NARRATIVE_PREFIX") &&
          fingerprint.normalizedBibliographicCore
        );
        records.push({
          item,
          segment,
          sourceType,
          footnoteOrdinal: ordinalByFootnoteId.get(item.footnoteId) ?? Number.MAX_SAFE_INTEGER,
          fingerprint,
          canEstablishIdentity,
          specialReference,
          ...(localFailure ? { localFailure } : {}),
        });
      }
    }
  }
  return records.sort(
    (left, right) =>
      left.footnoteOrdinal - right.footnoteOrdinal ||
      left.item.start - right.item.start ||
      left.item.id.localeCompare(right.item.id)
  );
}

export function* buildDocumentSourceRegistryWork(
  input: BuildDocumentSourceRegistryInput
): Generator<WorkProgress, DocumentSourceRegistry, void> {
  const startedAt = timestamp();
  const persistentIndex = persistentSourceIndex(input.mappingData);
  const state: RegistryBuildState = {
    sources: new Map(),
    fingerprintsBySource: new Map(),
    exactIndex: new Map(),
    normalizedIndex: new Map(),
    blockIndex: new Map(),
    resolutions: [],
    resolutionByItemId: new Map(),
  };
  const records = itemRecords(input);
  const total = records.length * 2;
  let processed = 0;
  yield { phase: "resolving", processed, total };
  for (const record of records) {
    if (!record.specialReference) processRegularRecord(record, state, persistentIndex);
    yield { phase: "resolving", processed: ++processed, total };
  }
  for (const record of records) {
    if (record.specialReference === "ANM") processPersistentRecord(record, state, persistentIndex);
    yield { phase: "resolving", processed: ++processed, total };
  }
  const footnoteIdByOrdinal = new Map(
    input.footnotes.map((footnote) => [footnote.ordinal, footnote.id])
  );
  resolveSpecialRecords(records, footnoteIdByOrdinal, state, persistentIndex);
  for (const record of records) {
    if (state.resolutionByItemId.has(record.item.id)) continue;
    addResolution(state, {
      citationItemId: record.item.id,
      resolution: record.localFailure ? "FAILED_LOCAL" : "UNRESOLVED",
      confidence: "low",
      canEstablishIdentity: false,
      warnings: [record.localFailure ? "LOCAL_SOURCE_RESOLUTION_FAILED" : "RESOLUTION_MISSING"],
      explanation: { strategy: "INSUFFICIENT_EVIDENCE" },
    });
  }

  const sources = [...state.sources.values()]
    .map((source) => ({
      ...source,
      ...(clearPersistentLiteratureMatch(source, input.mappingData)
        ? {
            persistentLiteratureEntryId: clearPersistentLiteratureMatch(source, input.mappingData),
          }
        : {}),
      citationItemIds: [...source.citationItemIds].sort(),
      observedVariants: [...source.observedVariants].sort((left, right) =>
        compareOccurrence(left.firstOccurrence, right.firstOccurrence)
      ),
    }))
    .sort((left, right) => compareOccurrence(left.firstOccurrence, right.firstOccurrence));
  for (const record of records) {
    const resolution = state.resolutionByItemId.get(record.item.id);
    record.item.sourceResolutionStatus = resolution?.resolution ?? "UNRESOLVED";
    record.item.canonicalSourceId =
      resolution?.persistentSourceId ?? resolution?.documentSourceId ?? null;
  }
  const resolutions = records
    .map((record) => state.resolutionByItemId.get(record.item.id)!)
    .filter(Boolean);
  const accounting = {
    citationItemsDetected: records.length,
    persistentMatched: resolutions.filter(
      (resolution) => resolution.finalState === "PERSISTENT_MATCH"
    ).length,
    documentMatched: resolutions.filter((resolution) => resolution.finalState === "DOCUMENT_MATCH")
      .length,
    ambiguous: resolutions.filter((resolution) => resolution.finalState === "AMBIGUOUS").length,
    unresolved: resolutions.filter((resolution) => resolution.finalState === "UNRESOLVED").length,
    intentionallyIgnored: resolutions.filter((resolution) => resolution.finalState === "NON_SOURCE")
      .length,
    failedLocal: resolutions.filter((resolution) => resolution.finalState === "FAILED_LOCAL")
      .length,
    accountedTotal: resolutions.length,
    invariantSatisfied: resolutions.length === records.length,
  };
  return {
    schemaVersion: 1,
    sources,
    resolutions,
    confirmedSourceCount: sources.filter((source) => source.status === "CONFIRMED_DOCUMENT_SOURCE")
      .length,
    unpromotedConfirmedSourceCount: sources.filter(
      (source) =>
        source.status === "CONFIRMED_DOCUMENT_SOURCE" && !source.persistentLiteratureEntryId
    ).length,
    ambiguousResolutionCount: resolutions.filter(
      (resolution) => resolution.resolution === "AMBIGUOUS"
    ).length,
    unresolvedResolutionCount: resolutions.filter(
      (resolution) => resolution.resolution === "UNRESOLVED"
    ).length,
    accounting,
    auditRecords: records.map((record) => {
      const resolution = state.resolutionByItemId.get(record.item.id)!;
      return {
        footnoteOrdinal: record.footnoteOrdinal,
        citationItemId: record.item.id,
        rawSourceText: record.item.rawText,
        sourceFamily: record.sourceType,
        ...(resolution.persistentSourceId
          ? { persistentSourceId: resolution.persistentSourceId }
          : {}),
        ...(resolution.documentSourceId ? { documentSourceId: resolution.documentSourceId } : {}),
        finalState: resolution.finalState,
        resolution: resolution.resolution,
        associatedFindingIds: [],
        ...(resolution.finalState === "NON_SOURCE"
          ? { ignoredReason: resolution.warnings[0] ?? "INTENTIONALLY_IGNORED" }
          : {}),
        noFindingReason: "SOURCE_RESOLUTION_ACCOUNTED_NO_ASSOCIATED_FINDING",
      };
    }),
    durationMs: Number((timestamp() - startedAt).toFixed(3)),
  };
}

export function buildDocumentSourceRegistry(
  input: BuildDocumentSourceRegistryInput
): DocumentSourceRegistry {
  return finishWork(buildDocumentSourceRegistryWork(input));
}

export function documentSourceForCitationItem(
  registry: DocumentSourceRegistry,
  citationItemId: string | undefined
): DocumentSource | undefined {
  if (!citationItemId) return undefined;
  const sourceId = registry.resolutions.find(
    (resolution) => resolution.citationItemId === citationItemId
  )?.documentSourceId;
  return sourceId
    ? registry.sources.find((source) => source.documentSourceId === sourceId)
    : undefined;
}
