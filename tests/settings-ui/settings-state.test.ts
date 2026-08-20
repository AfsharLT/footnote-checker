import { createDefaultCitationStyleProfile } from "../../src/citation-settings/defaults";
import {
  loadCitationStyleProfile,
  resetCitationStyleProfile,
  saveCitationStyleProfile,
} from "../../src/citation-settings/storage";
import type { CitationStyleStorage } from "../../src/citation-settings/types";
import {
  parseCitationStyleProfile,
  serializeCitationStyleProfile,
} from "../../src/citation-settings/validation";
import {
  addAbbreviationVariant,
  addModifierVariant,
  cloneCitationStyleProfile,
  createDefaultSettingsWorkingCopy,
  hasUnsavedChanges,
  removeAbbreviationVariant,
  validateSettingsWorkingCopy,
} from "../../src/settings-ui/state";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class TestStorage implements CitationStyleStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const saved = createDefaultCitationStyleProfile();
const working = cloneCitationStyleProfile(saved);
assert(!hasUnsavedChanges(working, saved), "Fresh working copy must be clean");
working.caseLaw.decisionTypeOutput.JUDGMENT = "U.";
assert(hasUnsavedChanges(working, saved), "Editing the working copy must set dirty state");
assert(
  saved.caseLaw.decisionTypeOutput.JUDGMENT === "Urt.",
  "Working copy must not mutate saved data"
);
assert(
  !hasUnsavedChanges(
    saved,
    parseCitationStyleProfile(serializeCitationStyleProfile(saved)).profile
  ),
  "Property order after persistence must not create a false dirty state"
);

let activeSection = "GENERAL";
activeSection = "CASE_LAW";
activeSection = "FORMATTING";
assert(activeSection === "FORMATTING", "Navigation state mismatch");
assert(
  working.caseLaw.decisionTypeOutput.JUDGMENT === "U.",
  "Navigation must not reload the working copy"
);

const storage = new TestStorage();
assert(saveCitationStyleProfile(working, storage).success, "Working copy must save");
assert(
  loadCitationStyleProfile(storage).caseLaw.decisionTypeOutput.JUDGMENT === "U.",
  "Saved setting must survive reload"
);
const discarded = cloneCitationStyleProfile(loadCitationStyleProfile(storage));
assert(
  !hasUnsavedChanges(discarded, loadCitationStyleProfile(storage)),
  "Discard must restore saved state"
);

const resetWorking = createDefaultSettingsWorkingCopy();
assert(resetWorking.caseLaw.decisionTypeOutput.JUDGMENT === "Urt.", "Reset working copy mismatch");
assert(
  loadCitationStyleProfile(storage).caseLaw.decisionTypeOutput.JUDGMENT === "U.",
  "Reset working copy must not persist before save"
);
resetCitationStyleProfile(storage);
assert(
  loadCitationStyleProfile(storage).caseLaw.decisionTypeOutput.JUDGMENT === "Urt.",
  "Persistent reset must restore default"
);

const preferred = cloneCitationStyleProfile(saved);
preferred.abbreviations.JUDGMENT.preferredOutput = "U.";
assert(
  validateSettingsWorkingCopy(preferred).length === 0,
  "Preferred abbreviation output must be editable"
);
const added = addAbbreviationVariant(preferred, "JUDGMENT", "Judg.");
assert(added.success, "Recognized abbreviation variant must be addable");
assert(
  !addAbbreviationVariant(added.value, "JUDGMENT", " judg. ").success,
  "Normalized duplicate abbreviation variant must be rejected"
);
assert(
  !addAbbreviationVariant(added.value, "JUDGMENT", "   ").success,
  "Empty abbreviation variant must be rejected"
);
const removed = removeAbbreviationVariant(
  added.value,
  "JUDGMENT",
  added.value.abbreviations.JUDGMENT.recognizedVariants.length - 1
);
assert(
  !removed.abbreviations.JUDGMENT.recognizedVariants.includes("Judg."),
  "Abbreviation variant must be removable"
);
assert(
  saved.abbreviations.FOLLOWING.preferredOutput === "f." &&
    saved.abbreviations.FOLLOWING_MULTIPLE.preferredOutput === "ff.",
  "f. and ff. must remain separate abbreviation concepts"
);
assert(
  addModifierVariant(saved, "COMPARE", "vergleichend").success,
  "Modifier variants must be edited separately"
);
const invalid = cloneCitationStyleProfile(saved);
invalid.abbreviations.ORDER.preferredOutput = "";
assert(
  validateSettingsWorkingCopy(invalid).some((error) => error.includes("ORDER")),
  "Empty required abbreviation output must be rejected"
);
