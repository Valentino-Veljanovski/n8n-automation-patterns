/**
 * Loads the ORIGINAL snippet implementations for differential testing.
 *
 * The originals live outside this repository. Set INPUT_DIR to the folder
 * that contains the cloned snippet repositories; when it is unset every
 * differential test skips itself (see `skipReason`).
 *
 * Three ways to get at old code:
 *   - requireOld(rel)             CommonJS files with module.exports and no top-level return
 *   - extractFunctions(src, names) pulls named `function` declarations (and
 *                                  single-line `const` definitions) out of an
 *                                  n8n Code-node script and evaluates just those
 *   - runCodeNode(src, ctx)        runs a whole Code-node body with an emulated context
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

export { createN8nContext, runCodeNode } from "../helpers/n8n-context.js";

export const INPUT_DIR = process.env.INPUT_DIR ?? "";
export const skipReason = INPUT_DIR ? false : "INPUT_DIR is not set";

const require = createRequire(import.meta.url);

/** @param {string} rel path relative to INPUT_DIR */
export function oldSource(rel) {
  return readFileSync(join(INPUT_DIR, rel), "utf8");
}

/** @param {string} rel */
export function requireOld(rel) {
  return require(join(INPUT_DIR, rel));
}

/**
 * @param {string} src
 * @param {string} name
 * @returns {string} the full text of `function name(...) { ... }`
 */
function sliceFunction(src, name) {
  const re = new RegExp(`(?:^|\\n)\\s*(function|class)\\s+${name}\\b`);
  const m = re.exec(src);
  if (!m) {
    const constRe = new RegExp(`(?:^|\\n)\\s*(const\\s+${name}\\s*=[^\\n]*;)`);
    const c = constRe.exec(src);
    if (c) return c[1];
    throw new Error(`function ${name} not found in old source`);
  }
  const start = m.index + m[0].indexOf(m[1]);
  // The body starts at the first "{" after the parameter list; a destructured
  // parameter like `({ a, b })` has braces of its own that must be skipped.
  let open = -1;
  if (m[1] === "function") {
    const paren = src.indexOf("(", start);
    let level = 0;
    for (let i = paren; i < src.length; i++) {
      if (src[i] === "(") level++;
      else if (src[i] === ")") {
        level--;
        if (level === 0) {
          open = src.indexOf("{", i);
          break;
        }
      }
    }
  } else {
    open = src.indexOf("{", start);
  }
  if (open === -1) throw new Error(`no body found for ${name}`);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces in function ${name}`);
}

/**
 * @param {string} src
 * @param {string[]} names declarations to extract, dependencies included
 * @returns {Record<string, Function>}
 */
export function extractFunctions(src, names) {
  const body = names.map((n) => sliceFunction(src, n)).join("\n");
  const factory = new Function(`${body}\nreturn { ${names.join(", ")} };`);
  return factory();
}

/**
 * Names of the nodes a Code-node script reads with `$("Name")`, in order of
 * first appearance. Lets a differential test build its context without
 * repeating the old workflow's node names.
 * @param {string} src
 * @returns {string[]}
 */
export function nodeNamesOf(src) {
  /** @type {string[]} */
  const names = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const m of code.matchAll(/\$\(\s*["']([^"']+)["']\s*\)/g)) {
    if (!names.includes(m[1])) names.push(m[1]);
  }
  return names;
}
