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
import { safeGet } from "../lib/graph/index.js";
import { stripHtml, collapseWhitespace } from "../lib/text/index.js";

/** Output key → accepted header texts, first match wins. */
const COLUMNS = {
  bookingId: ["BookingID", "bookingId", "Buchungsnummer"],
  customerName: ["KundenName", "CustomerName", "customerName", "Kunde"],
  customerAddress: ["KundenAdresse", "CustomerAddress", "customerAddress"],
  customerPhone: ["KundenTelefon", "CustomerPhone", "customerPhone"],
  customerEmail: ["KundenEmail", "CustomerEmail", "customerEmail"],
  projectManager: ["ProjektleiterName", "ProjectManager", "projectManager"],
  projectManagerEmail: ["ProjektleiterEmail", "ProjectManagerEmail", "projectManagerEmail"],
  company: ["ProjektleiterFirma", "Company", "company"],
  appointmentDate: ["Datum", "AppointmentDate", "appointmentDate"],
  appointmentTime: ["Uhrzeit", "AppointmentTime", "appointmentTime"],
};

/** @param {unknown} value */
const clean = (value) => (typeof value === "string" ? collapseWhitespace(stripHtml(value)) : value === undefined || value === null ? "" : String(value));

/**
 * @param {{ $input: { all: () => any[] } }} ctx
 */
export function run({ $input }) {
  return $input.all().map((item, index) => {
    const raw = item?.json ?? {};
    const rowIndex = raw._rowIndex ?? raw.rowIndex ?? index;
    /** @type {Record<string, any>} */
    const data = {};
    for (const [key, headers] of Object.entries(COLUMNS)) data[key] = clean(safeGet(raw, headers, ""));
    data.rowIndex = rowIndex;
    if (!data.bookingId) throw new Error(`column-map: row ${rowIndex}: missing BookingID, cannot proceed`);
    return { json: data };
  });
}
