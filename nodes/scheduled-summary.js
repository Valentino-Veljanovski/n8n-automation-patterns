/**
 * Run mode:   Run Once for All Items
 * Script:     scheduled-summary — the daily operations summary for Slack:
 *             actions sent today, tomorrow's appointments still unresolved,
 *             items pending longer than the overdue threshold. A summary is
 *             returned even when nothing came in, so a silent day and a
 *             broken schedule look different.
 * Input:      the merged rows of the action log and the tracking sheet, one
 *             item per row; json.source = "actions" marks a log row, every
 *             other row counts as tracking. Columns: ActionType, SentAt,
 *             AppointmentDate, Status (German or ISO dates, Excel serials)
 *             Optional $env: SUMMARY_TIME_ZONE (Europe/Berlin),
 *             SUMMARY_ACTION_TYPE (REMINDER_SMS), SUMMARY_OVERDUE_DAYS (2)
 * Output:     one item: json = { date, counts: { today, tomorrow, overdue }, message }
 *             `now` is injected by the wrapper; the day is taken in the time zone.
 * Uses:       lib/summary dayWindow, dailyStatusSummary; lib/dates toIsoDay
 * Built-ins:  none
 */
import { dayWindow, dailyStatusSummary } from "../lib/summary/index.js";
import { toIsoDay } from "../lib/dates/index.js";

/**
 * Reads one environment value; n8n throws when env access is blocked, and
 * that counts as "not set".
 * @param {any} $env @param {string} name
 */
function env($env, name) {
  try {
    const value = $env?.[name];
    return value === undefined || value === null || String(value) === "" ? undefined : String(value);
  } catch {
    return undefined;
  }
}

/**
 * @param {{ $input: { all: () => any[] }, $env?: any, now: Date }} ctx
 */
export function run({ $input, $env, now }) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error("scheduled-summary: `now` must be injected as a Date (the dist wrapper passes the clock)");
  const timeZone = env($env, "SUMMARY_TIME_ZONE") ?? "Europe/Berlin";
  const typeToCount = env($env, "SUMMARY_ACTION_TYPE") ?? "REMINDER_SMS";
  const overdueDays = Number(env($env, "SUMMARY_OVERDUE_DAYS") ?? 2);

  /** @type {any[]} */
  const actionRows = [];
  /** @type {any[]} */
  const trackingRows = [];
  for (const item of $input.all()) {
    const json = item?.json ?? {};
    (json.source === "actions" ? actionRows : trackingRows).push(json);
  }

  const window = dayWindow(timeZone, now);
  const { counts, message } = dailyStatusSummary({ actionRows, trackingRows, window, typeToCount, overdueDays });
  return [{ json: { date: toIsoDay(window.today), counts, message } }];
}
