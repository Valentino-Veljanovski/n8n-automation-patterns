import { test } from "node:test";
import assert from "node:assert/strict";

import { parseInteraction, threadContext, normalizeMessage, routeCommand, checkUploadSize, blockkit, buildHomeTab, findUserBySlackId, HOME_TAB_USER_COLUMNS } from "../../lib/slack/index.js";
import { columnMapperFromHeader } from "../../lib/graph/index.js";
import { skipReason, oldSource, requireOld, createN8nContext, runCodeNode, nodeNamesOf } from "./old-loader.js";

const RECLAMATION = "internal-reclamation-case-management-snippets/snippets/";
const CONSENT = "consent-based-3d-scan-control-center-snippets/snippets/";
const ASSISTANT = "slack-multilingual-executive-assistant-snippets/snippets/";
const DOCSEARCH = "document-search-assistant-snippets/snippets/";

// The old parsers hard-coded three placeholder IDs; they are rebuilt here so
// the literal never appears in this repository.
const OLD_IDS = ["A", "B", "C"].map((c) => "U_" + c.repeat(10));
const REGION_MAP = { region_a: "Region A", region_b: "Region B", region_c: "Region C", region_d: "Region D", region_e: "Region E" };

test("differential slack: reclamation slack-payload-parser", { skip: skipReason }, () => {
  const src = oldSource(RECLAMATION + "slack-payload-parser.js");
  const cases = [
    { type: "block_actions", user: { id: OLD_IDS[0] }, trigger_id: "T1", channel: { id: "C1" }, actions: [{ action_id: "new_region_a", value: "x" }], view: {} },
    { type: "block_actions", user: { id: OLD_IDS[1] }, actions: [{ action_id: "report_all" }] },
    { type: "block_actions", user: { id: OLD_IDS[1] }, actions: [{ action_id: "email_send_confirm" }] },
    {
      type: "view_submission",
      user: { id: OLD_IDS[2] },
      trigger_id: "T2",
      view: { callback_id: "search_submit", private_metadata: JSON.stringify({ region: "Region B", action: "search", userId: OLD_IDS[2] }), state: { values: { search_term: { v: { value: "Acme" } } } }, root_view_id: "V1" },
    },
  ];
  for (const payload of cases) {
    const [old] = runCodeNode(src, createN8nContext({ items: [{ body: { payload: JSON.stringify(payload) } }] }));
    const n = parseInteraction({ payload: JSON.stringify(payload) }, { allowList: new Set(OLD_IDS), regionMap: REGION_MAP, actionPrefixes: { email_send_confirm: "emailsend", email_draft_change: "emailchange" } });
    assert.equal(n.allowed, true);
    assert.equal(n.type, old.json.type, "type");
    assert.equal(n.actionPrefix, old.json.actionPrefix, "actionPrefix for " + payload.actions?.[0]?.action_id);
    assert.equal(n.region, old.json.region, "region");
    assert.equal(n.actionId, old.json.actionId);
    assert.equal(n.actionValue, old.json.actionValue);
    assert.equal(n.channelId, old.json.channelId);
    assert.equal(n.triggerId, old.json.triggerId);
    assert.equal(n.userId, old.json.userId);
    assert.equal(n.callbackId, old.json.callbackId);
    assert.deepEqual(n.viewState, old.json.viewState);
    assert.equal(n.rootViewId, old.json.rootViewId);
    assert.deepEqual(n.privateMetadata, old.json.rawMeta);
  }
  // Blocked user: old → { blocked: true, userId }, new → allowed: false with the payload still parsed.
  const stranger = { type: "block_actions", user: { id: "U_STRANGER" }, actions: [{ action_id: "new_region_a" }] };
  const [oldBlocked] = runCodeNode(src, createN8nContext({ items: [{ body: { payload: JSON.stringify(stranger) } }] }));
  assert.deepEqual(oldBlocked.json, { blocked: true, userId: "U_STRANGER" });
  const newBlocked = parseInteraction({ payload: JSON.stringify(stranger) }, { allowList: new Set(OLD_IDS), regionMap: REGION_MAP });
  assert.equal(newBlocked.allowed, false);
  assert.equal(newBlocked.actionPrefix, "new");
});

