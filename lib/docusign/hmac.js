/**
 * DocuSign Connect webhook verification (needs node:crypto).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Checks the HMAC-SHA256 DocuSign Connect puts in `X-DocuSign-Signature-1`.
 * The body must be the raw bytes DocuSign sent (string or Buffer), never a
 * re-serialised object. The header may be base64 (what DocuSign sends) or
 * hex. Comparison is constant-time.
 * @param {string | Buffer} rawBody
 * @param {unknown} signatureHeader
 * @param {string} secret
 */
export function verifyHmac(rawBody, signatureHeader, secret) {
  if (typeof secret !== "string" || !secret) throw new Error("verifyHmac: secret is required");
  if (!(typeof rawBody === "string" || Buffer.isBuffer(rawBody))) {
    throw new Error("verifyHmac: raw body must be a string or Buffer (hash the bytes DocuSign sent, not a parsed object)");
  }
  if (typeof signatureHeader !== "string" || !signatureHeader.trim()) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const sig = signatureHeader.trim();
  const provided = /^[0-9a-f]{64}$/i.test(sig) ? Buffer.from(sig, "hex") : Buffer.from(sig, "base64");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/**
 * Case-insensitive lookup of the first signature header.
 * @param {Record<string, unknown> | null | undefined} headers
 * @returns {string | null}
 */
export function getSignatureHeader(headers) {
  if (!headers || typeof headers !== "object") return null;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "x-docusign-signature-1" && typeof value === "string") return value;
  }
  return null;
}
