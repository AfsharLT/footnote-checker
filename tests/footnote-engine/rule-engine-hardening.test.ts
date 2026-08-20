import type { CitationSourceMappingData } from "../../src/citation-mapping/types";
import {
  createCitationSourceMappingIndex,
  resolveCitationSegmentSources,
} from "../../src/citation-mapping/resolver";
import { analyzeFootnotes } from "../../src/footnote-engine/engine";
import { deriveEffectiveCitationClassification } from "../../src/footnote-engine/effective-classification";
import type { Finding } from "../../src/footnote-engine/types";
import type { FootnoteSnapshot, FormattingRun } from "../../src/taskpane/taskpane";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function snapshot(
  contentText: string,
  ordinal = 1,
  formattingRuns: FormattingRun[] = []
): FootnoteSnapshot {
  return {
    id: `hardening-${ordinal}`,
    ordinal,
    contentText,
    originalTextHash: `hardening-${ordinal}-${contentText.length}`,
    protectedRanges: [],
    paragraphs: [],
    formattingRuns,
  } as FootnoteSnapshot;
}

function byRule(findings: readonly Finding[], ruleId: string): Finding[] {
  return findings.filter((finding) => finding.ruleId === ruleId);
}

function assertFindingIntegrity(contentText: string, findings: readonly Finding[]): void {
  findings.forEach((finding) => {
    assert(
      Number.isInteger(finding.start) &&
        Number.isInteger(finding.end) &&
        finding.start >= 0 &&
        finding.start <= finding.end &&
        finding.end <= contentText.length,
      `Invalid finding offsets for ${finding.ruleId}`
    );
    assert(
      finding.originalText === contentText.slice(finding.start, finding.end),
      `Finding slice mismatch for ${finding.ruleId}`
    );
    if (finding.start === finding.end) {
      assert(finding.originalText === "", `Zero-length finding must have empty text`);
    }
  });
}

const commentaryMapping: CitationSourceMappingData = {
  schemaVersion: 1,
  sources: [
    {
      schemaVersion: 1,
      canonicalSourceId: "commentary-mueko-stgb",
      kind: "COMMENTARY",
      preferredName: "MüKoStGB",
      legalArea: "STGB",
      applicableCitationTypes: ["COMMENTARY"],
      active: true,
      personStructureHint: "WORK_THEN_BEARBEITER",
    },
    {
      schemaVersion: 1,
      canonicalSourceId: "commentary-grueneberg",
      kind: "COMMENTARY",
      preferredName: "Grüneberg",
      legalArea: "BGB",
      applicableCitationTypes: ["COMMENTARY"],
      active: true,
    },
  ],
  aliases: [
    {
      canonicalSourceId: "commentary-mueko-stgb",
      alias: "MüKo-StGB",
      matchMode: "CASE_INSENSITIVE_TEXT",
      wholeWord: true,
      active: true,
      legacySafetyLevel: "PROBABLE",
    },
    {
      canonicalSourceId: "commentary-grueneberg",
      alias: "Palandt",
      matchMode: "CASE_INSENSITIVE_TEXT",
      wholeWord: true,
      active: true,
      legacySafetyLevel: "UNCERTAIN",
    },
  ],
};

for (const malformed of ["BGHSt 47, 45 (49.", "NJW 2025, 1234 (1236.", "JuS 1988, 787 (788."]) {
  const finding = byRule(
    analyzeFootnotes([snapshot(malformed)]).findings,
    "CITATION_PINPOINT_BRACKETS"
  );
  assert(finding.length === 1, `Missing bracket finding for ${malformed}`);
  assert(
    finding[0].originalText === "" && finding[0].suggestedText === ")",
    "Bracket fix must be an insertion"
  );
}
for (const correct of ["BGHSt 47, 45 (49).", "Korte, NZWiSt 2018, 231 (233 f.)."]) {
  assert(
    byRule(analyzeFootnotes([snapshot(correct)]).findings, "CITATION_PINPOINT_BRACKETS").length ===
      0,
    `False bracket finding for ${correct}`
  );
}

