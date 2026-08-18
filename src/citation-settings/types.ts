export const CURRENT_CITATION_SETTINGS_SCHEMA_VERSION = 1 as const;

export interface CharacterStylePreference {
  italic?: boolean;
  bold?: boolean;
  underline?: boolean;
}

export interface CitationFormattingPreferences {
  author: CharacterStylePreference;
  bearbeiter: CharacterStylePreference;
  editor: CharacterStylePreference;
  workTitle: CharacterStylePreference;
}

export interface GlobalCitationSettings {
  citationSeparator: string;
  personSeparator: string;
  trimAroundSeparators: boolean;
  finalPeriodRequired: boolean;
  preserveUnknownText: boolean;
  preferConservativeCorrections: boolean;
}

export type CitationAbbreviationConcept =
  | "JUDGMENT"
  | "ORDER"
  | "DECISION"
  | "DATE_INTRODUCER"
  | "MARGIN_NUMBER"
  | "PAGE"
  | "PARAGRAPH"
  | "SENTENCE"
  | "NUMBER"
  | "LETTER"
  | "HALF_SENTENCE"
  | "ALTERNATIVE"
  | "VARIANT"
  | "FOLLOWING"
  | "FOLLOWING_MULTIPLE"
  | "EDITION";

export interface AbbreviationPreference {
  concept: CitationAbbreviationConcept;
  recognizedVariants: string[];
  preferredOutput: string;
}

export type CitationAbbreviationPreferences = Record<
  CitationAbbreviationConcept,
  AbbreviationPreference
>;

export type CitationModifierConcept =
  "COMPARE" | "SEE" | "DIFFERENT_VIEW" | "FURTHER_REFERENCES" | "AGREEING" | "CRITICAL";

export interface CitationModifierPreference {
  normalizedConcept: CitationModifierConcept;
  recognizedVariants: string[];
  preferredOutput: string;
}

export type CitationModifierPreferences = Record<
  CitationModifierConcept,
  CitationModifierPreference
>;

export interface StatuteCitationSettings {
  sectionSymbolStyle: "sectionSymbol" | "article";
  paragraphStyle: "abbreviation" | "roman";
  sentenceStyle: "abbreviation" | "bareNumberAfterRomanParagraph";
  numberStyle: "abbreviation";
  letterStyle: "Buchst." | "lit.";
  halfSentenceStyle: "Hs.";
  alternativeStyle: "numberBeforeAbbreviation" | "abbreviationBeforeNumber";
  variantStyle: "numberBeforeAbbreviation" | "abbreviationBeforeNumber";
  followingStyle: "f." | "ff.";
  separatorBetweenMultipleSections: string;
  spaceBetweenUnitAndSection: boolean;
}

export type CitationDateFormat = "DD.MM.YYYY" | "D.M.YYYY" | "DD.MM.YY" | "D.M.YY";
export type ShortCitationDateFormat = "DD.MM.YYYY" | "D.M.YYYY";
export type PinpointStyle = "parentheses" | "comma";

export interface CaseLawCitationSettings {
  decisionTypeOutput: {
    JUDGMENT: string;
    ORDER: string;
    DECISION: string;
  };
  dateIntroducer: string;
  dateFormat: CitationDateFormat;
  directCitation: {
    includeCourt: boolean;
    includeDecisionType: boolean;
    includeDate: boolean;
    includeDocketNumber: boolean;
    separatorBeforeDocket: string;
  };
  journalCitation: {
    includeCourt: boolean;
    pinpointStyle: PinpointStyle;
  };
  officialCollectionCitation: {
    pinpointStyle: PinpointStyle;
  };
  databaseCitation: {
    includeCourtWhenAvailable: boolean;
  };
  hybridCitation: {
    parallelCitationSeparator: string;
  };
}

export interface CommentaryCitationSettings {
  personSeparator: string;
  includeEditorsWhenPresent: boolean;
  includeEditionWhenPresent: boolean;
  includeYearWhenPresent: boolean;
  includeVolumeWhenPresent: boolean;
  usePreferredWorkName: boolean;
  bearbeiterFormatting: CharacterStylePreference;
  editorFormatting: CharacterStylePreference;
  marginNumberAbbreviation: string;
  inheritStatuteSettings: boolean;
}

export interface BookCitationSettings {
  personSeparator: string;
  authorFormatting: CharacterStylePreference;
  useShortTitleWhenAvailable: boolean;
  includeEditionWhenPresent: boolean;
  includeYearWhenPresent: boolean;
  includePlaceWhenPresent: boolean;
  includePublisherWhenPresent: boolean;
  includeVolumeWhenPresent: boolean;
  marginNumberAbbreviation: string;
  pageAbbreviation: string;
  workSectionStyle: "sectionSymbol";
}

export interface JournalArticleCitationSettings {
  personSeparator: string;
  authorFormatting: CharacterStylePreference;
  useJournalAbbreviation: boolean;
  includeYear: boolean;
  includeFirstPage: boolean;
  pinpointStyle: PinpointStyle;
  preserveFollowingSuffix: boolean;
}

