import { test } from "node:test";
import assert from "node:assert/strict";

import { createN8nContext, runCodeNode, skipReason, oldSource, nodeNamesOf } from "./old-loader.js";

const DISPATCH = "multi-region-dispatch-automation-snippets/snippets/";

/** @param {string} s */
const squash = (s) => s.replace(/\s+/g, " ").trim();

test("differential nodes: html-strip against email-html-stripper (text content)", { skip: skipReason }, async () => {
  const { run } = await import("../../nodes/html-strip.js");
  const html = "<html><body><p>Sehr geehrte Damen &amp; Herren,</p><table><tr><td>Termin:&nbsp;11.05.2026</td></tr></table></body></html>";
  const [old] = runCodeNode(oldSource(DISPATCH + "email-html-stripper.js"), createN8nContext({ items: [{ body: { content: html } }] }));
  const [n] = run(createN8nContext({ items: [{ body: { content: html } }] }));
  assert.equal(squash(n.json.cleanedBody), squash(old.json.cleanedBody));
  // E6/E7: the old node read only the first item and crashed with
  // "[object Object]"-style errors on a body without content; the new one
  // handles every item and names the missing field.
  const twoItems = createN8nContext({ items: [{ body: { content: "<p>a</p>" } }, { body: { content: "<p>b</p>" } }] });
  assert.equal(runCodeNode(oldSource(DISPATCH + "email-html-stripper.js"), twoItems).length, 1);
  assert.equal(run(twoItems).length, 2);
});

test("differential nodes: column-map against data-shape-transformer", { skip: skipReason }, async () => {
  const { run } = await import("../../nodes/column-map.js");
  const src = oldSource(DISPATCH + "data-shape-transformer.js");
  const row = {
    BookingID: " SRL-1 ",
    KundenName: "<b>Max</b>\n Muster",
    KundenAdresse: "Str. 1,\r\n80331 München",
    KundenTelefon: "089 1",
    KundenEmail: "a@b.de",
    ProjektleiterName: "PM",
    ProjektleiterEmail: "pm@b.de",
    ProjektleiterFirma: "Firma",
    Datum: "11.05.2026",
    Uhrzeit: "14:30",
    _rowIndex: 3,
  };
  const [old] = runCodeNode(src, createN8nContext({ items: [row], nodes: {} }));
  const [n] = run(createN8nContext({ items: [row] }));
  assert.deepEqual(n.json, old.json);
  // E13 (recorded): with no input the old node re-read every row from an
  // upstream node by name; the new node returns [].
  const [fallbackNode] = nodeNamesOf(src);
  assert.equal(typeof fallbackNode, "string");
  assert.deepEqual(run(createN8nContext({ items: [] })), []);
});

test("differential nodes: folder-path against folder-path-sanitizer", { skip: skipReason }, async () => {
  const { run } = await import("../../nodes/folder-path.js");
  const src = oldSource(DISPATCH + "folder-path-sanitizer.js");
  for (const row of [
    { customerName: "Müller / Mayer-GmbH (2025)", bookingId: "SRL-1042", serviceType: "Umzug + Montage", documentType: "Signed_Document" },
    { customerName: "Acme", bookingId: "7", serviceType: "Reinigung", documentType: "Vertrag" },
    { serviceType: "" , documentType: "Doc" },
  ]) {
    const old = runCodeNode(src, createN8nContext({ items: [row] }));
    const [n] = run(createN8nContext({ items: [row] }));
    for (const key of ["folderName", "fileName", "fullPath", "subFolder"]) assert.equal(n.json[key], old.json[key], `${key} for ${JSON.stringify(row)}`);
  }
  // E11 (recorded): old "undefined_…" when documentType is missing, new "Dokument_…".
  const missing = { customerName: "Acme", bookingId: "7" };
  assert.equal(runCodeNode(src, createN8nContext({ items: [missing] })).json.fileName, "undefined_Acme__7.pdf");
  assert.equal(run(createN8nContext({ items: [missing] }))[0].json.fileName, "Dokument_Acme__7.pdf");
});
