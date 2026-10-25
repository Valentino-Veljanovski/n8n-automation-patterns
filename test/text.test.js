import { test } from "node:test";
import assert from "node:assert/strict";

import {
  stripInvisible,
  collapseWhitespace,
  decodeHtmlEntities,
  stripHtml,
  escapeHtml,
  truncate,
  safeFileName,
  documentFileName,
  safePath,
  cleanQuery,
  cleanFolderQuery,
  parseAmountDe,
  cleanAssistantReply,
} from "../lib/text/index.js";

test("E2 stripInvisible removes zero-width and soft-hyphen characters before trimming", () => {
  assert.equal(stripInvisible("\u200B hello"), "hello");
  assert.equal(stripInvisible("hello \u200B"), "hello");
  assert.equal(stripInvisible("\u00ADhello"), "hello");
  assert.equal(stripInvisible("Mül\u200Bler"), "Müller");
  assert.equal(stripInvisible("\uFEFFGroßmann\u200D"), "Großmann");
  assert.equal(stripInvisible(null), "");
  assert.equal(stripInvisible(42), "42");
});

test("collapseWhitespace flattens line breaks, tabs and nbsp to single spaces", () => {
  assert.equal(collapseWhitespace("  a \n\t b\u00A0 c  "), "a b c");
  assert.equal(collapseWhitespace(""), "");
});

test("E7 decodeHtmlEntities: numeric first, &amp; last", () => {
  assert.equal(decodeHtmlEntities("&#39;&#8203;&euro;&amp;lt;"), "'\u200B€&lt;");
  assert.equal(decodeHtmlEntities("&#x27;&nbsp;&quot;&gt;"), "'\u00A0\">");
  assert.equal(decodeHtmlEntities("Müller &amp; Söhne"), "Müller & Söhne");
  assert.equal(decodeHtmlEntities("&unknown;"), "&unknown;");
});

test("E7 stripHtml removes tags whose attributes contain '>'", () => {
  assert.equal(stripHtml('<a title="a>b" href="x">Link</a> text'), "Link text");
  assert.equal(stripHtml("<p data-x='1>2'>Hi</p>"), "Hi");
});

test("E7 stripHtml drops Outlook conditional comment blocks", () => {
  const html = "<p>Before</p><!--[if mso]><table><tr><td>MSO ONLY</td></tr></table><![endif]--><p>After</p>";
  assert.equal(stripHtml(html), "Before\n\nAfter");
  const notMso = "<!--[if !mso]><!--><p>Everyone</p><!--<![endif]-->";
  assert.equal(stripHtml(notMso), "Everyone");
});

test("stripHtml drops style and script blocks, decodes entities, keeps paragraph breaks", () => {
  const html =
    "<html><head><style>p{color:red}</style></head><body>" +
    "<div>Sehr geehrte <b>Damen</b> &amp; Herren,</div><br>" +
    "<p>Termin:&nbsp;11.05.2026</p><script>alert(1)</script>" +
    "<p></p><p></p><p>Gruß</p></body></html>";
  assert.equal(stripHtml(html), "Sehr geehrte Damen & Herren,\n\nTermin: 11.05.2026\n\nGruß");
  assert.equal(stripHtml(""), "");
  assert.equal(stripHtml(null), "");
});

