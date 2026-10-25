/**
 * Run mode:   Run Once for All Items
 * Script:     batch-dedup — keep the first item per key, so a side effect
 *             downstream (one summary email per project manager) fires once
 *             per batch even when the batch holds several bookings per key
 * Input:      items; json._dedupKey when the key is precomputed, otherwise
 *             the key is json.projectManagerEmail + "_" + json.projectManagerName
 * Output:     the first item of every key, in input order; json gains _dedupKey
 * Reads:      $input
 * Uses:       lib/text collapseWhitespace
 * Built-ins:  none
 */
import { collapseWhitespace } from "../lib/text/index.js";

const KEY_FIELDS = ["projectManagerEmail", "projectManagerName"];

/**
 * @param {{ $input: { all: () => any[] } }} ctx
 */
export function run({ $input }) {
  const seen = new Set();
  const out = [];
  for (const item of $input.all()) {
    const json = item?.json ?? {};
    const given = json._dedupKey;
    const key = given !== undefined && given !== null && String(given) !== "" ? String(given) : KEY_FIELDS.map((f) => collapseWhitespace(json[f])).join("_");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ json: { ...json, _dedupKey: key } });
  }
  return out;
}
