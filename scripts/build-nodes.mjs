/**
 * Builds the paste-ready Code-node scripts in dist/ from nodes/*.js.
 *
 * Each nodes/<name>.js exports `run(ctx)` and imports from lib/. A Code
 * node cannot import local files, so esbuild inlines lib/ as one ES module.
 * The n8n task runner cannot execute a bundler's export object (see
 * docs/runner-sandbox.md), so the module's trailing `export { run };` is
 * stripped and what remains are plain declarations. This script then
 * repeats the header comment of the source at the top and appends the one
 * top-level `return` that calls `run` with what the header's "Reads:" line
 * promises: `$input`, `$json` in Run-Once-for-Each-Item mode, `$env` when
 * the header lists a variable, and the clock as `now`.
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

/** Names of the node scripts, from nodes/*.js. */
export const NODE_NAMES = readdirSync(NODES_DIR)
  .filter((f) => f.endsWith(".js"))
  .map((f) => f.slice(0, -3))
  .sort();

/** Tokens a bundler emits for its export object; none of them works in the runner. */
const DEAD_IN_RUNNER = ["defineProperty", "__defProp", "__export", "__toCommonJS", "__esModule", "__name(", "__node"];

/**
 * The facts the header states that the wrapper depends on.
 * @param {string} header
 * @param {string} name
 */
export function parseHeader(header, name) {
  const lines = header.split("\n");
  const runMode = /^\s\*\s+Run mode:\s+(Run Once for All Items|Run Once for Each Item)\s*$/.exec(lines[1] ?? "")?.[1];
  if (!runMode) throw new Error(`nodes/${name}.js: the first header line must be "Run mode: Run Once for All Items" or "Run mode: Run Once for Each Item"`);
  const reads = /^\s\*\s+Reads:\s+(.*)$/m.exec(header)?.[1]?.trim();
  if (!reads) throw new Error(`nodes/${name}.js: the header needs a "Reads:" line ($input[, $json][, $env (VAR, …)])`);
  const match = /^\$input(, \$json)?(?:, \$env \(([^)]*)\))?$/.exec(reads);
  if (!match) throw new Error(`nodes/${name}.js: Reads line "${reads}" is not "$input[, $json][, $env (VAR, …)]"`);
  const each = runMode === "Run Once for Each Item";
  const json = Boolean(match[1]);
  if (json !== each) throw new Error(`nodes/${name}.js: Reads must list $json exactly in Run Once for Each Item mode`);
  const env = match[2] === undefined ? null : match[2].split(",").map((v) => v.trim()).filter(Boolean);
  if (env !== null && (env.length === 0 || env.some((v) => !/^[A-Z][A-Z0-9_]*$/.test(v)))) {
    throw new Error(`nodes/${name}.js: $env must list the variables the script reads, in capitals`);
  }
  return { runMode, each, json, env };
}

/**
 * The lines appended after the bundled declarations: the env reader when
 * the header lists variables, then the single top-level return.
 * @param {ReturnType<typeof parseHeader>} facts
 */
export function wrapperFor({ json, env }) {
  const args = ["$input"];
  if (json) args.push("$json");
  args.push("$: $");
  const lines = [];
  if (env) {
    lines.push(
      "function readEnv(names) {",
      "  const values = {};",
      "  for (const name of names) {",
      "    try {",
      "      const value = $env[name];",
      "      if (value !== undefined && value !== null) values[name] = String(value);",
      "    } catch {",
      "      // env access is blocked on this instance (N8N_BLOCK_ENV_ACCESS_IN_NODE): the script runs with its defaults",
      "    }",
      "  }",
      "  return values;",
      "}",
    );
    args.push(`$env: readEnv([${env.map((v) => JSON.stringify(v)).join(", ")}])`);
  }
  args.push("now: new Date()");
  lines.push(`return run({ ${args.join(", ")} });`);
  return lines.join("\n");
}

/**
 * Drops the module's export statement and proves nothing module-like is left.
 * @param {string} code esbuild's ESM output
 * @param {string} name
 */
export function stripExports(code, name) {
  const tail = /\nexport\s*\{([^}]*)\}\s*;?\s*$/.exec(code);
  if (!tail) throw new Error(`nodes/${name}.js: bundle does not end with an export list`);
  const exported = tail[1].split(",").map((v) => v.trim().replace(/^run as run$/, "run")).filter(Boolean);
  if (exported.length !== 1 || exported[0] !== "run") throw new Error(`nodes/${name}.js must export exactly \`run\`, found: ${exported.join(", ") || "(none)"}`);
  const body = code.slice(0, tail.index).trimEnd();
  const statement = /^\s*(import|export)\b/m.exec(body);
  if (statement) throw new Error(`nodes/${name}.js: an ${statement[1]} statement remains in the bundle`);
  for (const token of DEAD_IN_RUNNER) {
    if (body.includes(token)) throw new Error(`nodes/${name}.js: bundle contains "${token}", which does not work in the n8n task runner`);
  }
  return body;
}

/** @param {string} name */
export async function buildOne(name) {
  const entry = join(NODES_DIR, `${name}.js`);
  const source = readFileSync(entry, "utf8");
  const header = /^\/\*\*[\s\S]*?\*\//.exec(source)?.[0];
  if (!header) throw new Error(`nodes/${name}.js must start with a /** header */ comment`);
  const facts = parseHeader(header, name);
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "node",
    target: ["node20"],
    minify: false,
    keepNames: false,
    write: false,
    legalComments: "none",
    logLevel: "silent",
  });
  const body = stripExports(result.outputFiles[0].text, name);
  return `${header}\n${body}\n${wrapperFor(facts)}\n`;
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
