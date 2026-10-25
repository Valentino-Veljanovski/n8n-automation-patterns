/**
 * Run mode:   Run Once for Each Item
 * Script:     extraction-sanitize — clean what a language model extracted
 *             before it reaches a sheet, an API or a condition
 * Input:      the item from the model step: json = the extraction, or
 *             json.output = the extraction (fields customerName, customerEmail,
 *             customerPhone, customerAddress, appointmentDate, bookingId,
 *             projectManager, projectManagerEmail, company, notes)
 * Output:     one item: json = the cleaned fields (email lower-cased and
 *             validated, phone in E.164, date as YYYY-MM-DD, text flattened;
 *             invalid email/phone → "") plus _issues, a list of
 *             { field, kind, value } for everything that could not be cleaned
 * Reads:      $input, $json
 * Uses:       lib/llm sanitizeExtraction
 * Built-ins:  none
 */
// lib/dates/index.js
var EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
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

// lib/text/index.js
var INVISIBLE2 = /[\u200B-\u200D\uFEFF\u00AD\u2060]/g;
function str(value) {
  return value === null || value === void 0 ? "" : String(value);
}
function stripInvisible(value) {
  return str(value).replace(INVISIBLE2, "").trim();
}
function collapseWhitespace(value) {
  return str(value).replace(/\s+/g, " ").trim();
}
var NAMED_ENTITIES = {
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\xA0",
  euro: "\u20AC",
  pound: "\xA3",
  yen: "\xA5",
  cent: "\xA2",
  copy: "\xA9",
  reg: "\xAE",
  trade: "\u2122",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  laquo: "\xAB",
  raquo: "\xBB",
  bull: "\u2022",
  middot: "\xB7",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  sbquo: "\u201A",
  bdquo: "\u201E",
  szlig: "\xDF",
  auml: "\xE4",
  ouml: "\xF6",
  uuml: "\xFC",
  Auml: "\xC4",
  Ouml: "\xD6",
  Uuml: "\xDC",
  eacute: "\xE9",
  egrave: "\xE8",
  ecirc: "\xEA",
  agrave: "\xE0",
  aacute: "\xE1",
  acirc: "\xE2",
  ccedil: "\xE7",
  ntilde: "\xF1",
  oacute: "\xF3",
  ograve: "\xF2",
  uacute: "\xFA",
  ugrave: "\xF9",
  iacute: "\xED",
  deg: "\xB0",
  sect: "\xA7",
  para: "\xB6",
  times: "\xD7",
  divide: "\xF7",
  plusmn: "\xB1",
  frac12: "\xBD",
  zwj: "\u200D",
  zwnj: "\u200C",
  shy: "\xAD"
};
function decodeHtmlEntities(value) {
  return str(value).replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec))).replace(/&([A-Za-z][A-Za-z0-9]{1,8});/g, (whole, name) => name === "amp" ? whole : NAMED_ENTITIES[name] ?? whole).replace(/&amp;/g, "&");
}
var BLOCK_TAGS = /* @__PURE__ */ new Set([
  "p",
  "div",
  "br",
  "tr",
  "li",
  "ul",
  "ol",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "hr",
  "pre",
  "section",
  "article",
  "header",
  "footer",
  "address",
  "dd",
  "dt",
  "dl",
  "fieldset",
  "form"
]);
var TAG_RE = /<\/?([A-Za-z][A-Za-z0-9:-]*)(?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*\s*\/?>/g;
function stripHtml(value) {
  const text = str(value).replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[endif\]>/gi, "").replace(/<!DOCTYPE[^>]*>/gi, "").replace(/<(style|script|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "").replace(TAG_RE, (_, name) => BLOCK_TAGS.has(String(name).toLowerCase()) ? "\n" : "");
  return decodeHtmlEntities(text).replace(/\r\n?/g, "\n").replace(/\u00A0/g, " ").split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
var FILE_TYPE_WORDS = /* @__PURE__ */ new Set([
  "image",
  "images",
  "photo",
  "photos",
  "picture",
  "pictures",
  "bild",
  "bilder",
  "foto",
  "fotos",
  "pdf",
  "pdfs",
  "document",
  "documents",
  "dokument",
  "dokumente",
  "email",
  "emails",
  "e-mail",
  "e-mails",
  "mail",
  "mails",
  "excel",
  "spreadsheet",
  "word",
  "txt",
  "text",
  "file",
  "files",
  "datei",
  "dateien"
]);
function cleanQuery(value, { stopWords = FILE_TYPE_WORDS, lowercase = true } = {}) {
  const text = lowercase ? stripInvisible(value).toLowerCase() : stripInvisible(value);
  return text.split(/\s+/).filter((word) => word && !stopWords.has(word.toLowerCase())).join(" ").trim();
}
function parseAmountDe(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let s = stripInvisible(value).replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma !== -1) {
    s = (s.match(/,/g) ?? []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot !== -1) {
    const dots = (s.match(/\./g) ?? []).length;
    if (dots > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// lib/phone/index.js
var COUNTRY_CODES = (
  /** @type {const} */
  {
    DE: "49",
    AT: "43",
    CH: "41",
    MK: "389",
    GR: "30",
    RO: "40",
    BG: "359",
    RS: "381",
    AL: "355",
    GB: "44",
    FR: "33",
    IT: "39",
    ES: "34",
    NL: "31",
    BE: "32",
    PL: "48",
    CZ: "420",
    US: "1"
  }
);
var TRUNK_ZERO = /* @__PURE__ */ new Set(["49", "43", "41", "389", "30", "40", "359", "381", "355", "44", "33", "31", "32", "48"]);
var CODES_LONGEST_FIRST = [...new Set(Object.values(COUNTRY_CODES))].sort((a, b) => b.length - a.length);
var INVISIBLE3 = /[\u200B-\u200D\uFEFF\u00AD\u2060]/g;
function normalizePhone(raw, { defaultCountry = "DE" } = {}) {
  if (raw === null || raw === void 0) return null;
  let s = String(raw).replace(INVISIBLE3, "").trim().replace(/^tel:/i, "");
  if (!s || new RegExp("\\p{L}", "u").test(s)) return null;
  s = s.replace(/\(\s*0\s*\)/g, "");
  const international = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;
  let number;
  if (international) {
    number = digits;
  } else if (digits.startsWith("00")) {
    number = digits.slice(2);
  } else {
    const code = COUNTRY_CODES[
      /** @type {keyof typeof COUNTRY_CODES} */
      String(defaultCountry).toUpperCase()
    ];
    if (!code) throw new Error(`normalizePhone: unknown default country "${defaultCountry}"`);
    number = code + (digits.startsWith("0") ? digits.slice(1) : digits);
  }
  for (const code of CODES_LONGEST_FIRST) {
    if (number.startsWith(code)) {
      if (TRUNK_ZERO.has(code) && number[code.length] === "0") number = code + number.slice(code.length + 1);
      break;
    }
  }
  if (number.length < 8 || number.length > 15) return null;
  return "+" + number;
}

// lib/email/index.js
var LOCAL = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*";
var LABEL = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?";
var DOMAIN = `(?:${LABEL}\\.)+[A-Za-z]{2,63}`;
var EMAIL_RE = new RegExp(`${LOCAL}@${DOMAIN}`);
var EMAIL_EXACT_RE = new RegExp(`^${LOCAL}@${DOMAIN}$`);
function isValidEmail(value) {
  if (typeof value !== "string") return false;
  const s = stripInvisible(value);
  if (s.length > 254 || !EMAIL_EXACT_RE.test(s)) return false;
  return s.split("@")[0].length <= 64;
}
function extractEmail(value) {
  if (value === null || value === void 0) return null;
  const m = EMAIL_RE.exec(stripInvisible(value));
  if (!m) return null;
  const found = m[0].toLowerCase();
  return isValidEmail(found) ? found : null;
}
function normalizeEmail(value) {
  if (value === null || value === void 0) return null;
  const s = stripInvisible(value).replace(/\s+/g, "").toLowerCase();
  return isValidEmail(s) ? s : null;
}
var DEFAULT_ROUTE_ACTIONS = Object.freeze({
  accounting: "forward_to_accounting",
  offers: "move_to_offers",
  meeting_notes: "move_to_notes",
  marketing: "move_to_marketing",
  spam: "quarantine",
  replies: "move_to_replies",
  unclassified: "notify_for_review"
});
function decideRoute(classification, { actions = DEFAULT_ROUTE_ACTIONS, minConfidence = 0.65, reviewAction = "notify_for_review" } = {}) {
  const c = classification ?? {};
  const category = String(c.category ?? "").toLowerCase();
  const confidence = Number(c.confidence ?? 0);
  if (!actions[category] || !(confidence >= minConfidence)) {
    return { action: reviewAction, reason: "Low confidence or unknown category" };
  }
  return { action: actions[category], reason: `Matched ${category} with confidence ${confidence}` };
}

// lib/docusign/envelope.js
var UUID = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";
var STRATEGIES = [
  { source: "query-m", re: new RegExp(`[?&]m=${UUID}`, "i") },
  { source: "query-envelopeId", re: new RegExp(`[?&]envelopeId=${UUID}`, "i") },
  { source: "path", re: new RegExp(`envelopes/${UUID}`, "i") },
  { source: "label", re: new RegExp(`envelope\\s*id\\s*[:\\-]?\\s*${UUID}`, "i") },
  { source: "loose", re: new RegExp(UUID, "i") }
];
function textOf(input) {
  if (typeof input === "string") return input;
  if (!input || typeof input !== "object") return "";
  const body = input.body;
  if (body && typeof body === "object" && typeof body.content === "string") return body.content;
  if (typeof body === "string") return body;
  return typeof input.bodyPreview === "string" ? input.bodyPreview : "";
}
function extractEnvelopeId(input) {
  const text = decodeHtmlEntities(textOf(input));
  if (!text) return null;
  for (const { source, re } of STRATEGIES) {
    const m = re.exec(text);
    if (m) return { id: m[1].toLowerCase(), source: (
      /** @type {any} */
      source
    ) };
  }
  return null;
}

// lib/llm/index.js
var FENCE_RE = /^```[a-z]*\s*([\s\S]*?)\s*```$/i;
function parseModelJson(input) {
  if (input && typeof input === "object") return (
    /** @type {any} */
    input
  );
  if (typeof input !== "string") {
    throw new Error(`model output is not valid JSON: expected a string or object, got ${input === null ? "null" : typeof input}`);
  }
  const text = input.trim().replace(FENCE_RE, "$1").trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`model output is not valid JSON: ${reason}; starts with ${JSON.stringify(text.slice(0, 60))}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`model output is not valid JSON: expected an object or array, got ${JSON.stringify(parsed)}`);
  }
  return parsed;
}
var DEFAULT_EXTRACTION_SCHEMA = Object.freeze({
  customerName: "text",
  customerEmail: "email",
  customerPhone: "phone",
  customerAddress: "text",
  appointmentDate: "date",
  bookingId: "text",
  projectManager: "text",
  projectManagerEmail: "email",
  company: "text",
  notes: "text"
});
function sanitizeExtraction(raw, schema = DEFAULT_EXTRACTION_SCHEMA, { defaultCountry = "DE" } = {}) {
  const obj = raw && typeof raw === "object" ? (
    /** @type {any} */
    raw
  ) : {};
  const source = obj.output && typeof obj.output === "object" ? obj.output : obj;
  const values = {};
  const issues = [];
  for (const [field, kind] of Object.entries(schema)) {
    const value = source[field];
    const present = value !== null && value !== void 0 && String(value).trim() !== "";
    switch (kind) {
      case "text":
        values[field] = collapseWhitespace(stripInvisible(value));
        break;
      case "email": {
        const email = normalizeEmail(value);
        values[field] = email ?? "";
        if (present && !email) issues.push({ field, kind, value });
        break;
      }
      case "phone": {
        const phone = normalizePhone(value, { defaultCountry });
        values[field] = phone ?? "";
        if (present && !phone) issues.push({ field, kind, value });
        break;
      }
      case "date": {
        const cleaned = collapseWhitespace(stripInvisible(value));
        const parts = parseDate(cleaned);
        values[field] = parts ? String(toIsoDay(parts)) : cleaned;
        if (present && !parts) issues.push({ field, kind, value });
        break;
      }
      default:
        throw new Error(`sanitizeExtraction: unknown field kind "${kind}" for "${field}"`);
    }
  }
  return { values, issues };
}
var DEFAULT_PROMPT_FIELDS = Object.freeze([
  ["Company", "company"],
  ["Customer name", "customerName"],
  ["Address", "address"],
  ["Phone", "phone"],
  ["Status", "status"],
  ["Priority", "priority"],
  ["Reported on", "reportedOn"],
  ["Assigned to", "assignedTo"],
  ["Notes", "notes"]
]);
var TOOL_REGISTRY = Object.freeze([
  { name: "parseDate", description: "Read a date in German, ISO, English-month or Excel-serial form into calendar parts.", handler: parseDate },
  { name: "normalizePhone", description: "Turn a phone number into E.164.", handler: normalizePhone },
  { name: "extractEmail", description: "Find the first email address in a text.", handler: extractEmail },
  { name: "normalizeEmail", description: "Validate and lower-case an email address.", handler: normalizeEmail },
  { name: "extractEnvelopeId", description: "Find the DocuSign envelope ID in a notification.", handler: extractEnvelopeId },
  { name: "stripHtml", description: "Convert an HTML email body to plain text.", handler: stripHtml },
  { name: "parseAmountDe", description: "Read a German-formatted amount into a number.", handler: parseAmountDe },
  { name: "cleanQuery", description: "Remove file-type words from a search request.", handler: cleanQuery },
  { name: "decideRoute", description: "Map an email classification to a routing action.", handler: decideRoute },
  { name: "parseModelJson", description: "Parse JSON a model returned, code fence included.", handler: parseModelJson }
]);

// nodes/extraction-sanitize.js
function run({ $input, $json }) {
  const json = $json ?? ($input.item ?? $input.first())?.json ?? {};
  const { values, issues } = sanitizeExtraction(json);
  return [{ json: { ...values, _issues: issues } }];
}
return run({ $input, $json, $: $, now: new Date() });
