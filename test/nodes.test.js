/**
 * nodes/ and dist/: every script runs in two layers, the ESM source
 * (`run(ctx)`) and the paste-ready dist file (through runCodeNode, like a
 * Code node would), and both must agree.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createN8nContext, runCodeNode } from "./helpers/n8n-context.js";
import { buildAll, NODE_NAMES, RETURN_LINE } from "../scripts/build-nodes.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");

const SCRIPTS = [
  "approval-gate",
  "batch-dedup",
  "binary-fan-out",
  "column-map",
  "docusign-envelope",
  "extraction-sanitize",
  "folder-path",
  "html-strip",
  "scheduled-summary",
  "slack-interaction",
];

/** @param {string} name */
async function sourceRun(name) {
  return (await import(`../nodes/${name}.js`)).run;
}

/** @param {string} name */
function distSource(name) {
  return readFileSync(join(DIST, `${name}.js`), "utf8");
}

const NOW = new Date("2026-05-11T06:00:00Z");
const UUID = "6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b";

/**
 * One fixture per script: the context options both layers are run with.
 * @type {Record<string, { items: any[], nodes?: Record<string, any>, env?: Record<string, string> }>}
 */
const FIXTURES = {
  "approval-gate": { items: [{ recipient: "max@example.de", subject: "Re", body: "Hi", gateKind: "email" }] },
  "batch-dedup": {
    items: [
      { projectManagerEmail: "a@example.de", projectManagerName: "A", bookingId: "1" },
      { projectManagerEmail: "b@example.de", projectManagerName: "B", bookingId: "2" },
      { projectManagerEmail: "a@example.de", projectManagerName: "A", bookingId: "3" },
      { projectManagerEmail: "c@example.de", projectManagerName: "C", bookingId: "4" },
      { projectManagerEmail: "b@example.de", projectManagerName: "B", bookingId: "5" },
    ],
  },
  "binary-fan-out": {
    items: [
      {
        json: { bookingId: "SRL-1", customerName: "Acme", folderId: "F1" },
        binary: {
          a: { fileName: "a.pdf", mimeType: "application/pdf", fileSize: "27.7 kB", data: "QUFB" },
          b: { fileName: "b.png", mimeType: "image/png", fileSize: 512, data: "QkJC" },
        },
      },
    ],
  },
  "column-map": {
    items: [
      {
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
        _rowIndex: 7,
      },
    ],
  },
  "docusign-envelope": { items: [{ subject: "Completed: Example", body: { content: `<a href="https://x.example/?a=1&amp;m=${UUID}">Review</a>` } }] },
  "extraction-sanitize": { items: [{ output: { customerName: " Max\u200B ", customerEmail: "Max@Example.DE", customerPhone: "089 1234567", appointmentDate: "11.05.2026" } }] },
  "folder-path": { items: [{ customerName: "Müller / Mayer", bookingId: "SRL-1", serviceType: "Umzug", documentType: "Signed" }] },
  "html-strip": { items: [{ body: { contentType: "html", content: "<p>Hallo &amp; Grüße</p>" } }, { body: "<b>plain</b>" }, { body: { content: "x" } }] },
  "scheduled-summary": {
    items: [
      { source: "actions", ActionType: "REMINDER_SMS", SentAt: "11.05.2026" },
      { source: "tracking", AppointmentDate: "12.05.2026", Status: "pending", SentAt: "11.05.2026" },
    ],
  },
  "slack-interaction": {
    items: [{ body: { payload: JSON.stringify({ type: "block_actions", user: { id: "U0001" }, actions: [{ action_id: "search_region_a" }] }) }, regionMap: { region_a: "Region A" } }],
    env: { SLACK_ALLOWED_USER_IDS: "U0001, U0002" },
  },
};

test("the ten scripts exist in nodes/ and dist/", () => {
  assert.deepEqual(NODE_NAMES, SCRIPTS);
  assert.deepEqual(readdirSync(DIST).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3)).sort(), SCRIPTS);
});

