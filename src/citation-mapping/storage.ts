/* global window */

import { createDefaultCitationSourceMapping } from "./default-mapping";
import type {
  CitationSourceMappingData,
  CitationSourceMappingStorage,
  CitationSourceMappingStorageResult,
} from "./types";
import {
  parseCitationSourceMapping,
  serializeCitationSourceMapping,
  validateCitationSourceMappingData,
} from "./validation";

export const CITATION_SOURCE_MAPPING_STORAGE_KEY = "footnoteChecker.citationSourceMapping.v1";

let inMemoryMappingJson: string | null = null;

function browserStorage(): CitationSourceMappingStorage | undefined {
  try {
    return typeof window !== "undefined" && "localStorage" in window
      ? window.localStorage
      : undefined;
  } catch {
    return undefined;
  }
}

function selectedStorage(
  storage: CitationSourceMappingStorage | null | undefined
): CitationSourceMappingStorage | undefined {
  return storage === undefined ? browserStorage() : (storage ?? undefined);
}

export function loadCitationSourceMapping(
  storage?: CitationSourceMappingStorage | null
): CitationSourceMappingData {
  const persistentStorage = selectedStorage(storage);
  let json: string | null = null;
  if (persistentStorage) {
    try {
      json = persistentStorage.getItem(CITATION_SOURCE_MAPPING_STORAGE_KEY) ?? inMemoryMappingJson;
    } catch {
      json = inMemoryMappingJson;
    }
  } else {
    json = inMemoryMappingJson;
  }
  return json ? parseCitationSourceMapping(json).data : createDefaultCitationSourceMapping();
}

export function saveCitationSourceMapping(
  data: CitationSourceMappingData,
  storage?: CitationSourceMappingStorage | null
): CitationSourceMappingStorageResult {
  const validation = validateCitationSourceMappingData(data);
  if (!validation.success) {
    return {
      success: false,
      usedMemoryFallback: false,
      error: validation.errors.join("; "),
    };
  }
  const json = serializeCitationSourceMapping(validation.data);
  const persistentStorage = selectedStorage(storage);
  if (persistentStorage) {
    try {
      persistentStorage.setItem(CITATION_SOURCE_MAPPING_STORAGE_KEY, json);
      inMemoryMappingJson = json;
      return { success: true, usedMemoryFallback: false };
    } catch (error) {
      inMemoryMappingJson = json;
      return {
        success: true,
        usedMemoryFallback: true,
        error: error instanceof Error ? error.message : "localStorage write failed",
      };
    }
  }
  inMemoryMappingJson = json;
  return { success: true, usedMemoryFallback: true };
}

export function resetCitationSourceMapping(
  storage?: CitationSourceMappingStorage | null
): CitationSourceMappingStorageResult {
  inMemoryMappingJson = null;
  const persistentStorage = selectedStorage(storage);
  if (persistentStorage) {
    try {
      persistentStorage.removeItem(CITATION_SOURCE_MAPPING_STORAGE_KEY);
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
