import { createDefaultCitationSourceMapping } from "../citation-mapping/default-mapping";
import {
  createCanonicalSourceSlug,
  normalizeCitationSourceText,
} from "../citation-mapping/normalization";
import type {
  CitationSourceAlias,
  CitationSourceKind,
  CitationSourceLegalArea,
  CitationSourceMappingData,
  CitationSourceMaster,
  CommentaryPersonStructureHint,
  LegacySafetyLevel,
} from "../citation-mapping/types";
import { createDefaultCitationStyleProfile } from "../citation-settings/defaults";
import type {
  CitationAbbreviationConcept,
  CitationModifierConcept,
  CitationStyleProfile,
} from "../citation-settings/types";
import { sanitizeCitationStyleProfile } from "../citation-settings/validation";

export type SettingsSection =
  | "GENERAL"
  | "STATUTE"
  | "CASE_LAW"
  | "COMMENTARY"
  | "BOOK"
  | "JOURNAL_ARTICLE"
  | "OTHER_TYPES"
  | "ABBREVIATIONS"
  | "FORMATTING"
  | "MAPPING";

export interface MappingFilters {
  search: string;
  kind: "ALL" | CitationSourceKind;
  legalArea: "ALL" | CitationSourceLegalArea;
  status: "ALL" | "ACTIVE" | "INACTIVE";
  safety: "ALL" | LegacySafetyLevel;
  personStructureHint: "ALL" | CommentaryPersonStructureHint;
}

export interface AliasConflict {
  normalizedAlias: string;
  aliases: string[];
  canonicalSourceIds: string[];
}

export interface NewCitationSourceInput {
  preferredName: string;
  preferredCitationText?: string;
  kind: CitationSourceKind;
  legalArea: CitationSourceLegalArea;
  commentedLaw?: string;
  personStructureHint?: CommentaryPersonStructureHint;
  examplePattern?: string;
  notes?: string;
}

export interface EditorOperationResult<T> {
  success: boolean;
  value: T;
  error?: string;
}

export function cloneCitationStyleProfile(profile: CitationStyleProfile): CitationStyleProfile {
  return JSON.parse(JSON.stringify(profile)) as CitationStyleProfile;
}

export function cloneCitationSourceMapping(
  mapping: CitationSourceMappingData
): CitationSourceMappingData {
  return JSON.parse(JSON.stringify(mapping)) as CitationSourceMappingData;
}

export function createDefaultSettingsWorkingCopy(): CitationStyleProfile {
  return createDefaultCitationStyleProfile();
}

export function createDefaultMappingWorkingCopy(): CitationSourceMappingData {
  return createDefaultCitationSourceMapping();
}

export function restoreDefaultCitationSources(
  mapping: CitationSourceMappingData
): CitationSourceMappingData {
  const defaults = createDefaultCitationSourceMapping();
  const defaultIds = new Set(defaults.sources.map((source) => source.canonicalSourceId));
  const preservedSources = mapping.sources.filter(
    (source) => source.sourceOrigin !== "DEFAULT" && !defaultIds.has(source.canonicalSourceId)
  );
  const preservedIds = new Set(preservedSources.map((source) => source.canonicalSourceId));
  const preservedAliases = mapping.aliases.filter((alias) =>
    preservedIds.has(alias.canonicalSourceId)
  );

  return {
    schemaVersion: 1,
    sources: [...defaults.sources, ...preservedSources.map((source) => ({ ...source }))],
    aliases: [...defaults.aliases, ...preservedAliases.map((alias) => ({ ...alias }))],
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalize(nestedValue)])
    );
  }
  return value;
}

export function hasUnsavedChanges<T>(workingCopy: T, savedValue: T): boolean {
  return JSON.stringify(canonicalize(workingCopy)) !== JSON.stringify(canonicalize(savedValue));
}

function duplicateNormalizedValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  values.forEach((value) => {
    const normalized = normalizeCitationSourceText(value);
    if (seen.has(normalized)) duplicates.add(value);
    seen.add(normalized);
  });
  return Array.from(duplicates);
}

