import assert from "node:assert/strict";
import { compileStructuredAlias } from "../../src/citation-mapping/structured-alias";
import { readFileSync } from "node:fs";
import { analyzeFootnotes, analyzeFootnotesAsync } from "../../src/footnote-engine/engine";
import { createDefaultCitationStyleProfile } from "../../src/citation-settings/defaults";
import {
  createDefaultCitationSourceMapping,
  mergeBuiltInCitationSourceAdditions,
} from "../../src/citation-mapping/default-mapping";
import {
  parseCitationSourceMappingCsv,
  exportCitationSourceMappingCsv,
} from "../../src/citation-mapping/normalized-csv";
import { parseCitationSourceMapping } from "../../src/citation-mapping/validation";
import {
  addCitationSource,
  DEFAULT_MAPPING_FILTERS,
  filterCitationSources,
} from "../../src/settings-ui/state";
import { hashFootnoteContentText, type FootnoteSnapshot } from "../../src/taskpane/taskpane";
const corpus = JSON.parse(
  readFileSync(new URL("../fixtures/poc-17-7-real-footnotes.json", import.meta.url), "utf8")
);
const snapshot = (text: string, ordinal = 1) =>
  ({
    id: `closure-${ordinal}`,
    ordinal,
    contentText: text,
    originalTextHash: hashFootnoteContentText(text),
    paragraphs: [{ index: 0, start: 0, end: text.length }],
    protectedRanges: [],
    formattingRuns: [],
  }) as FootnoteSnapshot;

const compoundWork = compileStructuredAlias("Spindler/Schuster/Kaesling/{Bearbeiter}")!.match(
  "Spindler/Schuster/Kaesling/Volkmann, Art. 3 DSA Rn. 13."
)!;
assert.equal(compoundWork.workText, "Spindler/Schuster/Kaesling");
assert.equal(compoundWork.bearbeiterText, "Volkmann");
const repeatedPerson = "Lackner/Kühl/Heger/Heger-StGB, § 73 Rn. 11.";
const duplicateName = compileStructuredAlias("Lackner/Kühl/Heger/{Bearbeiter}-StGB")!.match(
  repeatedPerson
)!;
assert.equal(duplicateName.bearbeiterStart, repeatedPerson.lastIndexOf("Heger"));
assert.equal(duplicateName.workText, "Lackner/Kühl/Heger");
const profile = createDefaultCitationStyleProfile();
assert.equal(profile.bookChapter.pinpointStyle, "parentheses");
const analyze = (text: string) => analyzeFootnotes([snapshot(text)], { profile });
for (const text of [
  "vgl. Fischer, StGB, § 32 Rn. 1.",
  "s. Fischer, StGB, § 32 Rn. 1.",
  "a.A. BGH NJW 2025, 1234 (1236).",
]) {
  const replacements = analyze(text).findings.filter((f) => f.start === 0 && f.suggestedText);
  assert.equal(replacements.length, 1, "Identical rule outputs must produce one write-back target");
  assert.ok(Array.isArray(replacements[0].metadata?.contributingRuleIds));
  assert.equal((replacements[0].metadata.contributingRuleIds as string[]).length, 2);
}

for (const text of ["Hruschka JuS 1979, 385 388 ff.", "Joerden, GA 1991, 411. 414 ff."]) {
  const r = analyze(text);
  assert.ok(
    r.findings.some(
      (f) => f.ruleId === "JOURNAL_PINPOINT_STYLE" && f.metadata?.requiresManualReview
    )
  );
  const extraction = r.parseResults[0].segments[0].extraction;
  assert.equal(extraction.type, "JOURNAL_ARTICLE");
  if (extraction.type === "JOURNAL_ARTICLE")
    assert.equal(extraction.data.authors[0].rawText, text.split(/[, ]/)[0]);
}
for (const text of [
  "Hassemer, Festschrift für Bockelmann, 1979, S. 225, 239\u2009ff.",
  "Hruschka, Festschrift für Dreher, 1977, S. 189, 198\u202fff.",
  "Pawlik, Jahrbuch für Recht und Ethik 2003, 287, 313",
  "Neumann, Festschrift für Roxin, (Anm. 35), S. 421, 437",
  "Pawlik, Jahrbuch für Recht und Ethik 2014, S. 137, 152 ff. geht dahin, den Eingriffsadressaten zu verpflichten.",
]) {
  const result = analyze(text);
  const findings = result.findings.filter((f) => f.ruleId === "CONTRIBUTION_PINPOINT_STYLE");
  assert.equal(findings.length, 1, text);
  const f = findings[0];
  assert.equal(f.originalText, text.slice(f.start, f.end));
  const corrected = text.slice(0, f.start) + f.suggestedText + text.slice(f.end);
  assert.equal(
    analyze(corrected).findings.filter((f) => f.ruleId === "CONTRIBUTION_PINPOINT_STYLE").length,
    0,
    corrected
  );
  const comma = createDefaultCitationStyleProfile();
  comma.bookChapter.pinpointStyle = "comma";
  assert.equal(
    analyzeFootnotes([snapshot(text)], { profile: comma }).findings.filter(
      (f) => f.ruleId === "CONTRIBUTION_PINPOINT_STYLE"
    ).length,
    0
  );
}
for (const text of [
  "Hassemer, Festschrift für Bockelmann, 1979, S. 225, 239x ff.",
  "Hassemer, Festschrift für Bockelmann, 1979, S. 225",
  "Hassemer, Festschrift für Bockelmann, 1979, S. 225 (239 ff.)",
])
  assert.equal(
    analyze(text).findings.filter((f) => f.ruleId === "CONTRIBUTION_PINPOINT_STYLE").length,
    0
  );
