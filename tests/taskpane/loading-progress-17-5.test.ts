import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { analyzeFootnotes, analyzeFootnotesAsync } from "../../src/footnote-engine/engine";
import { finishWorkAsync, type WorkProgress } from "../../src/footnote-engine/cooperative";
import {
  createFootnoteReadProgress,
  hashFootnoteContentText,
  type FootnoteSnapshot,
} from "../../src/taskpane/taskpane";
import { loadingDisplay } from "../../src/taskpane/loading-progress";
import { createDefaultCitationStyleProfile } from "../../src/citation-settings/defaults";

const texts = [
  "Hassemer, Festschrift für Bockelmann, 1979, S. 225, 239 ff.",
  "Hruschka, Festschrift für Dreher, 1977, S. 189, 198 ff.",
  "BGHSt. 5, 245, 248.",
  "Kühl, Strafrecht Allgemeiner Teil, 8. Aufl. 2017, S. 50.",
  "Kühl, AT (Anm. 4), S. 51.",
  "ders., AT, S. 52.",
  "Vgl. https://example.org/test; § 32 StGB.",
  "",
];
function snapshot(index: number): FootnoteSnapshot {
  const contentText = texts[index % texts.length];
  return {
    id: `progress-${index}`,
    ordinal: index + 1,
    displayLabel: String(index + 1),
    rawWordText: contentText,
    contentText,
    contentLength: contentText.length,
    originalTextHash: hashFootnoteContentText(contentText),
    reference: { referenceText: String(index + 1) },
    locator: {
      ordinal: index + 1,
      displayLabel: String(index + 1),
      originalTextHash: hashFootnoteContentText(contentText),
      contextBefore: "",
      contextAfter: "",
    },
    paragraphCount: 1,
    paragraphs: [{ index: 0, start: 0, end: contentText.length }],
    hyperlinks: [],
    fields: [],
    bookmarks: [],
    contentControls: [],
    protectedRanges: [],
    readStatus: "complete",
    readWarnings: [],
    formattingRuns: [],
    paragraphFormats: [],
  };
}
function content(result: ReturnType<typeof analyzeFootnotes>) {
  return {
    ...result,
    durationMs: 0,
    registryDurationMs: 0,
    documentSourceRegistry: { ...result.documentSourceRegistry, durationMs: 0 },
  };
}

async function main() {
  const profile = createDefaultCitationStyleProfile();
  profile.bookChapter.pinpointStyle = "parentheses";
  for (const count of [0, 1, 80, 1200]) {
    const footnotes = Array.from({ length: count }, (_, index) => snapshot(index));
    const expected = analyzeFootnotes(structuredClone(footnotes), { profile });
    const events: WorkProgress[] = [];
    const timestamps: number[] = [];
    let ticks = 0;
    const heartbeat = setInterval(() => ticks++, 1);
    const startedAt = performance.now();
    const actual = await analyzeFootnotesAsync(structuredClone(footnotes), {
      profile,
      onProgress: (event) => {
        events.push(event);
        timestamps.push(performance.now());
      },
    });
    clearInterval(heartbeat);
    assert.deepEqual(
      content(actual),
      content(expected),
      `Sync/async outputs, IDs, offsets and protection must match for ${count} footnotes`
    );
    assert.ok(ticks > 0, "Interface must receive event-loop turns during CPU analysis");
    const percentages = events.map(
      (event) => createFootnoteReadProgress(event.phase, event.processed, event.total).percent
    );
    assert.ok(
      percentages.every(
        (value, index) => value < 100 && (index === 0 || value >= percentages[index - 1])
      ),
      "Live progress must be monotonic and below 100"
    );
    const parsed = events.filter((event) => event.phase === "analyzing");
    assert.equal(
      parsed[parsed.length - 1]?.processed,
      count,
      "Parsing must count actual footnotes including empty ones"
    );
    assert.deepEqual(
      [...new Set(events.map((event) => event.phase))],
      ["analyzing", "resolving", "checking", "finalizing"]
    );
    if (count === 1200)
      assert.ok(
        events.length < 150,
        "Progress callbacks must be coalesced, not render per citation"
      );
    const gaps = timestamps.slice(1).map((value, index) => value - timestamps[index]);
    console.log(
      `${count} footnotes: ${Math.round(performance.now() - startedAt)} ms, ${events.length} updates, ${ticks} UI turns, max update gap ${Math.round(Math.max(0, ...gaps))} ms`
    );
  }
  const stages = ["reading", "analyzing", "resolving", "checking", "finalizing"] as const;
  for (const phase of stages) {
    const progress = createFootnoteReadProgress(phase, 7, 10);
    assert.equal(progress.processed, 7);
    assert.ok(progress.percent < 100);
  }
  const ready = createFootnoteReadProgress("complete", 10, 10);
  assert.equal(loadingDisplay(ready, null, false, false, false)?.percent, 100);
  const before = loadingDisplay(
    createFootnoteReadProgress("finalizing", 10, 10),
    null,
    false,
    true,
    true
  )!;
  const planning = loadingDisplay(ready, null, true, true, true)!;
  const finalizing = loadingDisplay(
    ready,
    { phase: "FINALIZING", total: 4, processed: 4, applied: 4, failed: 0, stale: 0 },
    true,
    true,
    true
  )!;
  assert.ok(
    before.percent <= planning.percent &&
      planning.percent <= finalizing.percent &&
      finalizing.percent < 100,
    "Correction transition must never go backwards or finish early"
  );
  assert.equal(loadingDisplay(null, null, false, false, false), null, "Errors clear the display");
  assert.equal(
    loadingDisplay(createFootnoteReadProgress("reading", 0, 0), null, false, false, true)?.percent,
    0,
    "Unknown totals must not invent progress"
  );
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    analyzeFootnotesAsync([snapshot(0)], {
      signal: controller.signal,
      onProgress: () => {
        calls++;
        controller.abort();
      },
    }),
    /cancelled/
  );
  assert.equal(calls, 1, "Aborted work must not publish late progress");
  function* failing(): Generator<WorkProgress, number, void> {
    yield { phase: "analyzing", processed: 0, total: 1 };
    throw new Error("local failure");
  }
  await assert.rejects(
    finishWorkAsync(failing()),
    /local failure/,
    "Failures must propagate without fabricated success"
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