export function validateSettingsWorkingCopy(profile: CitationStyleProfile): string[] {
  const validation = sanitizeCitationStyleProfile(profile);
  const errors = [...validation.errors];
  if (!profile.name.trim()) errors.push("Profilname darf nicht leer sein.");

  Object.values(profile.abbreviations).forEach((preference) => {
    if (!preference.preferredOutput.trim()) {
      errors.push(`Abkürzung ${preference.concept}: bevorzugte Ausgabe darf nicht leer sein.`);
    }
    if (preference.recognizedVariants.some((variant) => !variant.trim())) {
      errors.push(`Abkürzung ${preference.concept}: leere Variante ist nicht erlaubt.`);
    }
    if (duplicateNormalizedValues(preference.recognizedVariants).length > 0) {
      errors.push(`Abkürzung ${preference.concept}: doppelte Variante ist nicht erlaubt.`);
    }
  });
  Object.values(profile.modifiers).forEach((preference) => {
    if (!preference.preferredOutput.trim()) {
      errors.push(`Modifier ${preference.normalizedConcept}: Ausgabe darf nicht leer sein.`);
    }
    if (preference.recognizedVariants.some((variant) => !variant.trim())) {
      errors.push(`Modifier ${preference.normalizedConcept}: leere Variante ist nicht erlaubt.`);
    }
    if (duplicateNormalizedValues(preference.recognizedVariants).length > 0) {
      errors.push(`Modifier ${preference.normalizedConcept}: doppelte Variante ist nicht erlaubt.`);
    }
  });
  return errors;
}

export function formatCitationStyleImportErrors(errors: readonly string[]): string[] {
  return errors.map((error) => {
    if (error.startsWith("Unsupported schemaVersion")) {
      return "Diese Settings-Datei verwendet eine nicht unterstützte Schema-Version.";
    }
    if (error === "Profile must be an object") {
      return "Die Settings-Datei muss ein vollständiges Profil enthalten.";
    }
    return error;
  });
}

function addVariant(values: readonly string[], candidate: string): EditorOperationResult<string[]> {
  const trimmed = candidate.trim();
  if (!trimmed)
    return { success: false, value: [...values], error: "Variante darf nicht leer sein." };
  const normalized = normalizeCitationSourceText(trimmed);
  if (values.some((value) => normalizeCitationSourceText(value) === normalized)) {
    return { success: false, value: [...values], error: "Diese Variante ist bereits vorhanden." };
  }
  return { success: true, value: [...values, trimmed] };
}

export function addAbbreviationVariant(
  profile: CitationStyleProfile,
  concept: CitationAbbreviationConcept,
  candidate: string
): EditorOperationResult<CitationStyleProfile> {
  const next = cloneCitationStyleProfile(profile);
  const addition = addVariant(next.abbreviations[concept].recognizedVariants, candidate);
  if (!addition.success) return { success: false, value: profile, error: addition.error };
  next.abbreviations[concept].recognizedVariants = addition.value;
  return { success: true, value: next };
}

export function removeAbbreviationVariant(
  profile: CitationStyleProfile,
  concept: CitationAbbreviationConcept,
  index: number
): CitationStyleProfile {
  const next = cloneCitationStyleProfile(profile);
  next.abbreviations[concept].recognizedVariants.splice(index, 1);
  return next;
}

export function addModifierVariant(
  profile: CitationStyleProfile,
  concept: CitationModifierConcept,
  candidate: string
): EditorOperationResult<CitationStyleProfile> {
  const next = cloneCitationStyleProfile(profile);
  const addition = addVariant(next.modifiers[concept].recognizedVariants, candidate);
  if (!addition.success) return { success: false, value: profile, error: addition.error };
  next.modifiers[concept].recognizedVariants = addition.value;
  return { success: true, value: next };
}

export function removeModifierVariant(
  profile: CitationStyleProfile,
  concept: CitationModifierConcept,
  index: number
): CitationStyleProfile {
  const next = cloneCitationStyleProfile(profile);
  next.modifiers[concept].recognizedVariants.splice(index, 1);
  return next;
}

export const DEFAULT_MAPPING_FILTERS: MappingFilters = {
  search: "",
  kind: "ALL",
  legalArea: "ALL",
  status: "ALL",
  safety: "ALL",
  personStructureHint: "ALL",
};

export function filterCitationSources(
  mapping: CitationSourceMappingData,
  filters: MappingFilters
): CitationSourceMaster[] {
  const search = normalizeCitationSourceText(filters.search);
  return mapping.sources
    .filter((source) => {
      const aliases = mapping.aliases.filter(
        (alias) => alias.canonicalSourceId === source.canonicalSourceId
      );
      const matchesSearch =
        !search ||
        normalizeCitationSourceText(source.preferredName).includes(search) ||
        normalizeCitationSourceText(source.canonicalSourceId).includes(search) ||
        aliases.some((alias) => normalizeCitationSourceText(alias.alias).includes(search));
      const matchesStatus =
        filters.status === "ALL" || (filters.status === "ACTIVE" ? source.active : !source.active);
      return (
        matchesSearch &&
        (filters.kind === "ALL" || source.kind === filters.kind) &&
        (filters.legalArea === "ALL" || source.legalArea === filters.legalArea) &&
        matchesStatus &&
        (filters.safety === "ALL" ||
          aliases.some((alias) => alias.legacySafetyLevel === filters.safety)) &&
        (filters.personStructureHint === "ALL" ||
          (source.personStructureHint ?? "UNKNOWN") === filters.personStructureHint)
      );
    })
    .sort((left, right) => left.preferredName.localeCompare(right.preferredName, "de"));
}

