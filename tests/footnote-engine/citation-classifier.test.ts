import { analyzeFootnotes } from "../../src/footnote-engine/engine";
import type {
  CaseLawCitationForm,
  CitationClassification,
  CitationType,
} from "../../src/footnote-engine/types";
import type { FootnoteSnapshot } from "../../src/taskpane/taskpane";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createSnapshot(contentText: string, ordinal = 1): FootnoteSnapshot {
  return {
    id: `classification-footnote-${ordinal}`,
    ordinal,
    contentText,
    originalTextHash: `classification-hash-${ordinal}-${contentText.length}`,
    protectedRanges: [],
    paragraphs: [],
  } as FootnoteSnapshot;
}

function classify(text: string): CitationClassification {
  const result = analyzeFootnotes([createSnapshot(text)]);
  assert(result.parseResults.length === 1, `Missing parse result for ${text}`);
  assert(result.parseResults[0].segments.length === 1, `Expected one segment for ${text}`);
  assert(
    result.findings.every((finding) => finding.ruleId !== "RULE_OUTPUT_INVALID"),
    "Classification must not lead to invalid rule output"
  );
  const classification = result.parseResults[0].segments[0].classification;
  for (const signal of classification.signals) {
    if (signal.text !== undefined && signal.start !== undefined && signal.end !== undefined) {
      assert(
        signal.text === text.slice(signal.start, signal.end),
        `Invalid classification signal offsets for ${signal.code}: ${text}`
      );
    }
  }
  return classification;
}

function assertType(
  text: string,
  expectedType: CitationType,
  expectedForm?: CaseLawCitationForm
): CitationClassification {
  const classification = classify(text);
  assert(
    classification.type === expectedType,
    `Expected ${expectedType}, received ${classification.type} for ${text}`
  );
  if (expectedForm) {
    assert(
      classification.caseLawForm === expectedForm,
      `Expected ${expectedForm}, received ${classification.caseLawForm ?? "none"} for ${text}`
    );
  }
  assert(classification.signals.length > 0, `Classification needs signals for ${text}`);
  return classification;
}

function runRequiredClassificationCases(): void {
  assertType("§ 263 Abs. 1 StGB", "STATUTE");
  assertType("vgl. § 263 Abs. 1 S. 1 Nr. 1 StGB", "STATUTE");
  assertType("Art. 5 Abs. 1 GG", "STATUTE");

  assertType("MüKo-StGB/Schneider, § 263 Rn. 4", "COMMENTARY");
  assertType("NK-StGB/Kargl, § 185 Rn. 3", "COMMENTARY");
  assertType("BeckOK-StGB/Heuchemer, § 73 Rn. 7", "COMMENTARY");

  assertType("Roxin/Greco, Strafrecht AT I, 5. Aufl. 2020, § 10 Rn. 12", "BOOK");
  assertType("Wessels/Beulke/Satzger, Strafrecht AT, 53. Aufl. 2023, Rn. 100", "BOOK");

  assertType("BGH, Urt. v. 07.08.2025 – 3 StR 123/25", "CASE_LAW", "DIRECT");
  assertType("BGHSt 47, 45 (49)", "CASE_LAW", "OFFICIAL_COLLECTION");
  assertType("BGH NJW 2025, 1234 (1236)", "CASE_LAW", "JOURNAL");
  assertType("BGH, Beschl. v. 01.02.2025 – 1 StR 10/25, BeckRS 2025, 12345", "CASE_LAW", "HYBRID");
  assertType(
    "BGH, Urt. v. 07.08.2025 – 3 StR 123/25 = NJW 2025, 1234 = BeckRS 2025, 12345",
    "CASE_LAW",
    "HYBRID"
  );

  assertType("Tenckhoff, JuS 1988, 787 (788)", "JOURNAL_ARTICLE");
  assertType("Korte, NZWiSt 2018, 231 (233 f.)", "JOURNAL_ARTICLE");
  assertType("Bittmann, KriPoZ 2016, 121 (125)", "JOURNAL_ARTICLE");

  assertType("BT-Drs. 20/1234, S. 15", "LEGISLATIVE_MATERIAL");
  assertType("BT-Drs. 18/9525, 66", "LEGISLATIVE_MATERIAL");

  assertType("https://example.com", "ONLINE_SOURCE");
  assertType("https://support.tiktok.com/... (letzter Aufruf am 31.03.2026)", "ONLINE_SOURCE");
  assertType("BMF-Schreiben v. 01.01.2025, IV A 1 – ...", "ADMINISTRATIVE_MATERIAL");
  assertType("Müller, in: Festschrift für X, 2025, S. 123", "FESTSCHRIFT_CONTRIBUTION");
  assertType("Müller, Anm. zu BGH, Urt. v. ..., NJW 2025, 100", "CASE_NOTE");
  assertType("Müller, NJW 2025, 1234", "JOURNAL_ARTICLE");
  assertType("BGH NJW 2025, 1234", "CASE_LAW", "JOURNAL");
  assertType("MüKo-StGB/Schneider, § 263 Rn. 4", "COMMENTARY");
  assertType("Roxin/Greco, Strafrecht AT I, § 10 Rn. 12", "BOOK");
  assertType(
    "wobei darüber gestritten wird, ob dies gilt, vgl. BGH, Urt. v. 12.01.1956 – 4 StR 570/55",
    "CASE_LAW",
    "DIRECT"
  );
  const other = assertType("Unklare Quelle ABC 2025, 17", "OTHER");
  assert(other.certainty === "low", "OTHER must remain low certainty");
}