export interface BookChapterCitationSettings {
  personSeparator: string;
  authorFormatting: CharacterStylePreference;
  editorFormatting: CharacterStylePreference;
  inToken: string;
  includeEditorsWhenPresent: boolean;
  includeEditionWhenPresent: boolean;
  includeYearWhenPresent: boolean;
  pageAbbreviation: string;
  pinpointStyle: PinpointStyle | "pagePrefix";
}

export interface CaseNoteCitationSettings {
  personSeparator: string;
  authorFormatting: CharacterStylePreference;
  preferredNoteMarker: string;
  journalPinpointStyle: PinpointStyle;
}

export interface LegislativeMaterialCitationSettings {
  BundestagDocumentPrefix: string;
  BundesratDocumentPrefix: string;
  pageAbbreviation: string;
  includePagePrefix: boolean;
}

export interface OnlineSourceCitationSettings {
  includeOrganizationWhenPresent: boolean;
  includeTitleWhenPresent: boolean;
  includeUrl: boolean;
  includeAccessDateWhenPresent: boolean;
  accessDateLabel: string;
  dateFormat: ShortCitationDateFormat;
}

export interface AdministrativeMaterialCitationSettings {
  includeAuthority: boolean;
  includeDocumentType: boolean;
  includeDate: boolean;
  includeFileNumber: boolean;
  dateIntroducer: string;
  dateFormat: ShortCitationDateFormat;
}

export interface CitationStyleProfile {
  schemaVersion: number;
  id: string;
  name: string;
  global: GlobalCitationSettings;
  statute: StatuteCitationSettings;
  caseLaw: CaseLawCitationSettings;
  commentary: CommentaryCitationSettings;
  book: BookCitationSettings;
  journalArticle: JournalArticleCitationSettings;
  bookChapter: BookChapterCitationSettings;
  caseNote: CaseNoteCitationSettings;
  legislativeMaterial: LegislativeMaterialCitationSettings;
  onlineSource: OnlineSourceCitationSettings;
  administrativeMaterial: AdministrativeMaterialCitationSettings;
  abbreviations: CitationAbbreviationPreferences;
  modifiers: CitationModifierPreferences;
  formatting: CitationFormattingPreferences;
}

export type SettingsCitationType =
  | "STATUTE"
  | "CASE_LAW"
  | "COMMENTARY"
  | "BOOK"
  | "JOURNAL_ARTICLE"
  | "BOOK_CHAPTER"
  | "CASE_NOTE"
  | "LEGISLATIVE_MATERIAL"
  | "ONLINE_SOURCE"
  | "ADMINISTRATIVE_MATERIAL"
  | "OTHER";

export interface CitationSettingsByType {
  STATUTE: StatuteCitationSettings;
  CASE_LAW: CaseLawCitationSettings;
  COMMENTARY: CommentaryCitationSettings;
  BOOK: BookCitationSettings;
  JOURNAL_ARTICLE: JournalArticleCitationSettings;
  BOOK_CHAPTER: BookChapterCitationSettings;
  CASE_NOTE: CaseNoteCitationSettings;
  LEGISLATIVE_MATERIAL: LegislativeMaterialCitationSettings;
  ONLINE_SOURCE: OnlineSourceCitationSettings;
  ADMINISTRATIVE_MATERIAL: AdministrativeMaterialCitationSettings;
  OTHER: Record<string, never>;
}

export type WorkOverrideCitationType =
  "COMMENTARY" | "BOOK" | "JOURNAL_ARTICLE" | "BOOK_CHAPTER" | "OTHER";

export type DeepPartial<T> = {
  [Property in keyof T]?: T[Property] extends object ? DeepPartial<T[Property]> : T[Property];
};

export type DeepReadonly<T> = {
  readonly [Property in keyof T]: T[Property] extends object
    ? DeepReadonly<T[Property]>
    : T[Property];
};

type WorkSettings<TType extends WorkOverrideCitationType> =
  TType extends keyof CitationSettingsByType
    ? DeepPartial<CitationSettingsByType[TType]>
    : Record<string, never>;

export interface WorkCitationOverride<
  TType extends WorkOverrideCitationType = WorkOverrideCitationType,
> {
  canonicalWorkId: string;
  citationType: TType;
  preferredName?: string;
  formatting?: DeepPartial<CitationFormattingPreferences>;
  citationSettingsOverride?: WorkSettings<TType>;
}

export interface ResolvedCitationSettings<TType extends SettingsCitationType> {
  citationType: TType;
  global: GlobalCitationSettings;
  settings: CitationSettingsByType[TType];
  formatting: CitationFormattingPreferences;
  abbreviations: CitationAbbreviationPreferences;
  modifiers: CitationModifierPreferences;
  preferredWorkName?: string;
}

export interface CitationStyleProfileValidationResult {
  success: boolean;
  profile: CitationStyleProfile;
  errors: string[];
}

export interface CitationStyleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CitationStyleStorageResult {
  success: boolean;
  usedMemoryFallback: boolean;
  error?: string;
}
