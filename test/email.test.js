import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractEmail,
  isValidEmail,
  normalizeEmail,
  normalizeInboundMail,
  decideRoute,
  DEFAULT_ROUTE_ACTIONS,
} from "../lib/email/index.js";

test("E3 extractEmail pulls the address out of a display-name form", () => {
  assert.equal(extractEmail("Max Mustermann <max@example.de>"), "max@example.de");
});

test("E3 extractEmail ignores zero-width characters inside the address", () => {
  assert.equal(extractEmail("john\u200B@example.com"), "john@example.com");
});

test("E3 isValidEmail rejects a bare host and accepts plus addressing", () => {
  assert.equal(isValidEmail("a@b"), false);
  assert.equal(isValidEmail("a.b+c@example.de"), true);
});

test("extractEmail: lower-cases, returns null when nothing is found", () => {
  assert.equal(extractEmail("Reply to MAX@Example.DE please"), "max@example.de");
  assert.equal(extractEmail("no address here"), null);
  assert.equal(extractEmail(null), null);
});

test("isValidEmail: common invalid shapes", () => {
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidEmail("a@@b.de"), false);
  assert.equal(isValidEmail(".a@b.de"), false);
  assert.equal(isValidEmail("a..b@b.de"), false);
  assert.equal(isValidEmail("a b@b.de"), false);
  assert.equal(isValidEmail("a@b.d"), false);
  assert.equal(isValidEmail("ops@sub.example.co.uk"), true);
  assert.equal(isValidEmail(undefined), false);
});

test("normalizeEmail trims, lower-cases and validates", () => {
  assert.equal(normalizeEmail("  Max@Example.DE \n"), "max@example.de");
  assert.equal(normalizeEmail("john\u200B@example.com"), "john@example.com");
  assert.equal(normalizeEmail("a@b"), null);
  assert.equal(normalizeEmail(""), null);
  assert.equal(normalizeEmail(null), null);
});

test("normalizeInboundMail: Microsoft Graph message shape", () => {
  const out = normalizeInboundMail({
    id: "AAMk1",
    from: { emailAddress: { name: "Max Mustermann", address: "Max@Example.DE" } },
    subject: "  Auftrag\n123 ",
    body: { contentType: "html", content: "<p>Hallo &amp; Grüße</p>" },
    bodyPreview: "Hallo & Grüße",
    hasAttachments: true,
    receivedDateTime: "2026-05-11T06:00:00Z",
  });
  assert.deepEqual(out, {
    messageId: "AAMk1",
    sender: "max@example.de",
    senderName: "Max Mustermann",
    subject: "Auftrag 123",
    bodyText: "Hallo & Grüße",
    hasAttachments: true,
    receivedAt: "2026-05-11T06:00:00Z",
  });
});

test("normalizeInboundMail: flat shape and missing fields", () => {
  const out = normalizeInboundMail({ from: "Max <max@example.de>", bodyText: " text ", attachments: [{ size: 1 }] });
  assert.deepEqual(out, {
    messageId: null,
    sender: "max@example.de",
    senderName: "Max",
    subject: "",
    bodyText: "text",
    hasAttachments: true,
    receivedAt: null,
  });
  assert.equal(normalizeInboundMail(null).sender, "");
});

test("decideRoute maps a confident category to its action", () => {
  assert.deepEqual(decideRoute({ category: "Accounting", confidence: 0.9 }), {
    action: "forward_to_accounting",
    reason: "Matched accounting with confidence 0.9",
  });
});

test("decideRoute sends low confidence and unknown categories to review", () => {
  assert.deepEqual(decideRoute({ category: "accounting", confidence: 0.5 }), {
    action: "notify_for_review",
    reason: "Low confidence or unknown category",
  });
  assert.equal(decideRoute({ category: "nonsense", confidence: 0.99 }).action, "notify_for_review");
  assert.equal(decideRoute({}).action, "notify_for_review");
});

test("decideRoute accepts a custom action map and threshold", () => {
  const actions = { vip: "page_on_call" };
  assert.equal(decideRoute({ category: "vip", confidence: 0.7 }, { actions, minConfidence: 0.6 }).action, "page_on_call");
  assert.equal(decideRoute({ category: "vip", confidence: 0.5 }, { actions, minConfidence: 0.6 }).action, "notify_for_review");
  assert.equal(DEFAULT_ROUTE_ACTIONS.spam, "quarantine");
});
