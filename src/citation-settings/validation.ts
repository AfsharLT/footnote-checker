import { createDefaultCitationStyleProfile } from "./defaults";
import {
  CURRENT_CITATION_SETTINGS_SCHEMA_VERSION,
  type CharacterStylePreference,
  type CitationAbbreviationConcept,
  type CitationModifierConcept,
  type CitationStyleProfile,
  type CitationStyleProfileValidationResult,
} from "./types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function objectValue(value: unknown, errors: string[], path: string): UnknownRecord {
  if (isRecord(value)) return value;
  if (value !== undefined) errors.push(`${path} must be an object`);
  return {};
}

function stringValue(value: unknown, fallback: string, errors: string[], path: string): string {
  if (typeof value === "string") return value;
  if (value !== undefined) errors.push(`${path} must be a string`);
  return fallback;
}

function booleanValue(value: unknown, fallback: boolean, errors: string[], path: string): boolean {
  if (typeof value === "boolean") return value;
  if (value !== undefined) errors.push(`${path} must be a boolean`);
  return fallback;
}

function optionalBooleanValue(
  value: unknown,
  fallback: boolean | undefined,
  errors: string[],
  path: string
): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value !== undefined) errors.push(`${path} must be a boolean`);
  return fallback;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  errors: string[],
  path: string
): T {
  if (typeof value === "string" && allowed.includes(value as T)) return value as T;
  if (value !== undefined) errors.push(`${path} has an unsupported value`);
  return fallback;
}

function stringArrayValue(
  value: unknown,
  fallback: readonly string[],
  errors: string[],
  path: string
): string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return [...value];
  }
  if (value !== undefined) errors.push(`${path} must be a string array`);
  return [...fallback];
}

function styleValue(
  value: unknown,
  fallback: CharacterStylePreference,
  errors: string[],
  path: string
): CharacterStylePreference {
  const source = objectValue(value, errors, path);
  const italic = optionalBooleanValue(source.italic, fallback.italic, errors, `${path}.italic`);
  const bold = optionalBooleanValue(source.bold, fallback.bold, errors, `${path}.bold`);
  const underline = optionalBooleanValue(
    source.underline,
    fallback.underline,
    errors,
    `${path}.underline`
  );
  return {
    ...(italic !== undefined ? { italic } : {}),
    ...(bold !== undefined ? { bold } : {}),
    ...(underline !== undefined ? { underline } : {}),
  };
}

