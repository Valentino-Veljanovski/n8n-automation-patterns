/**
 * Language-model output: parsing and cleaning before anything downstream
 * trusts it.
 */
import { parseDate, toIsoDay } from "../dates/index.js";
import { stripInvisible, collapseWhitespace } from "../text/index.js";
import { normalizePhone } from "../phone/index.js";
import { normalizeEmail } from "../email/index.js";

const FENCE_RE = /^```[a-z]*\s*([\s\S]*?)\s*```$/i;

/**
 * Model output → object. Accepts an object (returned as is) or a JSON
 * string, with or without a markdown code fence. Anything else throws an
 * Error whose message starts with "model output is not valid JSON".
 * @param {unknown} input
 * @returns {Record<string, any> | any[]}
 */
export function parseModelJson(input) {
  if (input && typeof input === "object") return /** @type {any} */ (input);
  if (typeof input !== "string") {
    throw new Error(`model output is not valid JSON: expected a string or object, got ${input === null ? "null" : typeof input}`);
  }
  const text = input.trim().replace(FENCE_RE, "$1").trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`model output is not valid JSON: ${reason}; starts with ${JSON.stringify(text.slice(0, 60))}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`model output is not valid JSON: expected an object or array, got ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

/** @typedef {"text" | "email" | "phone" | "date"} FieldKind */

/** Field kinds for a typical dispatch extraction. */
export const DEFAULT_EXTRACTION_SCHEMA = Object.freeze({
  customerName: "text",
  customerEmail: "email",
  customerPhone: "phone",
  customerAddress: "text",
  appointmentDate: "date",
  bookingId: "text",
  projectManager: "text",
  projectManagerEmail: "email",
  company: "text",
  notes: "text",
});

/**
 * Cleans every field of a model extraction by its kind: text is stripped
 * of invisible characters and flattened; email and phone are normalised
 * (invalid → ""); a date becomes "YYYY-MM-DD" or, when unreadable, stays
 * as cleaned text. Every field that could not be normalised is listed in
 * `issues`.
 * @param {unknown} raw the model output, optionally wrapped in `{ output }`
 * @param {Record<string, FieldKind | string>} [schema]
 * @param {{ defaultCountry?: string }} [options]
 * @returns {{ values: Record<string, string>, issues: { field: string, kind: string, value: unknown }[] }}
 */
export function sanitizeExtraction(raw, schema = DEFAULT_EXTRACTION_SCHEMA, { defaultCountry = "DE" } = {}) {
  const obj = raw && typeof raw === "object" ? /** @type {any} */ (raw) : {};
  const source = obj.output && typeof obj.output === "object" ? obj.output : obj;
  /** @type {Record<string, string>} */
  const values = {};
  /** @type {{ field: string, kind: string, value: unknown }[]} */
  const issues = [];

  for (const [field, kind] of Object.entries(schema)) {
    const value = source[field];
    const present = value !== null && value !== undefined && String(value).trim() !== "";
    switch (kind) {
      case "text":
        values[field] = collapseWhitespace(stripInvisible(value));
        break;
      case "email": {
        const email = normalizeEmail(value);
        values[field] = email ?? "";
        if (present && !email) issues.push({ field, kind, value });
        break;
      }
      case "phone": {
        const phone = normalizePhone(value, { defaultCountry });
        values[field] = phone ?? "";
        if (present && !phone) issues.push({ field, kind, value });
        break;
      }
      case "date": {
        const cleaned = collapseWhitespace(stripInvisible(value));
        const parts = parseDate(cleaned);
        values[field] = parts ? String(toIsoDay(parts)) : cleaned;
        if (present && !parts) issues.push({ field, kind, value });
        break;
      }
      default:
        throw new Error(`sanitizeExtraction: unknown field kind "${kind}" for "${field}"`);
    }
  }
  return { values, issues };
}
