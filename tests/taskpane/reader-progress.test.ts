import { createFootnoteReadProgress } from "../../src/taskpane/taskpane";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const total = 1144;
const processedValues = [0, 150, 300, 450, 600, 750, 900, 1050, total];
const progressValues = processedValues.map((processed) =>
  createFootnoteReadProgress("reading", processed, total)
);

assert(progressValues[0].percent === 0, "Reading progress must start at zero");
assert(
  progressValues.every(
    (progress, index) => index === 0 || progress.percent >= progressValues[index - 1].percent
  ),
  "Chunk progress must be monotonic"
);
assert(
  progressValues[progressValues.length - 1].processed === total &&
    progressValues[progressValues.length - 1].percent === 60,
  "Reader completion must reserve progress for analysis"
);

const analyzing = createFootnoteReadProgress("analyzing", total, total);
const correcting = createFootnoteReadProgress("correcting", 12, 27);
const complete = createFootnoteReadProgress("complete", total, total);
assert(analyzing.percent === 72, "Analysis phase must follow reader progress");
assert(
  correcting.processed === 12 && correcting.total === 27 && correcting.percent === 44,
  "Correction progress must reflect actually processed automatic actions"
);
assert(complete.percent === 100, "Complete phase must end at 100 percent");
assert(
  createFootnoteReadProgress("reading", total + 100, total).processed === total,
  "Processed count must be clamped to total"
);
