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
 * Reads:      $input
 * Uses:       lib/graph binaryFanOut
 * Built-ins:  none
 */
import { binaryFanOut } from "../lib/graph/index.js";

/**
 * @param {{ $input: { all: () => any[] } }} ctx
 */
export function run({ $input }) {
  const items = $input.all();
  const first = items[0]?.json ?? {};
  return binaryFanOut(items, { folderId: first.folderId ?? first.id ?? undefined, carry: ["bookingId", "customerName"] });
}
