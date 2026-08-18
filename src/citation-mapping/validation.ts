import { createDefaultCitationSourceMapping } from "./default-mapping";
import { normalizeCitationSourceText } from "./normalization";
import type {
  CitationSourceAlias,
  CitationSourceKind,
  CitationSourceLegalArea,
  CitationSourceMappingData,
  CitationSourceMappingValidationResult,
  CitationSourceMaster,
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
  return value === "COMMENTARY" || value === "JOURNAL";
}

function isArea(value: unknown): value is CitationSourceLegalArea {
  return ["BGB", "STGB", "STPO", "ZPO", "GG", "GENERAL", "UNKNOWN"].includes(
    value as CitationSourceLegalArea
  );
}

function isHint(value: unknown): value is CommentaryPersonStructureHint {
  return ["WORK_THEN_BEARBEITER", "WORK_WITHOUT_BEARBEITER", "AMBIGUOUS", "UNKNOWN"].includes(
    value as CommentaryPersonStructureHint
  );
}

function isSafety(value: unknown): value is LegacySafetyLevel {
  return value === "PROBABLE" || value === "UNCERTAIN";
}

function validateSource(
  value: unknown,
  index: number,
  errors: string[]
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
    !isArea(value.legalArea) ||
    typeof value.active !== "boolean"
  ) {
    errors.push(`sources[${index}] has invalid required fields`);
    return undefined;
  }
  const kind = value.kind;
  const canonicalSourceId = value.canonicalSourceId;
  const preferredName = value.preferredName;
  const hint = isHint(value.personStructureHint) ? value.personStructureHint : undefined;
  return {
    schemaVersion: 1,
    canonicalSourceId,
    kind,
    preferredName,
    legalArea: value.legalArea,
    ...(optionalString(value.commentedLaw) ? { commentedLaw: value.commentedLaw as string } : {}),
    applicableCitationTypes:
      kind === "COMMENTARY" ? ["COMMENTARY"] : ["JOURNAL_ARTICLE", "CASE_LAW", "CASE_NOTE"],
    active: value.active,
    ...(optionalString(value.examplePattern)
      ? { examplePattern: value.examplePattern as string }
      : {}),
    ...(optionalString(value.notes) ? { notes: value.notes as string } : {}),
    ...(hint ? { personStructureHint: hint } : {}),
    workOverride: {
      canonicalWorkId: canonicalSourceId,
      citationType: kind === "COMMENTARY" ? "COMMENTARY" : "JOURNAL_ARTICLE",
      preferredName,
    },
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
    value.matchMode !== "CASE_INSENSITIVE_TEXT" ||
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
    matchMode: "CASE_INSENSITIVE_TEXT",
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
  const sources = value.sources
    .map((source, index) => validateSource(source, index, errors))
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
      errors.push(`Alias conflict for "${alias}": ${Array.from(ids).sort().join(", ")}`);
  });

  return {
    success: errors.length === 0,
    data: { schemaVersion: 1, sources, aliases },
    errors,
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
