import { test } from "node:test";
import assert from "node:assert/strict";

import { parseModelJson, sanitizeExtraction, DEFAULT_EXTRACTION_SCHEMA, buildPrompt, TOOL_REGISTRY, findTool } from "../lib/llm/index.js";
import * as lib from "../lib/index.js";

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

const CASE = {
  company: "Acme GmbH",
  customerName: "Max Muster",
  address: "Musterstraße 1, 80331 München",
  phone: "+49891234567",
  status: "In Progress",
  priority: "high",
  reportedOn: "11.05.2026",
  assignedTo: "Eva",
  notes: "",
};

test("LLM buildPrompt: the system prompt contains only template text and the given fields", () => {
  const out = buildPrompt({ caseData: CASE, history: [], currentText: "Please draft a short reply.", senderBlock: "Acme GmbH | ops@example.de" });
  assert.equal(
    out.systemPrompt,
    [
      "You are an email-drafting assistant for an operations team.",
      "You help the user write professional German business emails about a customer case.",
      "",
      "Case data:",
      "- Company: Acme GmbH",
      "- Customer name: Max Muster",
      "- Address: Musterstraße 1, 80331 München",
      "- Phone: +49891234567",
      "- Status: In Progress",
      "- Priority: high",
      "- Reported on: 11.05.2026",
      "- Assigned to: Eva",
      "- Notes: ",
      "",
      "OUTPUT RULES (always follow):",
      "1. Reply in German.",
      "2. Formal tone, Sie / Ihr.",
      '3. Every email needs: "Betreff:" line, salutation, body, sign-off.',
      "4. Sender block: Acme GmbH | ops@example.de",
      "",
      "WORKFLOW RULES:",
      "5. If the recipient email address is NOT known, ASK FIRST. Do not draft an email without a recipient.",
      "6. Once the address is known, immediately produce the full draft.",
      "7. If the user asks for changes, revise and re-show the draft.",
      "8. When the user types SEND, dispatch the email via the Outlook tool without further confirmation.",
      "9. After a successful send, confirm: '✅ Email sent to <recipient>'.",
      "10. If sending fails, surface the error: '❌ Send failed: <reason>'.",
      "",
      "CURRENT STATE:",
      "❓ Recipient address not yet known. Ask for it first.",
    ].join("\n"),
  );
  assert.equal(out.chatInput, "Please draft a short reply.");
  assert.equal(out.isSendTrigger, false);
  assert.equal(out.hasRecipient, false);
});

test("LLM buildPrompt: recipient detection, send trigger, history and placeholders", () => {
  const withHistory = buildPrompt({
    caseData: CASE,
    history: [{ role: "user", content: "send it to max@example.de" }, { role: "assistant", content: "Draft follows" }],
    currentText: "shorter please",
  });
  assert.equal(withHistory.hasRecipient, true);
  assert.ok(withHistory.systemPrompt.includes("📧 Recipient address known. Draft or revise."));
  assert.ok(withHistory.systemPrompt.endsWith("\n\nConversation so far:\nUser: send it to max@example.de\nAssistant: Draft follows"));
  const send = buildPrompt({ caseData: CASE, history: [], currentText: " send " });
  assert.equal(send.isSendTrigger, true);
  assert.ok(send.systemPrompt.includes("⚡ User typed SEND. Dispatch via Outlook tool now."));
  const custom = buildPrompt({ caseData: { company: null, customerName: "-" }, currentText: "GO", sendTrigger: "GO" });
  assert.equal(custom.isSendTrigger, true);
  assert.ok(custom.systemPrompt.includes("- Company: \n- Customer name: \n"));
  assert.ok(custom.systemPrompt.includes("4. Sender block: [Sender name] | [sender address]"));
});

test("LLM TOOL_REGISTRY lists only functions implemented in this repository", () => {
  assert.ok(TOOL_REGISTRY.length >= 5);
  const names = TOOL_REGISTRY.map((t) => t.name);
  assert.equal(new Set(names).size, names.length, "names are unique");
  for (const tool of TOOL_REGISTRY) {
    assert.equal(typeof tool.description, "string");
    assert.equal(typeof tool.handler, "function");
    assert.equal(tool.handler, /** @type {Record<string, any>} */ (lib)[tool.name], `${tool.name} is the exported function of that name`);
  }
  assert.equal(findTool("normalizePhone")?.handler("089 1234567"), "+49891234567");
  assert.equal(findTool("webSearch"), null);
});

test("sanitizeExtraction with a custom schema and country", () => {
  const { values } = sanitizeExtraction({ tel: "0664 1234567" }, { tel: "phone" }, { defaultCountry: "AT" });
  assert.equal(values.tel, "+436641234567");
  assert.equal(Object.keys(DEFAULT_EXTRACTION_SCHEMA).length, 10);
  assert.throws(() => sanitizeExtraction({ x: 1 }, { x: "colour" }), /unknown field kind/);
});
