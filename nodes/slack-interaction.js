/**
 * Run mode:   Run Once for All Items
 * Script:     slack-interaction — one flat object from whatever Slack sent to
 *             the interactions webhook (button click, modal submit, modal
 *             close, Events API event, slash command), with the access
 *             decision made against an allow-list you provide
 * Input:      the webhook item: json.body is the request body ($json.body of
 *             the Webhook node). The allow-list comes from $env
 *             SLACK_ALLOWED_USER_IDS (comma-separated) or from
 *             json.allowedUserIds on the item; SLACK_SUPER_ADMIN_IDS /
 *             json.superAdminIds are optional; json.regionMap maps the suffix
 *             of an action_id ("region_a") to a label. There is no built-in
 *             list: without one the run stops.
 * Output:     one item: json = { type, triggerType, userId, userName, allowed,
 *             role, channelId, triggerId, actionId, actionPrefix, region,
 *             callbackId, viewState, privateMetadata, requiredPermission, … }
 * Uses:       lib/slack parseInteraction
 * Built-ins:  none
 */
import { parseInteraction } from "../lib/slack/index.js";

/** @param {any} $env @param {string} name */
function env($env, name) {
  try {
    const value = $env?.[name];
    return value === undefined || value === null ? undefined : String(value);
  } catch {
    return undefined;
  }
}

/** @param {unknown} value @returns {string[] | undefined} */
function idList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean);
  return undefined;
}

/**
 * @param {{ $input: { first: () => any }, $env?: any }} ctx
 */
export function run({ $input, $env }) {
  const json = $input.first()?.json ?? {};
  const body = json.body ?? json;
  const allowList = idList(env($env, "SLACK_ALLOWED_USER_IDS")) ?? idList(json.allowedUserIds);
  const superAdmins = idList(env($env, "SLACK_SUPER_ADMIN_IDS")) ?? idList(json.superAdminIds) ?? [];
  const interaction = parseInteraction(body, { allowList: /** @type {string[]} */ (allowList), superAdmins, regionMap: json.regionMap ?? {} });
  return [{ json: interaction }];
}
