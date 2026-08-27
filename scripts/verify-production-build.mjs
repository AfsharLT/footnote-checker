import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { transformSync } = require("@babel/core");
const { parse } = require("@babel/parser");
const distDirectory = path.join(projectRoot, "dist");
const requiredFiles = ["taskpane.html", "commands.html", "_headers"];
const hashedAssetPattern = /^.+\.[0-9a-f]{8}\.(?:js|css)$/;

function fail(message) {
  throw new Error(`Production build verification failed: ${message}`);
}

for (const filename of requiredFiles) {
  if (!existsSync(path.join(distDirectory, filename))) {
    fail(`dist/${filename} is missing.`);
  }
}

const emittedAssets = readdirSync(distDirectory).filter((filename) => /\.(?:js|css)$/.test(filename));
if (emittedAssets.length === 0) fail("no JavaScript or CSS assets were emitted.");

const mutableAssets = emittedAssets.filter((filename) => !hashedAssetPattern.test(filename));
if (mutableAssets.length > 0) {
  fail(`non-content-hashed JavaScript/CSS assets found: ${mutableAssets.join(", ")}`);
}

const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const browserslist = Array.isArray(packageJson.browserslist) ? packageJson.browserslist : [];
if (!browserslist.some((target) => /^safari\s*>=\s*15$/i.test(target))) {
  fail("package.json must declare Safari >= 15 as a production browser target.");
}

function containsClassStaticBlock(ast) {
  const pending = [ast];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node || typeof node !== "object") continue;
    if (node.type === "StaticBlock") return true;
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) pending.push(...value);
      else if (value && typeof value === "object") pending.push(value);
    }
  }
  return false;
}

const compatibilityProbe = transformSync(
  "class Safari15CompatibilityProbe { static { this.supported = true; } }",
  {
    babelrc: false,
    configFile: path.join(projectRoot, "babel.config.json"),
    cwd: projectRoot,
    filename: "safari15-compatibility-probe.js",
  }
);
if (
  !compatibilityProbe?.code ||
  containsClassStaticBlock(parse(compatibilityProbe.code, { sourceType: "script" }))
) {
  fail("the configured Babel target does not transform class static blocks for Safari 15.");
}

for (const filename of emittedAssets.filter((asset) => asset.endsWith(".js"))) {
  const source = readFileSync(path.join(distDirectory, filename), "utf8");
  let ast;
  try {
    ast = parse(source, { sourceType: "script" });
  } catch (error) {
    fail(`${filename} is not a valid classic script: ${error.message}`);
  }
  if (containsClassStaticBlock(ast)) {
    fail(`${filename} contains a class static block unsupported by the Safari 15 target.`);
  }
}

for (const htmlFilename of ["taskpane.html", "commands.html"]) {
  const html = readFileSync(path.join(distDirectory, htmlFilename), "utf8");
  const localAssetUrls = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g)]
    .map((match) => match[1])
    .filter((url) => !/^https?:\/\//i.test(url));

  if (localAssetUrls.length === 0) fail(`${htmlFilename} does not reference a local bundle.`);
  for (const assetUrl of localAssetUrls) {
    const filename = assetUrl.split(/[?#]/, 1)[0].replace(/^\//, "");
    if (!hashedAssetPattern.test(filename)) {
      fail(`${htmlFilename} references non-content-hashed asset ${assetUrl}.`);
    }
    if (!existsSync(path.join(distDirectory, filename))) {
      fail(`${htmlFilename} references missing asset ${assetUrl}.`);
    }
  }
}

const headers = readFileSync(path.join(distDirectory, "_headers"), "utf8");
for (const requiredDirective of [
  "/taskpane.html",
  "/commands.html",
  "Cache-Control: no-store",
  "/*.js",
  "/*.css",
  "Cache-Control: public, max-age=31536000, immutable",
]) {
  if (!headers.includes(requiredDirective)) {
    fail(`dist/_headers is missing ${JSON.stringify(requiredDirective)}.`);
  }
}

console.log(
  `Production build verified: ${emittedAssets.length} content-hashed JS/CSS assets, stable HTML entry points, and dist/_headers.`
);
