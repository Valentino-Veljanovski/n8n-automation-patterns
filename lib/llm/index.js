/**
 * Language-model output: parsing and cleaning before anything downstream
 * trusts it.
 */
import { parseDate, toIsoDay } from "../dates/index.js";
import { stripInvisible, collapseWhitespace, stripHtml, parseAmountDe, cleanQuery } from "../text/index.js";
import { normalizePhone } from "../phone/index.js";
import { normalizeEmail, extractEmail, decideRoute } from "../email/index.js";
import { extractEnvelopeId } from "../docusign/index.js";

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

/**
 * Prompt lines for a case record: [label, field].
 * @type {readonly (readonly [string, string])[]}
 */
export const DEFAULT_PROMPT_FIELDS = Object.freeze([
  ["Company", "company"],
  ["Customer name", "customerName"],
  ["Address", "address"],
  ["Phone", "phone"],
  ["Status", "status"],
  ["Priority", "priority"],
  ["Reported on", "reportedOn"],
  ["Assigned to", "assignedTo"],
  ["Notes", "notes"],
]);

const RECIPIENT_RE = /@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/** @param {unknown} value */
function promptValue(value) {
  if (value === null || value === undefined || value === "" || value === "-") return "";
  return String(value).trim();
}

/**
 * System prompt for an email-drafting agent working on one case inside a
 * Slack thread. The prompt is rebuilt on every turn from the case fields,
 * the thread history and the current message; the agent keeps no state.
 * @param {{
 *   caseData?: Record<string, unknown>,
 *   history?: { role: string, content: string }[],
 *   currentText?: string,
 *   sendTrigger?: string,
 *   senderBlock?: string,
 *   fields?: readonly (readonly [string, string])[],
 * }} options
 */
export function buildPrompt({ caseData = {}, history = [], currentText = "", sendTrigger = "SEND", senderBlock = "[Sender name] | [sender address]", fields = DEFAULT_PROMPT_FIELDS } = {}) {
  const text = String(currentText ?? "");
  const hasRecipient = history.some((m) => m.role === "user" && RECIPIENT_RE.test(m.content)) || RECIPIENT_RE.test(text);
  const isSendTrigger = text.trim().toUpperCase() === sendTrigger.toUpperCase();
  const historyText = history.length
    ? "\n\nConversation so far:\n" + history.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n")
    : "";
  const state = isSendTrigger
    ? `⚡ User typed ${sendTrigger}. Dispatch via Outlook tool now.`
    : hasRecipient
      ? "📧 Recipient address known. Draft or revise."
      : "❓ Recipient address not yet known. Ask for it first.";

  const systemPrompt =
    [
      "You are an email-drafting assistant for an operations team.",
      "You help the user write professional German business emails about a customer case.",
      "",
      "Case data:",
      ...fields.map(([label, field]) => `- ${label}: ${promptValue(caseData[field])}`),
      "",
      "OUTPUT RULES (always follow):",
      "1. Reply in German.",
      "2. Formal tone, Sie / Ihr.",
      '3. Every email needs: "Betreff:" line, salutation, body, sign-off.',
      `4. Sender block: ${senderBlock}`,
      "",
      "WORKFLOW RULES:",
      "5. If the recipient email address is NOT known, ASK FIRST. Do not draft an email without a recipient.",
      "6. Once the address is known, immediately produce the full draft.",
      "7. If the user asks for changes, revise and re-show the draft.",
      `8. When the user types ${sendTrigger}, dispatch the email via the Outlook tool without further confirmation.`,
      "9. After a successful send, confirm: '✅ Email sent to <recipient>'.",
      "10. If sending fails, surface the error: '❌ Send failed: <reason>'.",
      "",
      "CURRENT STATE:",
      state,
    ].join("\n") + historyText;

  return { systemPrompt, chatInput: text, isSendTrigger, hasRecipient };
}

/**
 * Tools an agent may call. Every entry is a function implemented in this
 * repository; there is no entry for anything that is not.
 * @type {readonly { name: string, description: string, handler: Function }[]}
 */
export const TOOL_REGISTRY = Object.freeze([
  { name: "parseDate", description: "Read a date in German, ISO, English-month or Excel-serial form into calendar parts.", handler: parseDate },
  { name: "normalizePhone", description: "Turn a phone number into E.164.", handler: normalizePhone },
  { name: "extractEmail", description: "Find the first email address in a text.", handler: extractEmail },
  { name: "normalizeEmail", description: "Validate and lower-case an email address.", handler: normalizeEmail },
  { name: "extractEnvelopeId", description: "Find the DocuSign envelope ID in a notification.", handler: extractEnvelopeId },
  { name: "stripHtml", description: "Convert an HTML email body to plain text.", handler: stripHtml },
  { name: "parseAmountDe", description: "Read a German-formatted amount into a number.", handler: parseAmountDe },
  { name: "cleanQuery", description: "Remove file-type words from a search request.", handler: cleanQuery },
  { name: "decideRoute", description: "Map an email classification to a routing action.", handler: decideRoute },
  { name: "parseModelJson", description: "Parse JSON a model returned, code fence included.", handler: parseModelJson },
]);

/**
 * @param {string} name
 * @returns {{ name: string, description: string, handler: Function } | null}
 */
export function findTool(name) {
  return TOOL_REGISTRY.find((t) => t.name === name) ?? null;
}
