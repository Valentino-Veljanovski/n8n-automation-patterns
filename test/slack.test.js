import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  parseInteraction,
  threadContext,
  normalizeMessage,
  detectScript,
  routeCommand,
  transliterateCyrillic,
  checkUploadSize,
  DEFAULT_UPLOAD_LIMIT_BYTES,
  blockkit,
  buildHomeTab,
  findUserBySlackId,
  HOME_TAB_USER_COLUMNS,
} from "../lib/slack/index.js";
import { columnMapperFromHeader } from "../lib/graph/index.js";

const ALLOW = new Set(["U0001", "U0002"]);
const REGIONS = { region_a: "Region A", region_b: "Region B" };

/** @param {Record<string, any>} payload */
const asBody = (payload) => ({ payload: JSON.stringify(payload) });

const blockActions = asBody({
  type: "block_actions",
  user: { id: "U0001", username: "max", real_name: "Max Muster" },
  trigger_id: "T1",
  channel: { id: "C1" },
  actions: [{ action_id: "search_region_a", value: "v1" }],
  view: { root_view_id: "V0" },
});

test("N1 parseInteraction throws without an allow-list", () => {
  const parse = /** @type {any} */ (parseInteraction);
  assert.throws(() => parse(blockActions), /allow-list/);
  assert.throws(() => parse(blockActions, {}), /allow-list/);
  assert.throws(() => parse(blockActions, { allowList: "U0001" }), /allow-list/);
});

test("N1 parseInteraction: block_actions", () => {
  const out = parseInteraction(blockActions, { allowList: ALLOW, regionMap: REGIONS });
  assert.equal(out.type, "block_actions");
  assert.equal(out.triggerType, "button_click");
  assert.equal(out.userId, "U0001");
  assert.equal(out.userName, "max");
  assert.equal(out.userRealName, "Max Muster");
  assert.equal(out.allowed, true);
  assert.equal(out.role, null);
  assert.equal(out.triggerId, "T1");
  assert.equal(out.channelId, "C1");
  assert.equal(out.actionId, "search_region_a");
  assert.equal(out.actionValue, "v1");
  assert.equal(out.actionPrefix, "search");
  assert.equal(out.region, "Region A");
  assert.equal(out.requiredPermission, "view");
  assert.equal(out.rootViewId, "V0");
  assert.deepEqual(out.privateMetadata, {});
});

test("N1 parseInteraction: delete actions need the delete permission, unknown regions pass through", () => {
  const body = asBody({ type: "block_actions", user: { id: "U0001" }, actions: [{ action_id: "delete_case" }] });
  const out = parseInteraction(body, { allowList: ALLOW, regionMap: REGIONS });
  assert.equal(out.requiredPermission, "delete");
  assert.equal(out.actionPrefix, "delete");
  assert.equal(out.region, "case");
  const all = parseInteraction(asBody({ type: "block_actions", user: { id: "U0001" }, actions: [{ action_id: "report_all" }] }), { allowList: ALLOW, regionMap: REGIONS });
  assert.equal(all.region, "all");
});

test("N1 parseInteraction: view_submission reads private_metadata", () => {
  const body = asBody({
    type: "view_submission",
    user: { id: "U0002", name: "eva" },
    trigger_id: "T2",
    view: {
      callback_id: "search_submit",
      private_metadata: JSON.stringify({ region: "Region B", action: "search", userId: "U0002" }),
      state: { values: { search_term: { v: { value: "Acme" } } } },
      root_view_id: "V1",
    },
  });
  const out = parseInteraction(body, { allowList: ALLOW });
  assert.equal(out.type, "view_submission");
  assert.equal(out.triggerType, "modal_submit");
  assert.equal(out.requiredPermission, "create");
  assert.equal(out.userName, "eva");
  assert.equal(out.region, "Region B");
  assert.equal(out.actionPrefix, "search");
  assert.equal(out.callbackId, "search_submit");
  assert.deepEqual(out.viewState, { search_term: { v: { value: "Acme" } } });
  assert.deepEqual(out.privateMetadata, { region: "Region B", action: "search", userId: "U0002" });
});

