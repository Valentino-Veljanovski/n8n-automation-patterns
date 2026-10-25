/**
 * Emulates the globals an n8n Code node sees, so that node wrappers (and,
 * in the differential tests, the original snippets) can run under
 * node:test without n8n.
 *
 *   const ctx = createN8nContext({ items: [{ a: 1 }], nodes: { Prev: [{ b: 2 }] } });
 *   ctx.$input.all()          // [{ json: { a: 1 } }]
 *   ctx.$("Prev").first()     // { json: { b: 2 } }
 *   runCodeNode(source, ctx)  // executes a Code-node body
 */
import { createRequire } from "node:module";

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
