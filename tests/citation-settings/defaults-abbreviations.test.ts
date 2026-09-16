import {
  recognizeCitationAbbreviation,
  recognizeCitationModifier,
} from "../../src/citation-settings/abbreviations";
import {
  createDefaultCitationStyleProfile,
  DEFAULT_CITATION_STYLE_PROFILE,
} from "../../src/citation-settings/defaults";
import { CURRENT_CITATION_SETTINGS_SCHEMA_VERSION } from "../../src/citation-settings/types";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const profile = createDefaultCitationStyleProfile();
assert(profile.schemaVersion === 1, "Default schemaVersion must be 1");
assert(
  profile.schemaVersion === CURRENT_CITATION_SETTINGS_SCHEMA_VERSION,
  "Default schemaVersion must be current"
);
assert(
  Boolean(
    profile.statute &&
    profile.caseLaw &&
    profile.commentary &&
    profile.book &&
    profile.journalArticle &&
    profile.bookChapter &&
    profile.caseNote &&
    profile.legislativeMaterial &&
    profile.onlineSource &&
    profile.administrativeMaterial
  ),
  "All citation-type settings must exist"
);
assert(profile.caseLaw.decisionTypeOutput.JUDGMENT === "Urt.", "Judgment default mismatch");
assert(profile.caseLaw.decisionTypeOutput.ORDER === "Beschl.", "Order default mismatch");
assert(profile.caseLaw.dateFormat === "DD.MM.YYYY", "Case-law date format mismatch");
assert(
  profile.caseLaw.hybridCitation.parallelCitationSeparator === " = ",
  "Parallel separator mismatch"
);
assert(profile.commentary.bearbeiterFormatting.italic === true, "Bearbeiter must be italic");
assert(profile.commentary.editorFormatting.italic === false, "Editor must not be italic");
assert(profile.journalArticle.pinpointStyle === "parentheses", "Journal pinpoint mismatch");
assert(
  profile.global.autoCloseInactiveFootnotes === true,
  "Inactive footnotes must auto-close by default"
);
assert(profile.statute.paragraphStyle === "abbreviation", "Paragraph style mismatch");
assert(profile.statute.sentenceStyle === "abbreviation", "Sentence style mismatch");

profile.name = "User profile";
profile.formatting.author.italic = false;
assert(
  DEFAULT_CITATION_STYLE_PROFILE.name === "Standard – deutsche juristische Zitierweise" &&
    DEFAULT_CITATION_STYLE_PROFILE.formatting.author.italic === true,
  "Changing a user profile must not mutate defaults"
);
assert(Object.isFrozen(DEFAULT_CITATION_STYLE_PROFILE), "Exported default profile must be frozen");
assert(
  Object.isFrozen(DEFAULT_CITATION_STYLE_PROFILE.caseLaw.directCitation),
  "Nested default structures must be frozen"
);

for (const variant of ["Urt.", "U.", "Urteil"]) {
  const match = recognizeCitationAbbreviation(variant);
  assert(match?.concept === "JUDGMENT", `${variant} must be JUDGMENT`);
  assert(match.preferredOutput === "Urt.", "JUDGMENT preferred output mismatch");
}

for (const variant of ["Beschl.", "B.", "Beschluss"]) {
  const match = recognizeCitationAbbreviation(variant);
  assert(match?.concept === "ORDER", `${variant} must be ORDER`);
  assert(match.preferredOutput === "Beschl.", "ORDER preferred output mismatch");
}

for (const variant of ["Rn.", "Rdnr.", "Randnummer"]) {
  const match = recognizeCitationAbbreviation(variant);
  assert(match?.concept === "MARGIN_NUMBER", `${variant} must be MARGIN_NUMBER`);
  assert(match.preferredOutput === "Rn.", "MARGIN_NUMBER preferred output mismatch");
}

assert(recognizeCitationAbbreviation("f.")?.concept === "FOLLOWING", "f. concept mismatch");
assert(
  recognizeCitationAbbreviation("ff.")?.concept === "FOLLOWING_MULTIPLE",
  "ff. concept mismatch"
);
assert(recognizeCitationModifier("f.") === undefined, "f. must not be a modifier");
assert(recognizeCitationModifier("ff.") === undefined, "ff. must not be a modifier");
assert(recognizeCitationModifier("vgl.")?.normalizedConcept === "COMPARE", "vgl. mismatch");