test("N1 parseInteraction: slash command", () => {
  const out = parseInteraction(
    { command: "/cases", text: "open", user_id: "U0001", user_name: "max", channel_id: "C9", trigger_id: "T3" },
    { allowList: ALLOW },
  );
  assert.equal(out.type, "slash_command");
  assert.equal(out.triggerType, "slash_command");
  assert.equal(out.command, "/cases");
  assert.equal(out.text, "open");
  assert.equal(out.userId, "U0001");
  assert.equal(out.channelId, "C9");
  assert.equal(out.triggerId, "T3");
  assert.equal(out.requiredPermission, "create");
});

test("N1 parseInteraction: Events API event", () => {
  const out = parseInteraction({ event: { type: "app_home_opened", user: "U0002", channel: "D1" } }, { allowList: ALLOW });
  assert.equal(out.type, "event");
  assert.equal(out.triggerType, "event");
  assert.equal(out.eventType, "app_home_opened");
  assert.equal(out.userId, "U0002");
  assert.equal(out.channelId, "D1");
  assert.equal(out.requiredPermission, "view");
  assert.equal(out.allowed, true);
});

test("N1 parseInteraction: unknown users are not allowed, super admins are", () => {
  const body = asBody({ type: "block_actions", user: { id: "U0099" }, actions: [] });
  assert.equal(parseInteraction(body, { allowList: ALLOW }).allowed, false);
  const admin = parseInteraction(body, { allowList: ALLOW, superAdmins: ["U0099"] });
  assert.equal(admin.allowed, true);
  assert.equal(admin.role, "super_admin");
});

test("N1 parseInteraction: broken payload JSON yields type unknown", () => {
  const out = parseInteraction({ payload: "{not json" }, { allowList: ALLOW });
  assert.equal(out.type, "unknown");
  assert.equal(out.allowed, false);
  assert.match(out.error ?? "", /payload/);
  assert.equal(parseInteraction(null, { allowList: ALLOW }).type, "unknown");
});

test("N1 the old repositories' placeholder Slack IDs appear nowhere in lib or test", () => {
  const placeholders = ["A", "B", "C"].map((c) => "U_" + c.repeat(10));
  /** @param {string} dir @returns {string[]} */
  const collect = (dir) =>
    readdirSync(dir).flatMap((e) => {
      const p = join(dir, e);
      return statSync(p).isDirectory() ? collect(p) : [p];
    });
  const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  for (const file of [...collect(join(root, "lib")), ...collect(join(root, "test"))]) {
    const text = readFileSync(file, "utf8");
    for (const id of placeholders) assert.equal(text.includes(id), false, `${file} contains ${id}`);
  }
});

test("threadContext: reads the JSON from a context block in the first message", () => {
  const messages = [
    { ts: "1", bot_id: "B1", blocks: [{ type: "context", elements: [{ type: "mrkdwn", text: 'case data: {"id":"7","region":"Region A"}' }] }] },
    { ts: "2", text: "please draft an email <@U1>" },
    { ts: "3", bot_id: "B1", text: "Draft: ..." },
  ];
  const out = threadContext(messages);
  assert.deepEqual(out.contextData, { id: "7", region: "Region A" });
  assert.deepEqual(out.history, [
    { role: "user", content: "please draft an email" },
    { role: "assistant", content: "Draft: ..." },
  ]);
});

test("threadContext: falls back to message text, then to a scan of every message", () => {
  const fromText = threadContext([{ ts: "1", text: 'New case {"id":"8","region":"Region B"}' }]);
  assert.deepEqual(fromText.contextData, { id: "8", region: "Region B" });
  const fromScan = threadContext([{ ts: "1", text: "intro" }, { ts: "2", text: 'here: {"id":"9","region":"Region C"}' }]);
  assert.deepEqual(fromScan.contextData, { id: "9", region: "Region C" });
  assert.deepEqual(threadContext([]).contextData, {});
  assert.deepEqual(threadContext([{ ts: "1", text: "{broken" }]).contextData, {});
});

