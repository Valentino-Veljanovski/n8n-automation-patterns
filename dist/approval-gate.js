/**
 * Run mode:   Run Once for Each Item
 * Script:     approval-gate — nothing is sent before a person approved the
 *             preview. First pass: build the preview from a draft. Later pass:
 *             the same preview with status "approved" releases the action.
 * Input:      json = a draft { recipient, subject, body, … } or a preview that
 *             came back from Slack ({ type, status, … }); json.gateKind
 *             "slack" (default) or "email" picks the wording and actions
 * Output:     one item: json = { action, message, preview }
 *             action is show_preview / hold_draft while waiting, send_email /
 *             send_reply once approved
 * Uses:       lib/approval createApprovalGate
 * Built-ins:  none
 */
"use strict";
var __node = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // nodes/approval-gate.js
  var approval_gate_exports = {};
  __export(approval_gate_exports, {
    run: () => run
  });

  // lib/approval/index.js
  var GATE_PRESETS = Object.freeze({
    slack: {
      type: "email_preview",
      fields: ["recipient", "subject", "body", "targetLanguage", "calendarSlot"],
      actions: ["approve_send", "edit_draft", "cancel"],
      hold: { action: "show_preview", message: "Please review and approve the email before sending." },
      execute: { action: "send_email", message: "Approved email can be sent." }
    },
    email: {
      type: "reply_preview",
      fields: ["recipient", "subject", "body"],
      actions: ["approve_send", "decline", "manual_review"],
      hold: { action: "hold_draft", message: "Manual approval is required before sending." },
      execute: { action: "send_reply", message: "Approved reply can be sent." }
    }
  });
  function createApprovalGate(kind, overrides = {}) {
    const preset = GATE_PRESETS[kind];
    if (!preset) throw new Error(`createApprovalGate: unknown approval gate kind "${kind}"`);
    const type = overrides.type ?? preset.type;
    const actions = [...overrides.actions ?? preset.actions];
    const fields = [...overrides.fields ?? preset.fields];
    const canExecute = (state) => {
      const s = (
        /** @type {any} */
        state
      );
      return Boolean(s) && typeof s === "object" && s.type === type && s.status === "approved";
    };
    return {
      kind,
      type,
      actions,
      /**
       * @param {Record<string, any>} draft
       * @returns {Record<string, any>}
       */
      buildPreview(draft) {
        const preview = { type, status: "awaiting_approval" };
        for (const field of fields) {
          if (draft?.[field] !== void 0) preview[field] = draft[field];
        }
        preview.actions = [...actions];
        return preview;
      },
      /** @param {Record<string, any>} state */
      approve(state) {
        return { ...state, status: "approved" };
      },
      canExecute,
      /** @param {unknown} state */
      nextAction(state) {
        return canExecute(state) ? { ...preset.execute } : { ...preset.hold };
      }
    };
  }

  // nodes/approval-gate.js
  function run({ $input }) {
    const state = { ...($input.item ?? $input.first())?.json ?? {} };
    const kind = typeof state.gateKind === "string" && state.gateKind in GATE_PRESETS ? state.gateKind : "slack";
    delete state.gateKind;
    const gate = createApprovalGate(
      /** @type {keyof typeof GATE_PRESETS} */
      kind
    );
    const preview = state.type ? state : gate.buildPreview(state);
    const next = gate.nextAction(preview);
    return [{ json: { ...next, preview } }];
  }
  return __toCommonJS(approval_gate_exports);
})();
return __node.run({ $input, $json, $, $env, now: new Date() });
