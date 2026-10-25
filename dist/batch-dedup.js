/**
 * Run mode:   Run Once for All Items
 * Script:     batch-dedup — keep the first item per key, so a side effect
 *             downstream (one summary email per project manager) fires once
 *             per batch even when the batch holds several bookings per key
 * Input:      items; json._dedupKey when the key is precomputed, otherwise
 *             the key is json.projectManagerEmail + "_" + json.projectManagerName
 * Output:     the first item of every key, in input order; json gains _dedupKey
 * Uses:       lib/text collapseWhitespace
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

  // nodes/batch-dedup.js
  var batch_dedup_exports = {};
  __export(batch_dedup_exports, {
    run: () => run
  });

  // lib/text/index.js
  function str(value) {
    return value === null || value === void 0 ? "" : String(value);
  }
  function collapseWhitespace(value) {
    return str(value).replace(/\s+/g, " ").trim();
  }

  // nodes/batch-dedup.js
  var KEY_FIELDS = ["projectManagerEmail", "projectManagerName"];
  function run({ $input }) {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const item of $input.all()) {
      const json = item?.json ?? {};
      const given = json._dedupKey;
      const key = given !== void 0 && given !== null && String(given) !== "" ? String(given) : KEY_FIELDS.map((f) => collapseWhitespace(json[f])).join("_");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ json: { ...json, _dedupKey: key } });
    }
    return out;
  }
  return __toCommonJS(batch_dedup_exports);
})();
return __node.run({ $input, $json, $, $env, now: new Date() });
