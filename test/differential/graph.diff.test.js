import { test } from "node:test";
import assert from "node:assert/strict";

import { createColumnMapper, splitBatches, sendMailPayload, createCrawlState, takeNextFolder, mergeChildren, rankFolders, filterFilesByType, formatFileResults, binaryFanOut } from "../../lib/graph/index.js";
import { skipReason, oldSource, requireOld, extractFunctions, createN8nContext, runCodeNode, nodeNamesOf } from "./old-loader.js";

const CONSENT = "consent-based-3d-scan-control-center-snippets/snippets/";
const SIGNED = "signed-document-delivery-automation-snippets/snippets/";
const DOCSEARCH = "document-search-assistant-snippets/snippets/";
const DISPATCH = "multi-region-dispatch-automation-snippets/snippets/";

test("differential graph: consent excel-column-mapper", { skip: skipReason }, () => {
  const ExcelMapper = /** @type {any} */ (extractFunctions(oldSource(CONSENT + "excel-column-mapper.js"), ["ExcelMapper"]).ExcelMapper);
  const config = { indexes: { caseNumber: 1, customerName: 8, envelopeId: 14, status: 15 }, totalColumns: 16 };
  const old = new ExcelMapper(config);
  const n = createColumnMapper(config);
  const rows = [
    { index: 3, values: [["", "CERT-0001", "", "", "", "", "", "", "Acme", "", "", "", "", "", "env-1", "pending"]] },
    { index: 4, values: [["", "CERT-0002", "", "", "", "", "", "", "Beta", "", "", "", "", "", "env-2", "done"]] },
  ];
  assert.equal(n.get(rows[0], "envelopeId"), old.get(rows[0], "envelopeId"));
  assert.deepEqual(n.getAll(rows[1]), old.getAll(rows[1]));
  assert.deepEqual(n.buildRow({ caseNumber: "CERT-0003", status: "x" }), old.buildRow({ caseNumber: "CERT-0003", status: "x" }));
  assert.deepEqual(n.findRow(rows, "envelopeId", "env-2"), old.findRow(rows, "envelopeId", "env-2"));
  assert.deepEqual(n.findRow(rows, "envelopeId", "none"), old.findRow(rows, "envelopeId", "none"));
  assert.deepEqual(n.filterRows(rows, "status", "done"), old.filterRows(rows, "status", "done"));
  assert.throws(() => old.get(rows[0], "nope"), /Unknown column/);
  assert.throws(() => n.get(rows[0], "nope"), /Unknown column/);
});

test("differential graph: signed attachment-batching-helper", { skip: skipReason }, () => {
  const old = requireOld(SIGNED + "attachment-batching-helper.js");
  const mb = 1024 * 1024;
  const files = [
    { safeName: "a.pdf", sizeMb: 2, base64Content: "A" },
    { safeName: "b.pdf", sizeMb: 1.4, base64Content: "B" },
    { safeName: "c.pdf", sizeMb: 0.2, base64Content: "C", contentType: "image/png" },
    { safeName: "d.pdf", sizeMb: 5, base64Content: "D" },
  ];
  const oldBatches = old.createAttachmentBatches(files, 3.5);
  const newBatches = splitBatches(
    files.map((f) => ({ name: f.safeName, sizeBytes: f.sizeMb * mb, contentBytes: f.base64Content, contentType: f.contentType })),
    { limitBytes: 3.5 * mb },
  );
  assert.deepEqual(newBatches, oldBatches);
  const options = { subjectPrefix: "Signed documents", bodyHtml: "<p>Hi</p>", toRecipients: ["ops@example.de"] };
  const oldMail = old.buildGraphEmailPayload(oldBatches[0], options);
  const newMail = sendMailPayload({ subject: `${options.subjectPrefix} ${newBatches[0].batchNumber}/${newBatches[0].totalBatches}`, bodyHtml: options.bodyHtml, to: options.toRecipients, attachments: newBatches[0].attachments });
  assert.deepEqual(newMail, oldMail);
});