test("E6 html-strip: a body object without .content throws a clear error", async () => {
  const run = await sourceRun("html-strip");
  assert.throws(() => run(createN8nContext({ items: [{ body: { contentType: "html" } }] })), (/** @type {any} */ err) => {
    assert.match(err.message, /body\.content missing/);
    assert.equal(err.message.includes("[object Object]"), false);
    return true;
  });
  assert.throws(() => run(createN8nContext({ items: [{ subject: "no body" }] })), /body missing/);
});

test("E7 html-strip processes every item, count in equals count out", async () => {
  const run = await sourceRun("html-strip");
  const out = run(createN8nContext(FIXTURES["html-strip"]));
  assert.equal(out.length, 3);
  assert.equal(out[0].json.cleanedBody, "Hallo & Grüße");
  assert.equal(out[1].json.cleanedBody, "plain");
  assert.equal(out[2].json.cleanedBody, "x");
  assert.equal(out[0].json.body.content, "<p>Hallo &amp; Grüße</p>", "input fields are kept");
});

test("E8 batch-dedup: dist has exactly one top-level return; first occurrence per key is kept", async () => {
  const dist = distSource("batch-dedup");
  assert.equal((dist.match(/^return\b/gm) ?? []).length, 1);
  const run = await sourceRun("batch-dedup");
  const out = run(createN8nContext(FIXTURES["batch-dedup"]));
  assert.deepEqual(out.map((/** @type {any} */ i) => i.json.bookingId), ["1", "2", "4"]);
  assert.equal(out[0].json._dedupKey, "a@example.de_A");
  const custom = run(createN8nContext({ items: [{ _dedupKey: "k", n: 1 }, { _dedupKey: "k", n: 2 }, { _dedupKey: "j", n: 3 }] }));
  assert.deepEqual(custom.map((/** @type {any} */ i) => i.json.n), [1, 3]);
  assert.deepEqual(run(createN8nContext({ items: [] })), []);
});

test("E11 folder-path: safe folder and file names; missing documentType reads Dokument", async () => {
  const run = await sourceRun("folder-path");
  const [out] = run(createN8nContext(FIXTURES["folder-path"]));
  assert.equal(out.json.subFolder, "Moving");
  assert.equal(out.json.folderName, "Müller - Mayer__SRL-1");
  assert.equal(out.json.fileName, "Signed_Müller - Mayer__SRL-1.pdf");
  assert.equal(out.json.fullPath, "Moving/Müller - Mayer__SRL-1/Signed_Müller - Mayer__SRL-1.pdf");
  const [noType] = run(createN8nContext({ items: [{ customerName: "Acme", bookingId: "7" }] }));
  assert.equal(noType.json.fileName, "Dokument_Acme__7.pdf");
  assert.equal(noType.json.subFolder, "Other");
  const [empty] = run(createN8nContext({ items: [{}] }));
  assert.equal(empty.json.folderName, "Unknown_Customer__no-id");
});

test("E12 binary-fan-out: empty input gives []; one item per binary", async () => {
  const run = await sourceRun("binary-fan-out");
  assert.deepEqual(run(createN8nContext({ items: [] })), []);
  assert.deepEqual(run(createN8nContext({ items: [{ bookingId: "x" }] })), []);
  const out = run(createN8nContext(FIXTURES["binary-fan-out"]));
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].json, { attachmentName: "a.pdf", mimeType: "application/pdf", fileSize: 27700, folderId: "F1", bookingId: "SRL-1", customerName: "Acme" });
  assert.equal(out[1].json.attachmentName, "b.png");
});

const COLUMN_MAP_KEYS = [
  "bookingId",
  "customerName",
  "customerAddress",
  "customerPhone",
  "customerEmail",
  "projectManager",
  "projectManagerEmail",
  "company",
  "appointmentDate",
  "appointmentTime",
  "rowIndex",
];

