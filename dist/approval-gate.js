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
 * Reads:      $input, $json
 * Uses:       lib/approval createApprovalGate
 * Built-ins:  none
 */
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
function run({ $input, $json }) {
  const state = { ...$json ?? ($input.item ?? $input.first())?.json ?? {} };
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
return run({ $input, $json, $: $, now: new Date() });
