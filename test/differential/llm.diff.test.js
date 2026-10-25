import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPrompt } from "../../lib/llm/index.js";
import { skipReason, oldSource, createN8nContext, runCodeNode } from "./old-loader.js";

const RECLAMATION = "internal-reclamation-case-management-snippets/snippets/";

test("differential llm: reclamation llm-agent-prompt-builder", { skip: skipReason }, () => {
  const src = oldSource(RECLAMATION + "llm-agent-prompt-builder.js");
  const contextData = { company: "Acme", customerName: "Max", address: "Str. 1", phone: "-", status: "open", priority: "high", reportedOn: "11.05.2026", assignedTo: "Eva", notes: null };
  const cases = [
    { history: [], currentText: "draft please" },
    { history: [{ role: "user", content: "to max@example.de" }], currentText: "shorter" },
    { history: [], currentText: " SEND " },
    { history: [], currentText: "send" },
  ];
  for (const c of cases) {
    const [old] = runCodeNode(src, createN8nContext({ items: [{ contextData, history: c.history, currentText: c.currentText, userId: "U", channelId: "C", threadTs: "1" }] }));
    const n = buildPrompt({ caseData: contextData, history: c.history, currentText: c.currentText, senderBlock: "[Company Name] | ops@example.com" });
    assert.equal(n.isSendTrigger, old.json.isSendTrigger, JSON.stringify(c));
    assert.equal(n.chatInput, old.json.chatInput);
    // Same case lines, same rules, same state marker; the old prompt only
    // differs by line-wrapping of two rule sentences.
    const normalise = (/** @type {string} */ s) => s.replace(/\s+/g, " ");
    assert.equal(normalise(n.systemPrompt), normalise(old.json.systemPrompt), JSON.stringify(c));
  }
});
