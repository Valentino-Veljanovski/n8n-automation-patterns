/**
 * Email addresses and inbound Outlook messages.
 */
import { stripInvisible, collapseWhitespace, stripHtml } from "../text/index.js";

const LOCAL = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*";
const LABEL = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?";
const DOMAIN = `(?:${LABEL}\\.)+[A-Za-z]{2,63}`;
const EMAIL_RE = new RegExp(`${LOCAL}@${DOMAIN}`);
const EMAIL_EXACT_RE = new RegExp(`^${LOCAL}@${DOMAIN}$`);

/**
 * True for a syntactically complete address with a dotted domain. "a@b"
 * is rejected, "a.b+c@example.de" accepted.
 * @param {unknown} value
 */
export function isValidEmail(value) {
  if (typeof value !== "string") return false;
  const s = stripInvisible(value);
  if (s.length > 254 || !EMAIL_EXACT_RE.test(s)) return false;
  return s.split("@")[0].length <= 64;
}

/**
 * First address found anywhere in the text ("Max <max@example.de>"),
 * lower-cased; null when there is none.
 * @param {unknown} value
 * @returns {string | null}
 */
export function extractEmail(value) {
  if (value === null || value === undefined) return null;
  const m = EMAIL_RE.exec(stripInvisible(value));
  if (!m) return null;
  const found = m[0].toLowerCase();
  return isValidEmail(found) ? found : null;
}

/**
 * Trims, removes invisible characters and inner whitespace, lower-cases,
 * validates. Invalid → null.
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeEmail(value) {
  if (value === null || value === undefined) return null;
  const s = stripInvisible(value).replace(/\s+/g, "").toLowerCase();
  return isValidEmail(s) ? s : null;
}

/**
 * @typedef {Object} InboundMail
 * @property {string | null} messageId
 * @property {string} sender lower-cased address, "" when absent
 * @property {string} senderName
 * @property {string} subject
 * @property {string} bodyText plain text
 * @property {boolean} hasAttachments
 * @property {string | null} receivedAt
 */

/**
 * Normalises a message from the Microsoft Graph / n8n Outlook trigger
 * shape (`from.emailAddress`, `body.content`, `bodyPreview`) or a flat
 * shape (`from`, `bodyText`) into one predictable object.
 * @param {any} message
 * @returns {InboundMail}
 */
export function normalizeInboundMail(message) {
  const m = message && typeof message === "object" ? message : {};
  let sender = "";
  let senderName = "";
  const from = m.from;
  if (typeof from === "string") {
    sender = extractEmail(from) ?? from.toLowerCase().trim();
    const namePart = from.split("<")[0];
    senderName = namePart.includes("@") ? "" : collapseWhitespace(namePart).replace(/^"|"$/g, "");
  } else if (from && typeof from === "object") {
    const addr = from.emailAddress ?? from;
    sender = normalizeEmail(addr.address) ?? "";
    senderName = collapseWhitespace(addr.name);
  }

  let bodyText = "";
  if (typeof m.bodyText === "string") bodyText = m.bodyText.trim();
  else if (m.body && typeof m.body === "object" && typeof m.body.content === "string") {
    bodyText = /html/i.test(String(m.body.contentType ?? "")) ? stripHtml(m.body.content) : m.body.content.trim();
  } else if (typeof m.body === "string") bodyText = m.body.trim();
  else if (typeof m.bodyPreview === "string") bodyText = m.bodyPreview.trim();

  return {
    messageId: m.id ?? m.messageId ?? null,
    sender,
    senderName,
    subject: collapseWhitespace(m.subject),
    bodyText,
    hasAttachments: Boolean(m.hasAttachments) || (Array.isArray(m.attachments) && m.attachments.length > 0),
    receivedAt: m.receivedDateTime ?? m.receivedAt ?? null,
  };
}

/** Category → action map used when none is injected. */
export const DEFAULT_ROUTE_ACTIONS = Object.freeze({
  accounting: "forward_to_accounting",
  offers: "move_to_offers",
  meeting_notes: "move_to_notes",
  marketing: "move_to_marketing",
  spam: "quarantine",
  replies: "move_to_replies",
  unclassified: "notify_for_review",
});

/**
 * Turns a classifier result into a routing action. Unknown categories and
 * confidence below the threshold go to review.
 * @param {{ category?: unknown, confidence?: unknown } | null | undefined} classification
 * @param {{ actions?: Record<string, string>, minConfidence?: number, reviewAction?: string }} [options]
 * @returns {{ action: string, reason: string }}
 */
export function decideRoute(classification, { actions = DEFAULT_ROUTE_ACTIONS, minConfidence = 0.65, reviewAction = "notify_for_review" } = {}) {
  const c = classification ?? {};
  const category = String(c.category ?? "").toLowerCase();
  const confidence = Number(c.confidence ?? 0);
  if (!actions[category] || !(confidence >= minConfidence)) {
    return { action: reviewAction, reason: "Low confidence or unknown category" };
  }
  return { action: actions[category], reason: `Matched ${category} with confidence ${confidence}` };
}