for (const text of [
  "Ackermann, NZKart 2025, 286 (291).",
  "Wimmer, PStR 2022, 38 (41).",
  "Pananis, StraFo 2020, 439 (440 f.).",
  "Braguinski, MMR 2025, 602 (606).",
  "BGH GRUR 2010, 616.",
  "BGH, NJW-RR 2009, 1413",
  "Zu einer möglichen Beihilfestrafbarkeit Strafbarkeit vgl. Braguinski, MMR 2025, 602 (606).",
  "EuGH, Urt. v. 28.02.2023 – C‑695/20.",
  "Parker/Van Alystne/Choudary, Die Plattform-Revolution, S. 126 ff.",
  "Nussbaum, Die strafrechtliche Verantwortlichkeit von Anbietern (innerhalb) sozialer Netzwerke, 2025.",
  "Hoeren/Sieber/Holznagel MMR-HdB/Martini/Ruschemeier, Teil 29.6 Rn. 55.",
])
  assert.notEqual(analyze(text).parseResults[0].segments[0].extraction.type, "OTHER", text);
for (const text of [
  "Roxin, in: ZStW 93 (1981), S. 68, 70\u2009ff.",
  "vgl. zum Selbsterhaltungsinteresse der Gesellschaft: Weigend, in: ZStW 98 (1986), S. 44, 62 f.",
  "Pars pro: Jansen, in: ZStW 137 (2025), S. 908, 928 ff.",
  "Weigend, in: ZStW 98 (1986), S. 44, 62 f.",
  "Jansen, in: ZStW 137 (2025), S. 908, 928 ff.",
]) {
  const result = analyze(text);
  assert.equal(result.parseResults[0].segments[0].extraction.type, "JOURNAL_ARTICLE", text);
  const finding = result.findings.find((f) => f.ruleId === "JOURNAL_PINPOINT_STYLE");
  assert.ok(finding, text);
  assert.ok(!result.findings.some((f) => f.ruleId === "BOOK_CHAPTER_PINPOINT_STYLE"));
  const corrected = text.slice(0, finding.start) + finding.suggestedText + text.slice(finding.end);
  assert.ok(!corrected.includes("(S."), corrected);
  assert.equal(
    analyze(corrected).findings.filter((f) => f.ruleId === "JOURNAL_PINPOINT_STYLE").length,
    0
  );
}
for (const text of [
  "Erwägungsgrund 29 DSA.",
  "Richtlinie 2010/13/EU über audiovisuelle Mediendienste.",
])
  assert.ok(
    analyze(text).findings.some((f) => f.ruleId === "CITATION_OTHER_REVIEW"),
    "Unsupported legal source must remain visible: " + text
  );