export function findAliasConflicts(mapping: CitationSourceMappingData): AliasConflict[] {
  const grouped = new Map<string, CitationSourceAlias[]>();
  mapping.aliases
    .filter((alias) => alias.active)
    .forEach((alias) => {
      const normalized = normalizeCitationSourceText(alias.alias);
      const aliases = grouped.get(normalized) ?? [];
      aliases.push(alias);
      grouped.set(normalized, aliases);
    });
  return Array.from(grouped.entries())
    .flatMap(([normalizedAlias, aliases]) => {
      const sourceIds = Array.from(new Set(aliases.map((alias) => alias.canonicalSourceId))).sort();
      return sourceIds.length > 1
        ? [
            {
              normalizedAlias,
              aliases: Array.from(new Set(aliases.map((alias) => alias.alias))).sort(),
              canonicalSourceIds: sourceIds,
            },
          ]
        : [];
    })
    .sort((left, right) => left.normalizedAlias.localeCompare(right.normalizedAlias, "de"));
}

function sourceIdFor(input: NewCitationSourceInput): string {
  const slug = createCanonicalSourceSlug(input.preferredName);
  if (input.kind === "JOURNAL") return `journal-${slug}`;
  if (input.kind === "COMMENTARY") return `commentary-${input.legalArea.toLowerCase()}-${slug}`;
  return `${input.kind.toLowerCase()}-${slug}`;
}

function citationTypesForKind(kind: CitationSourceKind) {
  if (kind === "COMMENTARY") return ["COMMENTARY"] as const;
  if (kind === "JOURNAL") return ["JOURNAL_ARTICLE", "CASE_LAW", "CASE_NOTE"] as const;
  if (kind === "BOOK") return ["BOOK", "OTHER"] as const;
  return ["OTHER"] as const;
}