test("normalizeMessage: shape, attachments and script", () => {
  const out = normalizeMessage({
    text: " Прати мејл ",
    user: "U1",
    channel: "C1",
    ts: "1700000000.000100",
    files: [{ id: "F1", name: "a.pdf", mimetype: "application/pdf" }, { id: "F2" }],
  });
  assert.deepEqual(out, {
    user: { id: "U1", languageHint: null },
    message: { text: "Прати мејл", channelId: "C1", messageId: "1700000000.000100", script: "cyrillic" },
    attachments: {
      hasAttachments: true,
      count: 2,
      files: [
        { id: "F1", name: "a.pdf", mimetype: "application/pdf" },
        { id: "F2", name: "attachment", mimetype: "application/octet-stream" },
      ],
    },
  });
  const empty = normalizeMessage(null);
  assert.equal(empty.user.id, "");
  assert.equal(empty.message.text, "");
  assert.equal(empty.message.script, "none");
  assert.equal(empty.attachments.hasAttachments, false);
  assert.equal(normalizeMessage({ language: "mk" }).user.languageHint, "mk");
});

test("detectScript tells Cyrillic, Latin and Greek apart", () => {
  assert.equal(detectScript("Прати мејл"), "cyrillic");
  assert.equal(detectScript("Send mail"), "latin");
  assert.equal(detectScript("Στείλε μήνυμα"), "greek");
  assert.equal(detectScript("Send мејл"), "mixed");
  assert.equal(detectScript("12345 !?"), "none");
});

test("transliterateCyrillic maps Macedonian and Serbian letters", () => {
  assert.equal(transliterateCyrillic("Прати мејл"), "Prati mejl");
  assert.equal(transliterateCyrillic("ќе ѓ љ њ џ ш ж ч ц"), "kje gj lj nj dzh sh zh ch c");
  assert.equal(transliterateCyrillic("Latin stays"), "Latin stays");
});

test("E15 routeCommand: help matches only as a whole word", () => {
  assert.deepEqual(routeCommand("help"), { route: "command", command: "help" });
  assert.deepEqual(routeCommand("/help me"), { route: "command", command: "help" });
  assert.equal(routeCommand("helpful tips for the meeting").route, "agent");
  assert.deepEqual(routeCommand("/status"), { route: "command", command: "status" });
  assert.deepEqual(routeCommand("/quick"), { route: "command", command: "quick" });
  assert.deepEqual(routeCommand(""), { route: "command", command: "empty" });
  assert.deepEqual(routeCommand(null), { route: "command", command: "empty" });
});

test("E15 routeCommand: the contacts category is reachable", () => {
  assert.deepEqual(routeCommand("add contact Max Muster"), { route: "agent", category: "contacts", needsApproval: true });
  assert.deepEqual(routeCommand("edit contact for Eva"), { route: "agent", category: "contacts", needsApproval: true });
});

test("E15 routeCommand: Cyrillic and Latin give the same category", () => {
  assert.deepEqual(routeCommand("Прати мејл на Макс"), { route: "agent", category: "email", needsApproval: true });
  assert.deepEqual(routeCommand("Prati mejl na Maks"), { route: "agent", category: "email", needsApproval: true });
  assert.deepEqual(routeCommand("Кога е следниот состанок"), { route: "agent", category: "calendar", needsApproval: false });
  assert.deepEqual(routeCommand("termin morgen?"), { route: "agent", category: "calendar", needsApproval: false });
  assert.deepEqual(routeCommand("what's the weather"), { route: "agent", category: "general", needsApproval: false });
  assert.deepEqual(routeCommand("send an email to Max"), { route: "agent", category: "email", needsApproval: true });
});

