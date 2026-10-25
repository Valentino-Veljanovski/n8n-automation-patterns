/**
 * One approval gate for every "show a preview, act only after a person
 * approves" step. The kind decides the wording and the action set; the
 * shape of a preview is the same everywhere: { type, status, ...fields, actions }.
 */

export const GATE_PRESETS = Object.freeze({
  slack: {
    type: "email_preview",
    fields: ["recipient", "subject", "body", "targetLanguage", "calendarSlot"],
    actions: ["approve_send", "edit_draft", "cancel"],
    hold: { action: "show_preview", message: "Please review and approve the email before sending." },
    execute: { action: "send_email", message: "Approved email can be sent." },
  },
  email: {
    type: "reply_preview",
    fields: ["recipient", "subject", "body"],
    actions: ["approve_send", "decline", "manual_review"],
    hold: { action: "hold_draft", message: "Manual approval is required before sending." },
    execute: { action: "send_reply", message: "Approved reply can be sent." },
  },
});

/**
 * @param {keyof typeof GATE_PRESETS} kind
 * @param {{ type?: string, actions?: string[], fields?: string[] }} [overrides]
 */
export function createApprovalGate(kind, overrides = {}) {
  const preset = GATE_PRESETS[kind];
  if (!preset) throw new Error(`createApprovalGate: unknown approval gate kind "${kind}"`);
  const type = overrides.type ?? preset.type;
  const actions = [...(overrides.actions ?? preset.actions)];
  const fields = [...(overrides.fields ?? preset.fields)];

  /** @param {unknown} state */
  const canExecute = (state) => {
    const s = /** @type {any} */ (state);
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
      /** @type {Record<string, any>} */
      const preview = { type, status: "awaiting_approval" };
      for (const field of fields) {
        if (draft?.[field] !== undefined) preview[field] = draft[field];
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
    },
  };
}
