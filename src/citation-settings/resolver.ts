import { createDefaultCitationStyleProfile } from "./defaults";
import type {
  BookChapterCitationSettings,
  BookCitationSettings,
  CaseNoteCitationSettings,
  CitationAbbreviationConcept,
  CitationFormattingPreferences,
  CitationModifierConcept,
  CitationSettingsByType,
  CitationStyleProfile,
  CommentaryCitationSettings,
  DeepPartial,
  JournalArticleCitationSettings,
  ResolvedCitationSettings,
  SettingsCitationType,
  WorkCitationOverride,
} from "./types";

export interface ResolveCitationSettingsInput<TType extends SettingsCitationType> {
  profile?: DeepPartial<CitationStyleProfile>;
  citationType: TType;
  workOverride?: WorkCitationOverride;
}

function mergeStyle(
  base: CitationFormattingPreferences["author"],
  override?: DeepPartial<CitationFormattingPreferences["author"]>
): CitationFormattingPreferences["author"] {
  return {
    ...(base.italic !== undefined ? { italic: base.italic } : {}),
    ...(base.bold !== undefined ? { bold: base.bold } : {}),
    ...(base.underline !== undefined ? { underline: base.underline } : {}),
    ...(override?.italic !== undefined ? { italic: override.italic } : {}),
    ...(override?.bold !== undefined ? { bold: override.bold } : {}),
    ...(override?.underline !== undefined ? { underline: override.underline } : {}),
  };
}

function mergeFormatting(
  base: CitationFormattingPreferences,
  override?: DeepPartial<CitationFormattingPreferences>
): CitationFormattingPreferences {
  return {
    author: mergeStyle(base.author, override?.author),
    bearbeiter: mergeStyle(base.bearbeiter, override?.bearbeiter),
    editor: mergeStyle(base.editor, override?.editor),
    workTitle: mergeStyle(base.workTitle, override?.workTitle),
  };
}

function matchingWorkSettings<TType extends SettingsCitationType>(
  workOverride: WorkCitationOverride | undefined,
  citationType: TType
): DeepPartial<CitationSettingsByType[TType]> | undefined {
  if (!workOverride || workOverride.citationType !== citationType) return undefined;
  return workOverride.citationSettingsOverride as
    DeepPartial<CitationSettingsByType[TType]> | undefined;
}

function resolveBook(
  defaults: CitationStyleProfile,
  profile: DeepPartial<CitationStyleProfile>,
  formatting: CitationFormattingPreferences,
  workFormatting?: DeepPartial<CitationFormattingPreferences>,
  workSettings?: DeepPartial<BookCitationSettings>
): BookCitationSettings {
  const source = profile.book;
  const authorFormatting = mergeStyle(
    mergeStyle(mergeStyle(formatting.author, source?.authorFormatting), workFormatting?.author),
    workSettings?.authorFormatting
  );
  formatting.author = authorFormatting;
  return {
    ...defaults.book,
    personSeparator:
      workSettings?.personSeparator ??
      source?.personSeparator ??
      profile.global?.personSeparator ??
      defaults.book.personSeparator,
    ...source,
    ...workSettings,
    authorFormatting,
  };
}

function resolveCommentary(
  defaults: CitationStyleProfile,
  profile: DeepPartial<CitationStyleProfile>,
  formatting: CitationFormattingPreferences,
  workFormatting?: DeepPartial<CitationFormattingPreferences>,
  workSettings?: DeepPartial<CommentaryCitationSettings>
): CommentaryCitationSettings {
  const source = profile.commentary;
  const bearbeiterFormatting = mergeStyle(
    mergeStyle(
      mergeStyle(formatting.bearbeiter, source?.bearbeiterFormatting),
      workFormatting?.bearbeiter
    ),
    workSettings?.bearbeiterFormatting
  );
  const editorFormatting = mergeStyle(
    mergeStyle(mergeStyle(formatting.editor, source?.editorFormatting), workFormatting?.editor),
    workSettings?.editorFormatting
  );
  formatting.bearbeiter = bearbeiterFormatting;
  formatting.editor = editorFormatting;
  return {
    ...defaults.commentary,
    personSeparator:
      workSettings?.personSeparator ??
      source?.personSeparator ??
      profile.global?.personSeparator ??
      defaults.commentary.personSeparator,
    ...source,
    ...workSettings,
    bearbeiterFormatting,
    editorFormatting,
  };
}

