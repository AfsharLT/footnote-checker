import { resolveCitationSettings } from "../../src/citation-settings/resolver";
import type { DeepPartial, CitationStyleProfile } from "../../src/citation-settings/types";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const globalOnly: DeepPartial<CitationStyleProfile> = {
  formatting: { author: { italic: false } },
};
const globalResolved = resolveCitationSettings({
  profile: globalOnly,
  citationType: "JOURNAL_ARTICLE",
});
assert(
  globalResolved.settings.authorFormatting.italic === false,
  "Global formatting must beat built-in type defaults when no type override exists"
);

const typeOverride: DeepPartial<CitationStyleProfile> = {
  formatting: { author: { italic: true } },
  journalArticle: { authorFormatting: { italic: false } },
};
const typeResolved = resolveCitationSettings({
  profile: typeOverride,
  citationType: "JOURNAL_ARTICLE",
});
assert(
  typeResolved.settings.authorFormatting.italic === false,
  "Citation-type formatting must beat global formatting"
);

const beforeResolution = JSON.stringify(typeOverride);
const workResolved = resolveCitationSettings({
  profile: typeOverride,
  citationType: "JOURNAL_ARTICLE",
  workOverride: {
    canonicalWorkId: "future-journal-id",
    citationType: "JOURNAL_ARTICLE",
    preferredName: "Future Journal",
    formatting: { author: { italic: true } },
    citationSettingsOverride: {
      authorFormatting: { italic: true },
      pinpointStyle: "comma",
    },
  },
});
assert(workResolved.settings.authorFormatting.italic === true, "Work formatting must win");
assert(workResolved.settings.pinpointStyle === "comma", "Work type settings must win");
assert(workResolved.preferredWorkName === "Future Journal", "Preferred work name missing");
assert(JSON.stringify(typeOverride) === beforeResolution, "Resolver must not mutate profile input");

const workFormattingOnly = resolveCitationSettings({
  profile: typeOverride,
  citationType: "JOURNAL_ARTICLE",
  workOverride: {
    canonicalWorkId: "formatting-only-id",
    citationType: "JOURNAL_ARTICLE",
    formatting: { author: { italic: true } },
  },
});
assert(
  workFormattingOnly.settings.authorFormatting.italic === true,
  "Generic work formatting must beat citation-type formatting"
);

const defaultResolved = resolveCitationSettings({ citationType: "CASE_LAW" });
assert(defaultResolved.settings.dateFormat === "DD.MM.YYYY", "Missing input must use defaults");
assert(
  defaultResolved.settings.directCitation.separatorBeforeDocket === " – ",
  "Nested built-in default missing"
);

const abbreviationResolved = resolveCitationSettings({
  profile: {
    abbreviations: {
      JUDGMENT: { preferredOutput: "Urteil" },
    },
  },
  citationType: "CASE_LAW",
});
assert(
  abbreviationResolved.abbreviations.JUDGMENT.preferredOutput === "Urteil" &&
    abbreviationResolved.abbreviations.JUDGMENT.recognizedVariants.includes("Urt."),
  "Profile abbreviation output must override without losing built-in variants"
);

const unrelatedWorkOverride = resolveCitationSettings({
  profile: globalOnly,
  citationType: "JOURNAL_ARTICLE",
  workOverride: {
    canonicalWorkId: "book-id",
    citationType: "BOOK",
    formatting: { author: { italic: true } },
  },
});
assert(
  unrelatedWorkOverride.settings.authorFormatting.italic === false,
  "Override for another citation type must be ignored"
);

const otherResolved = resolveCitationSettings({
  citationType: "OTHER",
  workOverride: {
    canonicalWorkId: "future-other-id",
    citationType: "OTHER",
    preferredName: "Future Work",
  },
});
assert(otherResolved.preferredWorkName === "Future Work", "OTHER work override must be prepared");
