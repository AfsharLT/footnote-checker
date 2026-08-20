import type {
  CitationSourceKind,
  CitationSourceMappingResolution,
} from "../citation-mapping/types";
import type { CitationSegment, CitationType } from "./types";

export interface EffectiveCitationClassification {
  parserType: CitationType;
  effectiveType: CitationType;
  source: "PARSER" | "SOURCE_MAPPING";
  canonicalSourceId?: string;
  mappingKind?: CitationSourceKind;
}

function mappedCitationType(kind: CitationSourceKind | undefined): CitationType | undefined {
  if (kind === "COMMENTARY") return "COMMENTARY";
  if (kind === "JOURNAL") return "JOURNAL_ARTICLE";
  if (kind === "BOOK") return "BOOK";
  return undefined;
}

export function deriveEffectiveCitationClassification(
  segment: CitationSegment,
  mapping?: CitationSourceMappingResolution
): EffectiveCitationClassification {
  const parserType = segment.classification.type;
  const parserResult: EffectiveCitationClassification = {
    parserType,
    effectiveType: parserType,
    source: "PARSER",
  };
  if (mapping?.status !== "MATCHED") return parserResult;

  const mappedType = mappedCitationType(mapping.kind);
  if (!mappedType) return parserResult;
  if (parserType === "CASE_LAW" && mapping.kind === "JOURNAL") return parserResult;

  const parserNeedsEnrichment =
    parserType === "OTHER" ||
    segment.classification.certainty === "low" ||
    segment.extraction?.status === "unresolved";
  if (!parserNeedsEnrichment || (parserType !== "OTHER" && parserType !== mappedType)) {
    return parserResult;
  }

  return {
    parserType,
    effectiveType: mappedType,
    source: "SOURCE_MAPPING",
    ...(mapping.canonicalSourceId ? { canonicalSourceId: mapping.canonicalSourceId } : {}),
    ...(mapping.kind ? { mappingKind: mapping.kind } : {}),
  };
}
