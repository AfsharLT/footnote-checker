import {
  createDefaultAbbreviationPreferences,
  createDefaultModifierPreferences,
} from "./abbreviations";
import {
  CURRENT_CITATION_SETTINGS_SCHEMA_VERSION,
  type CitationStyleProfile,
  type DeepReadonly,
} from "./types";

export function createDefaultCitationStyleProfile(): CitationStyleProfile {
  return {
    schemaVersion: CURRENT_CITATION_SETTINGS_SCHEMA_VERSION,
    id: "default-de-legal",
    name: "Standard – deutsche juristische Zitierweise",
    global: {
      citationSeparator: "; ",
      personSeparator: "/",
      trimAroundSeparators: true,
      finalPeriodRequired: true,
      preserveUnknownText: true,
      preferConservativeCorrections: true,
    },
    statute: {
      sectionSymbolStyle: "sectionSymbol",
      paragraphStyle: "abbreviation",
      sentenceStyle: "abbreviation",
      numberStyle: "abbreviation",
      letterStyle: "Buchst.",
      halfSentenceStyle: "Hs.",
      alternativeStyle: "numberBeforeAbbreviation",
      variantStyle: "numberBeforeAbbreviation",
      followingStyle: "f.",
      separatorBetweenMultipleSections: ", ",
      spaceBetweenUnitAndSection: true,
    },
    caseLaw: {
      decisionTypeOutput: {
        JUDGMENT: "Urt.",
        ORDER: "Beschl.",
        DECISION: "Entsch.",
      },
      dateIntroducer: "v.",
      dateFormat: "DD.MM.YYYY",
      directCitation: {
        includeCourt: true,
        includeDecisionType: true,
        includeDate: true,
        includeDocketNumber: true,
        separatorBeforeDocket: " – ",
      },
      journalCitation: {
        includeCourt: true,
        pinpointStyle: "parentheses",
      },
      officialCollectionCitation: {
        pinpointStyle: "parentheses",
      },
      databaseCitation: {
        includeCourtWhenAvailable: true,
      },
      hybridCitation: {
        parallelCitationSeparator: " = ",
      },
    },
    commentary: {
      personSeparator: "/",
      includeEditorsWhenPresent: true,
      includeEditionWhenPresent: false,
      includeYearWhenPresent: false,
      includeVolumeWhenPresent: true,
      usePreferredWorkName: true,
      bearbeiterFormatting: { italic: true },
      editorFormatting: { italic: false },
      marginNumberAbbreviation: "Rn.",
      inheritStatuteSettings: true,
    },
    book: {
      personSeparator: "/",
      authorFormatting: { italic: true },
      useShortTitleWhenAvailable: true,
      includeEditionWhenPresent: false,
      includeYearWhenPresent: false,
      includePlaceWhenPresent: false,
      includePublisherWhenPresent: false,
      includeVolumeWhenPresent: true,
      marginNumberAbbreviation: "Rn.",
      pageAbbreviation: "S.",
      workSectionStyle: "sectionSymbol",
    },
    journalArticle: {
      personSeparator: "/",
      authorFormatting: { italic: true },
      useJournalAbbreviation: true,
      includeYear: true,
      includeFirstPage: true,
      pinpointStyle: "parentheses",
      preserveFollowingSuffix: true,
    },
    bookChapter: {
      personSeparator: "/",
      authorFormatting: { italic: true },
      editorFormatting: { italic: false },
      inToken: "in:",
      includeEditorsWhenPresent: true,
      includeEditionWhenPresent: false,
      includeYearWhenPresent: true,
      pageAbbreviation: "S.",
      pinpointStyle: "pagePrefix",
    },
    caseNote: {
      personSeparator: "/",
      authorFormatting: { italic: true },
      preferredNoteMarker: "Anm.",
      journalPinpointStyle: "parentheses",
    },
    legislativeMaterial: {
      BundestagDocumentPrefix: "BT-Drs.",
      BundesratDocumentPrefix: "BR-Drs.",
      pageAbbreviation: "S.",
      includePagePrefix: true,
    },
    onlineSource: {
      includeOrganizationWhenPresent: true,
      includeTitleWhenPresent: true,
      includeUrl: true,
      includeAccessDateWhenPresent: true,
      accessDateLabel: "letzter Aufruf am",
      dateFormat: "DD.MM.YYYY",
    },
    administrativeMaterial: {
      includeAuthority: true,
      includeDocumentType: true,
      includeDate: true,
      includeFileNumber: true,
      dateIntroducer: "v.",
      dateFormat: "DD.MM.YYYY",
    },
    abbreviations: createDefaultAbbreviationPreferences(),
    modifiers: createDefaultModifierPreferences(),
    formatting: {
      author: { italic: true },
      bearbeiter: { italic: true },
      editor: { italic: false },
      workTitle: { italic: false },
    },
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export const DEFAULT_CITATION_STYLE_PROFILE: DeepReadonly<CitationStyleProfile> = deepFreeze(
  createDefaultCitationStyleProfile()
);
