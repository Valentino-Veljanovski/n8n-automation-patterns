import { test } from "node:test";
import assert from "node:assert/strict";

import {
  stripInvisible,
  collapseWhitespace,
  stripHtml,
  truncate,
  safeFileName,
  safePath,
  cleanQuery,
  cleanFolderQuery,
  parseAmountDe,
  cleanAssistantReply,
} from "../../lib/text/index.js";
import { skipReason, oldSource, requireOld, extractFunctions, createN8nContext, runCodeNode } from "./old-loader.js";

const DISPATCH = "multi-region-dispatch-automation-snippets/snippets/";
const DOCSEARCH = "document-search-assistant-snippets/snippets/";
const ASSISTANT = "slack-multilingual-executive-assistant-snippets/snippets/";
const RECLAMATION = "internal-reclamation-case-management-snippets/snippets/";

/** @param {string} s */
const squash = (s) => s.replace(/\s+/g, " ").trim();

test("differential text: appointment-date-filter stripInvisibleChars / truncateName", { skip: skipReason }, () => {
  const old = extractFunctions(oldSource(DISPATCH + "appointment-date-filter.js"), [
    "MAX_NAME_LENGTH",
    "stripInvisibleChars",
    "truncateName",
  ]);
  for (const input of ["Mül\u200Bler", "Großmann\uFEFF", "plain", "\u00ADsoft"]) {
    assert.equal(stripInvisible(input), old.stripInvisibleChars(input), JSON.stringify(input));
  }
  for (const input of ["Max Mustermann", "Müller Großmann GmbH & Co. KG Niederlassung Süd", "  padded \u200B "]) {
    assert.equal(truncate(stripInvisible(input), 35), old.truncateName(input), JSON.stringify(input));
  }
});

test("differential text: llm-output-sanitizer sanitizeText", { skip: skipReason }, () => {
  const old = extractFunctions(oldSource(DISPATCH + "llm-output-sanitizer.js"), ["sanitizeText"]);
  for (const input of ["  Max\r\n Mustermann\t", "a   b", "", null, "Müller\u200BGmbH"]) {
    assert.equal(collapseWhitespace(stripInvisible(input)), old.sanitizeText(input), JSON.stringify(input));
  }
  // E2: the old code strips zero-width characters AFTER trimming.
  assert.equal(old.sanitizeText("hello \u200B"), "hello ");
  assert.equal(collapseWhitespace(stripInvisible("hello \u200B")), "hello");
});

test("differential text: data-shape-transformer clean()", { skip: skipReason }, () => {
  const src = oldSource(DISPATCH + "data-shape-transformer.js");
  const row = {
    BookingID: " SRL-1 ",
    KundenName: "<b>Max</b>\n\tMuster  mann",
    KundenAdresse: "Straße 1,\r\n80331 München",
    KundenTelefon: "089 1",
    KundenEmail: "a@b.de",
    ProjektleiterName: "PM",
    ProjektleiterEmail: "pm@b.de",
    ProjektleiterFirma: "Firma",
    Datum: "11.05.2026",
    Uhrzeit: "14:30",
  };
  const ctx = createN8nContext({ items: [row], nodes: {} });
  const [out] = runCodeNode(src, ctx);
  assert.equal(collapseWhitespace(stripHtml(row.KundenName)), out.json.customerName);
  assert.equal(collapseWhitespace(stripHtml(row.KundenAdresse)), out.json.customerAddress);
  assert.equal(collapseWhitespace(stripHtml(row.BookingID)), out.json.bookingId);
});

test("differential text: email-html-stripper (text content, whitespace-normalised)", { skip: skipReason }, () => {
  const src = oldSource(DISPATCH + "email-html-stripper.js");
  const html =
    "<html><head><style>p{color:red}</style></head><body><p>Sehr geehrte Damen &amp; Herren,</p>" +
    "<table><tr><td>Termin:&nbsp;11.05.2026</td></tr></table><script>x()</script>" +
    "<p>&lt;Gruß&gt; &quot;Max&quot;</p></body></html>";
  const ctx = createN8nContext({ items: [{ body: { content: html } }] });
  const [out] = runCodeNode(src, ctx);
  // The old code emitted a newline for EVERY tag, so only the text content
  // is compared; line placement is intentionally different.
  assert.equal(squash(stripHtml(html)), squash(out.json.cleanedBody));
});