for (const text of [
  "TK-StGB/Eser/Schuster, § 73 Rn. 7.",
  "SK-StGB/Golla/Wolters, § 73b Rn. 5.",
  "Hornung/Schallbruch IT-Sicherheitsrecht/Spindler, Teil 3 Rn. 19.",
  "Hoeren/Sieber/Holznagel MMR-HdB/Martini/Ruschemeier, Teil 29.6 Rn. 55.",
]) {
  const n = snapshot(text);
  n.formattingRuns = [
    { start: 0, end: text.length, italic: false, fontName: "Aptos Serif" },
    {
      start: text.includes("recht/")
        ? text.indexOf("recht/") + 6
        : text.includes("HdB/")
          ? text.indexOf("HdB/") + 4
          : text.indexOf("/") + 1,
      end: text.indexOf(","),
      italic: true,
      fontName: "Aptos Serif",
    },
  ];
  const result = analyzeFootnotes([n], { profile });
  assert.ok(!result.findings.some((f) => f.ruleId === "FORMAT_ITALIC_REVIEW"), text);
}
const malformed = analyze("Schmidhäuser, GA 1991, 97v(112 ff.)").findings.find(
  (f) => f.ruleId === "JOURNAL_PINPOINT_STYLE"
);
assert.ok(malformed?.metadata?.requiresManualReview && !malformed.suggestedText);
const spacing = snapshot("Wimmer, PStR 2022, 38 (41). ");
spacing.formattingRuns = [
  { start: 0, end: spacing.contentText.length - 1, fontName: "Aptos Serif" },
  { start: spacing.contentText.length - 1, end: spacing.contentText.length, fontName: "Arial" },
];
assert.ok(
  !analyzeFootnotes([spacing], { profile }).findings.some((f) => f.ruleId === "FORMAT_FONT_NAME")
);
const mapping = createDefaultCitationSourceMapping();
assert.equal(
  filterCitationSources(mapping, { ...DEFAULT_MAPPING_FILTERS, kind: "FESTSCHRIFT" }).length,
  7
);
const parsed = parseCitationSourceMapping(JSON.stringify(mapping));
assert.ok(parsed.success);
const roundTrip = parseCitationSourceMappingCsv(exportCitationSourceMappingCsv(mapping));
assert.ok(roundTrip.success, JSON.stringify(roundTrip.errors));
assert.equal(roundTrip.data.sources.filter((s) => s.kind === "FESTSCHRIFT").length, 7);
const added = addCitationSource(mapping, {
  preferredName: "Test Festschrift",
  kind: "FESTSCHRIFT",
  legalArea: "STRAFRECHT",
});
assert.ok(added.success);
assert.deepEqual(added.value.sources[added.value.sources.length - 1]?.applicableCitationTypes, [
  "FESTSCHRIFT_CONTRIBUTION",
]);
const old = {
  ...mapping,
  sources: mapping.sources.map((s) =>
    s.kind === "FESTSCHRIFT" ? { ...s, kind: "BOOK" as const } : s
  ),
};
assert.equal(
  mergeBuiltInCitationSourceAdditions(old).sources.filter((s) => s.kind === "FESTSCHRIFT").length,
  7
);
const persistedOld = parseCitationSourceMapping(JSON.stringify(old));
assert.ok(persistedOld.success);
assert.equal(
  mergeBuiltInCitationSourceAdditions(persistedOld.data).sources.filter(
    (s) => s.kind === "FESTSCHRIFT"
  ).length,
  7
);
assert.deepEqual(
  parsed.data.sources.find((s) => s.kind === "FESTSCHRIFT")?.applicableCitationTypes,
  ["FESTSCHRIFT_CONTRIBUTION"]
);
const ownOld = {
  ...old,
  sources: old.sources.map((s) => ({ ...s, sourceOrigin: "USER" as const })),
};
assert.equal(
  mergeBuiltInCitationSourceAdditions(ownOld).sources.filter(
    (s) => s.canonicalSourceId.startsWith("festschrift-") && s.kind === "BOOK"
  ).length,
  7
);
for (const group of [corpus.small, corpus.largeUnique]) {
  const notes = group.map((n: { text: string }, i: number) => snapshot(n.text, i + 1));
  const result = analyzeFootnotes(notes, { profile });
  assert.equal(result.parseResults.length, notes.length);
  const byId = new Map(notes.map((n: FootnoteSnapshot) => [n.id, n.contentText]));
  for (const f of result.findings) {
    const text = byId.get(f.footnoteId) as string;
    assert.ok(f.start >= 0 && f.end <= text.length);
    assert.equal(f.originalText, text.slice(f.start, f.end), f.ruleId);
  }
  for (const p of result.parseResults)
    for (const s of p.segments) {
      if (
        s.extraction.type === "FESTSCHRIFT_CONTRIBUTION" &&
        s.extraction.data.firstPage &&
        s.extraction.data.pinpointPages.length
      ) {
        const first = s.extraction.data.firstPage;
        const pin = s.extraction.data.pinpointPages[0];
        const n = notes.find((n: FootnoteSnapshot) => n.id === p.footnoteId)!;
        if (/^\s*,\s*$/u.test(n.contentText.slice(first.end, pin.start)))
          assert.ok(
            result.findings.some(
              (f) =>
                f.footnoteId === p.footnoteId &&
                f.ruleId === "CONTRIBUTION_PINPOINT_STYLE" &&
                f.start === first.end
            ),
            s.originalText
          );
      }
    }
}
async function largeRun() {
  const notes = corpus.largePattern.map((index: number, i: number) =>
    snapshot(corpus.largeUnique[index].text, i + 1)
  );
  assert.equal(notes.length, 1144);
  let ticks = 0;
  const timer = setInterval(() => ticks++, 1);
  try {
    const result = await analyzeFootnotesAsync(notes, { profile });
    assert.equal(result.parseResults.length, 1144);
    assert.ok(ticks > 0, "Large real corpus must yield to the UI");
  } finally {
    clearInterval(timer);
  }
  console.log("POC17.7 real 80/1144 corpus, pinpoint safety and Festschrift persistence passed");
}
void largeRun().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const mixedSentence = analyze(
  "Engländer, in: Matt/Renzikowski StGB (Anm. 1), § 35 Rdn. 14a. Nach Lerman, in: ZStW 127 (2015), S. 284, 302 ist die Gefahr zumutbar."
);
assert.ok(
  mixedSentence.findings.some(
    (f) => f.ruleId === "COMMENTARY_MARGIN_NUMBER_ABBREVIATION" && f.originalText === "Rdn. 14a"
  )
);
assert.ok(mixedSentence.findings.some((f) => f.ruleId === "JOURNAL_PINPOINT_STYLE"));

