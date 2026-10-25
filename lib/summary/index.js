/**
 * Counting and reporting for scheduled Slack summaries. Calendar days come
 * from `dayWindow`, which asks Intl for the date in a named time zone and
 * never reads the machine clock through local getters.
 */
import { parseDate, formatDate, isSameDay, daysBetween } from "../dates/index.js";
import { parseAmountDe } from "../text/index.js";
import { safeGet } from "../graph/excel.js";

/** @typedef {import("../dates/index.js").DateParts} Parts */

/**
 * @param {any[]} items
 * @param {string | ((item: any) => unknown)} key property name or key function
 * @returns {Record<string, number>}
 */
export function countBy(items, key) {
  const keyOf = typeof key === "function" ? key : (/** @type {any} */ item) => item?.[key];
  /** @type {Record<string, number>} */
  const out = {};
  for (const item of items ?? []) {
    const k = String(keyOf(item) ?? "");
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/**
 * @param {string} title
 * @param {string[]} [lines]
 */
export function formatSlackSummary(title, lines = []) {
  const head = `📊 *${title}*`;
  return lines.length ? `${head}\n\n${lines.map((l) => `• ${l}`).join("\n")}` : head;
}

/**
 * Today, tomorrow and yesterday as calendar parts in `timeZone`. `now` is
 * injected: this module never reads the clock itself.
 * @param {string} timeZone IANA name, e.g. "Europe/Berlin"
 * @param {Date} now
 * @returns {{ today: Parts, tomorrow: Parts, yesterday: Parts }}
 */
export function dayWindow(timeZone, now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error("dayWindow: `now` must be a valid Date");
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    throw new Error(`dayWindow: unknown time zone "${timeZone}"`);
  }
  /** @type {Record<string, number>} */
  const parts = {};
  for (const p of formatter.formatToParts(now)) if (p.type !== "literal") parts[p.type] = Number(p.value);
  const today = { year: parts.year, month: parts.month, day: parts.day };
  /** @param {number} offset */
  const shift = (offset) => {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  };
  return { today, tomorrow: shift(1), yesterday: shift(-1) };
}

/**
 * Totals per category, highest first.
 * @param {Record<string, unknown> | null | undefined} counts
 */
export function categorySummary(counts) {
  const categories = Object.entries(counts ?? {}).map(([name, value]) => ({ name, count: Number(value || 0) }));
  const total = categories.reduce((sum, c) => sum + c.count, 0);
  const sorted = categories.sort((a, b) => b.count - a.count);
  return { total, categories: sorted, hasActivity: total > 0, topCategory: sorted[0] ?? null };
}

/** @param {ReturnType<typeof categorySummary>} summary */
export function formatCategorySummary(summary) {
  if (!summary.hasActivity) return "No routed email activity was recorded today.";
  const lines = summary.categories.map((c) => `• ${c.name}: ${c.count}`);
  return ["Daily email routing summary", "Total: " + summary.total, ...lines].join("\n");
}

/** @param {any} row n8n item or plain object */
const jsonOf = (row) => (row && typeof row === "object" && "json" in row ? row.json : row) ?? {};

/**
 * The daily operations summary: actions of one type sent today, tomorrow's
 * appointments still unresolved, items pending longer than `overdueDays`.
 * @param {{
 *   actionRows: any[],
 *   trackingRows: any[],
 *   window: { today: Parts, tomorrow: Parts },
 *   typeToCount?: string,
 *   overdueDays?: number,
 *   columns?: { actionType?: string | string[], sentAt?: string | string[], appointmentDate?: string | string[], status?: string | string[] },
 * }} options
 */
export function dailyStatusSummary({ actionRows, trackingRows, window, typeToCount = "REMINDER_SMS", overdueDays = 2, columns = {} }) {
  const col = { actionType: "ActionType", sentAt: "SentAt", appointmentDate: "AppointmentDate", status: "Status", ...columns };
  const { today, tomorrow } = window;

  let todayCount = 0;
  for (const row of actionRows ?? []) {
    const r = jsonOf(row);
    if (String(safeGet(r, col.actionType, "")).trim() !== typeToCount) continue;
    const sentAt = parseDate(safeGet(r, col.sentAt));
    if (sentAt && isSameDay(sentAt, today)) todayCount++;
  }

  let tomorrowCount = 0;
  let overdueCount = 0;
  for (const row of trackingRows ?? []) {
    const r = jsonOf(row);
    const status = String(safeGet(r, col.status, "")).trim().toUpperCase();
    const appointment = parseDate(safeGet(r, col.appointmentDate));
    if (appointment && isSameDay(appointment, tomorrow) && status !== "RESOLVED") tomorrowCount++;
    const sentAt = parseDate(safeGet(r, col.sentAt));
    if (sentAt && daysBetween(today, sentAt) > overdueDays && status === "PENDING") overdueCount++;
  }

  const lines = [
    `${todayCount} ${typeToCount.toLowerCase().replace(/_/g, " ")} action(s) today`,
    `${tomorrowCount} appointment(s) tomorrow with unresolved status`,
    `${overdueCount} item(s) overdue (sent > ${overdueDays} days ago, still pending)`,
  ];
  return {
    counts: { today: todayCount, tomorrow: tomorrowCount, overdue: overdueCount },
    message: formatSlackSummary(`Daily Summary, ${formatDate(today, "de")}`, lines),
  };
}

/** Header aliases for a case sheet, consumed by columnMapperFromHeader. */
export const CASE_REPORT_COLUMNS = Object.freeze({
  company: ["Company", "Firma", "Unternehmen"],
  reportedOn: ["Reported on", "Reported", "Gemeldet am", "Datum"],
  status: ["Status"],
  value: ["Value", "Betrag", "Wert"],
  paidOn: ["Paid on", "Bezahlt am", "Bezahlt"],
});

/** @param {Parts | null} parts */
const dayKey = (parts) => (parts ? parts.year * 10000 + parts.month * 100 + parts.day : 0);

/**
 * Per-region case counts and totals for an inclusive date range, read
 * through a column mapper (see CASE_REPORT_COLUMNS).
 * @param {{
 *   regions: { label: string, rows: any[] }[],
 *   mapper: import("../graph/excel.js").ColumnMapper,
 *   from?: string,
 *   to?: string,
 *   region?: string,
 *   statuses?: { inProgress?: string, completed?: string, onHold?: string, cancelled?: string },
 *   dividerMarker?: string,
 *   headerValue?: string,
 * }} options
 */
export function caseReport({ regions, mapper, from = "", to = "", region = "all", statuses = {}, dividerMarker = "▸", headerValue = "Company" }) {
  const label = { inProgress: "In Progress", completed: "Completed", onHold: "On Hold", cancelled: "Cancelled", ...statuses };
  const fromKey = dayKey(parseDate(from));
  const toKey = dayKey(parseDate(to));

  const results = [];
  let grandTotalValue = 0;
  let grandTotalPaid = 0;
  let grandCount = 0;

  for (const { label: regionLabel, rows } of regions) {
    if (region !== "all" && region !== regionLabel) continue;
    const r = { label: regionLabel, count: 0, inProgress: 0, completed: 0, onHold: 0, cancelled: 0, totalValue: 0, totalPaid: 0 };
    for (const row of rows ?? []) {
      const company = String(mapper.get(row, "company") ?? "").trim();
      if (!company || company.includes(dividerMarker) || company === headerValue) continue;
      const reported = dayKey(parseDate(mapper.get(row, "reportedOn")));
      if (fromKey && toKey && (!reported || reported < fromKey || reported > toKey)) continue;
      const status = String(mapper.get(row, "status") ?? "").trim();
      const value = parseAmountDe(mapper.get(row, "value"));
      const paidOn = String(mapper.get(row, "paidOn") ?? "").trim();
      if (status === label.inProgress) r.inProgress++;
      else if (status === label.completed) r.completed++;
      else if (status === label.onHold) r.onHold++;
      else if (status === label.cancelled) r.cancelled++;
      r.totalValue += value;
      if (paidOn) r.totalPaid += value;
      r.count++;
    }
    grandTotalValue += r.totalValue;
    grandTotalPaid += r.totalPaid;
    grandCount += r.count;
    if (r.count > 0 || region === regionLabel) results.push(r);
  }

  return {
    results,
    grandTotalValue,
    grandTotalPaid,
    grandCount,
    period: from && to ? `${from}, ${to}` : "All time",
    regionTitle: region === "all" ? "All regions" : region,
  };
}
