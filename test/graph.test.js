import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createColumnMapper,
  columnMapperFromHeader,
  safeGet,
  sendMailPayload,
  splitBatches,
  createCrawlState,
  takeNextFolder,
  mergeChildren,
  DEFAULT_MAX_ITERATIONS,
  rankFolders,
  FILE_TYPE_GROUPS,
  filterFilesByType,
  formatFileResults,
  binaryFanOut,
} from "../lib/graph/index.js";

const graphRow = { index: 4, values: [["CERT-0001", "Acme", "6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b", "pending"]] };
const INDEXES = { caseNumber: 0, customerName: 1, envelopeId: 2, status: 3 };

test("columnMapper reads named columns from Graph rows and plain arrays", () => {
  const mapper = createColumnMapper({ indexes: INDEXES, totalColumns: 4 });
  assert.equal(mapper.get(graphRow, "envelopeId"), "6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b");
  assert.equal(mapper.get(["x", "y", "z", "w"], "status"), "w");
  assert.throws(() => mapper.get(graphRow, "colour"), /Unknown column "colour".*caseNumber/);
  assert.throws(() => mapper.get({}, "status"), /Invalid Excel row/);
});

test("columnMapper getAll, buildRow, findRow, filterRows", () => {
  const mapper = createColumnMapper({ indexes: INDEXES, totalColumns: 6 });
  assert.deepEqual(mapper.getAll(graphRow), {
    _rowIndex: 4,
    caseNumber: "CERT-0001",
    customerName: "Acme",
    envelopeId: "6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b",
    status: "pending",
  });
  assert.deepEqual(mapper.buildRow({ caseNumber: "CERT-0002", status: "done", ignored: 1 }), ["CERT-0002", "", "", "done", "", ""]);
  const rows = [graphRow, { index: 5, values: [["CERT-0002", "Beta", "", "done"]] }];
  assert.equal(mapper.findRow(rows, "status", "done")?.index, 5);
  assert.equal(mapper.findRow(rows, "status", "nope"), null);
  assert.equal(mapper.filterRows(rows, "status", "pending").length, 1);
  assert.equal(createColumnMapper({ indexes: INDEXES }).buildRow({}).length, 4);
});

test("N2 columnMapperFromHeader resolves aliases, tolerates renames, reports missing columns", () => {
  const aliases = { caseNumber: ["Case No", "Case Number"], customerName: ["Customer"], envelopeId: ["Envelope ID", "DocuSign Envelope"] };
  const a = columnMapperFromHeader(["Case No", "Customer", "Envelope ID"], aliases);
  assert.deepEqual(a.indexes, { caseNumber: 0, customerName: 1, envelopeId: 2 });
  const b = columnMapperFromHeader([" docusign envelope ", "Case Number", "Customer"], aliases);
  assert.deepEqual(b.indexes, { caseNumber: 1, customerName: 2, envelopeId: 0 });
  assert.equal(b.totalColumns, 3);
  assert.throws(() => columnMapperFromHeader(["Customer"], aliases), /missing columns: caseNumber, envelopeId/);
});

test("N2 safeGet treats the empty string as missing", () => {
  assert.equal(safeGet(""), undefined);
  assert.equal(safeGet(null), undefined);
  assert.equal(safeGet(undefined), undefined);
  assert.equal(safeGet("x"), "x");
  assert.equal(safeGet(0), 0);
  assert.equal(safeGet({ Datum: "", AppointmentDate: "2026-05-11" }, ["Datum", "AppointmentDate"]), "2026-05-11");
  assert.equal(safeGet({ Datum: "  " }, ["Datum"]), undefined);
  assert.equal(safeGet({}, ["a"], "fallback"), "fallback");
  assert.equal(safeGet({ a: "v" }, "a"), "v");
});

test("sendMailPayload builds a Microsoft Graph sendMail body", () => {
  const out = sendMailPayload({
    subject: "Weekly delivery 1/2",
    bodyHtml: "<p>Hi</p>",
    to: ["ops@example.de", "lead@example.de"],
    attachments: [{ name: "a.pdf", contentType: "application/pdf", contentBytes: "AAAA" }],
  });
  assert.deepEqual(out, {
    message: {
      subject: "Weekly delivery 1/2",
      body: { contentType: "HTML", content: "<p>Hi</p>" },
      toRecipients: [{ emailAddress: { address: "ops@example.de" } }, { emailAddress: { address: "lead@example.de" } }],
      attachments: [{ "@odata.type": "#microsoft.graph.fileAttachment", name: "a.pdf", contentType: "application/pdf", contentBytes: "AAAA" }],
    },
    saveToSentItems: true,
  });
  const text = sendMailPayload({ subject: "s", bodyText: "plain", to: "one@example.de", from: "me@example.de", cc: ["cc@example.de"], saveToSentItems: false });
  assert.equal(text.message.body.contentType, "Text");
  assert.deepEqual(text.message.from, { emailAddress: { address: "me@example.de" } });
  assert.deepEqual(text.message.ccRecipients, [{ emailAddress: { address: "cc@example.de" } }]);
  assert.equal(text.message.attachments, undefined);
  assert.equal(text.saveToSentItems, false);
  assert.throws(() => sendMailPayload({ subject: "s", bodyText: "x", to: [] }), /recipient/);
});

