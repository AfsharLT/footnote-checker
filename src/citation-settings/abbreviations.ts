import type {
  AbbreviationPreference,
  CitationAbbreviationConcept,
  CitationAbbreviationPreferences,
  CitationModifierConcept,
  CitationModifierPreference,
  CitationModifierPreferences,
} from "./types";

const ABBREVIATION_DEFINITIONS: Readonly<
  Record<CitationAbbreviationConcept, readonly [readonly string[], string]>
> = {
  JUDGMENT: [["Urt.", "U.", "Urteil"], "Urt."],
  ORDER: [["Beschl.", "B.", "Beschluss"], "Beschl."],
  DECISION: [["Entsch.", "Entscheidung"], "Entsch."],
  DATE_INTRODUCER: [["v.", "vom"], "v."],
  MARGIN_NUMBER: [["Rn.", "Rdnr.", "Randnummer"], "Rn."],
  PAGE: [["S.", "Seite"], "S."],
  PARAGRAPH: [["Abs.", "Absatz"], "Abs."],
  SENTENCE: [["S.", "Satz"], "S."],
  NUMBER: [["Nr.", "Nummer"], "Nr."],
  LETTER: [["Buchst.", "lit.", "Buchstabe"], "Buchst."],
  HALF_SENTENCE: [["Hs.", "Halbsatz"], "Hs."],
  ALTERNATIVE: [["Alt.", "Alternative"], "Alt."],
  VARIANT: [["Var.", "Variante"], "Var."],
  FOLLOWING: [["f.", "f"], "f."],
  FOLLOWING_MULTIPLE: [["ff.", "ff"], "ff."],
  EDITION: [["Aufl.", "Auflage"], "Aufl."],
};

const MODIFIER_DEFINITIONS: Readonly<
  Record<CitationModifierConcept, readonly [readonly string[], string]>
> = {
  COMPARE: [["vgl."], "vgl."],
  SEE: [["siehe", "s."], "siehe"],
  DIFFERENT_VIEW: [["a. A.", "a.A."], "a. A."],
  FURTHER_REFERENCES: [["m. w. N.", "mwN"], "m. w. N."],
  AGREEING: [["zust."], "zust."],
  CRITICAL: [["krit."], "krit."],
};

export function createDefaultAbbreviationPreferences(): CitationAbbreviationPreferences {
  return Object.fromEntries(
    Object.entries(ABBREVIATION_DEFINITIONS).map(([concept, [variants, preferredOutput]]) => [
      concept,
      {
        concept: concept as CitationAbbreviationConcept,
        recognizedVariants: [...variants],
        preferredOutput,
      },
    ])
  ) as CitationAbbreviationPreferences;
}

export function createDefaultModifierPreferences(): CitationModifierPreferences {
  return Object.fromEntries(
    Object.entries(MODIFIER_DEFINITIONS).map(([normalizedConcept, [variants, preferredOutput]]) => [
      normalizedConcept,
      {
        normalizedConcept: normalizedConcept as CitationModifierConcept,
        recognizedVariants: [...variants],
        preferredOutput,
      },
    ])
  ) as CitationModifierPreferences;
}

function matchesVariant(input: string, variants: readonly string[]): boolean {
  const normalizedInput = input.trim().toLocaleLowerCase("de-DE");
  return variants.some((variant) => variant.toLocaleLowerCase("de-DE") === normalizedInput);
}

export function recognizeCitationAbbreviation(
  input: string,
  preferences: CitationAbbreviationPreferences = createDefaultAbbreviationPreferences()
): AbbreviationPreference | undefined {
  return Object.values(preferences).find((preference) =>
    matchesVariant(input, preference.recognizedVariants)
  );
}

export function recognizeCitationModifier(
  input: string,
  preferences: CitationModifierPreferences = createDefaultModifierPreferences()
): CitationModifierPreference | undefined {
  return Object.values(preferences).find((preference) =>
    matchesVariant(input, preference.recognizedVariants)
  );
}
