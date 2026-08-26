import type { ReviewClass, ReviewReason, ReviewStatus } from "./types";

export const REVIEW_CLASS_LABELS: Record<ReviewClass, string> = {
  AUTO: "Automatisch",
  MANUAL: "Prüfen",
  TECHNICAL: "Technisch",
  INFO: "Hinweis",
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  UNREVIEWED: "Offen",
  ACCEPTED: "Übernommen",
  REJECTED: "Abgelehnt",
  DEFERRED: "Später prüfen",
};

export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  DETERMINISTIC_TEXT_CHANGE: "Eindeutige Textänderung",
  DETERMINISTIC_FORMAT_CHANGE: "Eindeutige Formatänderung",
  SAFE_INSERTION: "Sichere Einfügung",
  SAFE_MAPPING_NORMALIZATION: "Sichere Quellenzuordnung",
  SEMANTIC_UNCERTAINTY: "Fachliche Prüfung erforderlich",
  UNKNOWN_ROLE: "Rolle nicht eindeutig",
  AMBIGUOUS_MAPPING: "Mehrdeutige Quellenzuordnung",
  LEGACY_MAPPING_UNCERTAIN: "Unsicheres Legacy-Mapping",
  CONSISTENCY_DECISION_REQUIRED: "Konsistenzentscheidung erforderlich",
  UNKNOWN_CITATION_TYPE: "Unbekannter Zitationstyp",
  PROTECTED_RANGE: "Geschützter Word-Bereich",
  SOURCE_CHANGED: "Fußnotentext wurde verändert",
  INVALID_RANGE: "Textbereich ist nicht mehr gültig",
  CONFLICTING_ACTION: "Konflikt mit einer anderen Änderung",
  MIXED_FORMATTING: "Uneinheitlicher Formatierungszustand",
  ACTION_NOT_BUILDABLE: "Änderungsaktion technisch nicht ableitbar",
  INFORMATION_ONLY: "Reiner Hinweis",
  NO_ACTION_AVAILABLE: "Keine konkrete Änderungsaktion verfügbar",
};
