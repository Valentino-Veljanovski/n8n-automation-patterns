/**
 * Named access to Excel rows fetched through Microsoft Graph. Rows arrive
 * either as `{ index, values: [[...cells]] }` (Graph) or as a plain array of
 * cells; both work everywhere here.
 */
import { collapseWhitespace } from "../text/index.js";

/**
 * @param {any} row
 * @returns {any[] | null}
 */
function cellsOrNull(row) {
  if (Array.isArray(row)) return row;
  if (row && typeof row === "object" && Array.isArray(row.values) && Array.isArray(row.values[0])) return row.values[0];
  return null;
}

/** @param {any} row */
function cellsOf(row) {
  const cells = cellsOrNull(row);
  if (!cells) throw new Error("Invalid Excel row structure");
  return cells;
}

/**
 * @typedef {Object} ColumnMapper
 * @property {Record<string, number>} indexes
 * @property {number} totalColumns
 * @property {(row: any, name: string) => any} get
 * @property {(row: any) => Record<string, any>} getAll
 * @property {(data: Record<string, any>) => any[]} buildRow
 * @property {(rows: any[], name: string, value: any) => any | null} findRow
 * @property {(rows: any[], name: string, value: any) => any[]} filterRows
 */

/**
 * @param {{ indexes: Record<string, number>, totalColumns?: number }} config
 * @returns {ColumnMapper}
 */
export function createColumnMapper({ indexes, totalColumns }) {
  if (!indexes || typeof indexes !== "object") throw new Error("createColumnMapper: indexes are required");
  const known = { ...indexes };
  const total = totalColumns ?? Math.max(-1, ...Object.values(known)) + 1;

  /** @param {string} name */
  const indexOf = (name) => {
    const index = known[name];
    if (index === undefined) throw new Error(`Unknown column "${name}". Known: ${Object.keys(known).join(", ")}`);
    return index;
  };

  return {
    indexes: known,
    totalColumns: total,
    get(row, name) {
      return cellsOf(row)[indexOf(name)];
    },
    getAll(row) {
      const cells = cellsOf(row);
      /** @type {Record<string, any>} */
      const out = {};
      if (!Array.isArray(row)) out._rowIndex = row.index;
      for (const [name, index] of Object.entries(known)) out[name] = cells[index];
      return out;
    },
    buildRow(data) {
      const out = new Array(total).fill("");
      for (const [name, index] of Object.entries(known)) {
        if (data[name] !== undefined && data[name] !== null) out[index] = data[name];
      }
      return out;
    },
    findRow(rows, name, value) {
      const index = indexOf(name);
      return rows.find((row) => cellsOrNull(row)?.[index] === value) ?? null;
    },
    filterRows(rows, name, value) {
      const index = indexOf(name);
      return rows.filter((row) => cellsOrNull(row)?.[index] === value);
    },
  };
}

/** @param {unknown} s */
const norm = (s) => collapseWhitespace(s).toLowerCase();

/**
 * Builds a mapper from the sheet's header row, so columns may move or be
 * renamed to any listed alias without touching the consumers.
 * @param {any} headerRow Graph row or array of header cells
 * @param {Record<string, string | string[]>} aliases canonical name → accepted header texts
 * @param {{ totalColumns?: number }} [options]
 * @returns {ColumnMapper}
 */
export function columnMapperFromHeader(headerRow, aliases, { totalColumns } = {}) {
  const header = cellsOf(headerRow).map(norm);
  /** @type {Record<string, number>} */
  const indexes = {};
  /** @type {string[]} */
  const missing = [];
  for (const [name, alts] of Object.entries(aliases)) {
    const candidates = (Array.isArray(alts) ? alts : [alts]).map(norm);
    const index = candidates.map((a) => header.indexOf(a)).find((i) => i !== -1);
    if (index === undefined) missing.push(name);
    else indexes[name] = index;
  }
  if (missing.length) throw new Error(`columnMapperFromHeader: missing columns: ${missing.join(", ")}`);
  return createColumnMapper({ indexes, totalColumns: totalColumns ?? header.length });
}

/** @param {unknown} value */
function isMissing(value) {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

/**
 * Reads the first present value. With one argument it just normalises a
 * value (`""`, null, undefined → undefined). With `keys` it looks them up on
 * `source` in order, treating empty strings as missing.
 * @param {any} source a value, or an object to read from
 * @param {string | string[]} [keys]
 * @param {any} [fallback]
 */
export function safeGet(source, keys, fallback = undefined) {
  if (keys === undefined) return isMissing(source) ? undefined : source;
  const list = Array.isArray(keys) ? keys : [keys];
  if (source && typeof source === "object") {
    for (const key of list) {
      const value = source[key];
      if (!isMissing(value)) return value;
    }
  }
  return fallback;
}
