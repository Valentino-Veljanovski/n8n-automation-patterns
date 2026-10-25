import { test } from "node:test";
import assert from "node:assert/strict";

import { createApprovalGate } from "../../lib/approval/index.js";
import { skipReason, oldSource, requireOld, extractFunctions } from "./old-loader.js";

const ASSISTANT = "slack-multilingual-executive-assistant-snippets/snippets/";
const OUTLOOK = "outlook-email-routing-automation-snippets/snippets/";

const draft = { recipient: "max@example.de", subject: "Re: lunch", body: "Sorry.", targetLanguage: "ro", calendarSlot: "2026-05-12T12:00" };

test("differential approval: assistant approval-gate", { skip: skipReason }, () => {
  const old = extractFunctions(oldSource(ASSISTANT + "approval-gate.js"), ["buildEmailPreview", "canSendEmail"]);
  const gate = createApprovalGate("slack");
  assert.deepEqual(gate.buildPreview(draft), old.buildEmailPreview(draft));
  // Deviation (recorded): for a draft without language or slot the old code
  // emitted `targetLanguage: undefined, calendarSlot: null`; the new preview
  // leaves absent fields out, so every gate kind has the same key set.
  const minimal = { recipient: "x", subject: "s", body: "b" };
  const oldMinimal = old.buildEmailPreview(minimal);
  assert.equal(oldMinimal.calendarSlot, null);
  assert.equal("targetLanguage" in oldMinimal, true);
  const newMinimal = gate.buildPreview(minimal);
  assert.equal("calendarSlot" in newMinimal, false);
  const oldRest = { ...oldMinimal };
  delete oldRest.targetLanguage;
  delete oldRest.calendarSlot;
  assert.deepEqual(newMinimal, oldRest);
  for (const state of [gate.buildPreview(draft), gate.approve(gate.buildPreview(draft)), { type: "reply_preview", status: "approved" }]) {
    assert.equal(gate.canExecute(state), old.canSendEmail(state));
  }
});

test("differential approval: outlook approval-gate", { skip: skipReason }, () => {
  const old = requireOld(OUTLOOK + "approval-gate.js");
  const gate = createApprovalGate("email");
  assert.deepEqual(gate.buildPreview(draft), old.buildReplyPreview(draft));
  for (const state of [gate.buildPreview(draft), gate.approve(gate.buildPreview(draft)), { type: "email_preview", status: "approved" }]) {
    assert.equal(gate.canExecute(state), old.canSendReply(state));
    assert.deepEqual(gate.nextAction(state), old.nextReplyAction(state));
  }
});