test("checkUploadSize guards the Slack upload limit", () => {
  assert.deepEqual(checkUploadSize({ binary: { data: { fileSize: 1024 } } }), { success: true, binaryKey: "data", fileSize: 1024 });
  assert.equal(DEFAULT_UPLOAD_LIMIT_BYTES, 25 * 1024 * 1024);
  const check = /** @type {(item: any, options?: any) => any} */ (checkUploadSize);
  const big = check({ binary: { data: { fileSize: DEFAULT_UPLOAD_LIMIT_BYTES + 1 } } });
  assert.equal(big.success, false);
  assert.equal(big.tooLarge, true);
  assert.equal(check({ binary: { data: { fileSize: 50 } } }, { limitBytes: 10 }).tooLarge, true);
  assert.equal(check({ binary: { data: { fileSize: "27.7 kB" } } }).fileSize, 27700);
  assert.equal(check({}).success, false);
});

test("blockkit builders produce Slack's shapes", () => {
  assert.deepEqual(blockkit.section("hi"), { type: "section", text: { type: "mrkdwn", text: "hi" } });
  assert.deepEqual(blockkit.button("Go", "go_now", "primary"), { type: "button", text: { type: "plain_text", text: "Go", emoji: true }, action_id: "go_now", style: "primary" });
  assert.deepEqual(blockkit.button("Go", "go_now"), { type: "button", text: { type: "plain_text", text: "Go", emoji: true }, action_id: "go_now" });
  assert.deepEqual(blockkit.divider(), { type: "divider" });
  assert.deepEqual(blockkit.header("H"), { type: "header", text: { type: "plain_text", text: "H" } });
  assert.deepEqual(blockkit.context(["a", "b"]), { type: "context", elements: [{ type: "mrkdwn", text: "a" }, { type: "mrkdwn", text: "b" }] });
  assert.deepEqual(blockkit.actions([blockkit.button("x", "x")]).type, "actions");
  assert.deepEqual(blockkit.publishHomePayload("U1", [blockkit.divider()]), { user_id: "U1", view: { type: "home", blocks: [{ type: "divider" }] } });
  const view = blockkit.modal({
    callbackId: "cb",
    privateMetadata: { a: 1 },
    title: "T",
    submit: "S",
    close: "C",
    blocks: [blockkit.plainTextInput({ blockId: "b", actionId: "v", label: "L", hint: "H", placeholder: "P", optional: true })],
  });
  assert.deepEqual(view, {
    type: "modal",
    callback_id: "cb",
    private_metadata: '{"a":1}',
    title: { type: "plain_text", text: "T", emoji: true },
    submit: { type: "plain_text", text: "S", emoji: true },
    close: { type: "plain_text", text: "C", emoji: true },
    blocks: [
      {
        type: "input",
        block_id: "b",
        optional: true,
        label: { type: "plain_text", text: "L", emoji: true },
        hint: { type: "plain_text", text: "H", emoji: true },
        element: { type: "plain_text_input", action_id: "v", placeholder: { type: "plain_text", text: "P" } },
      },
    ],
  });
  assert.deepEqual(blockkit.openModalPayload("T1", view), { trigger_id: "T1", view });
});

const HEADER = ["ID", "Name", "Email", "Slack ID", "Handle", "Phone", "Role", "Active"];
const USERS = [
  { index: 1, values: [["1", "Max", "max@example.de", "U1", "@max", "", "super_admin", "Yes"]] },
  { index: 2, values: [["2", "Eva", "eva@example.de", "U2", "@eva", "", "admin", "Yes"]] },
  { index: 3, values: [["3", "Tom", "tom@example.de", "U3", "@tom", "", "techniker", "Yes"]] },
  { index: 4, values: [["4", "Old", "old@example.de", "U4", "@old", "", "admin", "No"]] },
];
const NOW = new Date("2026-05-11T07:30:00Z");

/** @param {any} view @returns {string[]} */
const actionIds = (view) =>
  view.blocks.filter((/** @type {any} */ b) => b.type === "actions").flatMap((/** @type {any} */ b) => b.elements.map((/** @type {any} */ e) => e.action_id));

