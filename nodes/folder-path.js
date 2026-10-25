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
import { safePath, documentFileName } from "../lib/text/index.js";

/** Most specific first: "moving + assembly" must land in Assembly. */
const SERVICE_FOLDERS = [
  { folder: "Disassembly", match: ["disassembly", "demontage"] },
  { folder: "Reassembly", match: ["reassembly", "remontage"] },
  { folder: "Assembly", match: ["assembly", "montage", "installation"] },
  { folder: "Moving", match: ["moving", "umzug", "relocation"] },
  { folder: "Cleaning", match: ["cleaning", "reinigung"] },
];

/** @param {unknown} serviceType */
function serviceFolder(serviceType) {
  const text = String(serviceType ?? "").trim().toLowerCase();
  if (!text) return "Other";
  for (const { folder, match } of SERVICE_FOLDERS) if (match.some((k) => text.includes(k))) return folder;
  return "Other";
}

/**
 * @param {{ $input: { all: () => any[] } }} ctx
 */
export function run({ $input }) {
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
