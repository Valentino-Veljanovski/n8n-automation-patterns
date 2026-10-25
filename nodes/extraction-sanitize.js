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
import { sanitizeExtraction } from "../lib/llm/index.js";

/**
 * @param {{ $input: { item?: any, first: () => any }, $json?: any }} ctx
 */
export function run({ $input, $json }) {
  const json = $json ?? ($input.item ?? $input.first())?.json ?? {};
  const { values, issues } = sanitizeExtraction(json);
  return [{ json: { ...values, _issues: issues } }];
}
