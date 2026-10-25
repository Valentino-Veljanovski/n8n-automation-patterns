import { test } from "node:test";
import assert from "node:assert/strict";

import { categorySummary, formatCategorySummary, dailyStatusSummary, dayWindow, caseReport } from "../../lib/summary/index.js";
import { createColumnMapper } from "../../lib/graph/index.js";
import { formatDate } from "../../lib/dates/index.js";
import { skipReason, oldSource, requireOld, createN8nContext, runCodeNode, nodeNamesOf } from "./old-loader.js";

const OUTLOOK = "outlook-email-routing-automation-snippets/snippets/";
const DISPATCH = "multi-region-dispatch-automation-snippets/snippets/";
const RECLAMATION = "internal-reclamation-case-management-snippets/snippets/";

test("differential summary: outlook daily-summary-calculator", { skip: skipReason }, () => {
  const old = requireOld(OUTLOOK + "daily-summary-calculator.js");
  for (const counts of [{ accounting: 3, spam: "5", offers: 0 }, {}, { a: 1 }, null]) {
    const o = old.calculateDailySummary(counts);
    const n = categorySummary(counts);
    assert.deepEqual(n, o, JSON.stringify(counts));
    assert.equal(formatCategorySummary(n), old.formatSummaryForSlack(o));
  }
});

test("differential summary: dispatch scheduled-summary-aggregator", { skip: skipReason }, () => {
  const src = oldSource(DISPATCH + "scheduled-summary-aggregator.js");
  const [actionsNode, trackingNode] = nodeNamesOf(src);
  // The old node reads "today" from the machine clock, so the rows are dated
  // relative to the current local day; the new function gets the same window
  // from dayWindow(process.env.TZ).
  const window = dayWindow(process.env.TZ ?? "UTC", new Date());
  const de = (/** @type {any} */ p) => formatDate(p, "de");
  const actionRows = [
    { ActionType: "REMINDER_SMS", SentAt: de(window.today) },
    { ActionType: "REMINDER_SMS", SentAt: de(window.yesterday) },
    { ActionType: "OTHER", SentAt: de(window.today) },
  ];
  const trackingRows = [
    { AppointmentDate: de(window.tomorrow), Status: "pending", SentAt: de(window.today) },
    { AppointmentDate: de(window.tomorrow), Status: "RESOLVED", SentAt: de(window.today) },
    { AppointmentDate: "01.01.2030", Status: "PENDING", SentAt: "01.01.2020" },
    { AppointmentDate: "", Status: "PENDING", SentAt: "" },
  ];
  // The old node returns one item, not an array.
  const old = runCodeNode(src, createN8nContext({ nodes: { [actionsNode]: actionRows, [trackingNode]: trackingRows } }));
  const n = dailyStatusSummary({ actionRows, trackingRows, window });
  assert.deepEqual(n.counts, { today: 1, tomorrow: 1, overdue: 1 });
  // E1 family (recorded): the old node parses "DD.MM.YYYY" as UTC midnight
  // and compares it through local getters. West of UTC that is still the
  // previous evening, so today's and tomorrow's rows are not counted.
  const offsetMinutes = -new Date().getTimezoneOffset();
  if (offsetMinutes < 0) {
    assert.deepEqual(old.json.counts, { today: 0, tomorrow: 0, overdue: 1 }, "old output west of UTC");
  } else {
    assert.deepEqual(old.json.counts, n.counts);
    assert.equal(old.json.message, n.message);
  }
});

test("differential summary: reclamation date-range-summary-aggregator", { skip: skipReason }, () => {
  const src = oldSource(RECLAMATION + "date-range-summary-aggregator.js");
  const [rangeNode] = nodeNamesOf(src);
  const mapper = createColumnMapper({ indexes: { company: 0, reportedOn: 7, status: 14, value: 16, paidOn: 18 }, totalColumns: 19 });
  const labels = ["Region A", "Region B", "Region C", "Region D", "Region E"];
  /** @param {Record<number, any>} cells */
  const row = (cells) => {
    const r = new Array(19).fill("");
    for (const [i, v] of Object.entries(cells)) r[Number(i)] = v;
    return r;
  };
  const sheets = [
    [row({ 0: "Company" }), row({ 0: "Acme", 7: "11.05.2026", 14: "In Progress", 16: "500" }), row({ 0: "▸ divider" }), row({ 0: "Beta", 7: "2026-05-20", 14: "Completed", 16: "100", 18: "21.05.2026" }), row({ 0: "Gamma", 7: "01.04.2026", 14: "On Hold", 16: "50" })],
    [row({ 0: "Delta", 7: "12.05.2026", 14: "Cancelled", 16: "10" })],
    [],
    [row({ 0: "Eps", 7: "46153", 14: "Completed", 16: "7" })],
    [],
  ];
  const regions = labels.map((label, i) => ({ label, rows: sheets[i] }));
  for (const range of [{ dateFrom: "2026-05-01", dateTo: "2026-05-31", region: "all" }, { dateFrom: "", dateTo: "", region: "all" }, { dateFrom: "2026-05-01", dateTo: "2026-05-31", region: "Region C" }, { dateFrom: "", dateTo: "", region: "Region D" }]) {
    const [old] = runCodeNode(src, createN8nContext({ items: sheets.map((values) => ({ values })), nodes: { [rangeNode]: { ...range, userId: "U1" } } }));
    const n = caseReport({ regions, mapper, from: range.dateFrom, to: range.dateTo, region: range.region });
    assert.deepEqual(n.results, old.json.results, JSON.stringify(range));
    assert.equal(n.grandTotalValue, old.json.grandTotalValue);
    assert.equal(n.grandTotalPaid, old.json.grandTotalPaid);
    assert.equal(n.grandCount, old.json.grandCount);
    assert.equal(n.period, old.json.period);
    assert.equal(n.regionTitle, old.json.regionTitle);
  }
  // N5 (recorded): the old parseAmount reads "1.234,56" as 1.234; the new report sums 1234.56.
  const amountSheet = [[row({ 0: "Acme", 7: "11.05.2026", 14: "Completed", 16: "1.234,56" })], [], [], [], []];
  const [oldAmount] = runCodeNode(src, createN8nContext({ items: amountSheet.map((values) => ({ values })), nodes: { [rangeNode]: { dateFrom: "", dateTo: "", region: "all" } } }));
  assert.equal(oldAmount.json.grandTotalValue, 1.234);
  assert.equal(caseReport({ regions: labels.map((label, i) => ({ label, rows: amountSheet[i] })), mapper }).grandTotalValue, 1234.56);
});