const mueko = analyzeFootnotes([snapshot("MüKo-StGB/Fischer Rdnr. 4.")], {
  mappingData: commentaryMapping,
});
const muekoResolution = resolveCitationSegmentSources(
  mueko.parseResults[0].segments[0],
  createCitationSourceMappingIndex(commentaryMapping)
)[0]?.resolution;
assert(
  muekoResolution?.status === "MATCHED" &&
    muekoResolution.canonicalSourceId === "commentary-mueko-stgb",
  "MüKo prefix must map to MüKoStGB"
);
assert(
  mueko.parseResults[0].segments[0].classification.type === "OTHER" &&
    mueko.segmentAnalyses[0].effectiveClassification.effectiveType === "COMMENTARY" &&
    mueko.segmentAnalyses[0].effectiveClassification.source === "SOURCE_MAPPING",
  "MüKo fallback must retain parser OTHER and derive effective COMMENTARY"
);
assert(
  muekoResolution.matchedRange !== undefined &&
    "MüKo-StGB/Fischer Rdnr. 4.".slice(
      muekoResolution.matchedRange.start,
      muekoResolution.matchedRange.end
    ) === muekoResolution.matchedText,
  "Commentary prefix mapping must expose exact absolute offsets"
);
const muekoFindings = mueko.findings;
assertFindingIntegrity("MüKo-StGB/Fischer Rdnr. 4.", muekoFindings);
assert(
  byRule(muekoFindings, "COMMENTARY_WORK_NAME")[0]?.originalText === "MüKo-StGB" &&
    byRule(muekoFindings, "COMMENTARY_WORK_NAME")[0]?.suggestedText === "MüKoStGB",
  "Mapped OTHER commentary must also normalize its work name"
);
assert(
  byRule(muekoFindings, "CITATION_OTHER_REVIEW").length === 0,
  "Mapped MüKo prefix must suppress OTHER review"
);
assert(
  byRule(muekoFindings, "COMMENTARY_MARGIN_NUMBER_ABBREVIATION")[0]?.suggestedText === "Rn. 4",
  "Mapped OTHER commentary must normalize Rdnr."
);
assert(muekoFindings.length >= 2, "Independent MüKo findings must coexist");
assert(
  muekoFindings.length === 2 && byRule(muekoFindings, "RULE_OUTPUT_INVALID").length === 0,
  "MüKo fallback must produce exactly two domain findings and no technical error"
);

const normalMueko = analyzeFootnotes([snapshot("MüKo-StGB/Regge/Pegel, § 185 Rn. 39.")], {
  mappingData: commentaryMapping,
});
const normalMuekoSegment = normalMueko.parseResults[0].segments[0];
const normalMuekoMapping = resolveCitationSegmentSources(
  normalMuekoSegment,
  createCitationSourceMappingIndex(commentaryMapping)
)[0]?.resolution;
const normalMuekoEffective = deriveEffectiveCitationClassification(
  normalMuekoSegment,
  normalMuekoMapping
);
assert(
  normalMuekoSegment.classification.type === "COMMENTARY" &&
    normalMuekoEffective.effectiveType === "COMMENTARY" &&
    normalMuekoEffective.source === "PARSER",
  "Normal MüKo citation must remain parser-driven COMMENTARY"
);
assert(
  byRule(normalMueko.findings, "COMMENTARY_WORK_NAME").length === 1 &&
    byRule(normalMueko.findings, "CITATION_OTHER_REVIEW").length === 0,
  "Normal MüKo behavior must remain unchanged"
);
assertFindingIntegrity("MüKo-StGB/Regge/Pegel, § 185 Rn. 39.", normalMueko.findings);
assert(
  byRule(normalMueko.findings, "RULE_OUTPUT_INVALID").length === 0,
  "Normal MüKo citation must not create a technical error"
);

const palandtResult = analyzeFootnotes([snapshot("Palandt/Reiter § 464 BGB Rn. 2.")], {
  mappingData: commentaryMapping,
});
const palandtResolution = resolveCitationSegmentSources(
  palandtResult.parseResults[0].segments[0],
  createCitationSourceMappingIndex(commentaryMapping)
)[0]?.resolution;
assert(
  palandtResolution?.status === "MATCHED" &&
    palandtResolution.canonicalSourceId === "commentary-grueneberg" &&
    palandtResolution.legacySafetyLevel === "UNCERTAIN",
  "Palandt prefix must map conservatively to Grüneberg"
);
assert(
  deriveEffectiveCitationClassification(
    palandtResult.parseResults[0].segments[0],
    palandtResolution
  ).effectiveType === "COMMENTARY",
  "Palandt must be an effective commentary while parser type remains OTHER"
);
const palandt = palandtResult.findings;
assertFindingIntegrity("Palandt/Reiter § 464 BGB Rn. 2.", palandt);
assert(
  byRule(palandt, "SOURCE_MAPPING_LEGACY_UNCERTAIN").length === 1,
  "Palandt must retain UNCERTAIN legacy hint"
);
assert(
  byRule(palandt, "CITATION_OTHER_REVIEW").length === 0,
  "Mapped Palandt prefix must suppress OTHER review"
);
assert(
  !palandt.some((finding) => finding.suggestedText === "Grüneberg"),
  "UNCERTAIN prefix must not force a source name"
);
assert(
  byRule(palandt, "COMMENTARY_WORK_NAME").length === 0,
  "UNCERTAIN prefix must not create a hard work-name finding"
);
assert(
  palandt.length === 1 &&
    byRule(palandt, "RULE_OUTPUT_INVALID").length === 0 &&
    byRule(palandt, "COMMENTARY_MARGIN_NUMBER_ABBREVIATION").length === 0,
  "Palandt must produce exactly the conservative legacy hint"
);

