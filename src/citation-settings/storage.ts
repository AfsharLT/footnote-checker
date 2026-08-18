/* global window */

import { createDefaultCitationStyleProfile } from "./defaults";
import type {
  CitationStyleProfile,
  CitationStyleStorage,
  CitationStyleStorageResult,
} from "./types";
import {
  parseCitationStyleProfile,
  sanitizeCitationStyleProfile,
  serializeCitationStyleProfile,
} from "./validation";

export const CITATION_STYLE_PROFILE_STORAGE_KEY = "footnoteChecker.citationStyleProfile.v1";

let inMemoryProfileJson: string | null = null;

function browserStorage(): CitationStyleStorage | undefined {
  try {
    return typeof window !== "undefined" && "localStorage" in window
      ? window.localStorage
      : undefined;
  } catch {
    return undefined;
  }
}

function selectedStorage(
  storage: CitationStyleStorage | null | undefined
): CitationStyleStorage | undefined {
  return storage === undefined ? browserStorage() : (storage ?? undefined);
}

export function loadCitationStyleProfile(
  storage?: CitationStyleStorage | null
): CitationStyleProfile {
  let json: string | null = null;
  const persistentStorage = selectedStorage(storage);

  if (persistentStorage) {
    try {
      json = persistentStorage.getItem(CITATION_STYLE_PROFILE_STORAGE_KEY) ?? inMemoryProfileJson;
    } catch {
      json = inMemoryProfileJson;
    }
  } else {
    json = inMemoryProfileJson;
  }

  return json ? parseCitationStyleProfile(json).profile : createDefaultCitationStyleProfile();
}

export function saveCitationStyleProfile(
  profile: CitationStyleProfile,
  storage?: CitationStyleStorage | null
): CitationStyleStorageResult {
  const validation = sanitizeCitationStyleProfile(profile);
  if (!validation.success) {
    return {
      success: false,
      usedMemoryFallback: false,
      error: validation.errors.join("; "),
    };
  }

  const json = serializeCitationStyleProfile(validation.profile);
  const persistentStorage = selectedStorage(storage);
  if (persistentStorage) {
    try {
      persistentStorage.setItem(CITATION_STYLE_PROFILE_STORAGE_KEY, json);
      inMemoryProfileJson = json;
      return { success: true, usedMemoryFallback: false };
    } catch (error) {
      inMemoryProfileJson = json;
      return {
        success: true,
        usedMemoryFallback: true,
        error: error instanceof Error ? error.message : "localStorage write failed",
      };
    }
  }

  inMemoryProfileJson = json;
  return { success: true, usedMemoryFallback: true };
}

export function resetCitationStyleProfile(
  storage?: CitationStyleStorage | null
): CitationStyleStorageResult {
  const persistentStorage = selectedStorage(storage);
  inMemoryProfileJson = null;

  if (persistentStorage) {
    try {
      persistentStorage.removeItem(CITATION_STYLE_PROFILE_STORAGE_KEY);
      return { success: true, usedMemoryFallback: false };
    } catch (error) {
      return {
        success: true,
        usedMemoryFallback: true,
        error: error instanceof Error ? error.message : "localStorage reset failed",
      };
    }
  }

  return { success: true, usedMemoryFallback: true };
}