function resolveJournalArticle(
  defaults: CitationStyleProfile,
  profile: DeepPartial<CitationStyleProfile>,
  formatting: CitationFormattingPreferences,
  workFormatting?: DeepPartial<CitationFormattingPreferences>,
  workSettings?: DeepPartial<JournalArticleCitationSettings>
): JournalArticleCitationSettings {
  const source = profile.journalArticle;
  const authorFormatting = mergeStyle(
    mergeStyle(mergeStyle(formatting.author, source?.authorFormatting), workFormatting?.author),
    workSettings?.authorFormatting
  );
  formatting.author = authorFormatting;
  return {
    ...defaults.journalArticle,
    personSeparator:
      workSettings?.personSeparator ??
      source?.personSeparator ??
      profile.global?.personSeparator ??
      defaults.journalArticle.personSeparator,
    ...source,
    ...workSettings,
    authorFormatting,
  };
}

function resolveBookChapter(
  defaults: CitationStyleProfile,
  profile: DeepPartial<CitationStyleProfile>,
  formatting: CitationFormattingPreferences,
  workFormatting?: DeepPartial<CitationFormattingPreferences>,
  workSettings?: DeepPartial<BookChapterCitationSettings>
): BookChapterCitationSettings {
  const source = profile.bookChapter;
  const authorFormatting = mergeStyle(
    mergeStyle(mergeStyle(formatting.author, source?.authorFormatting), workFormatting?.author),
    workSettings?.authorFormatting
  );
  const editorFormatting = mergeStyle(
    mergeStyle(mergeStyle(formatting.editor, source?.editorFormatting), workFormatting?.editor),
    workSettings?.editorFormatting
  );
  formatting.author = authorFormatting;
  formatting.editor = editorFormatting;
  return {
    ...defaults.bookChapter,
    personSeparator:
      workSettings?.personSeparator ??
      source?.personSeparator ??
      profile.global?.personSeparator ??
      defaults.bookChapter.personSeparator,
    ...source,
    ...workSettings,
    authorFormatting,
    editorFormatting,
  };
}

function resolveCaseNote(
  defaults: CitationStyleProfile,
  profile: DeepPartial<CitationStyleProfile>,
  formatting: CitationFormattingPreferences,
  workSettings?: DeepPartial<CaseNoteCitationSettings>
): CaseNoteCitationSettings {
  const source = profile.caseNote;
  const authorFormatting = mergeStyle(
    mergeStyle(formatting.author, source?.authorFormatting),
    workSettings?.authorFormatting
  );
  formatting.author = authorFormatting;
  return {
    ...defaults.caseNote,
    personSeparator:
      workSettings?.personSeparator ??
      source?.personSeparator ??
      profile.global?.personSeparator ??
      defaults.caseNote.personSeparator,
    ...source,
    ...workSettings,
    authorFormatting,
  };
}

function resolveCaseLaw(
  defaults: CitationStyleProfile,
  profile: DeepPartial<CitationStyleProfile>
): CitationSettingsByType["CASE_LAW"] {
  const source = profile.caseLaw;
  return {
    ...defaults.caseLaw,
    ...source,
    decisionTypeOutput: {
      ...defaults.caseLaw.decisionTypeOutput,
      ...source?.decisionTypeOutput,
    },
    directCitation: {
      ...defaults.caseLaw.directCitation,
      ...source?.directCitation,
    },
    journalCitation: {
      ...defaults.caseLaw.journalCitation,
      ...source?.journalCitation,
    },
    officialCollectionCitation: {
      ...defaults.caseLaw.officialCollectionCitation,
      ...source?.officialCollectionCitation,
    },
    databaseCitation: {
      ...defaults.caseLaw.databaseCitation,
      ...source?.databaseCitation,
    },
    hybridCitation: {
      ...defaults.caseLaw.hybridCitation,
      ...source?.hybridCitation,
    },
  };
}

