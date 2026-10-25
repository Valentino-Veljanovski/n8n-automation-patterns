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

  // nodes/slack-interaction.js
  var slack_interaction_exports = {};
  __export(slack_interaction_exports, {
    run: () => run
  });

  // lib/graph/drive.js
  var FILE_TYPE_GROUPS = Object.freeze({
    image: ["jpg", "jpeg", "png", "gif", "bmp", "webp", "heic", "heif"],
    pdf: ["pdf"],
    email: ["msg", "eml"],
    msg: ["msg", "eml"],
    text: ["txt", "log"],
    txt: ["txt", "log"],
    excel: ["xlsx", "xls", "xlsm", "csv"],
    word: ["docx", "doc"]
  });
  var UNITS = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3 };

  // lib/slack/homeTab.js
  var HOME_TAB_USER_COLUMNS = Object.freeze({
    id: ["ID", "User ID"],
    name: ["Name"],
    email: ["Email", "E-Mail"],
    slackId: ["Slack ID", "Slack User ID"],
    handle: ["Handle", "Slack Handle"],
    role: ["Role", "Rolle"],
    active: ["Active", "Aktiv"]
  });

  // lib/slack/index.js
  function parseMeta(value) {
    if (value && typeof value === "object") return (
      /** @type {Record<string, any>} */
      value
    );
    if (typeof value !== "string" || !value) return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  function parseInteraction(body, options) {
    const { allowList, superAdmins = [], regionMap = {}, actionPrefixes = {}, deletePattern = /delete/ } = options ?? {};
    if (!(allowList instanceof Set || Array.isArray(allowList))) {
      throw new Error("parseInteraction: an allow-list (Set or array of Slack user IDs) is required; it is never hard-coded here");
    }
    const allowed = new Set(allowList);
    const admins = new Set(superAdmins);
    const out = {
      type: "unknown",
      triggerType: "",
      userId: "",
      userName: "",
      userRealName: "",
      allowed: false,
      role: null,
      channelId: "",
      triggerId: "",
      actionId: "",
      actionValue: "",
      actionPrefix: "",
      region: "",
      callbackId: "",
      viewState: {},
      privateMetadata: {},
      rootViewId: "",
      eventType: "",
      command: "",
      text: "",
      requiredPermission: "view",
      payload: null
    };
    const b = body && typeof body === "object" ? body : null;
    if (!b) return { ...out, error: "no body" };
    let payload = null;
    if (b.payload !== void 0) {
      try {
        payload = typeof b.payload === "string" ? JSON.parse(b.payload) : b.payload;
      } catch {
        return { ...out, error: "payload is not valid JSON" };
      }
    }
    if (payload && typeof payload === "object") {
      out.payload = payload;
      out.type = payload.type || "unknown";
      out.userId = payload.user?.id ?? "";
      out.userName = payload.user?.username ?? payload.user?.name ?? "";
      out.userRealName = payload.user?.real_name ?? payload.user?.profile?.real_name ?? "";
      out.triggerId = payload.trigger_id ?? "";
      out.channelId = payload.channel?.id ?? payload.container?.channel_id ?? "";
      const view = payload.view ?? {};
      out.callbackId = view.callback_id ?? "";
      out.viewState = view.state?.values ?? {};
      out.rootViewId = view.root_view_id ?? "";
      out.privateMetadata = parseMeta(view.private_metadata);
      if (out.type === "block_actions") {
        out.triggerType = "button_click";
        const action = payload.actions?.[0] ?? {};
        out.actionId = action.action_id ?? "";
        out.actionValue = action.value ?? "";
        if (actionPrefixes[out.actionId]) {
          out.actionPrefix = actionPrefixes[out.actionId];
        } else {
          const [prefix, ...rest] = out.actionId.split("_");
          out.actionPrefix = prefix ?? "";
          const key = rest.join("_");
          out.region = key ? regionMap[key] ?? key : "";
        }
        out.requiredPermission = deletePattern.test(out.actionId) ? "delete" : "view";
      } else if (out.type === "view_submission") {
        out.triggerType = "modal_submit";
        out.requiredPermission = "create";
        out.region = out.privateMetadata.region ?? "";
        out.actionPrefix = out.privateMetadata.action ?? "";
      } else if (out.type === "view_closed") {
        out.triggerType = "modal_close";
      }
    } else if (b.event && typeof b.event === "object") {
      out.type = "event";
      out.triggerType = "event";
      out.payload = b.event;
      out.eventType = b.event.type ?? "";
      out.userId = typeof b.event.user === "string" ? b.event.user : b.event.user?.id ?? "";
      out.userName = b.event.username ?? "";
      out.channelId = b.event.channel ?? "";
    } else if (typeof b.command === "string") {
      out.type = "slash_command";
      out.triggerType = "slash_command";
      out.payload = b;
      out.command = b.command;
      out.text = b.text ?? "";
      out.userId = b.user_id ?? "";
      out.userName = b.user_name ?? "";
      out.channelId = b.channel_id ?? "";
      out.triggerId = b.trigger_id ?? "";
      out.requiredPermission = "create";
    } else {
      return { ...out, error: "unrecognised interaction shape" };
    }
    if (admins.has(out.userId)) {
      out.allowed = true;
      out.role = "super_admin";
    } else {
      out.allowed = allowed.has(out.userId);
    }
    return out;
  }
  var word = (words) => new RegExp(`(?:^|[^\\p{L}])(?:${words})(?:$|[^\\p{L}])`, "u");
  var EMAIL_RE = word("email|e-mail|mail|mejl|kontakt|contact|prati|isprati|send|poraka");
  var CALENDAR_RE = word("calendar|kalender|kalendar|termin|meeting|free slot|sostanok|sastanak");
  var APPROVAL_RE = word("send|delete|update|create|remove|add|edit|prati|isprati|izbrisi|dodaj|smeni|promeni|kreiraj");
  var DEFAULT_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;

  // nodes/slack-interaction.js
  function env($env, name) {
    try {
      const value = $env?.[name];
      return value === void 0 || value === null ? void 0 : String(value);
    } catch {
      return void 0;
    }
  }
  function idList(value) {
    if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
    if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean);
    return void 0;
  }
  function run({ $input, $env }) {
    const json = $input.first()?.json ?? {};
    const body = json.body ?? json;
    const allowList = idList(env($env, "SLACK_ALLOWED_USER_IDS")) ?? idList(json.allowedUserIds);
    const superAdmins = idList(env($env, "SLACK_SUPER_ADMIN_IDS")) ?? idList(json.superAdminIds) ?? [];
    const interaction = parseInteraction(body, { allowList: (
      /** @type {string[]} */
      allowList
    ), superAdmins, regionMap: json.regionMap ?? {} });
    return [{ json: interaction }];
  }
  return __toCommonJS(slack_interaction_exports);
})();
return __node.run({ $input, $json, $, $env, now: new Date() });