test("N2 buildHomeTab: role-specific blocks read through the column mapper", () => {
  const mapper = columnMapperFromHeader(HEADER, HOME_TAB_USER_COLUMNS);
  const superAdmin = buildHomeTab({ userId: "U1", user: findUserBySlackId(USERS, mapper, "U1"), now: NOW, timeZone: "Europe/Berlin" });
  assert.equal(superAdmin.user_id, "U1");
  assert.equal(superAdmin.view.type, "home");
  assert.equal(superAdmin.view.blocks[0].text.text, "Guten Morgen, Max");
  assert.deepEqual(actionIds(superAdmin.view), ["create_case", "search_open", "my_cases", "reports_open", "help_open", "view_users", "system_settings", "compliance_center"]);
  const admin = buildHomeTab({ userId: "U2", user: findUserBySlackId(USERS, mapper, "U2"), now: NOW });
  assert.deepEqual(actionIds(admin.view), ["create_case", "search_open", "my_cases", "reports_open", "help_open"]);
  const tech = buildHomeTab({ userId: "U3", user: findUserBySlackId(USERS, mapper, "U3"), now: NOW });
  assert.deepEqual(actionIds(tech.view), ["create_case", "search_open", "my_cases"]);
  const text = JSON.stringify(superAdmin);
  assert.ok(text.includes("Ops Home"));
  assert.equal(/\bHub\b/.test(text), false, "the old internal app name is gone");
  assert.ok(text.includes("09:30"), "time rendered in Europe/Berlin");
});

test("N2 buildHomeTab: unknown and deactivated users get a single explanatory block", () => {
  const mapper = columnMapperFromHeader(HEADER, HOME_TAB_USER_COLUMNS);
  assert.equal(findUserBySlackId(USERS, mapper, "U404"), null);
  const denied = buildHomeTab({ userId: "U404", user: null, now: NOW });
  assert.equal(denied.view.blocks.length, 1);
  assert.match(denied.view.blocks[0].text.text, /Access denied/);
  const inactive = buildHomeTab({ userId: "U4", user: findUserBySlackId(USERS, mapper, "U4"), now: NOW });
  assert.equal(inactive.view.blocks.length, 1);
  assert.match(inactive.view.blocks[0].text.text, /deactivated/);
});

test("N2 buildHomeTab: a renamed and reordered header row still works through the mapper", () => {
  const header = ["Name", "Active", "Role", "Slack User ID", "Email", "ID", "Handle"];
  const rows = [{ index: 7, values: [["Max", "Yes", "super_admin", "U1", "max@example.de", "1", "@max"]] }];
  const mapper = columnMapperFromHeader(header, HOME_TAB_USER_COLUMNS);
  const user = findUserBySlackId(rows, mapper, "U1");
  assert.equal(user?.role, "super_admin");
  assert.equal(user?._rowIndex, 7);
  const view = buildHomeTab({ userId: "U1", user, now: NOW });
  assert.equal(view.view.blocks[0].text.text, "Guten Morgen, Max");
  assert.ok(actionIds(view.view).includes("view_users"));
});

test("buildHomeTab greets by Berlin hour", () => {
  const mapper = columnMapperFromHeader(HEADER, HOME_TAB_USER_COLUMNS);
  const user = findUserBySlackId(USERS, mapper, "U3");
  assert.match(buildHomeTab({ userId: "U3", user, now: new Date("2026-05-11T12:00:00Z") }).view.blocks[0].text.text, /^Guten Tag/);
  assert.match(buildHomeTab({ userId: "U3", user, now: new Date("2026-05-11T17:00:00Z") }).view.blocks[0].text.text, /^Guten Abend/);
  assert.match(buildHomeTab({ userId: "U3", user, now: new Date("2026-05-11T20:30:00Z") }).view.blocks[0].text.text, /^Guten Abend/);
  // 22:30Z is already 00:30 in Berlin (CEST): a new day, so morning.
  assert.match(buildHomeTab({ userId: "U3", user, now: new Date("2026-05-11T22:30:00Z") }).view.blocks[0].text.text, /^Guten Morgen/);
});