const ambiguousCommentaryMapping: CitationSourceMappingData = {
  ...commentaryMapping,
  sources: [
    ...commentaryMapping.sources,
    {
      schemaVersion: 1,
      canonicalSourceId: "commentary-second-mueko",
      kind: "COMMENTARY",
      preferredName: "Zweitwerk",
      legalArea: "STGB",
      applicableCitationTypes: ["COMMENTARY"],
      active: true,
    },
  ],
  aliases: [
    ...commentaryMapping.aliases,
    {
      canonicalSourceId: "commentary-second-mueko",
      alias: "MüKo-StGB",
      matchMode: "CASE_INSENSITIVE_TEXT",
      wholeWord: true,
      active: true,
    },
  ],
};
const ambiguousCommentary = analyzeFootnotes([snapshot("MüKo-StGB/Fischer Rdnr. 4.")], {
  mappingData: ambiguousCommentaryMapping,
});
const ambiguousSegment = ambiguousCommentary.parseResults[0].segments[0];
const ambiguousResolution = resolveCitationSegmentSources(
  ambiguousSegment,
  createCitationSourceMappingIndex(ambiguousCommentaryMapping)
)[0]?.resolution;
assert(
  ambiguousResolution?.status === "AMBIGUOUS" &&
    deriveEffectiveCitationClassification(ambiguousSegment, ambiguousResolution).effectiveType ===
      "OTHER",
  "Ambiguous prefix must not override parser OTHER"
);
assert(
  byRule(ambiguousCommentary.findings, "SOURCE_MAPPING_AMBIGUOUS").length === 1 &&
    byRule(ambiguousCommentary.findings, "COMMENTARY_WORK_NAME").length === 0,
  "Ambiguous prefix must not trigger commentary name replacement"
);

const threeIssueText = "MüKo-StGB/Regge/Pegel, § 185 Rdnr. 39.";
const threeIssueFindings = analyzeFootnotes(
  [
    snapshot(threeIssueText, 1, [
      {
        start: 0,
        end: threeIssueText.length,
        italic: false,
        bold: false,
        underline: "None",
      },
    ]),
  ],
  { mappingData: commentaryMapping }
).findings;
assertFindingIntegrity(threeIssueText, threeIssueFindings);
assert(
  byRule(threeIssueFindings, "COMMENTARY_WORK_NAME").length === 1 &&
    byRule(threeIssueFindings, "COMMENTARY_MARGIN_NUMBER_ABBREVIATION").length === 1 &&
    byRule(threeIssueFindings, "COMMENTARY_FORMATTING").length >= 1,
  "Work name, margin number and formatting findings must coexist"
);
assert(
  byRule(threeIssueFindings, "RULE_OUTPUT_INVALID").length === 0,
  "Three independent findings must not create a technical error"
);

const nonZeroStartText = " MüKo-StGB/Fischer Rdnr. 4.";
const nonZeroStartFirst = analyzeFootnotes([snapshot(nonZeroStartText)], {
  mappingData: commentaryMapping,
});
const nonZeroStartSecond = analyzeFootnotes([snapshot(nonZeroStartText)], {
  mappingData: commentaryMapping,
});
const nonZeroStartFindings = nonZeroStartFirst.findings;
assert(nonZeroStartFirst.parseResults[0].segments[0].start === 1, "Test requires segment start 1");
assertFindingIntegrity(nonZeroStartText, nonZeroStartFindings);
assert(
  byRule(nonZeroStartFindings, "COMMENTARY_WORK_NAME")[0]?.start === 1 &&
    byRule(nonZeroStartFindings, "COMMENTARY_MARGIN_NUMBER_ABBREVIATION").length === 1 &&
    byRule(nonZeroStartFindings, "RULE_OUTPUT_INVALID").length === 0,
  "Fallback findings must use absolute contentText offsets when segment start is non-zero"
);
assert(
  nonZeroStartFindings.map((finding) => finding.findingId).join("|") ===
    nonZeroStartSecond.findings.map((finding) => finding.findingId).join("|"),
  "Finding IDs must be deterministic"
);

