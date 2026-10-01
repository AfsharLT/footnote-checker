import { encodeSemicolonCsvRow, parseSemicolonCsv } from "./csv";
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
import type { WorkCitationOverride } from "../citation-settings/types";

const NORMALIZED_HEADERS = [
  "schemaVersion",
  "canonicalSourceId",
  "kind",
  "legalArea",
  "commentedLaw",
  "preferredName",
  "alias",
  "matchMode",
  "wholeWord",
  "active",
  "sourceActive",
  "legacySafetyLevel",
  "personStructureHint",
  "examplePattern",
  "notes",
  "aliasNotes",
  "legacyMappingId",
  "legacyCommentCode",
  "legacyAutoCorrectionAllowed",
  "legacyAnalysisAction",
  "legacyReviewAction",
  "legacyCorrectionAction",
  "legacyVersion",
  "legacyDate",
  "overridePreferredName",
  "overrideBearbeiterItalic",
  "overrideEditorItalic",
  "overridePersonSeparator",
  "overrideMarginNumberAbbreviation",
  "overridePinpointStyle",
  "preferredCitationText",
] as const;

const REQUIRED_NORMALIZED_HEADERS = NORMALIZED_HEADERS.filter(
  (name) => !name.startsWith("override") && name !== "preferredCitationText"
);

function csvValue(value: string | boolean | undefined): string {
  return value === undefined ? "" : String(value);
}

function overrideColumns(source: CitationSourceMaster): string[] {
  if (source.kind === "COMMENTARY") {
    const override = source.workOverride as WorkCitationOverride<"COMMENTARY"> | undefined;
    return [
      csvValue(override?.preferredName),
      csvValue(override?.formatting?.bearbeiter?.italic),
      csvValue(override?.formatting?.editor?.italic),
      csvValue(override?.citationSettingsOverride?.personSeparator),
      csvValue(override?.citationSettingsOverride?.marginNumberAbbreviation),
      "",
    ];
  }
  const override = source.workOverride as WorkCitationOverride<"JOURNAL_ARTICLE"> | undefined;
  return [
    csvValue(override?.preferredName),
    "",
    "",
    "",
    "",
    csvValue(override?.citationSettingsOverride?.pinpointStyle),
  ];
}

export function exportCitationSourceMappingCsv(data: CitationSourceMappingData): string {
  const sources = new Map(data.sources.map((source) => [source.canonicalSourceId, source]));
  const aliases = [...data.aliases].sort(
    (left, right) =>
      left.canonicalSourceId.localeCompare(right.canonicalSourceId) ||
      normalizeCitationSourceText(left.alias).localeCompare(
        normalizeCitationSourceText(right.alias)
      ) ||
      left.alias.localeCompare(right.alias)
  );
  const rows = aliases.flatMap((alias) => {
    const source = sources.get(alias.canonicalSourceId);
    if (!source) return [];
    return [
      encodeSemicolonCsvRow([
        "1",
        source.canonicalSourceId,
        source.kind,
        source.legalArea,
        csvValue(source.commentedLaw),
        source.preferredName,
        alias.alias,
        alias.matchMode,
        csvValue(alias.wholeWord),
        csvValue(alias.active),
        csvValue(source.active),
        csvValue(alias.legacySafetyLevel),
        csvValue(source.personStructureHint),
        csvValue(source.examplePattern),
        csvValue(source.notes),
        csvValue(alias.notes),
        csvValue(alias.legacyMappingId),
        csvValue(alias.legacyCommentCode),
        csvValue(alias.legacyAutoCorrectionAllowed),
        csvValue(alias.legacyActions?.analysis),
        csvValue(alias.legacyActions?.review),
        csvValue(alias.legacyActions?.correction),
        csvValue(alias.legacyVersion),
        csvValue(alias.legacyDate),
        ...overrideColumns(source),
        csvValue(source.preferredCitationText),
      ]),
    ];
  });
  return [encodeSemicolonCsvRow(NORMALIZED_HEADERS), ...rows].join("\n");
}

function parseBoolean(value: string, path: string, errors: string[]): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  errors.push(`${path} must be true or false`);
  return undefined;
}

function optionalBoolean(value: string, path: string, errors: string[]): boolean | undefined {
  return value === "" ? undefined : parseBoolean(value, path, errors);
}

function enumValue<T extends string>(
  value: string,
  allowed: readonly T[],
  path: string,
  errors: string[]
): T | undefined {
  if (allowed.includes(value as T)) return value as T;
  errors.push(`${path} has an unsupported value`);
  return undefined;
}