test("E13 column-map: empty upstream gives []; exact camelCase key set; German and English headers", async () => {
  const run = await sourceRun("column-map");
  assert.deepEqual(run(createN8nContext({ items: [] })), []);
  const [out] = run(createN8nContext(FIXTURES["column-map"]));
  assert.deepEqual(Object.keys(out.json).sort(), [...COLUMN_MAP_KEYS].sort());
  assert.deepEqual(out.json, {
    bookingId: "SRL-1",
    customerName: "Max Muster",
    customerAddress: "Str. 1, 80331 München",
    customerPhone: "089 1",
    customerEmail: "a@b.de",
    projectManager: "PM",
    projectManagerEmail: "pm@b.de",
    company: "Firma",
    appointmentDate: "11.05.2026",
    appointmentTime: "14:30",
    rowIndex: 7,
  });
  const [english] = run(createN8nContext({ items: [{ BookingID: "9", CustomerName: "Eva", Company: "Beta" }] }));
  assert.equal(english.json.customerName, "Eva");
  assert.equal(english.json.company, "Beta");
  assert.equal(english.json.rowIndex, 0);
  assert.throws(() => run(createN8nContext({ items: [{ KundenName: "no id" }] })), /missing BookingID/);
  const header = readFileSync(join(ROOT, "nodes", "column-map.js"), "utf8").split("*/")[0];
  for (const key of COLUMN_MAP_KEYS) assert.ok(header.includes(key), `header lists ${key}`);
});

test("E10 scheduled-summary: a summary item even at zero input, with an injected now", async () => {
  const run = await sourceRun("scheduled-summary");
  const [empty] = run({ ...createN8nContext({ items: [], env: {} }), now: NOW });
  assert.deepEqual(empty.json.counts, { today: 0, tomorrow: 0, overdue: 0 });
  assert.equal(empty.json.date, "2026-05-11");
  assert.match(empty.json.message, /^📊 \*Daily Summary, 11\.05\.2026\*/);
  const [withRows] = run({ ...createN8nContext(FIXTURES["scheduled-summary"]), now: NOW });
  assert.deepEqual(withRows.json.counts, { today: 1, tomorrow: 1, overdue: 0 });
  const [other] = run({ ...createN8nContext({ items: [], env: { SUMMARY_TIME_ZONE: "Pacific/Kiritimati" } }), now: new Date("2026-05-11T22:30:00Z") });
  assert.equal(other.json.date, "2026-05-12");
  assert.throws(() => run(createN8nContext({ items: [] })), /now/);
});

test("extraction-sanitize: cleans the first item and reports issues", async () => {
  const run = await sourceRun("extraction-sanitize");
  const [out] = run(createN8nContext(FIXTURES["extraction-sanitize"]));
  assert.equal(out.json.customerName, "Max");
  assert.equal(out.json.customerEmail, "max@example.de");
  assert.equal(out.json.customerPhone, "+49891234567");
  assert.equal(out.json.appointmentDate, "2026-05-11");
  assert.deepEqual(out.json._issues, []);
  const [bad] = run(createN8nContext({ items: [{ customerEmail: "nope" }] }));
  assert.deepEqual(bad.json._issues, [{ field: "customerEmail", kind: "email", value: "nope" }]);
});

test("docusign-envelope: envelope ID per mail item, throws when none is found", async () => {
  const run = await sourceRun("docusign-envelope");
  const [out] = run(createN8nContext(FIXTURES["docusign-envelope"]));
  assert.deepEqual(out.json, { envelopeId: UUID, source: "query-m", sourceSubject: "Completed: Example" });
  assert.throws(() => run(createN8nContext({ items: [{ subject: "Nothing", body: "no id here" }] })), /no envelope ID.*Nothing/);
});