test("differential slack: consent slack-authorization-extractor (four event shapes)", { skip: skipReason }, () => {
  const src = oldSource(CONSENT + "slack-authorization-extractor.js");
  const [entryNode] = nodeNamesOf(src);
  const shapes = [
    { payload: JSON.stringify({ type: "block_actions", user: { id: "U1", username: "max", real_name: "Max" }, trigger_id: "T1", channel: { id: "C1" }, actions: [{ action_id: "delete_case" }] }) },
    { payload: JSON.stringify({ type: "view_submission", user: { id: "U2", name: "eva" }, trigger_id: "T2", view: { callback_id: "x", state: { values: {} } } }) },
    { event: { type: "app_home_opened", user: "U3", channel: "D1" } },
    { command: "/cases", text: "open", user_id: "U4", user_name: "tom", channel_id: "C4", trigger_id: "T4" },
    { payload: JSON.stringify({ type: "view_closed", user: { id: "U5" } }) },
  ];
  for (const body of shapes) {
    const [old] = runCodeNode(src, createN8nContext({ nodes: { [entryNode]: { body, headers: {} } } }));
    const n = parseInteraction(body, { allowList: new Set(), superAdmins: OLD_IDS });
    assert.equal(n.userId, old.json.userId);
    assert.equal(n.userName || "Unknown", old.json.slackUserName);
    assert.equal(n.triggerType, old.json.triggerType, JSON.stringify(body).slice(0, 40));
    assert.equal(n.requiredPermission, old.json.requiredPermission);
    assert.equal(n.channelId, old.json.channelId);
    if (n.type === "slash_command") {
      // Deviation (recorded): the old extractor dropped trigger_id for slash
      // commands, although a modal cannot be opened without it.
      assert.equal(old.json.triggerId, "");
      assert.equal(n.triggerId, "T4");
    } else {
      assert.equal(n.triggerId, old.json.triggerId);
    }
    assert.equal(old.json.authorized, null);
    assert.equal(n.allowed, false);
  }
  // Super admin shortcut: old → authorized true / role super_admin; new → allowed true / role super_admin.
  const admin = { payload: JSON.stringify({ type: "block_actions", user: { id: OLD_IDS[0] }, actions: [] }) };
  const [oldAdmin] = runCodeNode(src, createN8nContext({ nodes: { [entryNode]: { body: admin, headers: {} } } }));
  assert.equal(oldAdmin.json.authorized, true);
  assert.equal(oldAdmin.json.role, "super_admin");
  const newAdmin = parseInteraction(admin, { allowList: new Set(), superAdmins: OLD_IDS });
  assert.equal(newAdmin.allowed, true);
  assert.equal(newAdmin.role, "super_admin");
});

test("differential slack: reclamation slack-thread-context-extractor", { skip: skipReason }, () => {
  const src = oldSource(RECLAMATION + "slack-thread-context-extractor.js");
  const [historyNode, currentNode] = nodeNamesOf(src);
  const threads = [
    [
      { ts: "1", bot_id: "B", blocks: [{ type: "context", elements: [{ text: 'case data: {"id":"7","region":"Region A"}' }] }] },
      { ts: "2", text: "please draft <@U1> an email" },
      { ts: "3", bot_id: "B", text: "Draft" },
    ],
    [{ ts: "1", text: 'New {"id":"8","region":"Region B"}' }, { ts: "2", text: "ok" }],
    [{ ts: "1", text: "intro" }, { ts: "2", text: 'pasted {"id":"9","region":"Region C"}' }],
    [{ ts: "1", text: "{broken" }],
  ];
  for (const messages of threads) {
    const [old] = runCodeNode(src, createN8nContext({ nodes: { [historyNode]: { messages }, [currentNode]: { text: "t", userId: "U", channelId: "C", threadTs: "1" } } }));
    const n = threadContext(messages);
    assert.deepEqual(n.contextData, old.json.contextData);
    assert.deepEqual(n.history, old.json.history);
  }
});

test("differential slack: assistant slack-message-normalizer", { skip: skipReason }, () => {
  const src = oldSource(ASSISTANT + "slack-message-normalizer.js");
  const message = { text: " hello ", user: "U1", channel: "C1", ts: "1.2", files: [{ id: "F1", name: "a.pdf", mimetype: "application/pdf" }], language: "mk" };
  const [old] = runCodeNode(src, createN8nContext({ items: [message] }));
  const n = normalizeMessage(message);
  assert.equal(n.user.id, old.json.user.id);
  assert.equal(n.user.languageHint, old.json.user.languageHint);
  assert.equal(n.message.text, old.json.message.text);
  assert.equal(n.message.channelId, old.json.message.channelId);
  assert.equal(n.message.messageId, old.json.message.messageId);
  assert.deepEqual(n.attachments, old.json.attachments);
  // Deviation (recorded): missing fields. Old → placeholder strings
  // ("SLACK_USER_ID", "FILE_ID"), new → "".
  const [oldEmpty] = runCodeNode(src, createN8nContext({ items: [{ files: [{}] }] }));
  assert.equal(oldEmpty.json.user.id, "SLACK_USER_ID");
  assert.equal(oldEmpty.json.attachments.files[0].id, "FILE_ID");
  assert.equal(normalizeMessage({ files: [{}] }).user.id, "");
  assert.equal(normalizeMessage({ files: [{}] }).attachments.files[0].id, "");
});

