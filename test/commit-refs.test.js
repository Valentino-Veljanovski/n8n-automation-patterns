/**
 * K2 — guards against commit ids that point nowhere.
 *
 * A commit id written into a file breaks when history is rewritten, and a
 * reader cannot check it. Files refer to a commit by its date and subject.
 * If an id is written anyway, it must name an ancestor of HEAD.
 *
 * A candidate is a run of 7 to 40 hex characters with at least one letter
 * and one digit. Runs of digits (phone numbers, serials) and the segments
 * of a UUID (next to a hyphen) are not candidates.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CANDIDATE_RE = /(?<![0-9A-Za-z-])(?=[0-9a-f]*[a-f])(?=[0-9a-f]*[0-9])[0-9a-f]{7,40}(?![0-9A-Za-z-])/g;

/** @param {string} text @returns {string[]} */
function candidates(text) {
  return text.match(CANDIDATE_RE) ?? [];
}

/** @param {string[]} args @returns {boolean} */
function gitOk(args) {
  try {
    execFileSync("git", args, { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** @param {string} id @returns {boolean} */
function isAncestorOfHead(id) {
  return gitOk(["cat-file", "-e", `${id}^{commit}`]) && gitOk(["merge-base", "--is-ancestor", id, "HEAD"]);
}

test("K2 the scanner picks commit-like ids and skips digits and UUIDs", () => {
  const id = ["a1b2", "c3d"].join("");
  assert.deepEqual(candidates(`fixed in commit ${id}.`), [id]);
  assert.deepEqual(candidates("call +49891234567 or 2958465"), []);
  assert.deepEqual(candidates(["6f1c2a3b", "4d5e", "4f60", "8a9b", "0c1d2e3f4a5b"].join("-")), []);
  assert.deepEqual(candidates("an effaced facade"), []);
});

test("K2 an id that is not a commit is not an ancestor of HEAD", () => {
  assert.equal(isAncestorOfHead(["0000000", "a"].join("")), false);
});

test("K2 no tracked file names a commit id that is not an ancestor of HEAD", () => {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  assert.ok(files.length > 10, `expected to scan more than 10 files, got ${files.length}`);
  /** @type {string[]} */
  const offenders = [];
  for (const file of files) {
    const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const id of candidates(line)) {
        if (!isAncestorOfHead(id)) offenders.push(`${file}:${i + 1} ${id}`);
      }
    });
  }
  assert.deepEqual(offenders, []);
});
