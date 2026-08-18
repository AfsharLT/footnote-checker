import { useCallback, useState } from "react";
import {
  loadCitationStyleProfile,
  resetCitationStyleProfile,
  saveCitationStyleProfile,
} from "./storage";
import type { CitationStyleProfile, CitationStyleStorageResult } from "./types";

export interface CitationSettingsState {
  activeProfile: CitationStyleProfile;
  updateProfile(profile: CitationStyleProfile): CitationStyleStorageResult;
  resetProfile(): CitationStyleStorageResult;
}

export function useCitationSettings(): CitationSettingsState {
  const [activeProfile, setActiveProfile] = useState<CitationStyleProfile>(() =>
    loadCitationStyleProfile()
  );

  const updateProfile = useCallback((profile: CitationStyleProfile) => {
    const result = saveCitationStyleProfile(profile);
    if (result.success) setActiveProfile(loadCitationStyleProfile());
    return result;
  }, []);

  const resetProfile = useCallback(() => {
    const result = resetCitationStyleProfile();
    setActiveProfile(loadCitationStyleProfile());
    return result;
  }, []);

  return { activeProfile, updateProfile, resetProfile };
}