test("differential slack: assistant smart-router", { skip: skipReason }, () => {
  const src = oldSource(ASSISTANT + "smart-router.js");
  /** @param {string} text */
  const old = (text) => runCodeNode(src, createN8nContext({ items: [{ message: { text } }] }))[0].json.routing;
  for (const text of ["", "/help", "/status now", "/quick", "send an email to max", "termin morgen", "what's the weather", "meeting at 3", "kontakt Max anschreiben"]) {
    assert.deepEqual(routeCommand(text), old(text), JSON.stringify(text));
  }
  // E15: old → new
  assert.deepEqual(old("helpful tips"), { route: "command", command: "help" });
  assert.equal(routeCommand("helpful tips").route, "agent");
  assert.equal(old("add contact Max").category, "email");
  assert.equal(/** @type {any} */ (routeCommand("add contact Max")).category, "contacts");
  assert.deepEqual(old("Прати мејл"), { route: "agent", category: "general", needsApproval: false });
  assert.deepEqual(routeCommand("Прати мејл"), { route: "agent", category: "email", needsApproval: true });
});

test("differential slack: consent role-based-home-tab (block types and action ids per role)", { skip: skipReason }, () => {
  const src = oldSource(CONSENT + "role-based-home-tab.js");
  const [eventNode, usersNode] = nodeNamesOf(src);
  const header = ["ID", "Name", "Email", "Slack ID", "Handle", "Phone", "Role", "Active"];
  const rows = [
    { index: 1, values: [["1", "Max", "max@example.de", "U1", "@max", "", "super_admin", "Yes"]] },
    { index: 2, values: [["2", "Eva", "eva@example.de", "U2", "@eva", "", "admin", "Yes"]] },
    { index: 3, values: [["3", "Tom", "tom@example.de", "U3", "@tom", "", "techniker", "Yes"]] },
    { index: 4, values: [["4", "Old", "old@example.de", "U4", "@old", "", "admin", "No"]] },
  ];
  const mapper = columnMapperFromHeader(header, HOME_TAB_USER_COLUMNS);
  /** @param {any} view */
  const skeleton = (view) => view.blocks.map((/** @type {any} */ b) => (b.type === "actions" ? ["actions", ...b.elements.map((/** @type {any} */ e) => e.action_id)] : b.type));
  for (const userId of ["U1", "U2", "U3", "U4", "U404"]) {
    const [old] = runCodeNode(src, createN8nContext({ nodes: { [eventNode]: { body: { event: { user: userId } } }, [usersNode]: { value: rows } } }));
    const n = buildHomeTab({ userId, user: findUserBySlackId(rows, mapper, userId), now: new Date() });
    assert.equal(n.user_id, old.json.user_id);
    assert.deepEqual(skeleton(n.view), skeleton(old.json.view), userId);
    const oldSections = old.json.view.blocks.filter((/** @type {any} */ b) => b.type === "section").map((/** @type {any} */ b) => b.text.text);
    const newSections = n.view.blocks.filter((/** @type {any} */ b) => b.type === "section").map((/** @type {any} */ b) => b.text.text);
    // Rename (recorded): the old branding section carried an internal app
    // name ("Internal … Hub"); the new one reads "Ops Home".
    assert.deepEqual(newSections, oldSections.map((/** @type {string} */ t) => t.replace(/Internal \w+ Hub/, "Ops Home")));
  }
});

test("differential slack: reclamation slack-modal-builder", { skip: skipReason }, () => {
  const src = oldSource(RECLAMATION + "slack-modal-builder.js");
  const input = { region: "Region B", triggerId: "T1", userId: "U1" };
  const [old] = runCodeNode(src, createN8nContext({ items: [input] }));
  const view = blockkit.modal({
    callbackId: "search_submit",
    privateMetadata: { region: input.region, action: "search", userId: input.userId },
    title: "Search cases",
    submit: "Search",
    close: "Cancel",
    blocks: [
      blockkit.section("B  *Region B*\n_Search by company, customer name, or address._"),
      blockkit.divider(),
      blockkit.plainTextInput({ blockId: "search_term", actionId: "v", label: "Company, customer or address", hint: "Leave empty to see all cases.", placeholder: "e.g. Acme GmbH, Mueller, Main Street...", optional: true }),
    ],
  });
  assert.deepEqual(blockkit.openModalPayload(input.triggerId, view), old.json.modalBody);
});

test("differential slack: document-search slack-delivery-size-guard", { skip: skipReason }, () => {
  const old = requireOld(DOCSEARCH + "slack-delivery-size-guard.js");
  for (const item of [{ binary: { data: { fileSize: 100 } } }, { binary: { data: { fileSize: 30 * 1024 * 1024 } } }, { binary: {} }, {}]) {
    assert.deepEqual(checkUploadSize(item), old.validateDownloadedFile(item), JSON.stringify(item));
  }
});
