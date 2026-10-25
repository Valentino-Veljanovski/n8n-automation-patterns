/**
 * Date handling without time-zone surprises.
 *
 * Everything works on plain calendar parts `{ year, month, day, hour?, minute? }`
 * (month is 1-12). No function here reads a Date through local getters or
 * converts one to an ISO string, so a date read from a spreadsheet, an email
 * or an LLM answer means the same calendar day on every machine.
 *
 * Excel serials use the 1899-12-30 epoch: serial 1 is 1899-12-31. Anchoring
 * there absorbs Excel's phantom 1900-02-29 for every date after 1900-03-01.
 */

/**
 * @typedef {Object} DateParts
 * @property {number} year
 * @property {number} month 1-12
 * @property {number} day 1-31
 * @property {number} [hour] 0-23
 * @property {number} [minute] 0-59
 */

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;
const MAX_SERIAL = 2_958_465; // 9999-12-31

/** @type {Record<string, number>} */
const MONTH_NAMES = {
  jan: 1, january: 1, januar: 1,
  feb: 2, february: 2, februar: 2,
  mar: 3, march: 3, märz: 3, maerz: 3, mär: 3,
  apr: 4, april: 4,
  may: 5, mai: 5,
  jun: 6, june: 6, juni: 6,
  jul: 7, july: 7, juli: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, okt: 10, oktober: 10,
  nov: 11, november: 11,
  dec: 12, december: 12, dez: 12, dezember: 12,
};

const INVISIBLE = /[\u200B-\u200D\uFEFF\u00AD\u2060]/g;

/** @param {number} n @returns {string} */
export function pad2(n) {
  return String(n).padStart(2, "0");
}

/** @param {number} year @param {number} month 1-12 */
function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * @param {number} year @param {number} month @param {number} day
 * @param {number} [hour] @param {number} [minute]
 * @returns {DateParts | null}
 */
function makeParts(year, month, day, hour, minute) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  /** @type {DateParts} */
  const parts = { year, month, day };
  if (hour !== undefined) {
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute === undefined || minute < 0 || minute > 59) {
      return null;
    }
    parts.hour = hour;
    parts.minute = minute;
  }
  return parts;
}

/**
 * Excel serial number → calendar parts (time included when the serial has a
 * fraction, rounded to the minute).
 * @param {number | string} serial
 * @returns {DateParts | null}
 */
export function fromExcelSerial(serial) {
  const n = typeof serial === "string" ? Number(serial.trim()) : serial;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 1 || n > MAX_SERIAL) return null;
  const minutes = Math.round(n * 1440);
  const d = new Date(EXCEL_EPOCH_MS + minutes * MS_PER_MINUTE);
  const hasTime = !Number.isInteger(n);
  return makeParts(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    hasTime ? d.getUTCHours() : undefined,
    hasTime ? d.getUTCMinutes() : undefined,
  );
}

/**
 * Calendar parts → Excel serial (fractional when a time is present).
 * @param {DateParts} parts
 * @returns {number}
 */
export function toExcelSerial(parts) {
  const ms = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour ?? 0, parts.minute ?? 0);
  return (ms - EXCEL_EPOCH_MS) / MS_PER_DAY;
}

const TIME_RE = /^(?:T|\s+|,\s*)?(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(?:Z|UTC|[+-]\d{2}:?\d{2})?$/i;

/**
 * @param {string} rest text after the date
 * @returns {{ hour?: number, minute?: number } | null} null when `rest` is not a time
 */
function parseTimeSuffix(rest) {
  if (rest === "") return {};
  const m = TIME_RE.exec(rest);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

const PATTERNS = [
  // 11.05.2026, 1.5.2026, 11.05.2026 14:30
  { re: /^(\d{1,2})\.(\d{1,2})\.(\d{4})(.*)$/, map: (/** @type {RegExpExecArray} */ m) => [Number(m[3]), Number(m[2]), Number(m[1]), m[4]] },
  // 2026-05-11, 2026-05-11T14:30:00Z, 2026-05-11 14:30
  { re: /^(\d{4})-(\d{2})-(\d{2})(.*)$/, map: (/** @type {RegExpExecArray} */ m) => [Number(m[1]), Number(m[2]), Number(m[3]), m[4]] },
  // May 11, 2026 / May 11 2026 / Mai 11, 2026
  { re: /^([A-Za-zÄäÖöÜü]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th|\.)?,?\s+(\d{4})(.*)$/, map: (/** @type {RegExpExecArray} */ m) => [Number(m[3]), monthNumber(m[1]), Number(m[2]), m[4]] },
  // 11 May 2026 / 11. Mai 2026
  { re: /^(\d{1,2})\.?\s+([A-Za-zÄäÖöÜü]{3,9})\.?,?\s+(\d{4})(.*)$/, map: (/** @type {RegExpExecArray} */ m) => [Number(m[3]), monthNumber(m[2]), Number(m[1]), m[4]] },
];

/** @param {string} name @returns {number} 0 when unknown */
function monthNumber(name) {
  return MONTH_NAMES[name.toLowerCase()] ?? 0;
}

/**
 * Parses the date shapes that show up in spreadsheets, emails and model
 * output: "1.5.2026", "11.05.2026 14:30", ISO 8601, "May 11, 2026",
 * "11 May 2026", an Excel serial (number or numeric string) or a Date
 * (read in UTC). Anything else → null. The wall-clock parts are taken as
 * written; an ISO offset is not applied.
 * @param {unknown} input
 * @returns {DateParts | null}
 */
export function parseDate(input) {
  if (input === null || input === undefined || input === "") return null;
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

/**
 * "YYYY-MM-DD" from parts; null in → null out, so it composes with parseDate.
 * @param {DateParts | null | undefined} parts
 * @returns {string | null}
 */
export function toIsoDay(parts) {
  if (!parts) return null;
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

/**
 * @param {DateParts | null | undefined} parts
 * @param {"de" | "iso"} [style]
 * @param {{ time?: boolean }} [options]
 * @returns {string} "" when parts is null
 */
export function formatDate(parts, style = "de", { time = false } = {}) {
  if (!parts) return "";
  const day = style === "iso" ? toIsoDay(parts) : `${pad2(parts.day)}.${pad2(parts.month)}.${parts.year}`;
  if (!time) return String(day);
  return `${day} ${pad2(parts.hour ?? 0)}:${pad2(parts.minute ?? 0)}`;
}

/**
 * @param {DateParts | null | undefined} a
 * @param {DateParts | null | undefined} b
 */
export function isSameDay(a, b) {
  if (!a || !b) return false;
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** @param {DateParts} parts */
function dayNumber(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day) / MS_PER_DAY;
}

/**
 * Whole calendar days from `earlier` to `later` (negative when reversed).
 * @param {DateParts} later
 * @param {DateParts} earlier
 */
export function daysBetween(later, earlier) {
  return dayNumber(later) - dayNumber(earlier);
}

/**
 * Folder name for a weekly archive, e.g. "Week_11_05_2026".
 * @param {DateParts} parts
 */
export function weekArchiveName(parts) {
  return `Week_${pad2(parts.day)}_${pad2(parts.month)}_${parts.year}`;
}

/**
 * @param {string} name
 * @returns {DateParts | null}
 */
export function parseWeekArchiveName(name) {
  const m = /^Week_(\d{2})_(\d{2})_(\d{4})$/.exec(String(name ?? ""));
  if (!m) return null;
  return makeParts(Number(m[3]), Number(m[2]), Number(m[1]));
}
