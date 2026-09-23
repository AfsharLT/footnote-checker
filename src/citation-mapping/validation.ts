import { createDefaultCitationSourceMapping } from "./default-mapping";
import { normalizeCitationSourceText } from "./normalization";
import type { CharacterStylePreference, WorkCitationOverride } from "../citation-settings/types";
import type {
  CitationSourceAlias,
  CitationSourceKind,
  CitationSourceLegalArea,
  CitationSourceMappingData,
  CitationSourceMappingValidationResult,
  CitationSourceMaster,
  CitationSourceOrigin,
  CommentaryPersonStructureHint,
  LegacySafetyLevel,
} from "./types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function isKind(value: unknown): value is CitationSourceKind {
  return ["COMMENTARY", "JOURNAL", "BOOK", "REPORT", "CUSTOM"].includes(
    value as CitationSourceKind
  );
}

function applicableCitationTypes(kind: CitationSourceKind) {
  if (kind === "COMMENTARY") return ["COMMENTARY"] as const;
  if (kind === "JOURNAL") return ["JOURNAL_ARTICLE", "CASE_LAW", "CASE_NOTE"] as const;
  if (kind === "BOOK") return ["BOOK", "OTHER"] as const;
  return ["OTHER"] as const;
}

export function normalizeCitationSourceLegalArea(
  value: unknown
): CitationSourceLegalArea | undefined {
  switch (value) {
    case "ZIVILRECHT":
    case "BGB":
      return "ZIVILRECHT";
    case "STRAFRECHT":
    case "STGB":
      return "STRAFRECHT";
    case "PROZESSRECHT":
    case "STPO":
    case "ZPO":
      return "PROZESSRECHT";
    case "OEFFENTLICHES_RECHT":
    case "GG":
      return "OEFFENTLICHES_RECHT";
    case "EUROPARECHT":
      return "EUROPARECHT";
    case "SONSTIGE":
    case "GENERAL":
    case "UNKNOWN":
      return "SONSTIGE";
    default:
      return undefined;
  }
}

function isHint(value: unknown): value is CommentaryPersonStructureHint {
  return [
    "WORK_THEN_BEARBEITER",
    "BEARBEITER_THEN_WORK",
    "WORK_WITHOUT_BEARBEITER",
    "EDITOR_STRUCTURE",
    "AMBIGUOUS",
    "UNKNOWN",
  ].includes(value as CommentaryPersonStructureHint);
}

function isSafety(value: unknown): value is LegacySafetyLevel {
  return value === "PROBABLE" || value === "UNCERTAIN";
}

function isSourceOrigin(value: unknown): value is CitationSourceOrigin {
  return value === "DEFAULT" || value === "USER" || value === "IMPORTED";
}

function optionalStyle(
  value: unknown,
  path: string,
  errors: string[]
): CharacterStylePreference | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return undefined;
  }
  const result: CharacterStylePreference = {};
  for (const property of ["italic", "bold", "underline"] as const) {
    if (value[property] === undefined) continue;
    if (typeof value[property] !== "boolean") errors.push(`${path}.${property} must be a boolean`);
    else result[property] = value[property];
  }
  return result;
}

function validatedWorkOverride(
  value: unknown,
  canonicalSourceId: string,
  kind: CitationSourceKind,
  preferredName: string,
  errors: string[]
): WorkCitationOverride | undefined {
  if (kind !== "COMMENTARY" && kind !== "JOURNAL") return undefined;
  const citationType = kind === "COMMENTARY" ? "COMMENTARY" : "JOURNAL_ARTICLE";
  const fallback: WorkCitationOverride = {
    canonicalWorkId: canonicalSourceId,
    citationType,
    preferredName,
  };
  if (value === undefined) return fallback;
  if (!isRecord(value)) {
    errors.push(`sources.${canonicalSourceId}.workOverride must be an object`);
    return fallback;
  }
  if (value.canonicalWorkId !== canonicalSourceId) {
    errors.push(`sources.${canonicalSourceId}.workOverride.canonicalWorkId must match the source`);
  }
  if (value.citationType !== citationType) {
    errors.push(`sources.${canonicalSourceId}.workOverride.citationType is incompatible`);
  }
  const formatting = isRecord(value.formatting) ? value.formatting : undefined;
  if (value.formatting !== undefined && !formatting) {
    errors.push(`sources.${canonicalSourceId}.workOverride.formatting must be an object`);
  }
  const bearbeiter = optionalStyle(
    formatting?.bearbeiter,
    `sources.${canonicalSourceId}.workOverride.formatting.bearbeiter`,
    errors
  );
  const editor = optionalStyle(
    formatting?.editor,
    `sources.${canonicalSourceId}.workOverride.formatting.editor`,
    errors
  );
  const settings = isRecord(value.citationSettingsOverride)
    ? value.citationSettingsOverride
    : undefined;
  if (value.citationSettingsOverride !== undefined && !settings) {
    errors.push(
      `sources.${canonicalSourceId}.workOverride.citationSettingsOverride must be an object`
    );
  }
  const preferred = optionalString(value.preferredName);
  if (value.preferredName !== undefined && !preferred) {
    errors.push(
      `sources.${canonicalSourceId}.workOverride.preferredName must be a non-empty string`
    );
  }

  if (kind === "COMMENTARY") {
    const personSeparator = optionalString(settings?.personSeparator);
    const marginNumberAbbreviation = optionalString(settings?.marginNumberAbbreviation);
    return {
      canonicalWorkId: canonicalSourceId,
      citationType: "COMMENTARY",
      preferredName: preferred ?? preferredName,
      ...(bearbeiter || editor
        ? {
            formatting: {
              ...(bearbeiter ? { bearbeiter } : {}),
              ...(editor ? { editor } : {}),
            },
          }
        : {}),
      ...(personSeparator || marginNumberAbbreviation
        ? {
            citationSettingsOverride: {
              ...(personSeparator ? { personSeparator } : {}),
              ...(marginNumberAbbreviation ? { marginNumberAbbreviation } : {}),
            },
          }
        : {}),
    };
  }

  const pinpointStyle =
    settings?.pinpointStyle === "parentheses" || settings?.pinpointStyle === "comma"
      ? settings.pinpointStyle
      : undefined;
  if (settings?.pinpointStyle !== undefined && !pinpointStyle) {
    errors.push(`sources.${canonicalSourceId}.workOverride.pinpointStyle is unsupported`);
  }
  return {
    canonicalWorkId: canonicalSourceId,
    citationType: "JOURNAL_ARTICLE",
    preferredName: preferred ?? preferredName,
    ...(pinpointStyle ? { citationSettingsOverride: { pinpointStyle } } : {}),
  };
}

