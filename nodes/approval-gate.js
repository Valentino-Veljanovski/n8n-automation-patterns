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
import { createApprovalGate, GATE_PRESETS } from "../lib/approval/index.js";

/**
 * @param {{ $input: { item?: any, first: () => any }, $json?: any }} ctx
 */
export function run({ $input, $json }) {
  const state = { ...($json ?? ($input.item ?? $input.first())?.json ?? {}) };
  const kind = typeof state.gateKind === "string" && state.gateKind in GATE_PRESETS ? state.gateKind : "slack";
  delete state.gateKind;
  const gate = createApprovalGate(/** @type {keyof typeof GATE_PRESETS} */ (kind));
  const preview = state.type ? state : gate.buildPreview(state);
  const next = gate.nextAction(preview);
  return [{ json: { ...next, preview } }];
}
