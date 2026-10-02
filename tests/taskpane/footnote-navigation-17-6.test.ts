import {
  navigateToFootnote,
  navigationTargetIsCurrent,
  expectedNavigationText,
  type FootnoteNavigationInput,
  type FootnoteNavigationResult,
} from "../../src/taskpane/footnote-navigation";
import type { FootnoteSnapshot } from "../../src/taskpane/taskpane";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function note(ordinal: number, text = `Source ${ordinal}`): FootnoteSnapshot {
  return {
    id: `note-${ordinal}`,
    ordinal,
    contentText: text,
    locator: { ordinal, contextBefore: `Before ${ordinal}`, contextAfter: `After ${ordinal}` },
  } as FootnoteSnapshot;
}
function input(count: number, ordinal = 1): FootnoteNavigationInput {
  const footnotes = Array.from({ length: count }, (_, index) => note(index + 1));
  return { footnote: footnotes[ordinal - 1], footnotes, appliedMutations: [] };
}
function current(i: FootnoteNavigationInput) {
  return {
    count: i.footnotes.length,
    contentText: i.footnote.contentText,
    contextBefore: i.footnote.locator.contextBefore,
    contextAfter: i.footnote.locator.contextAfter,
  };
}
const runtime = globalThis as unknown as { Word: unknown };
runtime.Word = {
  RangeLocation: { start: "Start", end: "End", content: "Content" },
  SelectionMode: { start: "Start" },
};
async function adapter(
  i: FootnoteNavigationInput,
  changed?: string,
  failure?: string,
  selectionType = "Footnote"
) {
  let syncs = 0;
  let selected = 0;
  let bodiesLoaded = 0;
  const notes = i.footnotes.map((snapshot) => ({
    reference: {
      getRange: () => ({
        expandTo: () => ({ text: snapshot.locator.contextAfter, load: () => undefined }),
      }),
      paragraphs: {
        getFirst: () => ({
          getRange: (side: string) => ({
            expandTo: () => ({
              text:
                side === "Start" ? snapshot.locator.contextBefore : snapshot.locator.contextAfter,
              load: () => undefined,
            }),
          }),
        }),
      },
    },
    body: {
      text: snapshot === i.footnote && changed !== undefined ? changed : snapshot.contentText,
      load: () => {
        bodiesLoaded++;
      },
      getRange: () => ({
        select: () => {
          selected++;
        },
      }),
    },
  }));
  const context = {
    document: {
      body: { footnotes: { items: notes, load: () => undefined } },
      getSelection: () => ({
        parentBody: { type: selectionType, text: changed ?? i.footnote.contentText, load: () => undefined },
      }),
    },
    sync: async () => {
      syncs++;
      if (failure) throw { code: failure };
    },
  } as unknown as Word.RequestContext;
  const result = await navigateToFootnote(i, async (callback) => callback(context));
  return { result, syncs, selected, bodiesLoaded };
}
async function run() {
  for (const count of [1, 80, 1200]) {
    const i = input(count, count);
    assert(navigationTargetIsCurrent(i, current(i)), `Current target ${count}`);
    const actual = await adapter(i);
    assert(
      actual.result.status === "SELECTED" && actual.selected === 1,
      `Select exact target ${count}`
    );
    assert(
      actual.syncs === 4 && actual.bodiesLoaded === 1,
      "Constant syncs and only target body load"
    );
    for (const [key, value] of [
      ["count", count + 1],
      ["count", count - 1],
      ["contentText", "changed"],
      ["contextBefore", "changed"],
      ["contextAfter", "changed"],
    ] as const) {
      assert(!navigationTargetIsCurrent(i, { ...current(i), [key]: value }), `Reject stale ${key}`);
    }
  }
  const i = input(2);
  for (const ordinal of [0, -1, 3, 1.2, NaN])
    assert(
      !navigationTargetIsCurrent(
        { ...i, footnote: { ...i.footnote, locator: { ...i.footnote.locator, ordinal } } },
        current(i)
      ),
      "Invalid ordinal"
    );
  const empty = await adapter({ ...i, footnotes: [] });
  assert(empty.result.status === "STALE" && empty.selected === 0, "Deleted document never selects");
  const wrongBody = await adapter(i, undefined, undefined, "MainDoc");
  assert(
    wrongBody.result.status === "FAILED",
    "Never claim success if Word selected the main document"
  );
  const changed = await adapter(i, "changed");
  assert(
    changed.result.status === "STALE" && changed.selected === 0 && changed.syncs === 2,
    "Changed note never selects"
  );
  assert(
    !navigationTargetIsCurrent(
      { ...i, footnotes: [i.footnote, { ...i.footnote, id: "duplicate" }] },
      current(i)
    ),
    "Identical context and content is ambiguous"
  );
  for (const code of ["NotImplemented", "ApiNotFound", "NotSupported", "GeneralException"]) {
    const result = await adapter(i, undefined, code);
    assert(
      result.selected === 0 &&
        result.result.status === (code === "GeneralException" ? "FAILED" : "UNSUPPORTED"),
      "Optional errors remain local"
    );
  }
  const mutation = {
    reviewItemId: "r1",
    footnoteId: i.footnote.id,
    actionKind: "TEXT_REPLACE" as const,
    oldStart: 0,
    oldEnd: 6,
    newTextLengthDelta: 1,
    newText: "Revised",
    appliedAt: "now",
  };
  const edited = { ...i, appliedMutations: [mutation] };
  assert(expectedNavigationText(edited) === "Revised 1", "Own known replacement replay");
  assert(
    navigationTargetIsCurrent(edited, { ...current(i), contentText: "Revised 1" }),
    "Own known corrections can navigate"
  );
  assert(
    !navigationTargetIsCurrent(edited, { ...current(i), contentText: "Revised 1 extra" }),
    "Unknown changes after correction block navigation"
  );
  assert(
    expectedNavigationText({ ...i, appliedMutations: [{ ...mutation, newText: undefined }] }) ===
      undefined,
    "Incomplete mutation rejected"
  );
  console.log("POC17.6 navigation safety and Word adapter tests passed.");
}
void run().catch((error) => {
  throw error;
});
