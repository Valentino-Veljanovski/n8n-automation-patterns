/**
 * Run mode:   Run Once for All Items
 * Script:     binary-fan-out — one item per mail attachment, each carrying its
 *             binary under the key "data", so one upload node serves them all
 * Input:      items with n8n binaries (an Outlook trigger with attachments);
 *             json.folderId (or json.id from a "create folder" step merged in)
 *             names the destination folder; json.bookingId and
 *             json.customerName are copied onto every attachment
 * Output:     per binary: json = { attachmentName, mimeType, fileSize (bytes
 *             from n8n's fileSize, null when absent), folderId, bookingId,
 *             customerName }, binary = { data }. No attachments → [].
 * Uses:       lib/graph binaryFanOut
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

  // nodes/binary-fan-out.js
  var binary_fan_out_exports = {};
  __export(binary_fan_out_exports, {
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
  function parseFileSize(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string") return null;
    const m = /^\s*([\d.,]+)\s*([a-zA-Z]*)\s*$/.exec(value);
    if (!m) return null;
    const n = Number(m[1].replace(",", "."));
    const unit = UNITS[m[2].toLowerCase() || "b"];
    if (!Number.isFinite(n) || unit === void 0) return null;
    return Math.round(n * unit);
  }
  function binaryFanOut(items, { folderId, carry = [] } = {}) {
    const out = [];
    for (const item of items ?? []) {
      const binary = item?.binary;
      if (!binary || typeof binary !== "object") continue;
      const json = item.json ?? {};
      for (const [key, data] of Object.entries(binary)) {
        const carried = {};
        for (const field of carry) carried[field] = json[field];
        out.push({
          json: {
            attachmentName: data?.fileName || key,
            mimeType: data?.mimeType || "application/octet-stream",
            fileSize: parseFileSize(data?.fileSize),
            folderId: folderId ?? json.folderId ?? null,
            ...carried
          },
          binary: { data }
        });
      }
    }
    return out;
  }

  // nodes/binary-fan-out.js
  function run({ $input }) {
    const items = $input.all();
    const first = items[0]?.json ?? {};
    return binaryFanOut(items, { folderId: first.folderId ?? first.id ?? void 0, carry: ["bookingId", "customerName"] });
  }
  return __toCommonJS(binary_fan_out_exports);
})();
return __node.run({ $input, $json, $, $env, now: new Date() });