test("differential graph: document-search recursive-crawl-queue", { skip: skipReason }, () => {
  const old = requireOld(DOCSEARCH + "recursive-crawl-queue.js");
  assert.deepEqual(createCrawlState("root"), old.createInitialCrawlState("root"));
  const children = [{ id: "f1", file: {} }, { id: "sub", folder: {} }];
  /** @type {any} */
  let oldState = old.takeNextFolder(old.createInitialCrawlState("root"));
  /** @type {any} */
  let newState = takeNextFolder(createCrawlState("root"));
  assert.deepEqual(newState, oldState);
  oldState = old.mergeChildrenIntoState(oldState, children);
  newState = mergeChildren(newState, children);
  assert.deepEqual(newState, oldState);
  assert.deepEqual(takeNextFolder(mergeChildren(takeNextFolder(newState), [])), old.takeNextFolder(old.mergeChildrenIntoState(old.takeNextFolder(oldState), [])));
  const capped = { pendingFolders: ["x"], collectedFiles: [], iterations: 50 };
  assert.deepEqual(takeNextFolder(capped), old.takeNextFolder(capped));
});

test("differential graph: document-search folder-ranker and file-result-formatter", { skip: skipReason }, () => {
  const ranker = requireOld(DOCSEARCH + "folder-ranker.js");
  const formatter = requireOld(DOCSEARCH + "file-result-formatter.js");
  const items = [
    { id: "1", name: "Projects", folder: {}, parentReference: { path: "/drive/root:/Kunden" } },
    { id: "2", name: "projects 2024", folder: {}, parentReference: { path: "/drive/root:/Archiv" } },
    { id: "3", name: "Report.PDF", file: {}, size: 5, webUrl: "u", lastModifiedDateTime: "t", parentReference: { driveId: "d", path: "/p" } },
    { id: "4", name: "photo.jpg", file: {}, size: 7 },
    { id: "5", name: "empty", size: 0 },
  ];
  for (const q of ["Projects", "projects, 2024", "", "Kunden/Archiv"]) {
    assert.deepEqual(rankFolders(items, q), ranker.rankFolderCandidates(items, q), q);
  }
  for (const type of ["pdf", "image", "excel", "", undefined, "MSG"]) {
    assert.deepEqual(filterFilesByType(items, type), formatter.filterFilesByType(items, type), String(type));
    assert.deepEqual(formatFileResults(items, type), formatter.formatFileResults(items, type), String(type));
  }
});

test("differential graph: dispatch binary-attachment-extractor", { skip: skipReason }, () => {
  const src = oldSource(DISPATCH + "binary-attachment-extractor.js");
  const [folderNode] = nodeNamesOf(src);
  const item = {
    json: { bookingId: "SRL-1", customerName: "Acme" },
    binary: {
      attachment_0: { fileName: "a.pdf", mimeType: "application/pdf", fileSize: "27.7 kB", data: "QUFB" },
      attachment_1: { fileName: "b.png", mimeType: "image/png", fileSize: 512, data: "QkJCQg==" },
    },
  };
  const old = runCodeNode(src, createN8nContext({ items: [item], nodes: { [folderNode]: { id: "F1" } } }));
  const n = binaryFanOut([item], { folderId: "F1", carry: ["bookingId", "customerName"] });
  assert.equal(n.length, old.length);
  for (let i = 0; i < n.length; i++) {
    assert.equal(n[i].json.attachmentName, old[i].json.attachmentName);
    assert.equal(n[i].json.mimeType, old[i].json.mimeType);
    assert.equal(n[i].json.folderId, old[i].json.folderId);
    assert.equal(n[i].json.bookingId, old[i].json.bookingId);
    assert.equal(n[i].json.customerName, old[i].json.customerName);
    assert.deepEqual(n[i].binary, old[i].binary);
  }
  // E12: old → new. Size: old measured the base64 payload (3 bytes for "QUFB"),
  // new reads n8n's fileSize (27.7 kB → 27700).
  assert.equal(old[0].json.fileSize, 3);
  assert.equal(n[0].json.fileSize, 27700);
  // E12: no attachments. Old → one marker item, new → [] (the marker is a node concern).
  const none = runCodeNode(src, createN8nContext({ items: [{ json: { bookingId: "SRL-2" } }], nodes: { [folderNode]: { id: "F1" } } }));
  assert.equal(none[0].json.attachmentName, null);
  assert.deepEqual(binaryFanOut([{ json: { bookingId: "SRL-2" } }]), []);
});
