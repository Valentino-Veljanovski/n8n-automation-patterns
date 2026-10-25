/**
 * Envelope IDs from DocuSign notification emails and Connect events. Kept
 * apart from the HMAC code so a script that only extracts IDs bundles
 * without node:crypto.
 */
import { decodeHtmlEntities } from "../text/index.js";

const UUID = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";

/** Strategies in order of reliability; the first match wins. */
const STRATEGIES = [
  { source: "query-m", re: new RegExp(`[?&]m=${UUID}`, "i") },
  { source: "query-envelopeId", re: new RegExp(`[?&]envelopeId=${UUID}`, "i") },
  { source: "path", re: new RegExp(`envelopes/${UUID}`, "i") },
  { source: "label", re: new RegExp(`envelope\\s*id\\s*[:\\-]?\\s*${UUID}`, "i") },
  { source: "loose", re: new RegExp(UUID, "i") },
];

/** @param {any} input */
function textOf(input) {
  if (typeof input === "string") return input;
  if (!input || typeof input !== "object") return "";
  const body = input.body;
  if (body && typeof body === "object" && typeof body.content === "string") return body.content;
  if (typeof body === "string") return body;
  return typeof input.bodyPreview === "string" ? input.bodyPreview : "";
}

/**
 * Finds the envelope UUID in a DocuSign notification (string or Outlook
 * message object). HTML entities are decoded first so `&amp;m=` matches.
 * @param {unknown} input
 * @returns {{ id: string, source: "query-m" | "query-envelopeId" | "path" | "label" | "loose" } | null}
 */
export function extractEnvelopeId(input) {
  const text = decodeHtmlEntities(textOf(input));
  if (!text) return null;
  for (const { source, re } of STRATEGIES) {
    const m = re.exec(text);
    if (m) return { id: m[1].toLowerCase(), source: /** @type {any} */ (source) };
  }
  return null;
}

/**
 * Reads the fields a Connect v2.1 event carries. Throws when there is no
 * envelope ID, since nothing downstream can work without one.
 * @param {unknown} body parsed object or JSON string
 */
export function parseConnectEvent(body) {
  const b = typeof body === "string" ? JSON.parse(body) : body;
  if (!b || typeof b !== "object") throw new Error("parseConnectEvent: body is not an object");
  const data = /** @type {any} */ (b).data ?? {};
  const envelopeId = data.envelopeId ?? null;
  if (!envelopeId) throw new Error("parseConnectEvent: event has no envelopeId");
  return {
    eventType: String(/** @type {any} */ (b).event ?? ""),
    apiVersion: String(/** @type {any} */ (b).apiVersion ?? ""),
    envelopeId: String(envelopeId),
    envelopeStatus: String(data.envelopeSummary?.status ?? ""),
    completedDateTime: data.envelopeSummary?.completedDateTime ?? null,
  };
}