function validateSource(
  value: unknown,
  index: number,
  errors: string[],
  defaultSourceIds: ReadonlySet<string>
): CitationSourceMaster | undefined {
  if (!isRecord(value)) {
    errors.push(`sources[${index}] must be an object`);
    return undefined;
  }
  if (
    value.schemaVersion !== 1 ||
    typeof value.canonicalSourceId !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.canonicalSourceId) ||
    !isKind(value.kind) ||
    typeof value.preferredName !== "string" ||
    value.preferredName.trim() === "" ||
    !normalizeCitationSourceLegalArea(value.legalArea) ||
    typeof value.active !== "boolean"
  ) {
    errors.push(`sources[${index}] has invalid required fields`);
    return undefined;
  }
  const kind = value.kind;
  const canonicalSourceId = value.canonicalSourceId;
  const preferredName = value.preferredName;
  const hint = isHint(value.personStructureHint) ? value.personStructureHint : undefined;
  const workOverride = validatedWorkOverride(
    value.workOverride,
    canonicalSourceId,
    kind,
    preferredName,
    errors
  );
  return {
    schemaVersion: 1,
    canonicalSourceId,
    sourceOrigin: isSourceOrigin(value.sourceOrigin)
      ? value.sourceOrigin
      : defaultSourceIds.has(canonicalSourceId)
        ? "DEFAULT"
        : "USER",
    kind,
    preferredName,
    ...(optionalString(value.preferredCitationText)
      ? { preferredCitationText: value.preferredCitationText as string }
      : {}),
    legalArea: normalizeCitationSourceLegalArea(value.legalArea)!,
    ...(optionalString(value.commentedLaw) ? { commentedLaw: value.commentedLaw as string } : {}),
    applicableCitationTypes: [...applicableCitationTypes(kind)],
    active: value.active,
    ...(optionalString(value.examplePattern)
      ? { examplePattern: value.examplePattern as string }
      : {}),
    ...(optionalString(value.notes) ? { notes: value.notes as string } : {}),
    ...(hint ? { personStructureHint: hint } : {}),
    ...(workOverride ? { workOverride } : {}),
    ...(isRecord(value.legacyMetadata)
      ? {
          legacyMetadata: {
            ...(optionalString(value.legacyMetadata.legacyWorkType)
              ? { legacyWorkType: value.legacyMetadata.legacyWorkType as string }
              : {}),
            ...(optionalString(value.legacyMetadata.legacyLegalArea)
              ? { legacyLegalArea: value.legacyMetadata.legacyLegalArea as string }
              : {}),
            legacyVersions: Array.isArray(value.legacyMetadata.legacyVersions)
              ? value.legacyMetadata.legacyVersions.filter(
                  (item): item is string => typeof item === "string"
                )
              : [],
            legacyDates: Array.isArray(value.legacyMetadata.legacyDates)
              ? value.legacyMetadata.legacyDates.filter(
                  (item): item is string => typeof item === "string"
                )
              : [],
          },
        }
      : {}),
  };
}

