/**
 * Run mode:   Run Once for All Items
 * Script:     html-strip — plain text from an Outlook / Microsoft Graph mail body
 * Input:      items whose json.body is a Graph body object { contentType, content }
 *             or an HTML/text string (the Outlook trigger's shape)
 * Output:     one item per input item: json = { ...input json, cleanedBody }
 *             An item without a usable body stops the run with a clear error.
 * Uses:       lib/text stripHtml
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

  // nodes/html-strip.js
  var html_strip_exports = {};
  __export(html_strip_exports, {
    run: () => run
  });

  // lib/text/index.js
  function str(value) {
    return value === null || value === void 0 ? "" : String(value);
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

  // nodes/html-strip.js
  function run({ $input }) {
    return $input.all().map((item, index) => {
      const json = item?.json ?? {};
      const body = json.body;
      let html;
      if (typeof body === "string") {
        html = body;
      } else if (body && typeof body === "object") {
        if (typeof body.content !== "string") {
          throw new Error(`html-strip: item ${index}: body.content missing (body is an object without a string "content" field)`);
        }
        html = body.content;
      } else {
        throw new Error(`html-strip: item ${index}: body missing (expected json.body as a string or { content })`);
      }
      return { json: { ...json, cleanedBody: stripHtml(html) } };
    });
  }
  return __toCommonJS(html_strip_exports);
})();
return __node.run({ $input, $json, $, $env, now: new Date() });
