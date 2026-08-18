import { useCallback, useMemo, useState } from "react";
import { createCitationSourceMappingIndex } from "./resolver";
import {
  loadCitationSourceMapping,
  resetCitationSourceMapping,
  saveCitationSourceMapping,
} from "./storage";
import type { CitationSourceMappingData, CitationSourceMappingStorageResult } from "./types";

export function useCitationSourceMapping() {
  const [mappingData, setMappingData] = useState<CitationSourceMappingData>(() =>
    loadCitationSourceMapping()
  );
  const mappingIndex = useMemo(() => createCitationSourceMappingIndex(mappingData), [mappingData]);

  const updateMapping = useCallback((data: CitationSourceMappingData) => {
    const result = saveCitationSourceMapping(data);
    if (result.success) setMappingData(loadCitationSourceMapping());
    return result;
  }, []);

  const resetMapping = useCallback((): CitationSourceMappingStorageResult => {
    const result = resetCitationSourceMapping();
    setMappingData(loadCitationSourceMapping());
    return result;
  }, []);

  return { mappingData, mappingIndex, updateMapping, resetMapping };
}