function runStructuralSafetyCases(): void {
  const commentaryResult = analyzeFootnotes([createSnapshot("MüKo-StGB/Schneider, § 263 Rn. 4")])
    .parseResults[0].segments[0];
  assert(commentaryResult.classification.type === "COMMENTARY", "Commentary must win over statute");
  assert(
    commentaryResult.embeddedStatuteReferences[0].originalText === "§ 263",
    "Classification must retain embedded statute data"
  );

  assertType("BGH, Urt. v. 01.01.2025 – 1 StR 1/25, zu § 263 StGB", "CASE_LAW", "DIRECT");
  assertType("Müller, NJW 2025, 1234, https://example.com", "JOURNAL_ARTICLE");
  assertType("BGH NJW 2025, 1234, https://example.com", "CASE_LAW", "JOURNAL");
  assertType(
    "YouTube Creator Economy, https://example.com (letzter Aufruf am 31.03.2026)",
    "ONLINE_SOURCE"
  );
}

function runRealDocumentCase(): void {
  const text =
    "MüKo-StGB/Regge/Pegel, § 185 Rn. 39; NK-StGB/Kargl, § 185 Rn. 3; wobei darüber gestritten wird, ob dies gilt, vgl. BGH, Urt. v. 12.01.1956 – 4 StR 570/55";
  const result = analyzeFootnotes([createSnapshot(text)]).parseResults[0];
  assert(result.segments.length === 3, "Real document case must retain three segments");
  assert(result.segments[0].classification.type === "COMMENTARY", "Real segment 1 must classify");
  assert(
    result.segments[0].classification.certainty === "high",
    "Segment 1 must be high certainty"
  );
  assert(result.segments[1].classification.type === "COMMENTARY", "Real segment 2 must classify");
  assert(
    result.segments[1].classification.certainty === "high",
    "Segment 2 must be high certainty"
  );
  assert(
    result.segments[2].classification.type === "CASE_LAW",
    "Narrative segment must be case law"
  );
  assert(
    result.segments[2].classification.caseLawForm === "DIRECT",
    "Narrative case citation must have DIRECT form"
  );
  assert(
    result.segments[0].embeddedStatuteReferences[0].originalText === "§ 185" &&
      result.segments[1].embeddedStatuteReferences[0].originalText === "§ 185",
    "Real commentary statute references must remain intact"
  );
}

function runMassTest(): void {
  const snapshots = Array.from({ length: 1200 }, (_, index) => {
    const ordinal = index + 1;
    return createSnapshot(
      `MüKo-StGB/Regge/Pegel, § 185 Rn. ${ordinal}; BGH NJW 2025, ${1000 + ordinal}`,
      ordinal
    );
  });
  const result = analyzeFootnotes(snapshots);
  assert(result.parseResults.length === 1200, "Mass test must classify every footnote");
  assert(
    result.parseResults.every(
      (parseResult) =>
        parseResult.segments.length === 2 &&
        parseResult.segments[0].classification.type === "COMMENTARY" &&
        parseResult.segments[1].classification.type === "CASE_LAW"
    ),
    "Mass-test segment classifications must be deterministic"
  );
}

runRequiredClassificationCases();
runStructuralSafetyCases();
runRealDocumentCase();
runMassTest();
