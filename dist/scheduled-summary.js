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

  // nodes/scheduled-summary.js
  var scheduled_summary_exports = {};
  __export(scheduled_summary_exports, {
    run: () => run
  });

  // lib/dates/index.js
  var EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
  var MS_PER_DAY = 864e5;
  var MS_PER_MINUTE = 6e4;
  var MAX_SERIAL = 2958465;
  var MONTH_NAMES = {
    jan: 1,
    january: 1,
    januar: 1,
    feb: 2,
    february: 2,
    februar: 2,
    mar: 3,
    march: 3,
    m\u00E4rz: 3,
    maerz: 3,
    m\u00E4r: 3,
    apr: 4,
    april: 4,
    may: 5,
    mai: 5,
    jun: 6,
    june: 6,
    juni: 6,
    jul: 7,
    july: 7,
    juli: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    okt: 10,
    oktober: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
    dez: 12,
    dezember: 12
  };
  var INVISIBLE = /[\u200B-\u200D\uFEFF\u00AD\u2060]/g;
  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }
  function makeParts(year, month, day, hour, minute) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
    const parts = { year, month, day };
    if (hour !== void 0) {
      if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute === void 0 || minute < 0 || minute > 59) {
        return null;
      }
      parts.hour = hour;
      parts.minute = minute;
    }
    return parts;
  }
  function fromExcelSerial(serial) {
    const n = typeof serial === "string" ? Number(serial.trim()) : serial;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 1 || n > MAX_SERIAL) return null;
    const minutes = Math.round(n * 1440);
    const d = new Date(EXCEL_EPOCH_MS + minutes * MS_PER_MINUTE);
    const hasTime = !Number.isInteger(n);
    return makeParts(
      d.getUTCFullYear(),
      d.getUTCMonth() + 1,
      d.getUTCDate(),
      hasTime ? d.getUTCHours() : void 0,
      hasTime ? d.getUTCMinutes() : void 0
    );
  }
  var TIME_RE = /^(?:T|\s+|,\s*)?(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(?:Z|UTC|[+-]\d{2}:?\d{2})?$/i;
  function parseTimeSuffix(rest) {
    if (rest === "") return {};
    const m = TIME_RE.exec(rest);
    if (!m) return null;
    return { hour: Number(m[1]), minute: Number(m[2]) };
  }
  var PATTERNS = [
    // 11.05.2026, 1.5.2026, 11.05.2026 14:30
    { re: /^(\d{1,2})\.(\d{1,2})\.(\d{4})(.*)$/, map: (m) => [Number(m[3]), Number(m[2]), Number(m[1]), m[4]] },
    // 2026-05-11, 2026-05-11T14:30:00Z, 2026-05-11 14:30
    { re: /^(\d{4})-(\d{2})-(\d{2})(.*)$/, map: (m) => [Number(m[1]), Number(m[2]), Number(m[3]), m[4]] },
    // May 11, 2026 / May 11 2026 / Mai 11, 2026
    { re: /^([A-Za-zÄäÖöÜü]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th|\.)?,?\s+(\d{4})(.*)$/, map: (m) => [Number(m[3]), monthNumber(m[1]), Number(m[2]), m[4]] },
    // 11 May 2026 / 11. Mai 2026
    { re: /^(\d{1,2})\.?\s+([A-Za-zÄäÖöÜü]{3,9})\.?,?\s+(\d{4})(.*)$/, map: (m) => [Number(m[3]), monthNumber(m[2]), Number(m[1]), m[4]] }
  ];
  function monthNumber(name) {
    return MONTH_NAMES[name.toLowerCase()] ?? 0;
  }
  function parseDate(input) {
    if (input === null || input === void 0 || input === "") return null;
    if (input instanceof Date) {
      if (Number.isNaN(input.getTime())) return null;
      return makeParts(input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate(), input.getUTCHours(), input.getUTCMinutes());
    }
    if (typeof input === "number") return fromExcelSerial(input);
    if (typeof input !== "string") return null;
    const s = input.replace(INVISIBLE, "").trim();
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s)) return fromExcelSerial(s);
    for (const { re, map } of PATTERNS) {
      const m = re.exec(s);
      if (!m) continue;
      const [year, month, day, rest] = map(m);
      const time = parseTimeSuffix(String(rest).trim() === "" ? "" : String(rest));
      if (time === null) return null;
      return makeParts(Number(year), Number(month), Number(day), time.hour, time.minute);
    }
    return null;
  }
  function toIsoDay(parts) {
    if (!parts) return null;
    return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  }
  function formatDate(parts, style = "de", { time = false } = {}) {
    if (!parts) return "";
    const day = style === "iso" ? toIsoDay(parts) : `${pad2(parts.day)}.${pad2(parts.month)}.${parts.year}`;
    if (!time) return String(day);
    return `${day} ${pad2(parts.hour ?? 0)}:${pad2(parts.minute ?? 0)}`;
  }
  function isSameDay(a, b) {
    if (!a || !b) return false;
    return a.year === b.year && a.month === b.month && a.day === b.day;
  }
  function dayNumber(parts) {
    return Date.UTC(parts.year, parts.month - 1, parts.day) / MS_PER_DAY;
  }
  function daysBetween(later, earlier) {
    return dayNumber(later) - dayNumber(earlier);
  }

  // lib/graph/excel.js
  function isMissing(value) {
    return value === null || value === void 0 || typeof value === "string" && value.trim() === "";
  }
  function safeGet(source, keys, fallback = void 0) {
    if (keys === void 0) return isMissing(source) ? void 0 : source;
    const list = Array.isArray(keys) ? keys : [keys];
    if (source && typeof source === "object") {
      for (const key of list) {
        const value = source[key];
        if (!isMissing(value)) return value;
      }
    }
    return fallback;
  }

  // lib/summary/index.js
  function formatSlackSummary(title, lines = []) {
    const head = `\u{1F4CA} *${title}*`;
    return lines.length ? `${head}

${lines.map((l) => `\u2022 ${l}`).join("\n")}` : head;
  }
  function dayWindow(timeZone, now) {
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error("dayWindow: `now` must be a valid Date");
    let formatter;
    try {
      formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    } catch {
      throw new Error(`dayWindow: unknown time zone "${timeZone}"`);
    }
    const parts = {};
    for (const p of formatter.formatToParts(now)) if (p.type !== "literal") parts[p.type] = Number(p.value);
    const today = { year: parts.year, month: parts.month, day: parts.day };
    const shift = (offset) => {
      const d = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    };
    return { today, tomorrow: shift(1), yesterday: shift(-1) };
  }
  var jsonOf = (row) => (row && typeof row === "object" && "json" in row ? row.json : row) ?? {};
  function dailyStatusSummary({ actionRows, trackingRows, window, typeToCount = "REMINDER_SMS", overdueDays = 2, columns = {} }) {
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
      `${overdueCount} item(s) overdue (sent > ${overdueDays} days ago, still pending)`
    ];
    return {
      counts: { today: todayCount, tomorrow: tomorrowCount, overdue: overdueCount },
      message: formatSlackSummary(`Daily Summary, ${formatDate(today, "de")}`, lines)
    };
  }
  var CASE_REPORT_COLUMNS = Object.freeze({
    company: ["Company", "Firma", "Unternehmen"],
    reportedOn: ["Reported on", "Reported", "Gemeldet am", "Datum"],
    status: ["Status"],
    value: ["Value", "Betrag", "Wert"],
    paidOn: ["Paid on", "Bezahlt am", "Bezahlt"]
  });

  // nodes/scheduled-summary.js
  function env($env, name) {
    try {
      const value = $env?.[name];
      return value === void 0 || value === null || String(value) === "" ? void 0 : String(value);
    } catch {
      return void 0;
    }
  }
  function run({ $input, $env, now }) {
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error("scheduled-summary: `now` must be injected as a Date (the dist wrapper passes the clock)");
    const timeZone = env($env, "SUMMARY_TIME_ZONE") ?? "Europe/Berlin";
    const typeToCount = env($env, "SUMMARY_ACTION_TYPE") ?? "REMINDER_SMS";
    const overdueDays = Number(env($env, "SUMMARY_OVERDUE_DAYS") ?? 2);
    const actionRows = [];
    const trackingRows = [];
    for (const item of $input.all()) {
      const json = item?.json ?? {};
      (json.source === "actions" ? actionRows : trackingRows).push(json);
    }
    const window = dayWindow(timeZone, now);
    const { counts, message } = dailyStatusSummary({ actionRows, trackingRows, window, typeToCount, overdueDays });
    return [{ json: { date: toIsoDay(window.today), counts, message } }];
  }
  return __toCommonJS(scheduled_summary_exports);
})();
return __node.run({ $input, $json, $, $env, now: new Date() });
