import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { extractEnvelopeId, verifyHmac, getSignatureHeader, parseConnectEvent } from "../lib/docusign/index.js";

const uuidA = "11111111-2222-4333-8444-555555555555";
const uuidM = "6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b";

test("E5 extractEnvelopeId prefers the m= query parameter, even behind &amp;", () => {
  const html = `<a href="https://app.docusign.com/documents/details?a=${uuidA}&amp;m=${uuidM}">Review documents</a>`;
  assert.deepEqual(extractEnvelopeId(html), { id: uuidM, source: "query-m" });
});

test("E5 extractEnvelopeId reads an envelopes/<uuid> path", () => {
  assert.deepEqual(extractEnvelopeId(`see https://demo.docusign.net/restapi/v2.1/accounts/1/envelopes/${uuidM}`), {
    id: uuidM,
    source: "path",
  });
});

test("extractEnvelopeId: remaining strategies in order, lower-cased id", () => {
  assert.deepEqual(extractEnvelopeId(`?envelopeId=${uuidA.toUpperCase()}`), { id: uuidA, source: "query-envelopeId" });
  assert.deepEqual(extractEnvelopeId(`Envelope ID: ${uuidA}`), { id: uuidA, source: "label" });
  assert.deepEqual(extractEnvelopeId(`ref ${uuidA} end`), { id: uuidA, source: "loose" });
  assert.equal(extractEnvelopeId("nothing here"), null);
  assert.equal(extractEnvelopeId(null), null);
});

test("extractEnvelopeId accepts an Outlook message object", () => {
  assert.deepEqual(extractEnvelopeId({ subject: "x", body: { content: `?m=${uuidM}` } }), { id: uuidM, source: "query-m" });
  assert.deepEqual(extractEnvelopeId({ bodyPreview: `envelopes/${uuidM}` }), { id: uuidM, source: "path" });
});

// N3 — fixed vector, computed once with Node's crypto and frozen here.
const vector = {
  body: '{"event":"envelope-completed","data":{"envelopeId":"6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b"}}',
  secret: "n8n-patterns-test-secret",
  hex: "ea8875ebdd63a3e4f29f9b3739ce55f2e63090c26c34053228ffdfb233d10fd1",
  base64: "6oh1691jo+Tyn5s3Oc5V8uYwkMJsNAUyKP/fsjPRD9E=",
};

test("N3 verifyHmac: known vector passes (hex and base64 header)", () => {
  assert.equal(verifyHmac(vector.body, vector.hex, vector.secret), true);
  assert.equal(verifyHmac(vector.body, vector.base64, vector.secret), true);
  assert.equal(verifyHmac(Buffer.from(vector.body, "utf8"), vector.base64, vector.secret), true);
});

test("N3 verifyHmac: one changed byte fails", () => {
  const tampered = vector.body.replace("completed", "completeD");
  assert.equal(verifyHmac(tampered, vector.hex, vector.secret), false);
  assert.equal(verifyHmac(vector.body, vector.hex.replace(/^e/, "f"), vector.secret), false);
  assert.equal(verifyHmac(vector.body, "", vector.secret), false);
  assert.equal(verifyHmac(vector.body, "short", vector.secret), false);
});

test("N3 verifyHmac requires a secret and a raw body", () => {
  assert.throws(() => verifyHmac(vector.body, vector.hex, ""), /secret/);
  assert.throws(() => verifyHmac(/** @type {any} */ ({ parsed: true }), vector.hex, vector.secret), /raw body/);
});

test("N3 verifyHmac compares with crypto.timingSafeEqual, not ===", () => {
  const src = readFileSync(new URL("../lib/docusign/hmac.js", import.meta.url), "utf8");
  assert.ok(src.includes("timingSafeEqual"), "timingSafeEqual must be used");
  assert.equal(/digest\(\)\s*[!=]==/.test(src), false, "digest must not be compared with ===/!==");
});

test("getSignatureHeader finds the header regardless of case", () => {
  assert.equal(getSignatureHeader({ "X-DocuSign-Signature-1": "abc" }), "abc");
  assert.equal(getSignatureHeader({ "x-docusign-signature-1": "abc" }), "abc");
  assert.equal(getSignatureHeader({ other: "x" }), null);
  assert.equal(getSignatureHeader(null), null);
});

test("parseConnectEvent reads the Connect v2.1 shape", () => {
  const body = {
    event: "envelope-completed",
    apiVersion: "v2.1",
    data: { envelopeId: uuidM, envelopeSummary: { status: "completed", completedDateTime: "2026-05-11T10:00:00Z" } },
  };
  assert.deepEqual(parseConnectEvent(body), {
    eventType: "envelope-completed",
    apiVersion: "v2.1",
    envelopeId: uuidM,
    envelopeStatus: "completed",
    completedDateTime: "2026-05-11T10:00:00Z",
  });
  assert.deepEqual(parseConnectEvent(JSON.stringify(body)), parseConnectEvent(body));
  assert.throws(() => parseConnectEvent({ event: "x" }), /envelopeId/);
});