test("splitBatches packs attachments under a byte limit, in order", () => {
  const mb = 1024 * 1024;
  const files = [
    { name: "a.pdf", sizeBytes: 2 * mb, contentBytes: "A" },
    { name: "b.pdf", sizeBytes: 1.4 * mb, contentBytes: "B" },
    { name: "c.pdf", sizeBytes: 0.2 * mb, contentBytes: "C" },
    { name: "d.pdf", sizeBytes: 5 * mb, contentBytes: "D" },
    { name: "e.pdf", sizeBytes: 0.1 * mb, contentBytes: "E" },
  ];
  const batches = splitBatches(files, { limitBytes: 3.5 * mb });
  assert.deepEqual(batches.map((b) => b.attachments.map((a) => a.name)), [["a.pdf", "b.pdf"], ["c.pdf"], ["d.pdf"], ["e.pdf"]]);
  assert.deepEqual(batches.map((b) => [b.batchNumber, b.totalBatches, b.attachmentCount]), [[1, 4, 2], [2, 4, 1], [3, 4, 1], [4, 4, 1]]);
  assert.deepEqual(batches[0].attachments[0], { name: "a.pdf", contentType: "application/pdf", contentBytes: "A" });
  assert.deepEqual(splitBatches([], { limitBytes: mb }), []);
  assert.throws(() => splitBatches(files, /** @type {any} */ ({})), /limitBytes/);
});

test("crawl queue: bounded breadth-first traversal", () => {
  let state = createCrawlState("root");
  assert.deepEqual(state, { pendingFolders: ["root"], collectedFiles: [], iterations: 0 });
  let step = takeNextFolder(state);
  assert.equal(step.done, false);
  assert.equal(step.currentFolderId, "root");
  state = mergeChildren(step, [{ id: "f1", file: {} }, { id: "sub", folder: {} }]);
  assert.deepEqual(state.pendingFolders, ["sub"]);
  assert.equal(state.collectedFiles.length, 1);
  step = takeNextFolder(state);
  assert.equal(step.currentFolderId, "sub");
  const finished = takeNextFolder(mergeChildren(step, []));
  assert.deepEqual(finished, { done: true, collectedFiles: [{ id: "f1", file: {} }], hitLimit: false, iterationsUsed: 2 });
  const capped = takeNextFolder({ pendingFolders: ["x"], collectedFiles: [], iterations: 3 }, { maxIterations: 3 });
  assert.equal(capped.done, true);
  assert.equal(capped.hitLimit, true);
  assert.equal(DEFAULT_MAX_ITERATIONS, 50);
});

test("rankFolders scores exact name, full path, and term hits", () => {
  const items = [
    { id: "1", name: "Projects", folder: {}, parentReference: { path: "/drive/root:/Kunden" } },
    { id: "2", name: "projects 2024", folder: {}, parentReference: { path: "/drive/root:/Archiv" } },
    { id: "3", name: "file.txt", file: {}, size: 10 },
    { id: "4", name: "Other", folder: {}, parentReference: { path: "/drive/root:/projects" } },
  ];
  const ranked = rankFolders(items, "Projects");
  // "1": exact name 20 + path contains 10 + term in name 4; "2": path 10 + term 4; "4": path 10 + term in path 1
  assert.deepEqual(ranked.map((r) => [r.id, r.score]), [["1", 34], ["2", 14], ["4", 11]]);
  assert.deepEqual(rankFolders([], "x"), []);
});

test("filterFilesByType and formatFileResults", () => {
  const items = [
    { id: "a", name: "Report.PDF", file: {}, size: 5, webUrl: "u1", lastModifiedDateTime: "t", parentReference: { driveId: "d", path: "/p" } },
    { id: "b", name: "photo.jpg", file: {}, size: 7 },
    { id: "c", name: "folder", folder: {} },
  ];
  assert.equal(FILE_TYPE_GROUPS.image.includes("heic"), true);
  assert.deepEqual(filterFilesByType(items, "pdf").map((i) => i.id), ["a"]);
  assert.deepEqual(filterFilesByType(items, "").map((i) => i.id), ["a", "b"]);
  assert.deepEqual(formatFileResults(items, "pdf"), {
    totalResults: 1,
    files: [{ name: "Report.PDF", itemId: "a", driveId: "d", webUrl: "u1", size: 5, lastModifiedDateTime: "t", parentPath: "/p" }],
    message: "Found 1 matching file.",
  });
  assert.equal(formatFileResults(items, "excel").message, "No excel files found.");
  assert.equal(formatFileResults(items, "").message, "Found 2 matching files.");
});

test("E12 binaryFanOut: empty input gives an empty output", () => {
  assert.deepEqual(binaryFanOut([]), []);
  assert.deepEqual(binaryFanOut([{ json: { bookingId: "1" } }]), []);
});

test("E12 binaryFanOut: one item per binary, size from fileSize", () => {
  const items = [
    {
      json: { bookingId: "SRL-1", customerName: "Acme", folderId: "F1" },
      binary: {
        attachment_0: { fileName: "a.pdf", mimeType: "application/pdf", fileSize: "27.7 kB", data: "QUFB" },
        attachment_1: { fileName: "b.png", mimeType: "image/png", fileSize: 512, data: "QkJCQg==" },
      },
    },
  ];
  const out = binaryFanOut(items, { carry: ["bookingId", "customerName"], folderId: "F1" });
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].json, { attachmentName: "a.pdf", mimeType: "application/pdf", fileSize: 27700, folderId: "F1", bookingId: "SRL-1", customerName: "Acme" });
  assert.deepEqual(out[0].binary, { data: items[0].binary.attachment_0 });
  assert.equal(out[1].json.fileSize, 512);
  assert.equal(out[1].json.attachmentName, "b.png");
  const noSize = binaryFanOut([{ json: {}, binary: { x: { data: "QUFBQUFBQUFBQUFB" } } }]);
  assert.equal(noSize[0].json.fileSize, null, "size is not derived from the base64 payload");
  assert.equal(noSize[0].json.attachmentName, "x");
});
