/**
 * Role-based App Home tab. The user record comes from a users sheet read
 * through the column mapper, so the sheet's column order never leaks into
 * this file.
 */
import { section, button, divider, header, context, actions, publishHomePayload } from "./blockkit.js";

/** Header aliases for the users sheet, consumed by columnMapperFromHeader. */
export const HOME_TAB_USER_COLUMNS = Object.freeze({
  id: ["ID", "User ID"],
  name: ["Name"],
  email: ["Email", "E-Mail"],
  slackId: ["Slack ID", "Slack User ID"],
  handle: ["Handle", "Slack Handle"],
  role: ["Role", "Rolle"],
  active: ["Active", "Aktiv"],
});

/** @type {Record<string, string>} */
const ROLE_NAMES = { super_admin: "Super Administrator", admin: "Administrator", techniker: "Techniker" };
/** @type {Record<string, string>} */
const ROLE_ICONS = { super_admin: "👑", admin: "👔", techniker: "🔧" };

/**
 * @param {any[]} rows users sheet rows (Graph rows or arrays)
 * @param {{ findRow: Function, getAll: Function }} mapper from lib/graph
 * @param {string} slackId
 * @returns {Record<string, any> | null}
 */
export function findUserBySlackId(rows, mapper, slackId) {
  const row = mapper.findRow(rows, "slackId", slackId);
  return row ? mapper.getAll(row) : null;
}

/** @param {unknown} value */
function isActive(value) {
  if (value === true) return true;
  return ["yes", "ja", "true", "1", "active", "aktiv"].includes(String(value ?? "").trim().toLowerCase());
}

/**
 * @param {Date} now
 * @param {string} timeZone
 */
function clock(now, timeZone) {
  // de-DE renders a 24-hour "HH:MM"; the hour is read back from that string
  // so the greeting and the displayed time can never disagree.
  const time = new Intl.DateTimeFormat("de-DE", { timeZone, hour: "2-digit", minute: "2-digit" }).format(now);
  const hour = Number(time.split(":")[0]) % 24;
  const date = new Intl.DateTimeFormat("de-DE", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  return { hour, time, date };
}

/**
 * Builds the `views.publish` body for one user. `now` is injected (no clock
 * read in lib/), so the greeting is reproducible in tests.
 * @param {{ userId: string, user: Record<string, any> | null, now: Date, timeZone?: string, appName?: string }} options
 */
export function buildHomeTab({ userId, user, now, timeZone = "Europe/Berlin", appName = "Ops Home" }) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error("buildHomeTab: `now` must be a valid Date");
  if (!user) {
    return publishHomePayload(userId, [section("*❌ Access denied*\n\nYour account was not found.\nContact an administrator.")]);
  }
  if (!isActive(user.active)) {
    return publishHomePayload(userId, [section("*🔴 Account deactivated*\n\nYour account is currently deactivated.\nContact an administrator.")]);
  }

  const role = String(user.role ?? "");
  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "admin";
  const { hour, time, date } = clock(now, timeZone);
  const greeting = hour < 12 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";

  const blocks = [
    header(`${greeting}, ${user.name ?? ""}`),
    section(`${ROLE_ICONS[role] ?? "👤"} *${ROLE_NAMES[role] ?? role}*\n📧 ${user.email ?? ""}\n🆔 ${user.handle ?? ""}`),
    context([`📅 ${date} • 🕐 ${time}`]),
    divider(),
    section(`📷 *${appName}*\n_Internal team tool - restricted access_`),
    divider(),
    section("⚡ *Quick actions*"),
    actions([button("📝 New case", "create_case", "primary"), button("🔍 Search", "search_open"), button("📁 My cases", "my_cases")]),
  ];
  if (isSuperAdmin || isAdmin) {
    blocks.push(actions([button("📊 Reports", "reports_open"), button("❓ Help", "help_open")]));
  }
  if (isSuperAdmin) {
    blocks.push(divider(), section("*🔒 Administration*"));
    blocks.push(actions([button("👥 Users", "view_users"), button("⚙️ Settings", "system_settings"), button("🔐 Compliance", "compliance_center")]));
  }
  blocks.push(divider(), context([`🚀 *${appName}*`, `🔄 ${time}`]));
  return publishHomePayload(userId, blocks);
}
