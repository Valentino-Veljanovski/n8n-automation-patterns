/**
 * K1 — guards against literal zero-width characters in source files.
 *
 * Invisible code points belong in sources only as \uXXXX escapes. A literal
 * one is unreadable in a diff and once slipped in through an editing tool.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url);
const DIRS = ["lib", "test", "nodes", "docs"];
const FILES = ["README.md", "package.json"];
const INVISIBLE_RE = /[\u200B-\u200D\uFEFF\u00AD\u2060]/;

/** @param {string} dir @returns {string[]} */
function collect(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (/\.(js|md|json)$/.test(entry)) out.push(full);
  }
  return out;
}

test("K1 the scanner recognises a literal invisible code point", () => {
  assert.equal(INVISIBLE_RE.test("a" + String.fromCodePoint(0x200b) + "b"), true);
  assert.equal(INVISIBLE_RE.test("a" + String.fromCodePoint(0x00ad) + "b"), true);
  assert.equal(INVISIBLE_RE.test("plain"), false);
});

test("K1 no source file contains a literal U+200B-U+200D, U+FEFF, U+00AD or U+2060", () => {
  const files = [
    ...DIRS.flatMap((d) => collect(join(ROOT.pathname.replace(/^\/([A-Za-z]:)/, "$1"), d))),
    ...FILES.map((f) => join(ROOT.pathname.replace(/^\/([A-Za-z]:)/, "$1"), f)),
  ];
  assert.ok(files.length > 10, `expected to scan more than 10 files, got ${files.length}`);
  /** @type {string[]} */
  const offenders = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const m = INVISIBLE_RE.exec(text);
    if (m) {
      const line = text.slice(0, m.index).split("\n").length;
      offenders.push(`${file}:${line} U+${m[0].codePointAt(0)?.toString(16).toUpperCase()}`);
    }
  }
  assert.deepEqual(offenders, []);
});
