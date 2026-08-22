import { ADDITIONAL_TYPE_RULES } from "./additional-types";
import { BOOK_RULES } from "./book";
import { CASE_LAW_RULES } from "./case-law";
import { COMMENTARY_RULES } from "./commentary";
import { DOCUMENT_RULES } from "./document";
import { emptyFootnoteRule } from "./empty-footnote";
import { finalPeriodRule } from "./final-period";
export { REGISTERED_FORMATTING_RULES } from "./formatting";
import { GENERIC_RULES } from "./generic";
import { JOURNAL_RULES } from "./journal";
import { citationPinpointBracketsRule } from "./pinpoint-brackets";
import { STATUTE_RULES } from "./statute";
import type { DocumentRule, FootnoteRule } from "./types";

export const LOCAL_RULES: readonly FootnoteRule[] = [
  emptyFootnoteRule,
  finalPeriodRule,
  citationPinpointBracketsRule,
  ...STATUTE_RULES,
  ...CASE_LAW_RULES,
  ...COMMENTARY_RULES,
  ...BOOK_RULES,
  ...JOURNAL_RULES,
  ...ADDITIONAL_TYPE_RULES,
  ...GENERIC_RULES,
].sort((left, right) => left.priority - right.priority || left.ruleId.localeCompare(right.ruleId));

export const REGISTERED_DOCUMENT_RULES: readonly DocumentRule[] = [...DOCUMENT_RULES].sort(
  (left, right) => left.priority - right.priority || left.ruleId.localeCompare(right.ruleId)
);
