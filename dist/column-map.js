/**
 * Run mode:   Run Once for All Items
 * Script:     column-map — spreadsheet rows with German or English headers
 *             into one clean, camelCase shape for the nodes that follow
 * Input:      items as the Excel node emits them: one object per row keyed by
 *             header text (BookingID / KundenName / … or their English names);
 *             _rowIndex or rowIndex when the sheet node provides it
 * Output:     one item per row with exactly these keys:
 *             bookingId, customerName, customerAddress, customerPhone,
 *             customerEmail, projectManager, projectManagerEmail, company,
 *             appointmentDate, appointmentTime, rowIndex
 *             Text is stripped of HTML and flattened. A row without a
 *             booking ID stops the run with its row index. No input → [].
 * Uses:       lib/graph safeGet; lib/text stripHtml, collapseWhitespace
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

  // nodes/column-map.js
  var column_map_exports = {};
  __export(column_map_exports, {
    run: () => run
  });

  // lib/text/index.js
  function str(value) {
    return value === null || value === void 0 ? "" : String(value);
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

  // nodes/column-map.js
  var COLUMNS = {
    bookingId: ["BookingID", "bookingId", "Buchungsnummer"],
    customerName: ["KundenName", "CustomerName", "customerName", "Kunde"],
    customerAddress: ["KundenAdresse", "CustomerAddress", "customerAddress"],
    customerPhone: ["KundenTelefon", "CustomerPhone", "customerPhone"],
    customerEmail: ["KundenEmail", "CustomerEmail", "customerEmail"],
    projectManager: ["ProjektleiterName", "ProjectManager", "projectManager"],
    projectManagerEmail: ["ProjektleiterEmail", "ProjectManagerEmail", "projectManagerEmail"],
    company: ["ProjektleiterFirma", "Company", "company"],
    appointmentDate: ["Datum", "AppointmentDate", "appointmentDate"],
    appointmentTime: ["Uhrzeit", "AppointmentTime", "appointmentTime"]
  };
  var clean = (value) => typeof value === "string" ? collapseWhitespace(stripHtml(value)) : value === void 0 || value === null ? "" : String(value);
  function run({ $input }) {
    return $input.all().map((item, index) => {
      const raw = item?.json ?? {};
      const rowIndex = raw._rowIndex ?? raw.rowIndex ?? index;
      const data = {};
      for (const [key, headers] of Object.entries(COLUMNS)) data[key] = clean(safeGet(raw, headers, ""));
      data.rowIndex = rowIndex;
      if (!data.bookingId) throw new Error(`column-map: row ${rowIndex}: missing BookingID, cannot proceed`);
      return { json: data };
    });
  }
  return __toCommonJS(column_map_exports);
})();
return __node.run({ $input, $json, $, $env, now: new Date() });
