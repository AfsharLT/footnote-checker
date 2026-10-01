import { createDefaultCitationStyleProfile } from "../../src/citation-settings/defaults";
import {
  CITATION_STYLE_PROFILE_STORAGE_KEY,
  loadCitationStyleProfile,
  resetCitationStyleProfile,
  saveCitationStyleProfile,
} from "../../src/citation-settings/storage";
import type { CitationStyleStorage } from "../../src/citation-settings/types";
import {
  parseCitationStyleProfile,
  serializeCitationStyleProfile,
} from "../../src/citation-settings/validation";

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

const storage = new TestStorage();
assert(loadCitationStyleProfile(storage).id === "default-de-legal", "Missing storage must default");

const customized = createDefaultCitationStyleProfile();
customized.name = "Local profile";
customized.caseLaw.decisionTypeOutput.JUDGMENT = "Urteil";
customized.global.autoCloseInactiveFootnotes = false;
assert(saveCitationStyleProfile(customized, storage).success, "Valid profile must save");
const loaded = loadCitationStyleProfile(storage);
assert(loaded.name === "Local profile", "Saved name must load");
assert(loaded.caseLaw.decisionTypeOutput.JUDGMENT === "Urteil", "Saved setting must load");
assert(
  loaded.global.autoCloseInactiveFootnotes === false,
  "Accordion preference must persist through the existing settings storage"
);

storage.setItem(CITATION_STYLE_PROFILE_STORAGE_KEY, "{broken");
assert(loadCitationStyleProfile(storage).id === "default-de-legal", "Corrupt JSON must default");

storage.setItem(
  CITATION_STYLE_PROFILE_STORAGE_KEY,
  JSON.stringify({ schemaVersion: 99, id: "future", name: "Future" })
);
assert(loadCitationStyleProfile(storage).schemaVersion === 1, "Future schema must default");

storage.setItem(
  CITATION_STYLE_PROFILE_STORAGE_KEY,
  JSON.stringify({
    schemaVersion: 1,
    id: "partial",
    name: "Partial",
    statute: { paragraphStyle: "invalid-value" },
    caseLaw: { dateFormat: "invalid-date" },
    unknownProperty: "ignored",
  })
);
const sanitized = loadCitationStyleProfile(storage);
assert(sanitized.name === "Partial", "Valid partial values must survive");
assert(sanitized.statute.paragraphStyle === "abbreviation", "Invalid enum must default");
assert(sanitized.caseLaw.dateFormat === "DD.MM.YYYY", "Invalid date enum must default");
assert(sanitized.commentary.marginNumberAbbreviation === "Rn.", "Missing fields must default");
assert(
  sanitized.global.autoCloseInactiveFootnotes === true,
  "Older profiles without the accordion preference must migrate to the ON default"
);

saveCitationStyleProfile(customized, storage);
resetCitationStyleProfile(storage);
assert(loadCitationStyleProfile(storage).id === "default-de-legal", "Reset must restore default");

resetCitationStyleProfile(null);
const memoryProfile = createDefaultCitationStyleProfile();
memoryProfile.name = "Session profile";
const memorySave = saveCitationStyleProfile(memoryProfile, null);
assert(memorySave.success && memorySave.usedMemoryFallback, "Unavailable storage must use memory");
assert(loadCitationStyleProfile(null).name === "Session profile", "Memory profile must load");
resetCitationStyleProfile(null);

const failingStorage: CitationStyleStorage = {
  getItem: () => {
    throw new Error("read unavailable");
  },
  setItem: () => {
    throw new Error("write unavailable");
  },
  removeItem: () => {
    throw new Error("reset unavailable");
  },
};
const fallbackProfile = createDefaultCitationStyleProfile();
fallbackProfile.name = "Fallback after failure";
const fallbackSave = saveCitationStyleProfile(fallbackProfile, failingStorage);
assert(fallbackSave.success && fallbackSave.usedMemoryFallback, "Write failure must use memory");
assert(
  loadCitationStyleProfile(failingStorage).name === "Fallback after failure",
  "Read failure must use session memory"
);
resetCitationStyleProfile(null);

const serialized = serializeCitationStyleProfile(customized);
const parsed = parseCitationStyleProfile(serialized);
assert(parsed.success, "Serialized profile must parse");
assert(
  serializeCitationStyleProfile(parsed.profile) === serializeCitationStyleProfile(customized),
  "Serialization round-trip must preserve the semantic profile"
);
assert(
  !parseCitationStyleProfile("not json").success,
  "Invalid JSON must report validation failure"
);
