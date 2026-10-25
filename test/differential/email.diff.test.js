import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeEmail, normalizeInboundMail, decideRoute } from "../../lib/email/index.js";
import { skipReason, oldSource, requireOld, extractFunctions } from "./old-loader.js";

const DISPATCH = "multi-region-dispatch-automation-snippets/snippets/";
const OUTLOOK = "outlook-email-routing-automation-snippets/snippets/";

test("differential email: llm-output-sanitizer sanitizeEmail", { skip: skipReason }, () => {
  const old = extractFunctions(oldSource(DISPATCH + "llm-output-sanitizer.js"), ["sanitizeEmail"]);
  // "a@b" is included on purpose: the old regex already required a dotted
  // domain, so E3 is a tightening on the extractEmail side, not a change here.
  for (const input of [" Max@Example.DE ", "max@example.de", "bad", "", null, "a b@example.de", "a@b", "a.b+c@example.de"]) {
    assert.equal(normalizeEmail(input) ?? "", old.sanitizeEmail(input), JSON.stringify(input));
  }
});

test("differential email: outlook email-field-normalizer", { skip: skipReason }, () => {
  const old = requireOld(OUTLOOK + "email-field-normalizer.js");
  const samples = [
    { id: "1", from: "Max@Example.DE", subject: " Hi ", bodyText: " body ", hasAttachments: true, receivedDateTime: "2026-05-11T06:00:00Z" },
    { from: "ops@example.de", bodyPreview: "preview" },
    {},
  ];
  for (const sample of samples) {
    const o = old.normalizeEmail(sample);
    const n = /** @type {Record<string, unknown>} */ (normalizeInboundMail(sample));
    for (const key of ["messageId", "sender", "subject", "bodyText", "hasAttachments", "receivedAt"]) {
      assert.equal(n[key], o[key], `${key} for ${JSON.stringify(sample)}`);
    }
  }
});

test("differential email: outlook routing-decision-helper", { skip: skipReason }, () => {
  const old = requireOld(OUTLOOK + "routing-decision-helper.js");
  for (const c of [
    { category: "accounting", confidence: 0.9 },
    { category: "Offers", confidence: 0.65 },
    { category: "spam", confidence: 0.64 },
    { category: "unknown", confidence: 1 },
    {},
  ]) {
    assert.deepEqual(decideRoute(c), old.decideEmailRoute(c), JSON.stringify(c));
  }
});
