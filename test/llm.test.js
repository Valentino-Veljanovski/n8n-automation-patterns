import { test } from "node:test";
import assert from "node:assert/strict";

import { parseModelJson, sanitizeExtraction, DEFAULT_EXTRACTION_SCHEMA } from "../lib/llm/index.js";

test("E4 parseModelJson parses a JSON string", () => {
  assert.deepEqual(parseModelJson('{"a":1}'), { a: 1 });
});

test("E4 parseModelJson passes an object through", () => {
  assert.deepEqual(parseModelJson({ a: 1 }), { a: 1 });
});

test("E4 parseModelJson throws a clear error on non-JSON", () => {
  assert.throws(() => parseModelJson("not json"), /model output is not valid JSON/);
  assert.throws(() => parseModelJson(""), /model output is not valid JSON/);
  assert.throws(() => parseModelJson(undefined), /model output is not valid JSON/);
  assert.throws(() => parseModelJson("42"), /model output is not valid JSON/);
});

test("parseModelJson tolerates a markdown code fence around the JSON", () => {
  assert.deepEqual(parseModelJson('```json\n{"a": [1, 2]}\n```'), { a: [1, 2] });
  assert.deepEqual(parseModelJson("```\n{\"b\":true}\n```"), { b: true });
});

test("sanitizeExtraction cleans every field by its kind", () => {
  const raw = {
    output: {
      customerName: "  Max\u200B Mustermann\n",
      customerEmail: " Max@Example.DE ",
      customerPhone: "089 1234567",
      customerAddress: "Musterstraße 1,\r\n80331 München",
      appointmentDate: "11.05.2026",
      bookingId: " SRL-1042 ",
      projectManager: "",
      projectManagerEmail: "a@b",
      company: null,
      notes: "Call\tfirst",
    },
  };
  const { values, issues } = sanitizeExtraction(raw);
  assert.deepEqual(values, {
    customerName: "Max Mustermann",
    customerEmail: "max@example.de",
    customerPhone: "+49891234567",
    customerAddress: "Musterstraße 1, 80331 München",
    appointmentDate: "2026-05-11",
    bookingId: "SRL-1042",
    projectManager: "",
    projectManagerEmail: "",
    company: "",
    notes: "Call first",
  });
  assert.deepEqual(issues, [{ field: "projectManagerEmail", kind: "email", value: "a@b" }]);
});

test("sanitizeExtraction keeps an unparsable date as cleaned text and reports it", () => {
  const { values, issues } = sanitizeExtraction({ appointmentDate: " next\u200B Tuesday " }, { appointmentDate: "date" });
  assert.equal(values.appointmentDate, "next Tuesday");
  assert.deepEqual(issues, [{ field: "appointmentDate", kind: "date", value: " next\u200B Tuesday " }]);
});

test("sanitizeExtraction with a custom schema and country", () => {
  const { values } = sanitizeExtraction({ tel: "0664 1234567" }, { tel: "phone" }, { defaultCountry: "AT" });
  assert.equal(values.tel, "+436641234567");
  assert.equal(Object.keys(DEFAULT_EXTRACTION_SCHEMA).length, 10);
  assert.throws(() => sanitizeExtraction({ x: 1 }, { x: "colour" }), /unknown field kind/);
});