export function addCitationSource(
  mapping: CitationSourceMappingData,
  input: NewCitationSourceInput
): EditorOperationResult<CitationSourceMappingData> {
  const preferredName = input.preferredName.trim();
  if (!preferredName) {
    return { success: false, value: mapping, error: "Preferred Name darf nicht leer sein." };
  }
  const canonicalSourceId = sourceIdFor({ ...input, preferredName });
  if (!canonicalSourceId.replace(/^(journal|commentary-[a-z]+|book|report|custom)-/, "")) {
    return {
      success: false,
      value: mapping,
      error: "Aus dem Namen kann keine stabile ID erzeugt werden.",
    };
  }
  if (mapping.sources.some((source) => source.canonicalSourceId === canonicalSourceId)) {
    return {
      success: false,
      value: mapping,
      error: `Canonical Source ID existiert bereits: ${canonicalSourceId}`,
    };
  }
  const next = cloneCitationSourceMapping(mapping);
  next.sources.push({
    schemaVersion: 1,
    canonicalSourceId,
    sourceOrigin: "USER",
    kind: input.kind,
    preferredName,
    ...(input.preferredCitationText?.trim()
      ? { preferredCitationText: input.preferredCitationText.trim() }
      : {}),
    legalArea: input.legalArea,
    ...(input.commentedLaw?.trim() ? { commentedLaw: input.commentedLaw.trim() } : {}),
    applicableCitationTypes: [...citationTypesForKind(input.kind)],
    active: true,
    ...(input.personStructureHint ? { personStructureHint: input.personStructureHint } : {}),
    ...(input.examplePattern?.trim() ? { examplePattern: input.examplePattern.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    ...(input.kind === "COMMENTARY" || input.kind === "JOURNAL"
      ? {
          workOverride: {
            canonicalWorkId: canonicalSourceId,
            citationType: input.kind === "COMMENTARY" ? "COMMENTARY" : "JOURNAL_ARTICLE",
            preferredName,
          },
        }
      : {}),
  });
  next.aliases.push({
    canonicalSourceId,
    alias: preferredName,
    matchMode: "CASE_INSENSITIVE_TEXT",
    wholeWord: true,
    active: true,
  });
  return { success: true, value: next };
}

export function removeCitationSource(
  mapping: CitationSourceMappingData,
  canonicalSourceId: string
): EditorOperationResult<CitationSourceMappingData> {
  if (!mapping.sources.some((source) => source.canonicalSourceId === canonicalSourceId)) {
    return { success: false, value: mapping, error: "Quelle wurde nicht gefunden." };
  }
  const next = cloneCitationSourceMapping(mapping);
  next.sources = next.sources.filter((source) => source.canonicalSourceId !== canonicalSourceId);
  next.aliases = next.aliases.filter((alias) => alias.canonicalSourceId !== canonicalSourceId);
  return { success: true, value: next };
}

export function updateCitationSource(
  mapping: CitationSourceMappingData,
  canonicalSourceId: string,
  changes: Partial<
    Pick<
      CitationSourceMaster,
      | "preferredName"
      | "preferredCitationText"
      | "kind"
      | "legalArea"
      | "commentedLaw"
      | "active"
      | "personStructureHint"
      | "examplePattern"
      | "notes"
      | "workOverride"
    >
  >
): CitationSourceMappingData {
  const next = cloneCitationSourceMapping(mapping);
  const source = next.sources.find(
    (candidate) => candidate.canonicalSourceId === canonicalSourceId
  );
  if (!source) return mapping;
  Object.assign(source, changes);
  if (changes.kind) {
    source.applicableCitationTypes = [...citationTypesForKind(changes.kind)];
    source.workOverride =
      changes.kind === "COMMENTARY" || changes.kind === "JOURNAL"
        ? {
            ...source.workOverride,
            canonicalWorkId: source.canonicalSourceId,
            citationType: changes.kind === "COMMENTARY" ? "COMMENTARY" : "JOURNAL_ARTICLE",
            preferredName: source.workOverride?.preferredName ?? source.preferredName,
          }
        : undefined;
  }
  return next;
}

export function addCitationSourceAlias(
  mapping: CitationSourceMappingData,
  canonicalSourceId: string,
  aliasText: string
): EditorOperationResult<CitationSourceMappingData> {
  const alias = aliasText.trim();
  if (!alias) return { success: false, value: mapping, error: "Alias darf nicht leer sein." };
  if (!mapping.sources.some((source) => source.canonicalSourceId === canonicalSourceId)) {
    return { success: false, value: mapping, error: "Master-Quelle wurde nicht gefunden." };
  }
  const normalized = normalizeCitationSourceText(alias);
  if (
    mapping.aliases.some(
      (candidate) =>
        candidate.canonicalSourceId === canonicalSourceId &&
        normalizeCitationSourceText(candidate.alias) === normalized
    )
  ) {
    return {
      success: false,
      value: mapping,
      error: "Alias ist für diese Quelle bereits vorhanden.",
    };
  }
  const next = cloneCitationSourceMapping(mapping);
  next.aliases.push({
    canonicalSourceId,
    alias,
    matchMode: "CASE_INSENSITIVE_TEXT",
    wholeWord: true,
    active: true,
  });
  return { success: true, value: next };
}

export function updateCitationSourceAlias(
  mapping: CitationSourceMappingData,
  aliasIndex: number,
  changes: Partial<
    Pick<CitationSourceAlias, "alias" | "active" | "wholeWord" | "matchMode" | "legacySafetyLevel">
  >
): CitationSourceMappingData {
  const next = cloneCitationSourceMapping(mapping);
  const alias = next.aliases[aliasIndex];
  if (!alias) return mapping;
  Object.assign(alias, changes);
  if (changes.matchMode === "WHOLE_WORD_MARKER") alias.wholeWord = true;
  return next;
}

export function removeUserCitationSourceAlias(
  mapping: CitationSourceMappingData,
  aliasIndex: number
): EditorOperationResult<CitationSourceMappingData> {
  const alias = mapping.aliases[aliasIndex];
  if (!alias) return { success: false, value: mapping, error: "Alias wurde nicht gefunden." };
  if (alias.legacyMappingId) {
    return {
      success: false,
      value: mapping,
      error: "Legacy-Aliase werden deaktiviert und nicht gelöscht.",
    };
  }
  if (
    mapping.aliases.filter((candidate) => candidate.canonicalSourceId === alias.canonicalSourceId)
      .length === 1
  ) {
    return {
      success: false,
      value: mapping,
      error: "Mindestens ein Alias ist für den CSV-Roundtrip erforderlich.",
    };
  }
  const next = cloneCitationSourceMapping(mapping);
  next.aliases.splice(aliasIndex, 1);
  return { success: true, value: next };
}