const integrityCorpus = [
  snapshot("MüKo-StGB/Fischer Rdnr. 4.", 101),
  snapshot("MüKo-StGB/Regge/Pegel, § 185 Rn. 39.", 102),
  snapshot("Palandt/Reiter § 464 BGB Rn. 2.", 103),
  snapshot(nonZeroStartText, 104),
];
const integrityFirst = analyzeFootnotes(integrityCorpus, { mappingData: commentaryMapping });
const integritySecond = analyzeFootnotes(integrityCorpus, { mappingData: commentaryMapping });
const contentByFootnoteId = new Map(
  integrityCorpus.map((footnote) => [footnote.id, footnote.contentText])
);
integrityFirst.findings.forEach((finding) =>
  assertFindingIntegrity(contentByFootnoteId.get(finding.footnoteId) ?? "", [finding])
);
assert(
  integrityFirst.findings.map((finding) => finding.findingId).join("|") ===
    integritySecond.findings.map((finding) => finding.findingId).join("|"),
  "All corpus finding IDs must be deterministic"
);

function reportMapping(
  duplicateMarker = false,
  preferredCitationText?: string
): CitationSourceMappingData {
  const sources: CitationSourceMappingData["sources"] = [
    {
      schemaVersion: 1,
      canonicalSourceId: "report-gabriel-digitale-plattformen-16",
      kind: "REPORT",
      preferredName: "Gabriel – Digitale Plattformen – Forschungsbericht Nr. 16",
      ...(preferredCitationText ? { preferredCitationText } : {}),
      legalArea: "GENERAL",
      applicableCitationTypes: ["OTHER"],
      active: true,
    },
  ];
  const aliases: CitationSourceMappingData["aliases"] = [
    {
      canonicalSourceId: sources[0].canonicalSourceId,
      alias: "Forschungsbericht Nr. 16",
      matchMode: "WHOLE_WORD_MARKER",
      wholeWord: true,
      active: true,
    },
  ];
  if (duplicateMarker) {
    sources.push({
      schemaVersion: 1,
      canonicalSourceId: "report-conflict",
      kind: "REPORT",
      preferredName: "Konfliktbericht",
      legalArea: "GENERAL",
      applicableCitationTypes: ["OTHER"],
      active: true,
    });
    aliases.push({ ...aliases[0], canonicalSourceId: "report-conflict" });
  }
  return { schemaVersion: 1, sources, aliases };
}

const variantA =
  "Gabriel, Digitale Plattformen: Grundlagen und Erscheinungsformen, Forschungsbericht Nr. 16, S. 40.";
const variantB =
  "Forschungsbericht Nr. 16, Gabriel, Digitale Plattformen: Grundlagen und Erscheinungsformen, S. 40.";
const customMapping = reportMapping();
const customResult = analyzeFootnotes([snapshot(variantA, 1), snapshot(variantB, 2)], {
  mappingData: customMapping,
});
const customResolutions = customResult.parseResults.flatMap((result) =>
  result.segments.flatMap((segment) =>
    resolveCitationSegmentSources(segment, createCitationSourceMappingIndex(customMapping))
  )
);
assert(
  customResolutions.length === 2 &&
    customResolutions.every(
      ({ resolution }) =>
        resolution.status === "MATCHED" &&
        resolution.canonicalSourceId === "report-gabriel-digitale-plattformen-16"
    ),
  "Both report variants must map to the same canonical source"
);
const custom = customResult.findings;
assert(
  byRule(custom, "CITATION_OTHER_REVIEW").length === 0,
  "Matched report markers must suppress OTHER review"
);
assert(
  byRule(custom, "SOURCE_CITATION_VARIANT_CONSISTENCY").length === 1,
  "Report variants must be compared by canonical source id"
);

const ambiguous = analyzeFootnotes([snapshot(variantA)], {
  mappingData: reportMapping(true),
}).findings;
assert(
  byRule(ambiguous, "SOURCE_MAPPING_AMBIGUOUS").length === 1,
  "Conflicting marker must be ambiguous"
);
assert(
  byRule(ambiguous, "CITATION_OTHER_REVIEW").length === 1,
  "Ambiguous source must retain review info"
);

const preferred = analyzeFootnotes([snapshot(variantB)], {
  mappingData: reportMapping(false, variantA),
}).findings;
assert(
  byRule(preferred, "CUSTOM_SOURCE_PREFERRED_CITATION")[0]?.suggestedText === variantA,
  "Preferred full citation must produce a warning suggestion"
);

console.log("POC 11.1/11.2/11.3 hardening tests passed");