function validateAlias(
  value: unknown,
  index: number,
  errors: string[]
): CitationSourceAlias | undefined {
  if (!isRecord(value)) {
    errors.push(`aliases[${index}] must be an object`);
    return undefined;
  }
  if (
    typeof value.canonicalSourceId !== "string" ||
    typeof value.alias !== "string" ||
    value.alias.trim() === "" ||
    (value.matchMode !== "CASE_INSENSITIVE_TEXT" && value.matchMode !== "WHOLE_WORD_MARKER") ||
    typeof value.wholeWord !== "boolean" ||
    typeof value.active !== "boolean"
  ) {
    errors.push(`aliases[${index}] has invalid required fields`);
    return undefined;
  }
  const actions = isRecord(value.legacyActions) ? value.legacyActions : {};
  return {
    ...(optionalString(value.legacyMappingId)
      ? { legacyMappingId: value.legacyMappingId as string }
      : {}),
    canonicalSourceId: value.canonicalSourceId,
    alias: value.alias,
    matchMode: value.matchMode,
    wholeWord: value.wholeWord,
    active: value.active,
    ...(isSafety(value.legacySafetyLevel) ? { legacySafetyLevel: value.legacySafetyLevel } : {}),
    ...(typeof value.legacyAutoCorrectionAllowed === "boolean"
      ? { legacyAutoCorrectionAllowed: value.legacyAutoCorrectionAllowed }
      : {}),
    ...(optionalString(value.legacyCommentCode)
      ? { legacyCommentCode: value.legacyCommentCode as string }
      : {}),
    legacyActions: {
      ...(optionalString(actions.analysis) ? { analysis: actions.analysis as string } : {}),
      ...(optionalString(actions.review) ? { review: actions.review as string } : {}),
      ...(optionalString(actions.correction) ? { correction: actions.correction as string } : {}),
    },
    ...(optionalString(value.notes) ? { notes: value.notes as string } : {}),
    ...(optionalString(value.legacyVersion)
      ? { legacyVersion: value.legacyVersion as string }
      : {}),
    ...(optionalString(value.legacyDate) ? { legacyDate: value.legacyDate as string } : {}),
  };
}

export function validateCitationSourceMappingData(
  value: unknown
): CitationSourceMappingValidationResult {
  const fallback = createDefaultCitationSourceMapping();
  if (!isRecord(value) || value.schemaVersion !== 1) {
    return {
      success: false,
      data: fallback,
      errors: ["Citation source mapping has an unsupported schemaVersion"],
    };
  }
  if (!Array.isArray(value.sources) || !Array.isArray(value.aliases)) {
    return {
      success: false,
      data: fallback,
      errors: ["Citation source mapping must contain source and alias arrays"],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const defaultSourceIds = new Set(fallback.sources.map((source) => source.canonicalSourceId));
  const sources = value.sources
    .map((source, index) => validateSource(source, index, errors, defaultSourceIds))
    .filter((source): source is CitationSourceMaster => source !== undefined);
  const aliases = value.aliases
    .map((alias, index) => validateAlias(alias, index, errors))
    .filter((alias): alias is CitationSourceAlias => alias !== undefined);
  const sourceIds = new Set<string>();
  sources.forEach((source) => {
    if (sourceIds.has(source.canonicalSourceId)) {
      errors.push(`Duplicate canonicalSourceId: ${source.canonicalSourceId}`);
    }
    sourceIds.add(source.canonicalSourceId);
  });
  aliases.forEach((alias) => {
    if (!sourceIds.has(alias.canonicalSourceId)) {
      errors.push(`Alias references missing source: ${alias.canonicalSourceId}`);
    }
    const source = sources.find(
      (candidate) => candidate.canonicalSourceId === alias.canonicalSourceId
    );
    if (
      alias.matchMode === "WHOLE_WORD_MARKER" &&
      source &&
      !["BOOK", "REPORT", "CUSTOM"].includes(source.kind)
    ) {
      errors.push(`WHOLE_WORD_MARKER is not allowed for source: ${alias.canonicalSourceId}`);
    }
    if (alias.matchMode === "WHOLE_WORD_MARKER" && !alias.wholeWord) {
      errors.push(`WHOLE_WORD_MARKER must use wholeWord for source: ${alias.canonicalSourceId}`);
    }
  });
  const aliasSources = new Map<string, Set<string>>();
  aliases
    .filter((alias) => alias.active)
    .forEach((alias) => {
      const normalized = normalizeCitationSourceText(alias.alias);
      const ids = aliasSources.get(normalized) ?? new Set<string>();
      ids.add(alias.canonicalSourceId);
      aliasSources.set(normalized, ids);
    });
  aliasSources.forEach((ids, alias) => {
    if (ids.size > 1)
      warnings.push(`Alias conflict for "${alias}": ${Array.from(ids).sort().join(", ")}`);
  });

  return {
    success: errors.length === 0,
    data: { schemaVersion: 1, sources, aliases },
    errors,
    warnings,
  };
}

export function serializeCitationSourceMapping(data: CitationSourceMappingData): string {
  return JSON.stringify(validateCitationSourceMappingData(data).data);
}

export function parseCitationSourceMapping(json: string): CitationSourceMappingValidationResult {
  try {
    return validateCitationSourceMappingData(JSON.parse(json) as unknown);
  } catch {
    return {
      success: false,
      data: createDefaultCitationSourceMapping(),
      errors: ["Citation source mapping JSON is invalid"],
    };
  }
}