test("differential text: folder-path-sanitizer sanitizePath / safeFileName", { skip: skipReason }, () => {
  const old = extractFunctions(oldSource(DISPATCH + "folder-path-sanitizer.js"), ["sanitizePath", "safeFileName"]);
  for (const input of ["Müller / Mayer-GmbH (2025)", 'a:b*c?d"e<f>g|h\\i', "trailing dots... ", "", null, "Unknown_Customer"]) {
    assert.equal(safePath(input), old.sanitizePath(input), JSON.stringify(input));
  }
  for (const input of ["Signed_Document_MUELLER_GMBH__SRL-1042.pdf", "Müller / Mayer-GmbH (2025).pdf", "Отчёт_2026.pdf"]) {
    assert.equal(safeFileName(input), old.safeFileName(input), JSON.stringify(input));
  }
  // E11: the old code sliced to 80 characters AFTER ".pdf" was part of the
  // string, so a long name lost its extension; the new code keeps it.
  const long = "A".repeat(100) + ".pdf";
  assert.equal(old.safeFileName(long).endsWith(".pdf"), false);
  assert.equal(safeFileName(long, { ext: ".pdf" }).endsWith(".pdf"), true);
});

test("differential text: document-search query-cleaner / folder-query-sanitizer", { skip: skipReason }, () => {
  const qc = requireOld(DOCSEARCH + "query-cleaner.js");
  const fq = requireOld(DOCSEARCH + "folder-query-sanitizer.js");
  for (const input of ["Find the PDF invoices from 2024", "Bilder vom Umzug", "", null, "Excel Datei Umsatz"]) {
    assert.equal(cleanQuery(input), qc.cleanSearchQuery(input), JSON.stringify(input));
  }
  for (const input of ["Projects/2024\\'Q1'", "  Kunden  ", "", null]) {
    assert.equal(cleanFolderQuery(input), fq.sanitizeFolderQuery(input), JSON.stringify(input));
  }
  // Deviation (not an E-case, recorded here): double quotes break a Graph
  // search string the same way single quotes do, so the new code drops both.
  assert.equal(fq.sanitizeFolderQuery('"Kunden"'), '"Kunden"');
  assert.equal(cleanFolderQuery('"Kunden"'), "Kunden");
});

test("differential text: response-cleaner cleanAssistantResponse", { skip: skipReason }, () => {
  const old = extractFunctions(oldSource(ASSISTANT + "response-cleaner.js"), ["cleanAssistantResponse"]);
  for (const input of ["Sure, here you go", "Here is what I found: 3 slots", "plain answer", "a\n\n\n\nb", "", null]) {
    assert.equal(cleanAssistantReply(input), old.cleanAssistantResponse(input), JSON.stringify(input));
  }
  // E16: old → new
  assert.equal(old.cleanAssistantResponse("Surely the invoice is attached."), "ly the invoice is attached.");
  assert.equal(cleanAssistantReply("Surely the invoice is attached."), "Surely the invoice is attached.");
  assert.equal(old.cleanAssistantResponse("Of course! Here"), "! Here");
  assert.equal(cleanAssistantReply("Of course! Here"), "Here");
  assert.equal(old.cleanAssistantResponse("This was automated with n8n."), "This was .");
  assert.equal(cleanAssistantReply("This was automated with n8n."), "This was automated with n8n.");
});

test("differential text: date-range-summary-aggregator parseAmount", { skip: skipReason }, () => {
  const old = extractFunctions(oldSource(RECLAMATION + "date-range-summary-aggregator.js"), ["parseAmount"]);
  for (const input of ["1234.56", "500", "€ 500", "", null, "n/a", "-12,5"]) {
    assert.equal(parseAmountDe(input), old.parseAmount(input), JSON.stringify(input));
  }
  // Deviation (not an E-case, recorded here): the old function's own
  // doc-comment promises "1.234,56" → 1234.56 but it returns 1.234, because it
  // swaps the comma for a dot and then parses "1.234.56".
  assert.equal(old.parseAmount("1.234,56"), 1.234);
  assert.equal(parseAmountDe("1.234,56"), 1234.56);
});
