import { test } from "node:test";
import assert from "node:assert/strict";

import { createApprovalGate, GATE_PRESETS } from "../lib/approval/index.js";

const draft = { recipient: "max@example.de", subject: "Re: lunch", body: "Sorry, cannot make it." };

test("approval: slack and email gates produce the same {type,status,actions} shape", () => {
  const slack = createApprovalGate("slack").buildPreview(draft);
  const email = createApprovalGate("email").buildPreview(draft);
  assert.deepEqual(Object.keys(slack), Object.keys(email));
  assert.deepEqual(slack, {
    type: "email_preview",
    status: "awaiting_approval",
    recipient: "max@example.de",
    subject: "Re: lunch",
    body: "Sorry, cannot make it.",
    actions: ["approve_send", "edit_draft", "cancel"],
  });
  assert.deepEqual(email, {
    type: "reply_preview",
    status: "awaiting_approval",
    recipient: "max@example.de",
    subject: "Re: lunch",
    body: "Sorry, cannot make it.",
    actions: ["approve_send", "decline", "manual_review"],
  });
});

test("approval: nothing executes until the preview is approved", () => {
  const gate = createApprovalGate("email");
  const preview = gate.buildPreview(draft);
  assert.equal(gate.canExecute(preview), false);
  assert.deepEqual(gate.nextAction(preview), { action: "hold_draft", message: "Manual approval is required before sending." });
  const approved = gate.approve(preview);
  assert.equal(approved.status, "approved");
  assert.equal(preview.status, "awaiting_approval", "approve returns a copy");
  assert.equal(gate.canExecute(approved), true);
  assert.deepEqual(gate.nextAction(approved), { action: "send_reply", message: "Approved reply can be sent." });
  assert.equal(gate.canExecute({ type: "email_preview", status: "approved" }), false, "a preview of another kind is not accepted");
  assert.equal(gate.canExecute(null), false);
});

test("approval: slack gate wording and custom overrides", () => {
  const slack = createApprovalGate("slack");
  assert.deepEqual(slack.nextAction(slack.buildPreview(draft)), { action: "show_preview", message: "Please review and approve the email before sending." });
  assert.deepEqual(slack.nextAction(slack.approve(slack.buildPreview(draft))), { action: "send_email", message: "Approved email can be sent." });
  const custom = createApprovalGate("email", { actions: ["ok", "no"], type: "custom_preview" });
  assert.deepEqual(custom.buildPreview({ recipient: "x" }).actions, ["ok", "no"]);
  assert.equal(custom.buildPreview({ recipient: "x" }).type, "custom_preview");
  assert.throws(() => createApprovalGate(/** @type {any} */ ("fax")), /unknown approval gate kind/);
  assert.deepEqual(Object.keys(GATE_PRESETS), ["slack", "email"]);
});