const authorChain = analyzeFootnotes(
  [
    snapshot(
      "Engländer, in: Matt/Renzikowski StGB, § 34 Rn. 5; ders., GA 2010, 15, 21; ders., GA 2017, 242, 252 f.; ders., Nothilfe, S. 96 f."
    ),
  ],
  { profile, mappingData: createDefaultCitationSourceMapping() }
);
assert.equal(
  authorChain.findings.filter((f) => f.ruleId === "ANAPHORIC_REFERENCE_REVIEW").length,
  0,
  "A verified commentary bearbeiter must remain the author of consecutive ders. references"
);
const anaphoricContribution = analyze(
  "Engländer, Nothilfe, S. 126 ff.; ders., Festschrift für Schünemann, 2015, S. 583, 586."
);
assert.ok(
  !anaphoricContribution.parseResults[0].segments.some((s) => s.originalText === "ders."),
  "A contribution must not be separated from its author"
);

const suspiciousYear = analyze("Korte, NZWiSt 2918, 231 (233).");
assert.ok(
  suspiciousYear.findings.some(
    (f) =>
      f.ruleId === "JOURNAL_PUBLICATION_YEAR_REVIEW" &&
      f.originalText === "2918" &&
      !f.suggestedText
  )
);
assert.ok(
  !analyze("Korte, NZWiSt 2018, 231 (233).").findings.some(
    (f) => f.ruleId === "JOURNAL_PUBLICATION_YEAR_REVIEW"
  )
);
const commentaryVariants = analyzeFootnotes(
  [snapshot("Fischer/Lutz-StGB, § 73b Rn. 5; Von der Groeben/Tiedje AEUV, Art. 57 Rn. 69.")],
  { profile, mappingData: createDefaultCitationSourceMapping() }
);
const roleMappings = commentaryVariants.segmentAnalyses
  .flatMap((s) => s.sourceMappings)
  .map((m) => m.resolution);
assert.ok(
  roleMappings.every((m) => m.status === "MATCHED" && m.matchSource === "STRUCTURED_ALIAS")
);
assert.deepEqual(
  roleMappings.map((m) => (m.status === "MATCHED" ? m.matchedBearbeiter : null)),
  ["Lutz", "Tiedje"]
);
const profiledDates = analyzeFootnotes(
  [
    snapshot("BGH, Urt. v. 24.07.2025 – 3 StR 382/24."),
    snapshot("LG Hamburg, Urt. v. 19. 12.2025 – 324 O 400/25.", 2),
  ],
  { profile }
);
assert.ok(
  !profiledDates.findings.some(
    (f) => f.ruleId === "CITATION_STYLE_CONSISTENCY" && f.originalText === "24.07.2025"
  ),
  "A date matching the explicit profile must not get majority-style advice"
);
const ordinalProse = analyze(
  "BGH wistra 2025, 197: wohl keine Verengung strebt der 1. Strafsenat mit der Formulierung an „Die Regelung des § 73 Abs. 1 StGB“. "
);
assert.ok(!ordinalProse.findings.some((f) => f.ruleId === "CITATION_OTHER_REVIEW"));
