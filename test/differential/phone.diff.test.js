import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizePhone } from "../../lib/phone/index.js";
import { skipReason, oldSource, extractFunctions } from "./old-loader.js";

const DISPATCH = "multi-region-dispatch-automation-snippets/snippets/";

test("differential phone: appointment-date-filter normalizePhone", { skip: skipReason }, () => {
  const old = extractFunctions(oldSource(DISPATCH + "appointment-date-filter.js"), ["normalizePhone"]);
  for (const input of ["089 1234567", "+49 89 1234567", "+49891234567", "089-1234567"]) {
    assert.equal(normalizePhone(input), old.normalizePhone(input), JSON.stringify(input));
  }
  // Empty input: old "" → new null (both are "no phone"); nodes/ wrappers map null to "".
  assert.equal(old.normalizePhone(""), "");
  assert.equal(normalizePhone(""), null);
  // E9: old → new
  assert.equal(old.normalizePhone("0049 89 1234567"), "+49049891234567");
  assert.equal(normalizePhone("0049 89 1234567"), "+49891234567");
  assert.equal(old.normalizePhone("+49 (0) 89 1234567"), "+490891234567");
  assert.equal(normalizePhone("+49 (0) 89 1234567"), "+49891234567");
});

test("differential phone: llm-output-sanitizer sanitizePhone is the deleted second normaliser", { skip: skipReason }, () => {
  const old = extractFunctions(oldSource(DISPATCH + "llm-output-sanitizer.js"), ["sanitizePhone"]);
  // The old second normaliser did not normalise at all: it kept spaces,
  // dashes and parentheses, so the same number had two shapes in one repo.
  assert.equal(old.sanitizePhone("+49 (0) 89 1234567"), "+49 (0) 89 1234567");
  assert.equal(normalizePhone("+49 (0) 89 1234567"), "+49891234567");
  assert.equal(old.sanitizePhone("089 1234567"), "089 1234567");
  assert.equal(normalizePhone("089 1234567"), "+49891234567");
});