export function sanitizeCitationStyleProfile(value: unknown): CitationStyleProfileValidationResult {
  const fallback = createDefaultCitationStyleProfile();
  const errors: string[] = [];

  if (!isRecord(value)) {
    return {
      success: false,
      profile: fallback,
      errors: ["Profile must be an object"],
    };
  }

  if (value.schemaVersion !== CURRENT_CITATION_SETTINGS_SCHEMA_VERSION) {
    return {
      success: false,
      profile: fallback,
      errors: [`Unsupported schemaVersion; expected ${CURRENT_CITATION_SETTINGS_SCHEMA_VERSION}`],
    };
  }

  const global = objectValue(value.global, errors, "global");
  const formatting = objectValue(value.formatting, errors, "formatting");
  const statute = objectValue(value.statute, errors, "statute");
  const caseLaw = objectValue(value.caseLaw, errors, "caseLaw");
  const decisionTypeOutput = objectValue(
    caseLaw.decisionTypeOutput,
    errors,
    "caseLaw.decisionTypeOutput"
  );
  const directCitation = objectValue(caseLaw.directCitation, errors, "caseLaw.directCitation");
  const journalCitation = objectValue(caseLaw.journalCitation, errors, "caseLaw.journalCitation");
  const officialCollectionCitation = objectValue(
    caseLaw.officialCollectionCitation,
    errors,
    "caseLaw.officialCollectionCitation"
  );
  const databaseCitation = objectValue(
    caseLaw.databaseCitation,
    errors,
    "caseLaw.databaseCitation"
  );
  const hybridCitation = objectValue(caseLaw.hybridCitation, errors, "caseLaw.hybridCitation");
  const commentary = objectValue(value.commentary, errors, "commentary");
  const book = objectValue(value.book, errors, "book");
  const journalArticle = objectValue(value.journalArticle, errors, "journalArticle");
  const bookChapter = objectValue(value.bookChapter, errors, "bookChapter");
  const caseNote = objectValue(value.caseNote, errors, "caseNote");
  const legislativeMaterial = objectValue(value.legislativeMaterial, errors, "legislativeMaterial");
  const onlineSource = objectValue(value.onlineSource, errors, "onlineSource");
  const administrativeMaterial = objectValue(
    value.administrativeMaterial,
    errors,
    "administrativeMaterial"
  );

  const profile: CitationStyleProfile = {
    schemaVersion: CURRENT_CITATION_SETTINGS_SCHEMA_VERSION,
    id: stringValue(value.id, fallback.id, errors, "id"),
    name: stringValue(value.name, fallback.name, errors, "name"),
    global: {
      citationSeparator: stringValue(
        global.citationSeparator,
        fallback.global.citationSeparator,
        errors,
        "global.citationSeparator"
      ),
      personSeparator: stringValue(
        global.personSeparator,
        fallback.global.personSeparator,
        errors,
        "global.personSeparator"
      ),
      autoCloseInactiveFootnotes: booleanValue(
        global.autoCloseInactiveFootnotes,
        fallback.global.autoCloseInactiveFootnotes,
        errors,
        "global.autoCloseInactiveFootnotes"
      ),
      trimAroundSeparators: booleanValue(
        global.trimAroundSeparators,
        fallback.global.trimAroundSeparators,
        errors,
        "global.trimAroundSeparators"
      ),
      finalPeriodRequired: booleanValue(
        global.finalPeriodRequired,
        fallback.global.finalPeriodRequired,
        errors,
        "global.finalPeriodRequired"
      ),
      preserveUnknownText: booleanValue(
        global.preserveUnknownText,
        fallback.global.preserveUnknownText,
        errors,
        "global.preserveUnknownText"
      ),
      preferConservativeCorrections: booleanValue(
        global.preferConservativeCorrections,
        fallback.global.preferConservativeCorrections,
        errors,
        "global.preferConservativeCorrections"
      ),
    },
    formatting: {
      author: styleValue(
        formatting.author,
        fallback.formatting.author,
        errors,
        "formatting.author"
      ),
      bearbeiter: styleValue(
        formatting.bearbeiter,
        fallback.formatting.bearbeiter,
        errors,
        "formatting.bearbeiter"
      ),
      editor: styleValue(
        formatting.editor,
        fallback.formatting.editor,
        errors,
        "formatting.editor"
      ),
      workTitle: styleValue(
        formatting.workTitle,
        fallback.formatting.workTitle,
        errors,
        "formatting.workTitle"
      ),
    },
    statute: {
      sectionSymbolStyle: enumValue(
        statute.sectionSymbolStyle,
        ["sectionSymbol", "article"],
        fallback.statute.sectionSymbolStyle,
        errors,
        "statute.sectionSymbolStyle"
      ),
      paragraphStyle: enumValue(
        statute.paragraphStyle,
        ["abbreviation", "roman"],
        fallback.statute.paragraphStyle,
        errors,
        "statute.paragraphStyle"
      ),
      sentenceStyle: enumValue(
        statute.sentenceStyle,
        ["abbreviation", "bareNumberAfterRomanParagraph"],
        fallback.statute.sentenceStyle,
        errors,
        "statute.sentenceStyle"
      ),
      numberStyle: enumValue(
        statute.numberStyle,
        ["abbreviation"],
        fallback.statute.numberStyle,
        errors,
        "statute.numberStyle"
      ),
      letterStyle: enumValue(
        statute.letterStyle,
        ["Buchst.", "lit."],
        fallback.statute.letterStyle,
        errors,
        "statute.letterStyle"
      ),
      halfSentenceStyle: enumValue(
        statute.halfSentenceStyle,
        ["Hs."],
        fallback.statute.halfSentenceStyle,
        errors,
        "statute.halfSentenceStyle"
      ),
      alternativeStyle: enumValue(
        statute.alternativeStyle,
        ["numberBeforeAbbreviation", "abbreviationBeforeNumber"],
        fallback.statute.alternativeStyle,
        errors,
        "statute.alternativeStyle"
      ),
      variantStyle: enumValue(
        statute.variantStyle,
        ["numberBeforeAbbreviation", "abbreviationBeforeNumber"],
        fallback.statute.variantStyle,
        errors,
        "statute.variantStyle"
      ),
      followingStyle: enumValue(
        statute.followingStyle,
        ["f.", "ff."],
        fallback.statute.followingStyle,
        errors,
        "statute.followingStyle"
      ),
      separatorBetweenMultipleSections: stringValue(
        statute.separatorBetweenMultipleSections,
        fallback.statute.separatorBetweenMultipleSections,
        errors,
        "statute.separatorBetweenMultipleSections"
      ),
      spaceBetweenUnitAndSection: booleanValue(
        statute.spaceBetweenUnitAndSection,
        fallback.statute.spaceBetweenUnitAndSection,
        errors,
        "statute.spaceBetweenUnitAndSection"
      ),
    },
    caseLaw: {
      decisionTypeOutput: {
        JUDGMENT: stringValue(
          decisionTypeOutput.JUDGMENT,
          fallback.caseLaw.decisionTypeOutput.JUDGMENT,
          errors,
          "caseLaw.decisionTypeOutput.JUDGMENT"
        ),
        ORDER: stringValue(
          decisionTypeOutput.ORDER,
          fallback.caseLaw.decisionTypeOutput.ORDER,
          errors,
          "caseLaw.decisionTypeOutput.ORDER"
        ),
        DECISION: stringValue(
          decisionTypeOutput.DECISION,
          fallback.caseLaw.decisionTypeOutput.DECISION,
          errors,
          "caseLaw.decisionTypeOutput.DECISION"
        ),
      },
      dateIntroducer: stringValue(
        caseLaw.dateIntroducer,
        fallback.caseLaw.dateIntroducer,
        errors,
        "caseLaw.dateIntroducer"
      ),
      dateFormat: enumValue(
        caseLaw.dateFormat,
        ["DD.MM.YYYY", "D.M.YYYY", "DD.MM.YY", "D.M.YY"],
        fallback.caseLaw.dateFormat,
        errors,
        "caseLaw.dateFormat"
      ),
      directCitation: {
        includeCourt: booleanValue(
          directCitation.includeCourt,
          fallback.caseLaw.directCitation.includeCourt,
          errors,
          "caseLaw.directCitation.includeCourt"
        ),
        includeDecisionType: booleanValue(
          directCitation.includeDecisionType,
          fallback.caseLaw.directCitation.includeDecisionType,
          errors,
          "caseLaw.directCitation.includeDecisionType"
        ),
        includeDate: booleanValue(
          directCitation.includeDate,
          fallback.caseLaw.directCitation.includeDate,
          errors,
          "caseLaw.directCitation.includeDate"
        ),
        includeDocketNumber: booleanValue(
          directCitation.includeDocketNumber,
          fallback.caseLaw.directCitation.includeDocketNumber,
          errors,
          "caseLaw.directCitation.includeDocketNumber"
        ),
        separatorBeforeDocket: stringValue(
          directCitation.separatorBeforeDocket,
          fallback.caseLaw.directCitation.separatorBeforeDocket,
          errors,
          "caseLaw.directCitation.separatorBeforeDocket"
        ),
      },
      journalCitation: {
        includeCourt: booleanValue(
          journalCitation.includeCourt,
          fallback.caseLaw.journalCitation.includeCourt,
          errors,
          "caseLaw.journalCitation.includeCourt"
        ),
        pinpointStyle: enumValue(
          journalCitation.pinpointStyle,
          ["parentheses", "comma"],
          fallback.caseLaw.journalCitation.pinpointStyle,
          errors,
          "caseLaw.journalCitation.pinpointStyle"
        ),
      },
      officialCollectionCitation: {
        pinpointStyle: enumValue(
          officialCollectionCitation.pinpointStyle,
          ["parentheses", "comma"],
          fallback.caseLaw.officialCollectionCitation.pinpointStyle,
          errors,
          "caseLaw.officialCollectionCitation.pinpointStyle"
        ),
      },
      databaseCitation: {
        includeCourtWhenAvailable: booleanValue(
          databaseCitation.includeCourtWhenAvailable,
          fallback.caseLaw.databaseCitation.includeCourtWhenAvailable,
          errors,
          "caseLaw.databaseCitation.includeCourtWhenAvailable"
        ),
      },
      hybridCitation: {
        parallelCitationSeparator: stringValue(
          hybridCitation.parallelCitationSeparator,
          fallback.caseLaw.hybridCitation.parallelCitationSeparator,
          errors,
          "caseLaw.hybridCitation.parallelCitationSeparator"
        ),
      },
    },
    commentary: {
      personSeparator: stringValue(
        commentary.personSeparator,
        fallback.commentary.personSeparator,
        errors,
        "commentary.personSeparator"
      ),
      includeEditorsWhenPresent: booleanValue(
        commentary.includeEditorsWhenPresent,
        fallback.commentary.includeEditorsWhenPresent,
        errors,
        "commentary.includeEditorsWhenPresent"
      ),
      includeEditionWhenPresent: booleanValue(
        commentary.includeEditionWhenPresent,
        fallback.commentary.includeEditionWhenPresent,
        errors,
        "commentary.includeEditionWhenPresent"
      ),
      includeYearWhenPresent: booleanValue(
        commentary.includeYearWhenPresent,
        fallback.commentary.includeYearWhenPresent,
        errors,
        "commentary.includeYearWhenPresent"
      ),
      includeVolumeWhenPresent: booleanValue(
        commentary.includeVolumeWhenPresent,
        fallback.commentary.includeVolumeWhenPresent,
        errors,
        "commentary.includeVolumeWhenPresent"
      ),
      usePreferredWorkName: booleanValue(
        commentary.usePreferredWorkName,
        fallback.commentary.usePreferredWorkName,
        errors,
        "commentary.usePreferredWorkName"
      ),
      bearbeiterFormatting: styleValue(
        commentary.bearbeiterFormatting,
        fallback.commentary.bearbeiterFormatting,
        errors,
        "commentary.bearbeiterFormatting"
      ),
      editorFormatting: styleValue(
        commentary.editorFormatting,
        fallback.commentary.editorFormatting,
        errors,
        "commentary.editorFormatting"
      ),
      marginNumberAbbreviation: stringValue(
        commentary.marginNumberAbbreviation,
        fallback.commentary.marginNumberAbbreviation,
        errors,
        "commentary.marginNumberAbbreviation"
      ),
      inheritStatuteSettings: booleanValue(
        commentary.inheritStatuteSettings,
        fallback.commentary.inheritStatuteSettings,
        errors,
        "commentary.inheritStatuteSettings"
      ),
    },
    book: {
      personSeparator: stringValue(
        book.personSeparator,
        fallback.book.personSeparator,
        errors,
        "book.personSeparator"
      ),
      authorFormatting: styleValue(
        book.authorFormatting,
        fallback.book.authorFormatting,
        errors,
        "book.authorFormatting"
      ),
      useShortTitleWhenAvailable: booleanValue(
        book.useShortTitleWhenAvailable,
        fallback.book.useShortTitleWhenAvailable,
        errors,
        "book.useShortTitleWhenAvailable"
      ),
      includeEditionWhenPresent: booleanValue(
        book.includeEditionWhenPresent,
        fallback.book.includeEditionWhenPresent,
        errors,
        "book.includeEditionWhenPresent"
      ),
      includeYearWhenPresent: booleanValue(
        book.includeYearWhenPresent,
        fallback.book.includeYearWhenPresent,
        errors,
        "book.includeYearWhenPresent"
      ),
      includePlaceWhenPresent: booleanValue(
        book.includePlaceWhenPresent,
        fallback.book.includePlaceWhenPresent,
        errors,
        "book.includePlaceWhenPresent"
      ),
      includePublisherWhenPresent: booleanValue(
        book.includePublisherWhenPresent,
        fallback.book.includePublisherWhenPresent,
        errors,
        "book.includePublisherWhenPresent"
      ),
      includeVolumeWhenPresent: booleanValue(
        book.includeVolumeWhenPresent,
        fallback.book.includeVolumeWhenPresent,
        errors,
        "book.includeVolumeWhenPresent"
      ),
      marginNumberAbbreviation: stringValue(
        book.marginNumberAbbreviation,
        fallback.book.marginNumberAbbreviation,
        errors,
        "book.marginNumberAbbreviation"
      ),
      pageAbbreviation: stringValue(
        book.pageAbbreviation,
        fallback.book.pageAbbreviation,
        errors,
        "book.pageAbbreviation"
      ),
      workSectionStyle: enumValue(
        book.workSectionStyle,
        ["sectionSymbol"],
        fallback.book.workSectionStyle,
        errors,
        "book.workSectionStyle"
      ),
    },
    journalArticle: {
      personSeparator: stringValue(
        journalArticle.personSeparator,
        fallback.journalArticle.personSeparator,
        errors,
        "journalArticle.personSeparator"
      ),
      authorFormatting: styleValue(
        journalArticle.authorFormatting,
        fallback.journalArticle.authorFormatting,
        errors,
        "journalArticle.authorFormatting"
      ),
      useJournalAbbreviation: booleanValue(
        journalArticle.useJournalAbbreviation,
        fallback.journalArticle.useJournalAbbreviation,
        errors,
        "journalArticle.useJournalAbbreviation"
      ),
      includeYear: booleanValue(
        journalArticle.includeYear,
        fallback.journalArticle.includeYear,
        errors,
        "journalArticle.includeYear"
      ),
      includeFirstPage: booleanValue(
        journalArticle.includeFirstPage,
        fallback.journalArticle.includeFirstPage,
        errors,
        "journalArticle.includeFirstPage"
      ),
      pinpointStyle: enumValue(
        journalArticle.pinpointStyle,
        ["parentheses", "comma"],
        fallback.journalArticle.pinpointStyle,
        errors,
        "journalArticle.pinpointStyle"
      ),
      preserveFollowingSuffix: booleanValue(
        journalArticle.preserveFollowingSuffix,
        fallback.journalArticle.preserveFollowingSuffix,
        errors,
        "journalArticle.preserveFollowingSuffix"
      ),
    },
    bookChapter: {
      personSeparator: stringValue(
        bookChapter.personSeparator,
        fallback.bookChapter.personSeparator,
        errors,
        "bookChapter.personSeparator"
      ),
      authorFormatting: styleValue(
        bookChapter.authorFormatting,
        fallback.bookChapter.authorFormatting,
        errors,
        "bookChapter.authorFormatting"
      ),
      editorFormatting: styleValue(
        bookChapter.editorFormatting,
        fallback.bookChapter.editorFormatting,
        errors,
        "bookChapter.editorFormatting"
      ),
      inToken: stringValue(
        bookChapter.inToken,
        fallback.bookChapter.inToken,
        errors,
        "bookChapter.inToken"
      ),
      includeEditorsWhenPresent: booleanValue(
        bookChapter.includeEditorsWhenPresent,
        fallback.bookChapter.includeEditorsWhenPresent,
        errors,
        "bookChapter.includeEditorsWhenPresent"
      ),
      includeEditionWhenPresent: booleanValue(
        bookChapter.includeEditionWhenPresent,
        fallback.bookChapter.includeEditionWhenPresent,
        errors,
        "bookChapter.includeEditionWhenPresent"
      ),
      includeYearWhenPresent: booleanValue(
        bookChapter.includeYearWhenPresent,
        fallback.bookChapter.includeYearWhenPresent,
        errors,
        "bookChapter.includeYearWhenPresent"
      ),
      pageAbbreviation: stringValue(
        bookChapter.pageAbbreviation,
        fallback.bookChapter.pageAbbreviation,
        errors,
        "bookChapter.pageAbbreviation"
      ),
      pinpointStyle: enumValue(
        bookChapter.pinpointStyle,
        ["parentheses", "comma", "pagePrefix"],
        fallback.bookChapter.pinpointStyle,
        errors,
        "bookChapter.pinpointStyle"
      ),
    },
    caseNote: {
      personSeparator: stringValue(
        caseNote.personSeparator,
        fallback.caseNote.personSeparator,
        errors,
        "caseNote.personSeparator"
      ),
      authorFormatting: styleValue(
        caseNote.authorFormatting,
        fallback.caseNote.authorFormatting,
        errors,
        "caseNote.authorFormatting"
      ),
      preferredNoteMarker: stringValue(
        caseNote.preferredNoteMarker,
        fallback.caseNote.preferredNoteMarker,
        errors,
        "caseNote.preferredNoteMarker"
      ),
      journalPinpointStyle: enumValue(
        caseNote.journalPinpointStyle,
        ["parentheses", "comma"],
        fallback.caseNote.journalPinpointStyle,
        errors,
        "caseNote.journalPinpointStyle"
      ),
    },
    legislativeMaterial: {
      BundestagDocumentPrefix: stringValue(
        legislativeMaterial.BundestagDocumentPrefix,
        fallback.legislativeMaterial.BundestagDocumentPrefix,
        errors,
        "legislativeMaterial.BundestagDocumentPrefix"
      ),
      BundesratDocumentPrefix: stringValue(
        legislativeMaterial.BundesratDocumentPrefix,
        fallback.legislativeMaterial.BundesratDocumentPrefix,
        errors,
        "legislativeMaterial.BundesratDocumentPrefix"
      ),
      pageAbbreviation: stringValue(
        legislativeMaterial.pageAbbreviation,
        fallback.legislativeMaterial.pageAbbreviation,
        errors,
        "legislativeMaterial.pageAbbreviation"
      ),
      includePagePrefix: booleanValue(
        legislativeMaterial.includePagePrefix,
        fallback.legislativeMaterial.includePagePrefix,
        errors,
        "legislativeMaterial.includePagePrefix"
      ),
    },
    onlineSource: {
      includeOrganizationWhenPresent: booleanValue(
        onlineSource.includeOrganizationWhenPresent,
        fallback.onlineSource.includeOrganizationWhenPresent,
        errors,
        "onlineSource.includeOrganizationWhenPresent"
      ),
      includeTitleWhenPresent: booleanValue(
        onlineSource.includeTitleWhenPresent,
        fallback.onlineSource.includeTitleWhenPresent,
        errors,
        "onlineSource.includeTitleWhenPresent"
      ),
      includeUrl: booleanValue(
        onlineSource.includeUrl,
        fallback.onlineSource.includeUrl,
        errors,
        "onlineSource.includeUrl"
      ),
      includeAccessDateWhenPresent: booleanValue(
        onlineSource.includeAccessDateWhenPresent,
        fallback.onlineSource.includeAccessDateWhenPresent,
        errors,
        "onlineSource.includeAccessDateWhenPresent"
      ),
      accessDateLabel: stringValue(
        onlineSource.accessDateLabel,
        fallback.onlineSource.accessDateLabel,
        errors,
        "onlineSource.accessDateLabel"
      ),
      dateFormat: enumValue(
        onlineSource.dateFormat,
        ["DD.MM.YYYY", "D.M.YYYY"],
        fallback.onlineSource.dateFormat,
        errors,
        "onlineSource.dateFormat"
      ),
    },
    administrativeMaterial: {
      includeAuthority: booleanValue(
        administrativeMaterial.includeAuthority,
        fallback.administrativeMaterial.includeAuthority,
        errors,
        "administrativeMaterial.includeAuthority"
      ),
      includeDocumentType: booleanValue(
        administrativeMaterial.includeDocumentType,
        fallback.administrativeMaterial.includeDocumentType,
        errors,
        "administrativeMaterial.includeDocumentType"
      ),
      includeDate: booleanValue(
        administrativeMaterial.includeDate,
        fallback.administrativeMaterial.includeDate,
        errors,
        "administrativeMaterial.includeDate"
      ),
      includeFileNumber: booleanValue(
        administrativeMaterial.includeFileNumber,
        fallback.administrativeMaterial.includeFileNumber,
        errors,
        "administrativeMaterial.includeFileNumber"
      ),
      dateIntroducer: stringValue(
        administrativeMaterial.dateIntroducer,
        fallback.administrativeMaterial.dateIntroducer,
        errors,
        "administrativeMaterial.dateIntroducer"
      ),
      dateFormat: enumValue(
        administrativeMaterial.dateFormat,
        ["DD.MM.YYYY", "D.M.YYYY"],
        fallback.administrativeMaterial.dateFormat,
        errors,
        "administrativeMaterial.dateFormat"
      ),
    },
    abbreviations: fallback.abbreviations,
    modifiers: fallback.modifiers,
  };

  const abbreviations = objectValue(value.abbreviations, errors, "abbreviations");
  (Object.keys(fallback.abbreviations) as CitationAbbreviationConcept[]).forEach((concept) => {
    const entry = objectValue(abbreviations[concept], errors, `abbreviations.${concept}`);
    profile.abbreviations[concept] = {
      concept,
      recognizedVariants: stringArrayValue(
        entry.recognizedVariants,
        fallback.abbreviations[concept].recognizedVariants,
        errors,
        `abbreviations.${concept}.recognizedVariants`
      ),
      preferredOutput: stringValue(
        entry.preferredOutput,
        fallback.abbreviations[concept].preferredOutput,
        errors,
        `abbreviations.${concept}.preferredOutput`
      ),
    };
  });

  const modifiers = objectValue(value.modifiers, errors, "modifiers");
  (Object.keys(fallback.modifiers) as CitationModifierConcept[]).forEach((concept) => {
    const entry = objectValue(modifiers[concept], errors, `modifiers.${concept}`);
    profile.modifiers[concept] = {
      normalizedConcept: concept,
      recognizedVariants: stringArrayValue(
        entry.recognizedVariants,
        fallback.modifiers[concept].recognizedVariants,
        errors,
        `modifiers.${concept}.recognizedVariants`
      ),
      preferredOutput: stringValue(
        entry.preferredOutput,
        fallback.modifiers[concept].preferredOutput,
        errors,
        `modifiers.${concept}.preferredOutput`
      ),
    };
  });

  return { success: errors.length === 0, profile, errors };
}

export function serializeCitationStyleProfile(profile: CitationStyleProfile): string {
  return JSON.stringify(sanitizeCitationStyleProfile(profile).profile, null, 2);
}

export function parseCitationStyleProfile(json: string): CitationStyleProfileValidationResult {
  try {
    const normalizedJson = json.replace(/^\uFEFF/, "");
    return sanitizeCitationStyleProfile(JSON.parse(normalizedJson) as unknown);
  } catch {
    return {
      success: false,
      profile: createDefaultCitationStyleProfile(),
      errors: ["Die Settings-Datei enthält kein gültiges JSON."],
    };
  }
}
