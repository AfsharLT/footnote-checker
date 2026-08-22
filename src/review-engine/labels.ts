import type { ReviewClass, ReviewReason, ReviewStatus } from "./types";

export const REVIEW_CLASS_LABELS: Record<ReviewClass, string> = {
  AUTO: "Automatisch",
  MANUAL: "Prüfen",
  TECHNICAL: "Technisch",
  INFO: "Hinweis",
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  UNREVIEWED: "Offen",
  ACCEPTED: "Übernehmen",
  REJECTED: "Ablehnen",
  DEFERRED: "Später prüfen",
};

export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  DETERMINISTIC_TEXT_CHANGE: "Eindeutige Textänderung",
  DETERMINISTIC_FORMAT_CHANGE: "Eindeutige Formatänderung",
  SAFE_INSERTION: "Sichere Einfügung",
  SAFE_MAPPING_NORMALIZATION: "Sichere Mapping-Normalisierung",
  SEMANTIC_UNCERTAINTY: "Fachliche Entscheidung erforderlich",
  UNKNOWN_ROLE: "Rolle nicht sicher bestimmt",
  AMBIGUOUS_MAPPING: "Mehrdeutige Quellenzuordnung",
  LEGACY_MAPPING_UNCERTAIN: "Unsicheres Legacy-Mapping",
  CONSISTENCY_DECISION_REQUIRED: "Konsistenzentscheidung erforderlich",
  UNKNOWN_CITATION_TYPE: "Unbekannter Zitationstyp",
  PROTECTED_RANGE: "Geschützter Dokumentbereich",
  SOURCE_CHANGED: "Quelltext wurde verändert",
  INVALID_RANGE: "Textbereich ist nicht mehr gültig",
  CONFLICTING_ACTION: "Widersprüchliche Änderung",
  MIXED_FORMATTING: "Uneinheitlicher Formatierungszustand",
  ACTION_NOT_BUILDABLE: "Änderungsaktion technisch nicht ableitbar",
  INFORMATION_ONLY: "Reiner Hinweis",
  NO_ACTION_AVAILABLE: "Keine konkrete Änderungsaktion verfügbar",
};
