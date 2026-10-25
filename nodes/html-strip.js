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
import { stripHtml } from "../lib/text/index.js";

/**
 * @param {{ $input: { all: () => any[] } }} ctx
 */
export function run({ $input }) {
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
