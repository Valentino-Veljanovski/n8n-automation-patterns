/**
 * Slack: interaction parsing, thread context, message normalisation,
 * command routing, upload guard and Block Kit builders.
 */
import { parseFileSize } from "../graph/drive.js";

export * as blockkit from "./blockkit.js";
export { buildHomeTab, findUserBySlackId, HOME_TAB_USER_COLUMNS } from "./homeTab.js";

/** @param {unknown} value */
function parseMeta(value) {
  if (value && typeof value === "object") return /** @type {Record<string, any>} */ (value);
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * @typedef {Object} Interaction
 * @property {"block_actions" | "view_submission" | "view_closed" | "event" | "slash_command" | "unknown"} type
 * @property {string} triggerType button_click, modal_submit, modal_close, event, slash_command
 * @property {string} userId
 * @property {string} userName
 * @property {string} userRealName
 * @property {boolean} allowed
 * @property {"super_admin" | null} role
 * @property {string} channelId
 * @property {string} triggerId
 * @property {string} actionId
 * @property {string} actionValue
 * @property {string} actionPrefix
 * @property {string} region
 * @property {string} callbackId
 * @property {Record<string, any>} viewState
 * @property {Record<string, any>} privateMetadata
 * @property {string} rootViewId
 * @property {string} eventType
 * @property {string} command
 * @property {string} text
 * @property {"view" | "create" | "delete"} requiredPermission
 * @property {any} payload
 * @property {string} [error]
 */

/**
 * Parses the body of a Slack interactions webhook into one flat object,
 * whatever shape Slack sent: `block_actions`, `view_submission`,
 * `view_closed` (URL-encoded `payload`), an Events API `event`, or a slash
 * `command`. Access is decided against an allow-list the caller injects;
 * there is no default, so a missing list throws instead of letting everyone in.
 *
 * Action IDs follow `<prefix>_<regionKey>`; `regionMap` turns the key into
 * a label, `actionPrefixes` overrides the prefix for specific action IDs.
 * @param {any} body the webhook body
 * @param {{ allowList: Set<string> | string[], superAdmins?: string[], regionMap?: Record<string, string>, actionPrefixes?: Record<string, string>, deletePattern?: RegExp }} options
 * @returns {Interaction}
 */
export function parseInteraction(body, options) {
  const { allowList, superAdmins = [], regionMap = {}, actionPrefixes = {}, deletePattern = /delete/ } = options ?? {};
  if (!(allowList instanceof Set || Array.isArray(allowList))) {
    throw new Error("parseInteraction: an allow-list (Set or array of Slack user IDs) is required; it is never hard-coded here");
  }
  const allowed = new Set(allowList);
  const admins = new Set(superAdmins);

  /** @type {Interaction} */
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
    payload: null,
  };

  const b = body && typeof body === "object" ? body : null;
  if (!b) return { ...out, error: "no body" };

  let payload = null;
  if (b.payload !== undefined) {
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

/** @param {string} text */
function jsonObjectIn(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Recovers structured data a bot embedded in the first message of a thread
 * (context block → message text → any message that looks right) and turns
 * the replies into chat history.
 * @param {any[]} messages `conversations.replies` messages, oldest first
 * @param {{ marker?: string, requiredKeys?: string[] }} [options]
 * @returns {{ contextData: Record<string, any>, history: { role: "user" | "assistant", content: string }[] }}
 */
export function threadContext(messages, { marker = "case data", requiredKeys = ["id", "region"] } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const first = list[0] ?? {};
  /** @type {Record<string, any>} */
  let contextData = {};

  for (const block of first.blocks ?? []) {
    if (block?.type !== "context" || !Array.isArray(block.elements)) continue;
    for (const element of block.elements) {
      const text = String(element?.text ?? "");
      if (!text.includes(marker)) continue;
      const found = jsonObjectIn(text);
      if (found) contextData = found;
    }
  }
  if (!contextData.id && typeof first.text === "string") {
    const found = jsonObjectIn(first.text);
    if (found) contextData = found;
  }
  if (!contextData.id) {
    for (const message of list) {
      const text = String(message?.text ?? "");
      if (!requiredKeys.every((key) => text.includes(`"${key}"`))) continue;
      const found = jsonObjectIn(text);
      if (found) {
        contextData = found;
        break;
      }
    }
  }

  const history = list
    .filter((m) => m?.ts !== first.ts)
    .map((m) => ({
      role: /** @type {"user" | "assistant"} */ (m.bot_id ? "assistant" : "user"),
      content: String(m.text ?? "").replace(/<[^>]+>/g, "").trim(),
    }))
    .filter((m) => m.content);

  return { contextData, history };
}

/**
 * Which script the letters of a text belong to.
 * @param {unknown} text
 * @returns {"cyrillic" | "latin" | "greek" | "mixed" | "none"}
 */
export function detectScript(text) {
  const s = String(text ?? "");
  const scripts = [
    ["cyrillic", /\p{Script=Cyrillic}/u],
    ["latin", /\p{Script=Latin}/u],
    ["greek", /\p{Script=Greek}/u],
  ].filter(([, re]) => /** @type {RegExp} */ (re).test(s));
  if (scripts.length === 0) return "none";
  if (scripts.length > 1) return "mixed";
  return /** @type {"cyrillic" | "latin" | "greek"} */ (scripts[0][0]);
}

/**
 * One predictable object from a Slack message event. No language detection
 * happens here; `languageHint` is whatever the event carried.
 * @param {any} event
 */
export function normalizeMessage(event) {
  const m = event && typeof event === "object" ? event : {};
  const text = String(m.text ?? "").trim();
  const files = Array.isArray(m.files) ? m.files : [];
  return {
    user: { id: m.user ?? "", languageHint: m.language ?? null },
    message: { text, channelId: m.channel ?? "", messageId: m.ts ?? "", script: detectScript(text) },
    attachments: {
      hasAttachments: files.length > 0,
      count: files.length,
      files: files.map((/** @type {any} */ f) => ({
        id: f?.id ?? "",
        name: f?.name ?? "attachment",
        mimetype: f?.mimetype ?? "application/octet-stream",
      })),
    },
  };
}

/** @type {Record<string, string>} Macedonian and Serbian Cyrillic → Latin, with Russian extras. */
const CYRILLIC = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ѓ: "gj", ђ: "dj", е: "e", ё: "jo", ж: "zh", з: "z", ѕ: "dz",
  и: "i", й: "j", ј: "j", к: "k", л: "l", љ: "lj", м: "m", н: "n", њ: "nj", о: "o", п: "p", р: "r",
  с: "s", т: "t", ќ: "kj", ћ: "c", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", џ: "dzh", ш: "sh",
  щ: "sht", ъ: "", ы: "y", ь: "", э: "e", ю: "ju", я: "ja",
};

/**
 * Cyrillic letters → Latin so keyword rules can be written once.
 * @param {unknown} text
 */
export function transliterateCyrillic(text) {
  return String(text ?? "").replace(/\p{Script=Cyrillic}/gu, (ch) => {
    const lower = ch.toLowerCase();
    const latin = CYRILLIC[lower];
    if (latin === undefined) return ch;
    if (ch !== lower && latin) return latin[0].toUpperCase() + latin.slice(1);
    return latin;
  });
}

/** @param {string} words alternation */
const word = (words) => new RegExp(`(?:^|[^\\p{L}])(?:${words})(?:$|[^\\p{L}])`, "u");

const CONTACTS_RE = /(?:^|[^\p{L}])(?:delete|add|edit|update|remove|new)\s+(?:a\s+|the\s+)?contacts?(?:$|[^\p{L}])|(?:dodaj|izbrisi|smeni|promeni)\s+kontakt|kontakt\s+(?:dodaj|izbrisi|smeni|promeni)/u;
const EMAIL_RE = word("email|e-mail|mail|mejl|kontakt|contact|prati|isprati|send|poraka");
const CALENDAR_RE = word("calendar|kalender|kalendar|termin|meeting|free slot|sostanok|sastanak");
const APPROVAL_RE = word("send|delete|update|create|remove|add|edit|prati|isprati|izbrisi|dodaj|smeni|promeni|kreiraj");

/**
 * Direct commands (`help`, `/status`, `/quick`) go to the command branch;
 * everything else to the agent with a category and whether it needs human
 * approval. Keywords match whole words only, in Latin or Cyrillic.
 * @param {unknown} text
 * @returns {{ route: "command", command: string } | { route: "agent", category: "email" | "calendar" | "contacts" | "general", needsApproval: boolean }}
 */
export function routeCommand(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return { route: "command", command: "empty" };
  const t = transliterateCyrillic(raw).toLowerCase();

  if (/^\/?help(?:$|[^\p{L}])/u.test(t)) return { route: "command", command: "help" };
  if (/^\/status(?:$|[^\p{L}])/u.test(t)) return { route: "command", command: "status" };
  if (/^\/quick(?:$|[^\p{L}])/u.test(t)) return { route: "command", command: "quick" };

  /** @type {"email" | "calendar" | "contacts" | "general"} */
  let category = "general";
  if (CONTACTS_RE.test(t)) category = "contacts";
  else if (EMAIL_RE.test(t)) category = "email";
  else if (CALENDAR_RE.test(t)) category = "calendar";

  return { route: "agent", category, needsApproval: APPROVAL_RE.test(t) };
}

export const DEFAULT_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;

/**
 * Checks a downloaded item before it is uploaded to Slack.
 * @param {any} item n8n item with a `binary` property
 * @param {{ limitBytes?: number }} [options]
 * @returns {{ success: true, binaryKey: string, fileSize: number } | { success: false, error: string, tooLarge?: boolean }}
 */
export function checkUploadSize(item, { limitBytes = DEFAULT_UPLOAD_LIMIT_BYTES } = {}) {
  const binary = item?.binary && typeof item.binary === "object" ? item.binary : {};
  const binaryKey = Object.keys(binary)[0];
  if (!binaryKey) return { success: false, error: "No file was downloaded from SharePoint." };
  const fileSize = parseFileSize(binary[binaryKey]?.fileSize) ?? 0;
  if (fileSize > limitBytes) {
    return { success: false, error: "File exceeds the Slack upload limit. Use the SharePoint link instead.", tooLarge: true };
  }
  return { success: true, binaryKey, fileSize };
}
