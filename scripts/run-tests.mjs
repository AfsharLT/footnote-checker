import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function testFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? testFiles(path)
      : entry.isFile() && entry.name.endsWith(".test.ts")
        ? [path]
        : [];
  });
}

const files = testFiles(join(process.cwd(), "tests")).sort();

for (const file of files) {
  const result = spawnSync(process.execPath, ["--import", "tsx", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`All ${files.length} test files passed.`);