function optional(value: string): string | undefined {
  return value === "" ? undefined : value;
}

export function parseCitationSourceMappingCsv(
  csvText: string
): CitationSourceMappingValidationResult {
  const parsed = parseSemicolonCsv(csvText);
  const errors = [...parsed.errors];
  const warnings: string[] = [];
  if (parsed.rows.length === 0) {
    return {
      success: false,
      data: { schemaVersion: 1, sources: [], aliases: [] },
      errors: [...errors, "Normalized mapping CSV is empty"],
    };
  }
  const header = parsed.rows[0];
  const positions = new Map(header.map((name, index) => [name, index]));
  REQUIRED_NORMALIZED_HEADERS.forEach((name) => {
    if (!positions.has(name)) errors.push(`Missing normalized CSV column: ${name}`);
  });
  const valueAt = (row: readonly string[], name: (typeof NORMALIZED_HEADERS)[number]): string => {
    const index = positions.get(name);
    return index === undefined ? "" : (row[index] ?? "");
  };

  const sourcesById = new Map<string, CitationSourceMaster>();
  const aliases: CitationSourceAlias[] = [];
  parsed.rows.slice(1).forEach((row, rowIndex) => {
    if (row.every((value) => value.trim() === "")) return;
    const path = `row ${rowIndex + 2}`;
    if (valueAt(row, "schemaVersion") !== "1") {
      errors.push(`${path} has an unsupported schemaVersion`);
      return;
    }
    const canonicalSourceId = valueAt(row, "canonicalSourceId");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(canonicalSourceId)) {
      errors.push(`${path} has an invalid canonicalSourceId`);
      return;
    }
    const kind = enumValue<CitationSourceKind>(
      valueAt(row, "kind"),
      ["COMMENTARY", "JOURNAL", "BOOK", "REPORT", "CUSTOM"],
      `${path}.kind`,
      errors
    );
    const areaValue = valueAt(row, "legalArea");
    const area = (
      {
        BGB: "ZIVILRECHT",
        STGB: "STRAFRECHT",
        STPO: "PROZESSRECHT",
        ZPO: "PROZESSRECHT",
        GG: "OEFFENTLICHES_RECHT",
        GENERAL: "SONSTIGE",
        UNKNOWN: "SONSTIGE",
        ZIVILRECHT: "ZIVILRECHT",
        STRAFRECHT: "STRAFRECHT",
        PROZESSRECHT: "PROZESSRECHT",
        OEFFENTLICHES_RECHT: "OEFFENTLICHES_RECHT",
        EUROPARECHT: "EUROPARECHT",
        SONSTIGE: "SONSTIGE",
      } as const
    )[
      areaValue as
        CitationSourceLegalArea | "BGB" | "STGB" | "STPO" | "ZPO" | "GG" | "GENERAL" | "UNKNOWN"
    ];
    if (!area) errors.push(`${path}.legalArea has an unsupported value`);
    const preferredName = valueAt(row, "preferredName");
    const aliasText = valueAt(row, "alias");
    const matchMode = enumValue(
      valueAt(row, "matchMode"),
      ["CASE_INSENSITIVE_TEXT", "WHOLE_WORD_MARKER"] as const,
      `${path}.matchMode`,
      errors
    );
    if (!kind || !area || !preferredName || !aliasText || !matchMode) {
      errors.push(`${path} is missing required source or alias values`);
      return;
    }
    const sourceActive = parseBoolean(valueAt(row, "sourceActive"), `${path}.sourceActive`, errors);
    const aliasActive = parseBoolean(valueAt(row, "active"), `${path}.active`, errors);
    const wholeWord = parseBoolean(valueAt(row, "wholeWord"), `${path}.wholeWord`, errors);
    const hint = optional(valueAt(row, "personStructureHint"));
    const personHint = hint
      ? enumValue<CommentaryPersonStructureHint>(
          hint,
          [
            "WORK_THEN_BEARBEITER",
            "BEARBEITER_THEN_WORK",
            "WORK_WITHOUT_BEARBEITER",
            "EDITOR_STRUCTURE",
            "AMBIGUOUS",
            "UNKNOWN",
          ],
          `${path}.personStructureHint`,
          errors
        )
      : undefined;
    const safety = optional(valueAt(row, "legacySafetyLevel"));
    const legacySafetyLevel = safety
      ? enumValue<LegacySafetyLevel>(
          safety,
          ["PROBABLE", "UNCERTAIN"],
          `${path}.legacySafetyLevel`,
          errors
        )
      : undefined;
    const legacyAutoCorrectionAllowed = optionalBoolean(
      valueAt(row, "legacyAutoCorrectionAllowed"),
      `${path}.legacyAutoCorrectionAllowed`,
      errors
    );
    const overrideBearbeiterItalic = optionalBoolean(
      valueAt(row, "overrideBearbeiterItalic"),
      `${path}.overrideBearbeiterItalic`,
      errors
    );
    const overrideEditorItalic = optionalBoolean(
      valueAt(row, "overrideEditorItalic"),
      `${path}.overrideEditorItalic`,
      errors
    );
    const overridePinpointStyle = valueAt(row, "overridePinpointStyle");
    if (
      overridePinpointStyle &&
      overridePinpointStyle !== "parentheses" &&
      overridePinpointStyle !== "comma"
    ) {
      errors.push(`${path}.overridePinpointStyle has an unsupported value`);
    }
    if (sourceActive === undefined || aliasActive === undefined || wholeWord === undefined) return;
    if (matchMode === "WHOLE_WORD_MARKER" && !["BOOK", "REPORT", "CUSTOM"].includes(kind)) {
      errors.push(`${path}.matchMode WHOLE_WORD_MARKER is incompatible with ${kind}`);
      return;
    }
    if (matchMode === "WHOLE_WORD_MARKER" && !wholeWord) {
      errors.push(`${path}.wholeWord must be true for WHOLE_WORD_MARKER`);
      return;
    }

    const existing = sourcesById.get(canonicalSourceId);
    if (
      existing &&
      (existing.kind !== kind ||
        existing.legalArea !== area ||
        existing.preferredName !== preferredName ||
        existing.preferredCitationText !== optional(valueAt(row, "preferredCitationText")))
    ) {
      errors.push(`${path} conflicts with another row for ${canonicalSourceId}`);
      return;
    }
    if (!existing) {
      sourcesById.set(canonicalSourceId, {
        schemaVersion: 1,
        canonicalSourceId,
        sourceOrigin: "IMPORTED",
        kind,
        preferredName,
        ...(optional(valueAt(row, "preferredCitationText"))
          ? { preferredCitationText: valueAt(row, "preferredCitationText") }
          : {}),
        legalArea: area,
        ...(optional(valueAt(row, "commentedLaw"))
          ? { commentedLaw: valueAt(row, "commentedLaw") }
          : {}),
        applicableCitationTypes:
          kind === "COMMENTARY"
            ? ["COMMENTARY"]
            : kind === "JOURNAL"
              ? ["JOURNAL_ARTICLE", "CASE_LAW", "CASE_NOTE", "FORTHCOMING"]
              : kind === "BOOK"
                ? [
                    "BOOK",
                    "BOOK_CHAPTER",
                    "FESTSCHRIFT_CONTRIBUTION",
                    "YEARBOOK_CONTRIBUTION",
                    "OTHER",
                  ]
                : kind === "REPORT"
                  ? ["CASE_LAW", "LEGISLATIVE_MATERIAL", "OTHER"]
                  : ["MANUSCRIPT", "FORTHCOMING", "OTHER"],
        active: sourceActive,
        ...(optional(valueAt(row, "examplePattern"))
          ? { examplePattern: valueAt(row, "examplePattern") }
          : {}),
        ...(optional(valueAt(row, "notes")) ? { notes: valueAt(row, "notes") } : {}),
        ...(personHint ? { personStructureHint: personHint } : {}),
        ...((kind === "COMMENTARY" &&
          (optional(valueAt(row, "overridePreferredName")) ||
            overrideBearbeiterItalic !== undefined ||
            overrideEditorItalic !== undefined ||
            optional(valueAt(row, "overridePersonSeparator")) ||
            optional(valueAt(row, "overrideMarginNumberAbbreviation")))) ||
        (kind === "JOURNAL" &&
          (optional(valueAt(row, "overridePreferredName")) || overridePinpointStyle))
          ? {
              workOverride:
                kind === "COMMENTARY"
                  ? {
                      canonicalWorkId: canonicalSourceId,
                      citationType: "COMMENTARY",
                      ...(optional(valueAt(row, "overridePreferredName"))
                        ? { preferredName: valueAt(row, "overridePreferredName") }
                        : {}),
                      ...(overrideBearbeiterItalic !== undefined ||
                      overrideEditorItalic !== undefined
                        ? {
                            formatting: {
                              ...(overrideBearbeiterItalic !== undefined
                                ? { bearbeiter: { italic: overrideBearbeiterItalic } }
                                : {}),
                              ...(overrideEditorItalic !== undefined
                                ? { editor: { italic: overrideEditorItalic } }
                                : {}),
                            },
                          }
                        : {}),
                      ...(optional(valueAt(row, "overridePersonSeparator")) ||
                      optional(valueAt(row, "overrideMarginNumberAbbreviation"))
                        ? {
                            citationSettingsOverride: {
                              ...(optional(valueAt(row, "overridePersonSeparator"))
                                ? { personSeparator: valueAt(row, "overridePersonSeparator") }
                                : {}),
                              ...(optional(valueAt(row, "overrideMarginNumberAbbreviation"))
                                ? {
                                    marginNumberAbbreviation: valueAt(
                                      row,
                                      "overrideMarginNumberAbbreviation"
                                    ),
                                  }
                                : {}),
                            },
                          }
                        : {}),
                    }
                  : {
                      canonicalWorkId: canonicalSourceId,
                      citationType: "JOURNAL_ARTICLE",
                      ...(optional(valueAt(row, "overridePreferredName"))
                        ? { preferredName: valueAt(row, "overridePreferredName") }
                        : {}),
                      ...(overridePinpointStyle === "parentheses" ||
                      overridePinpointStyle === "comma"
                        ? {
                            citationSettingsOverride: {
                              pinpointStyle: overridePinpointStyle,
                            },
                          }
                        : {}),
                    },
            }
          : {}),
      });
    }

    aliases.push({
      ...(optional(valueAt(row, "legacyMappingId"))
        ? { legacyMappingId: valueAt(row, "legacyMappingId") }
        : {}),
      canonicalSourceId,
      alias: aliasText,
      matchMode,
      wholeWord,
      active: aliasActive,
      ...(legacySafetyLevel ? { legacySafetyLevel } : {}),
      ...(legacyAutoCorrectionAllowed !== undefined ? { legacyAutoCorrectionAllowed } : {}),
      ...(optional(valueAt(row, "legacyCommentCode"))
        ? { legacyCommentCode: valueAt(row, "legacyCommentCode") }
        : {}),
      legacyActions: {
        ...(optional(valueAt(row, "legacyAnalysisAction"))
          ? { analysis: valueAt(row, "legacyAnalysisAction") }
          : {}),
        ...(optional(valueAt(row, "legacyReviewAction"))
          ? { review: valueAt(row, "legacyReviewAction") }
          : {}),
        ...(optional(valueAt(row, "legacyCorrectionAction"))
          ? { correction: valueAt(row, "legacyCorrectionAction") }
          : {}),
      },
      ...(optional(valueAt(row, "aliasNotes")) ? { notes: valueAt(row, "aliasNotes") } : {}),
      ...(optional(valueAt(row, "legacyVersion"))
        ? { legacyVersion: valueAt(row, "legacyVersion") }
        : {}),
      ...(optional(valueAt(row, "legacyDate")) ? { legacyDate: valueAt(row, "legacyDate") } : {}),
    });
  });

  const conflicts = new Map<string, Set<string>>();
  aliases
    .filter((alias) => alias.active)
    .forEach((alias) => {
      const normalized = normalizeCitationSourceText(alias.alias);
      const ids = conflicts.get(normalized) ?? new Set<string>();
      ids.add(alias.canonicalSourceId);
      conflicts.set(normalized, ids);
    });
  conflicts.forEach((ids, alias) => {
    if (ids.size > 1)
      warnings.push(`Alias conflict for "${alias}": ${Array.from(ids).sort().join(", ")}`);
  });

  const sources = Array.from(sourcesById.values()).sort((left, right) =>
    left.canonicalSourceId.localeCompare(right.canonicalSourceId)
  );
  sources.forEach((source) => {
    const sourceAliases = aliases.filter(
      (alias) => alias.canonicalSourceId === source.canonicalSourceId
    );
    const versions = Array.from(
      new Set(
        sourceAliases
          .map((alias) => alias.legacyVersion)
          .filter((value): value is string => Boolean(value))
      )
    );
    const dates = Array.from(
      new Set(
        sourceAliases
          .map((alias) => alias.legacyDate)
          .filter((value): value is string => Boolean(value))
      )
    );
    if (versions.length > 0 || dates.length > 0) {
      source.legacyMetadata = { legacyVersions: versions, legacyDates: dates };
    }
  });

  return {
    success: errors.length === 0,
    data: { schemaVersion: 1, sources, aliases },
    errors,
    warnings,
  };
}
