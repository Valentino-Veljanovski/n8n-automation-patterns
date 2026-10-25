/**
 * Run mode:   Run Once for All Items
 * Script:     folder-path — safe SharePoint / OneDrive folder and file names
 *             from customer-supplied data, plus a service-type subfolder
 * Input:      items with json.customerName, json.bookingId, json.serviceType,
 *             json.documentType (all optional; "Unknown_Customer", "no-id",
 *             "Other" and "Dokument" fill the gaps)
 * Output:     one item per input item: json = { ...input json, subFolder,
 *             folderName, fileName, fullPath }
 * Uses:       lib/text safePath, documentFileName
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

  // nodes/folder-path.js
  var folder_path_exports = {};
  __export(folder_path_exports, {
    run: () => run
  });

  // lib/text/index.js
  var INVISIBLE = /[\u200B-\u200D\uFEFF\u00AD\u2060]/g;
  function str(value) {
    return value === null || value === void 0 ? "" : String(value);
  }
  function stripInvisible(value) {
    return str(value).replace(INVISIBLE, "").trim();
  }
  function collapseWhitespace(value) {
    return str(value).replace(/\s+/g, " ").trim();
  }
  var RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  var FALLBACK_STEM = "Dokument";
  function byteLength(s) {
    return Buffer.byteLength(s, "utf8");
  }
  function safeFileName(name, { ext = "", maxBytes = 255 } = {}) {
    let stem = stripInvisible(name);
    if (ext && stem.toLowerCase().endsWith(ext.toLowerCase())) stem = stem.slice(0, -ext.length);
    stem = stem.replace(/[^\p{L}\p{M}\p{N} _.-]/gu, "").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
    if (!stem) stem = FALLBACK_STEM;
    if (RESERVED_NAMES.test(stem)) stem += "_";
    const budget = maxBytes - byteLength(ext);
    let chars = Array.from(stem);
    while (chars.length > 1 && byteLength(chars.join("")) > budget) chars.pop();
    stem = chars.join("").replace(/[. ]+$/, "") || FALLBACK_STEM;
    return stem + ext;
  }
  function documentFileName({ documentType, folderName } = {}, ext = ".pdf") {
    const type = collapseWhitespace(documentType) || FALLBACK_STEM;
    const folder = collapseWhitespace(folderName);
    return safeFileName(folder ? `${type}_${folder}` : type, { ext });
  }
  function safePath(value) {
    return stripInvisible(value).replace(/[\\/:*?"<>|\p{Cc}]/gu, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
  }

  // nodes/folder-path.js
  var SERVICE_FOLDERS = [
    { folder: "Disassembly", match: ["disassembly", "demontage"] },
    { folder: "Reassembly", match: ["reassembly", "remontage"] },
    { folder: "Assembly", match: ["assembly", "montage", "installation"] },
    { folder: "Moving", match: ["moving", "umzug", "relocation"] },
    { folder: "Cleaning", match: ["cleaning", "reinigung"] }
  ];
  function serviceFolder(serviceType) {
    const text = String(serviceType ?? "").trim().toLowerCase();
    if (!text) return "Other";
    for (const { folder, match } of SERVICE_FOLDERS) if (match.some((k) => text.includes(k))) return folder;
    return "Other";
  }
  function run({ $input }) {
    return $input.all().map((item) => {
      const json = item?.json ?? {};
      const customer = safePath(json.customerName || "Unknown_Customer");
      const booking = safePath(json.bookingId || "no-id");
      const folderName = safePath(`${customer}__${booking}`);
      const fileName = documentFileName({ documentType: json.documentType, folderName }, ".pdf");
      const subFolder = serviceFolder(json.serviceType);
      return { json: { ...json, subFolder, folderName, fileName, fullPath: `${subFolder}/${folderName}/${fileName}` } };
    });
  }
  return __toCommonJS(folder_path_exports);
})();
return __node.run({ $input, $json, $, $env, now: new Date() });