function resolvePreferences(
  defaults: CitationStyleProfile,
  profile: DeepPartial<CitationStyleProfile>
): Pick<ResolvedCitationSettings<SettingsCitationType>, "abbreviations" | "modifiers"> {
  const abbreviations = defaults.abbreviations;
  (Object.keys(abbreviations) as CitationAbbreviationConcept[]).forEach((concept) => {
    const override = profile.abbreviations?.[concept];
    const variants: unknown = override?.recognizedVariants;
    abbreviations[concept] = {
      concept,
      recognizedVariants:
        Array.isArray(variants) && variants.every((variant) => typeof variant === "string")
          ? [...variants]
          : [...defaults.abbreviations[concept].recognizedVariants],
      preferredOutput:
        typeof override?.preferredOutput === "string"
          ? override.preferredOutput
          : defaults.abbreviations[concept].preferredOutput,
    };
  });

  const modifiers = defaults.modifiers;
  (Object.keys(modifiers) as CitationModifierConcept[]).forEach((concept) => {
    const override = profile.modifiers?.[concept];
    const variants: unknown = override?.recognizedVariants;
    modifiers[concept] = {
      normalizedConcept: concept,
      recognizedVariants:
        Array.isArray(variants) && variants.every((variant) => typeof variant === "string")
          ? [...variants]
          : [...defaults.modifiers[concept].recognizedVariants],
      preferredOutput:
        typeof override?.preferredOutput === "string"
          ? override.preferredOutput
          : defaults.modifiers[concept].preferredOutput,
    };
  });

  return {
    abbreviations,
    modifiers,
  };
}

export function resolveCitationSettings<TType extends SettingsCitationType>({
  profile = {},
  citationType,
  workOverride,
}: ResolveCitationSettingsInput<TType>): ResolvedCitationSettings<TType> {
  const defaults = createDefaultCitationStyleProfile();
  const global = { ...defaults.global, ...profile.global };
  let formatting = mergeFormatting(defaults.formatting, profile.formatting);
  const matchingWorkOverride =
    workOverride?.citationType === citationType ? workOverride : undefined;
  formatting = mergeFormatting(formatting, matchingWorkOverride?.formatting);
  const workSettings = matchingWorkSettings(matchingWorkOverride, citationType);
  let settings: CitationSettingsByType[SettingsCitationType];

  switch (citationType) {
    case "STATUTE":
      settings = { ...defaults.statute, ...profile.statute };
      break;
    case "CASE_LAW":
      settings = resolveCaseLaw(defaults, profile);
      break;
    case "COMMENTARY":
      settings = resolveCommentary(
        defaults,
        profile,
        formatting,
        matchingWorkOverride?.formatting,
        workSettings as DeepPartial<CommentaryCitationSettings> | undefined
      );
      break;
    case "BOOK":
      settings = resolveBook(
        defaults,
        profile,
        formatting,
        matchingWorkOverride?.formatting,
        workSettings as DeepPartial<BookCitationSettings> | undefined
      );
      break;
    case "JOURNAL_ARTICLE":
      settings = resolveJournalArticle(
        defaults,
        profile,
        formatting,
        matchingWorkOverride?.formatting,
        workSettings as DeepPartial<JournalArticleCitationSettings> | undefined
      );
      break;
    case "BOOK_CHAPTER":
      settings = resolveBookChapter(
        defaults,
        profile,
        formatting,
        matchingWorkOverride?.formatting,
        workSettings as DeepPartial<BookChapterCitationSettings> | undefined
      );
      break;
    case "CASE_NOTE":
      settings = resolveCaseNote(defaults, profile, formatting);
      break;
    case "LEGISLATIVE_MATERIAL":
      settings = { ...defaults.legislativeMaterial, ...profile.legislativeMaterial };
      break;
    case "ONLINE_SOURCE":
      settings = { ...defaults.onlineSource, ...profile.onlineSource };
      break;
    case "ADMINISTRATIVE_MATERIAL":
      settings = { ...defaults.administrativeMaterial, ...profile.administrativeMaterial };
      break;
    case "OTHER":
      settings = {};
      break;
  }

  const preferences = resolvePreferences(defaults, profile);
  return {
    citationType,
    global,
    settings: settings as CitationSettingsByType[TType],
    formatting,
    abbreviations: preferences.abbreviations,
    modifiers: preferences.modifiers,
    ...(matchingWorkOverride?.preferredName
      ? { preferredWorkName: matchingWorkOverride.preferredName }
      : {}),
  };
}
