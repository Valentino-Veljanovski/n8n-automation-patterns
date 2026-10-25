/**
 * K6 — no function in lib/ or nodes/ reads the wall clock. `now` is always
 * injected; the only `new Date()` lives in the dist wrapper line.
 * Constructing a Date from explicit values (`new Date(Date.UTC(...))`) is
 * arithmetic, not a clock read, and stays allowed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** @param {string} dir @returns {string[]} */
function jsFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...jsFiles(full));
    else if (entry.endsWith(".js")) out.push(full);
  }
  return out;
}

const CLOCK_READ = /new Date\(\s*\)|Date\.now\(/;

test("K6 lib/ and nodes/ never read the clock", () => {
  const files = [...jsFiles(join(ROOT, "lib")), ...jsFiles(join(ROOT, "nodes"))];
  assert.ok(files.length > 15);
  const offenders = files.filter((f) => CLOCK_READ.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
});

test("K6 dist/ reads the clock exactly once, on the final return line", () => {
  for (const file of jsFiles(join(ROOT, "dist"))) {
    const text = readFileSync(file, "utf8");
    const hits = text.match(/new Date\(\s*\)/g) ?? [];
    assert.equal(hits.length, 1, `${file}: ${hits.length} clock reads`);
    const lastLine = text.trimEnd().split("\n").pop() ?? "";
    assert.match(lastLine, /^return __node\.run\(.*now: new Date\(\)/, file);
  }
});
