/**
 * Emulates the globals an n8n Code node sees, so that node wrappers (and,
 * in the differential tests, the original snippets) can run under
 * node:test without n8n.
 *
 *   const ctx = createN8nContext({ items: [{ a: 1 }], nodes: { Prev: [{ b: 2 }] } });
 *   ctx.$input.all()                     // [{ json: { a: 1 } }]
 *   ctx.$("Prev").first()                // { json: { b: 2 } }
 *   runCodeNode(source, ctx)             // executes a Code-node body in this process
 *   runCodeNodeLikeRunner(source, ctx)   // executes it in a context modelled on the n8n task runner
 */
import { createRequire } from "node:module";
import { createContext, runInContext } from "node:vm";

const require = createRequire(import.meta.url);

/** @typedef {{ json: Record<string, any>, binary?: Record<string, any> }} Item */

/** @param {any} value @returns {Item} */
function toItem(value) {
  if (value && typeof value === "object" && "json" in value) return value;
  return { json: value ?? {} };
}

/** @param {any[]} list */
function accessor(list) {
  return {
    all: () => list,
    first: () => list[0],
    last: () => list[list.length - 1],
    item: list[0],
    /** @type {Record<string, any>} */
    context: {},
  };
}

/**
 * @param {{ items?: any[], nodes?: Record<string, any>, env?: Record<string, string> }} [options]
 */
export function createN8nContext({ items = [], nodes = {}, env = {} } = {}) {
  const list = items.map(toItem);
  /** @param {string} name */
  const $ = (name) => {
    if (!(name in nodes)) {
      throw new Error(`Node "${name}" is not part of the test context`);
    }
    const data = nodes[name];
    return accessor((Array.isArray(data) ? data : [data]).map(toItem));
  };
  return {
    $input: accessor(list),
    $json: list[0]?.json ?? {},
    $,
    items: list,
    $env: env,
  };
}

/**
 * A `$env` that behaves like n8n's when N8N_BLOCK_ENV_ACCESS_IN_NODE is set:
 * the object exists, but reading any variable throws.
 * @returns {Record<string, string>}
 */
export function blockedEnv() {
  return new Proxy(
    {},
    {
      has: () => true,
      get() {
        throw new Error("access to env vars denied");
      },
    },
  );
}

/**
 * Runs a Code-node body (a script that may `return` at top level) with the
 * given context. `require` and `module` are provided so that scripts which
 * use CommonJS exports also work.
 * @param {string} source
 * @param {ReturnType<typeof createN8nContext>} ctx
 */
export function runCodeNode(source, ctx) {
  const module = { exports: {} };
  // A script may declare its own `items` (e.g. `let items;`), which would
  // clash with a parameter of the same name; only inject it when it does not.
  const declaresItems = /\b(?:let|const|var)\s+items\b/.test(source);
  const params = ["$input", "$json", "$", "$env", "require", "module", "exports"];
  const args = [ctx.$input, ctx.$json, ctx.$, ctx.$env, require, module, module.exports];
  if (!declaresItems) {
    params.push("items");
    args.push(ctx.items);
  }
  const fn = new Function(...params, source);
  return fn(...args);
}

/**
 * The narrowest model of what a probe in n8n 2.44.6's JS task runner showed
 * (see docs/runner-sandbox.md): Object.defineProperty and
 * Object.defineProperties have no effect, and the prototypes of Object,
 * Array and Function cannot be changed. Everything a bundler's export
 * object relies on is therefore dead; plain declarations keep working.
 */
const RUNNER_SETUP = `
  Object.defineProperty = (target) => target;
  Object.defineProperties = (target) => target;
  Object.freeze(Object.prototype);
  Object.freeze(Array.prototype);
  Object.freeze(Function.prototype);
`;

/**
 * Runs a Code-node body the way the n8n task runner does, as the body of an
 * async function inside a fresh vm context (no Node globals, no `require`)
 * prepared with RUNNER_SETUP. Only `$input`, `$json`, `$` and `$env` are
 * injected. Resolves with what the body returned.
 * @param {string} source
 * @param {ReturnType<typeof createN8nContext>} ctx
 * @returns {Promise<any>}
 */
export function runCodeNodeLikeRunner(source, ctx) {
  const context = createContext({});
  runInContext(RUNNER_SETUP, context);
  const factory = runInContext(`(async function VmCodeWrapper($input, $json, $, $env) {\n${source}\n})`, context, { filename: "code-node.js" });
  return factory(ctx.$input, ctx.$json, ctx.$, ctx.$env);
}