test("escapeHtml escapes the five significant characters", () => {
  assert.equal(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`), "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;");
});

test("truncate counts code points and includes the ellipsis in the limit", () => {
  assert.equal(truncate("Müller Großmann GmbH & Co. KG Niederlassung", 20), "Müller Großmann Gmb…");
  assert.equal(truncate("Müller Großmann GmbH", 20), "Müller Großmann GmbH");
  assert.equal(truncate("short", 20), "short");
  assert.equal(truncate("😀😀😀😀", 3), "😀😀…");
  assert.equal(truncate("abcdef", 4, "..."), "a...");
});

test("E11 safeFileName truncates before appending the extension", () => {
  const long = "Ä".repeat(300);
  const out = safeFileName(long, { ext: ".pdf" });
  assert.ok(out.endsWith(".pdf"));
  assert.ok(Buffer.byteLength(out, "utf8") <= 255, `byte length ${Buffer.byteLength(out, "utf8")}`);
  assert.ok(out.length > 4, "stem must not be empty");
});

test("E11 safeFileName: reserved Windows names get an underscore suffix", () => {
  assert.equal(safeFileName("CON", { ext: ".pdf" }), "CON_.pdf");
  assert.equal(safeFileName("prn", { ext: ".pdf" }), "prn_.pdf");
  assert.equal(safeFileName("COM1", { ext: ".pdf" }), "COM1_.pdf");
  assert.equal(safeFileName("lpt9", { ext: ".pdf" }), "lpt9_.pdf");
  assert.equal(safeFileName("CONTRACT", { ext: ".pdf" }), "CONTRACT.pdf");
});

test("E11 safeFileName keeps letters of any script, strips illegal characters and trailing dots", () => {
  assert.equal(safeFileName("Müller / Mayer-GmbH (2025)", { ext: ".pdf" }), "Müller Mayer-GmbH 2025.pdf");
  assert.equal(safeFileName("Signed_Document_EXAMPLE.pdf", { ext: ".pdf" }), "Signed_Document_EXAMPLE.pdf");
  assert.equal(safeFileName("Отчёт 2026...", { ext: ".pdf" }), "Отчёт 2026.pdf");
  assert.equal(safeFileName("", { ext: ".pdf" }), "Dokument.pdf");
  assert.equal(safeFileName("report"), "report");
});

test("E11 documentFileName falls back to 'Dokument' when documentType is missing", () => {
  assert.equal(documentFileName({ documentType: undefined, folderName: "MUELLER_GMBH__SRL-1042" }), "Dokument_MUELLER_GMBH__SRL-1042.pdf");
  assert.equal(documentFileName({ documentType: "Signed_Document", folderName: "ACME__1" }), "Signed_Document_ACME__1.pdf");
  assert.equal(documentFileName({ documentType: "  ", folderName: "" }), "Dokument.pdf");
});

test("safePath replaces characters illegal in Windows and SharePoint paths", () => {
  assert.equal(safePath("Müller / Mayer-GmbH (2025)"), "Müller - Mayer-GmbH (2025)");
  assert.equal(safePath('a:b*c?d"e<f>g|h\\i'), "a-b-c-d-e-f-g-h-i");
  assert.equal(safePath("trailing dots... "), "trailing dots");
  assert.equal(safePath(null), "");
});

test("cleanQuery drops file-type words and lower-cases", () => {
  assert.equal(cleanQuery("Find the PDF invoices from 2024"), "find the invoices from 2024");
  assert.equal(cleanQuery("Bilder vom Umzug"), "vom umzug");
  assert.equal(cleanQuery("Report", { stopWords: new Set(["report"]) }), "");
  assert.equal(cleanQuery("Report", { lowercase: false }), "Report");
});

test("cleanFolderQuery prepares a folder hint for Graph search", () => {
  assert.equal(cleanFolderQuery("Projects/2024\\'Q1'"), "Projects 2024 Q1");
  assert.equal(cleanFolderQuery('  "Kunden"  '), "Kunden");
});

test("parseAmountDe handles German and plain decimal notation", () => {
  assert.equal(parseAmountDe("1.234,56"), 1234.56);
  assert.equal(parseAmountDe("1234.56"), 1234.56);
  assert.equal(parseAmountDe("€ 1.234,56"), 1234.56);
  assert.equal(parseAmountDe("500"), 500);
  assert.equal(parseAmountDe("-12,5"), -12.5);
  assert.equal(parseAmountDe("1.234"), 1234);
  assert.equal(parseAmountDe("1,234.56"), 1234.56);
  assert.equal(parseAmountDe(""), 0);
  assert.equal(parseAmountDe(null), 0);
  assert.equal(parseAmountDe("n/a"), 0);
  assert.equal(parseAmountDe(42), 42);
});

test("E16 cleanAssistantReply only strips a filler that stands alone", () => {
  assert.equal(cleanAssistantReply("Surely the invoice is attached."), "Surely the invoice is attached.");
  assert.equal(cleanAssistantReply("Of course! Here"), "Here");
  assert.equal(cleanAssistantReply("Sure, here you go"), "here you go");
  assert.equal(cleanAssistantReply("This was automated with n8n."), "This was automated with n8n.");
  assert.equal(cleanAssistantReply("a\n\n\n\n\nb"), "a\n\nb");
  assert.equal(cleanAssistantReply(null), "");
});
