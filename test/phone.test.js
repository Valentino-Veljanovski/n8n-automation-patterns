import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizePhone } from "../lib/phone/index.js";

test("E9 normalizePhone: international prefix 00", () => {
  assert.equal(normalizePhone("0049 89 1234567"), "+49891234567");
});

test("E9 normalizePhone: trunk zero in parentheses after the country code", () => {
  assert.equal(normalizePhone("+49 (0) 89 1234567"), "+49891234567");
  assert.equal(normalizePhone("+49 (0)89 / 1234567"), "+49891234567");
});

test("E9 normalizePhone: national number gets the default country", () => {
  assert.equal(normalizePhone("089 1234567"), "+49891234567");
  assert.equal(normalizePhone("089-1234567", { defaultCountry: "DE" }), "+49891234567");
  assert.equal(normalizePhone("0664 1234567", { defaultCountry: "AT" }), "+436641234567");
});

test("E9 normalizePhone never produces +49 followed by a trunk zero", () => {
  for (const raw of ["+49 0 89 1234567", "0049 0 89 1234567", "+49089 1234567", "+49 (0) 89 1234567"]) {
    const out = normalizePhone(raw);
    assert.equal(out, "+49891234567", raw);
    assert.equal(out?.startsWith("+490"), false, raw);
  }
});

test("normalizePhone: already E.164 input is returned unchanged apart from formatting", () => {
  assert.equal(normalizePhone("+49891234567"), "+49891234567");
  assert.equal(normalizePhone("+389 70 123 456"), "+38970123456");
  assert.equal(normalizePhone("+1 (415) 555-0132"), "+14155550132");
});

test("normalizePhone: Italian numbers keep their leading zero", () => {
  assert.equal(normalizePhone("+39 06 1234567"), "+39061234567");
});

test("normalizePhone: empty, letters and absurd lengths give null", () => {
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(null), null);
  assert.equal(normalizePhone(undefined), null);
  assert.equal(normalizePhone("call me"), null);
  assert.equal(normalizePhone("12"), null);
  assert.equal(normalizePhone("+49 89 12345678901234567"), null);
});

test("normalizePhone strips invisible characters and a tel: prefix", () => {
  assert.equal(normalizePhone("tel:\u200B+49 89 1234567"), "+49891234567");
});
