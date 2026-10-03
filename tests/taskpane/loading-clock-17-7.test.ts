import assert from "node:assert/strict";
import * as React from "react";
import { LoadingProgress } from "../../src/taskpane/components/LoadingProgress";
const { window } = require("linkedom").parseHTML("<html><body><div id='root'></div></body></html>");
Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const callbacks = new Map<number, () => void>();
let id = 0,
  now = 0;
Object.defineProperty(globalThis, "performance", { value: { now: () => now }, configurable: true });
window.setInterval = (fn: () => void) => {
  callbacks.set(++id, fn);
  return id;
};
window.clearInterval = (id: number) => callbacks.delete(id);
async function run() {
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  const display = { label: "Lesen", detail: "1 / 80", percent: 10, active: true };
  const render = (label: string, active = true) =>
    React.createElement(LoadingProgress, { display: { ...display, label, active } });
  await React.act(async () => root.render(render("Lesen")));
  assert.equal(callbacks.size, 1);
  now = 8000;
  await React.act(async () => [...callbacks.values()].forEach((fn) => fn()));
  assert.ok(document.body.textContent.includes("8 s"));
  await React.act(async () => root.render(render("Erkennen")));
  assert.equal(callbacks.size, 1);
  assert.equal(id, 1, "A phase change must keep the same clock");
  assert.ok(document.body.textContent.includes("8 s"));
  now = 9000;
  await React.act(async () => [...callbacks.values()].forEach((fn) => fn()));
  assert.ok(document.body.textContent.includes("9 s"));
  await React.act(async () => root.render(render("Korrigieren")));
  now = 17350;
  await React.act(async () => [...callbacks.values()].forEach((fn) => fn()));
  assert.ok(
    document.body.textContent.includes("17 s"),
    "Delayed callbacks catch up to real elapsed time"
  );
  await React.act(async () => root.render(render("Fertig", false)));
  assert.equal(callbacks.size, 0);
  await React.act(async () => root.render(render("Neue Prüfung")));
  assert.ok(document.body.textContent.includes("0 s"));
  await React.act(async () => window.dispatchEvent(new window.Event("pagehide")));
  assert.equal(callbacks.size, 0);
  await React.act(async () => root.unmount());
  console.log("POC17.7 continuous phase clock, delayed callback and cleanup passed");
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