test("slack-interaction: allow-list from $env or the item, never a literal", async () => {
  const run = await sourceRun("slack-interaction");
  const [out] = run(createN8nContext(FIXTURES["slack-interaction"]));
  assert.equal(out.json.type, "block_actions");
  assert.equal(out.json.allowed, true);
  assert.equal(out.json.region, "Region A");
  const fromItem = run(createN8nContext({ items: [{ body: FIXTURES["slack-interaction"].items[0].body, allowedUserIds: ["U0009"] }] }));
  assert.equal(fromItem[0].json.allowed, false);
  assert.throws(() => run(createN8nContext({ items: [{ body: FIXTURES["slack-interaction"].items[0].body }] })), /allow-list/);
  const admin = run(createN8nContext({ items: [{ body: FIXTURES["slack-interaction"].items[0].body }], env: { SLACK_ALLOWED_USER_IDS: "", SLACK_SUPER_ADMIN_IDS: "U0001" } }));
  assert.equal(admin[0].json.role, "super_admin");
  const src = readFileSync(join(ROOT, "nodes", "slack-interaction.js"), "utf8");
  assert.equal(/allowList:\s*\[\s*"/.test(src), false, "no literal allow-list in the source");
});

test("approval-gate: builds a preview, holds, and releases an approved state", async () => {
  const run = await sourceRun("approval-gate");
  const [held] = run(createN8nContext(FIXTURES["approval-gate"]));
  assert.equal(held.json.action, "hold_draft");
  assert.equal(held.json.preview.type, "reply_preview");
  assert.equal(held.json.preview.status, "awaiting_approval");
  const [sent] = run(createN8nContext({ items: [{ ...held.json.preview, status: "approved", gateKind: "email" }] }));
  assert.equal(sent.json.action, "send_reply");
  const [slack] = run(createN8nContext({ items: [{ recipient: "x", subject: "s", body: "b" }] }));
  assert.equal(slack.json.action, "show_preview");
  assert.equal(slack.json.preview.type, "email_preview");
});

test("B1 build is idempotent and dist/ matches the sources", async () => {
  const dir = mkdtempSync(join(tmpdir(), "n8n-patterns-build-"));
  try {
    const first = await buildAll(dir);
    const second = await buildAll(dir);
    assert.deepEqual(second, first);
    for (const name of SCRIPTS) assert.equal(distSource(name), first[name], `dist/${name}.js is in sync`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("B1 every dist file is a self-contained Code-node body", () => {
  for (const name of SCRIPTS) {
    const text = distSource(name);
    const header = /^\/\*\*[\s\S]*?\*\//.exec(text)?.[0] ?? "";
    assert.ok(header, `${name}: header present`);
    assert.match(header.split("\n")[1] ?? "", /^\s\*\s+Run mode:/, `${name}: run mode is the first header line`);
    assert.equal(/^\s*import\s/m.test(text), false, `${name}: no import`);
    const requires = [...text.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
    const builtins = requires.filter((m) => /^(node:)?(crypto|buffer|util)$/.test(m));
    assert.deepEqual(requires, builtins, `${name}: only node built-ins may be required`);
    assert.equal((text.match(/^return\b/gm) ?? []).length, 1, `${name}: exactly one top-level return`);
    assert.ok(text.trimEnd().endsWith(RETURN_LINE), `${name}: ends with the run line`);
  }
});

test("B1 source run() and dist agree on every fixture", async () => {
  for (const name of SCRIPTS) {
    const run = await sourceRun(name);
    const now = new Date();
    const fromSource = run({ ...createN8nContext(FIXTURES[name]), now });
    const fromDist = runCodeNode(distSource(name), createN8nContext(FIXTURES[name]));
    assert.deepEqual(fromDist, fromSource, name);
  }
});

test("B2 nodes/ and dist/ never read another node by name", () => {
  const files = [...SCRIPTS.map((n) => join(ROOT, "nodes", `${n}.js`)), ...SCRIPTS.map((n) => join(DIST, `${n}.js`))];
  for (const file of files) {
    assert.equal(/\$\(\s*["']/.test(readFileSync(file, "utf8")), false, `${file} contains a $("...") read`);
  }
});
