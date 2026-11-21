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
 *   runCodeNodeInMode(source, mode, { items })   // the same in the node's run mode: n8n's source
 *                                        // check, one run per item, n8n's result check
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
 * @param {{ $input: any, $json: any, $: any, $env: any }} ctx
 * @returns {Promise<any>}
 */
export function runCodeNodeLikeRunner(source, ctx) {
  const context = createContext({});
  runInContext(RUNNER_SETUP, context);
  const factory = runInContext(`(async function VmCodeWrapper($input, $json, $, $env) {\n${source}\n})`, context, { filename: "code-node.js" });
  return factory(ctx.$input, ctx.$json, ctx.$, ctx.$env);
}

export const ALL_ITEMS = "Run Once for All Items";
export const EACH_ITEM = "Run Once for Each Item";

/**
 * An error shaped like n8n's ValidationError as the editor shows it.
 * @param {string} message
 * @param {string} description
 * @param {number} itemIndex
 * @param {number} [lineNumber]
 */
function validationError(message, description, itemIndex, lineNumber) {
  const where = lineNumber === undefined ? `[item ${itemIndex}]` : `[line ${lineNumber}, for item ${itemIndex}]`;
  return Object.assign(new Error(`${message} ${where}`), { description, itemIndex, lineNumber });
}

/**
 * What n8n does with the SOURCE TEXT of a Code node in Run Once for Each
 * Item mode before any of it runs. Ported from n8n tag n8n@2.45.6,
 * packages/nodes-base/nodes/Code/JsCodeValidator.ts, lines 8-36
 * (validateNoDisallowedMethodsInRunForEach), called from
 * JsTaskRunnerSandbox.runCodeForEachItem (JsTaskRunnerSandbox.ts, line 79).
 * Observed in n8n 2.45.6 on 21 November 2026 for `.first()`; the other three
 * names are read from that source, not observed.
 * @param {string} code
 * @param {number} [itemIndex]
 */
export function validateRunForEachSource(code, itemIndex = 0) {
  const disallowedMethod = code.match(/\$input\.(?<disallowedMethod>first|last|all|itemMatching)/)?.groups?.disallowedMethod;
  if (!disallowedMethod) return;
  const lineNumber =
    code.split("\n").findIndex((raw) => {
      const line = raw.trimStart();
      return line.includes(disallowedMethod) && !line.startsWith("//") && !line.startsWith("/*") && !line.startsWith("*");
    }) + 1;
  if (lineNumber === 0) return;
  throw validationError(`Can't use .${disallowedMethod}() here`, "This is only available in 'Run Once for All Items' mode", itemIndex, lineNumber);
}

/**
 * n8n's isObject (packages/nodes-base/nodes/Code/utils.ts, lines 3-7).
 * @param {unknown} value
 */
const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);

/**
 * What happens to the value the code returned for one item in Each-Item
 * mode. Read from n8n tag n8n@2.45.6, not observed in a host:
 * packages/@n8n/task-runner/src/js-task-runner/js-task-runner.ts, lines
 * 443-463 and 517-528 (the runner keeps `result.json` when the result has a
 * `json` key, else the whole result, and pairs it with the input item), then
 * packages/nodes-base/nodes/Code/result-validation.ts, lines 86-124
 * (validateRunCodeEachItem: the item's `json` must be a plain object). A
 * returned array has no `json` key, so it becomes the item's `json` and is
 * rejected.
 * @param {any} result
 * @param {number} index
 */
function eachItemResult(result, index) {
  if (typeof result !== "object") {
    throw validationError("Code doesn't return an object", `Please return an object representing the output item. ('${result}' was returned instead.)`, index);
  }
  const json = "json" in result ? result.json : "binary" in result ? {} : result;
  if (json === undefined || !isPlainObject(json)) {
    throw validationError("A 'json' property isn't an object", "In the returned data, every key named 'json' must point to an object.", index);
  }
  return result.binary ? { json, pairedItem: { item: index }, binary: result.binary } : { json, pairedItem: { item: index } };
}

/**
 * Runs a Code-node body in the run mode the node is set to, in the runner
 * model. All Items: one run, `$input` holds every item. Each Item: the
 * source check first, then one run per input item with that item as
 * `$input.item` and `$json`; `null` drops the item; every other result goes
 * through the result check.
 * @param {string} source
 * @param {string} mode ALL_ITEMS or EACH_ITEM
 * @param {{ items?: any[], env?: Record<string, string> }} [options]
 * @returns {Promise<any[]>}
 */
export async function runCodeNodeInMode(source, mode, { items = [], env = {} } = {}) {
  if (mode === ALL_ITEMS) return runCodeNodeLikeRunner(source, createN8nContext({ items, env }));
  if (mode !== EACH_ITEM) throw new Error(`unknown run mode "${mode}"`);
  validateRunForEachSource(source, 0);
  const base = createN8nContext({ items, env });
  const out = [];
  for (let index = 0; index < base.items.length; index++) {
    const item = base.items[index];
    const result = await runCodeNodeLikeRunner(source, { $input: { item, context: {} }, $json: item.json, $: base.$, $env: env });
    if (result === null || result === undefined) continue;
    out.push(eachItemResult(result, index));
  }
  return out;
}
