/**
 * Builds the paste-ready Code-node scripts in dist/ from nodes/*.js.
 *
 * Each nodes/<name>.js exports `run({ $input, $json, $, $env, now })` and
 * imports from lib/. A Code node cannot import local files, so esbuild
 * inlines lib/ into one IIFE and this script appends the single top-level
 * `return` that makes the file a valid Code-node body. The header comment
 * of the source is repeated at the top of the dist file.
 *
 *   npm run build            writes dist/
 *   buildAll(outDir)         same, programmatically (used by the tests)
 */
import { build } from "esbuild";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NODES_DIR = join(ROOT, "nodes");
export const DIST_DIR = join(ROOT, "dist");

/** The one line that turns the bundle into a Code-node body. */
export const RETURN_LINE = "return __node.run({ $input, $json, $, $env, now: new Date() });";

/** Names of the node scripts, from nodes/*.js. */
export const NODE_NAMES = readdirSync(NODES_DIR)
  .filter((f) => f.endsWith(".js"))
  .map((f) => f.slice(0, -3))
  .sort();

/** @param {string} name */
export async function buildOne(name) {
  const entry = join(NODES_DIR, `${name}.js`);
  const source = readFileSync(entry, "utf8");
  const header = /^\/\*\*[\s\S]*?\*\//.exec(source)?.[0];
  if (!header) throw new Error(`nodes/${name}.js must start with a /** header */ comment`);
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    globalName: "__node",
    platform: "node",
    target: ["node20"],
    write: false,
    legalComments: "none",
    logLevel: "silent",
  });
  const code = result.outputFiles[0].text.trimEnd();
  return `${header}\n${code}\n${RETURN_LINE}\n`;
}

/**
 * @param {string} [outDir]
 * @returns {Promise<Record<string, string>>} name → file contents
 */
export async function buildAll(outDir = DIST_DIR) {
  mkdirSync(outDir, { recursive: true });
  /** @type {Record<string, string>} */
  const out = {};
  for (const name of NODE_NAMES) {
    out[name] = await buildOne(name);
    writeFileSync(join(outDir, `${name}.js`), out[name]);
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const built = await buildAll();
  console.log(`built ${Object.keys(built).length} scripts into dist/: ${Object.keys(built).join(", ")}`);
}
