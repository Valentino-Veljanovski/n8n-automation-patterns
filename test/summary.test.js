import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  countBy,
  formatSlackSummary,
  dayWindow,
  categorySummary,
  formatCategorySummary,
  dailyStatusSummary,
  caseReport,
  CASE_REPORT_COLUMNS,
} from "../lib/summary/index.js";
import { columnMapperFromHeader } from "../lib/graph/index.js";

test("E10 dayWindow('Europe/Berlin') on the DST switch night", () => {
  const w = dayWindow("Europe/Berlin", new Date("2026-03-29T00:30:00Z"));
  assert.deepEqual(w.today, { year: 2026, month: 3, day: 29 });
  assert.deepEqual(w.tomorrow, { year: 2026, month: 3, day: 30 });
  assert.deepEqual(w.yesterday, { year: 2026, month: 3, day: 28 });
});

test("E10 dayWindow('Europe/Berlin') just after midnight local time", () => {
  const w = dayWindow("Europe/Berlin", new Date("2026-10-24T22:30:00Z"));
  assert.deepEqual(w.today, { year: 2026, month: 10, day: 25 });
  assert.deepEqual(w.tomorrow, { year: 2026, month: 10, day: 26 });
  const utc = dayWindow("UTC", new Date("2026-10-24T22:30:00Z"));
  assert.deepEqual(utc.today, { year: 2026, month: 10, day: 24 });
  assert.throws(() => dayWindow("Mars/Olympus", new Date()), /time zone/);
});

test("E10 lib/summary never reads a Date through local getters, and dead code fails lint", () => {
  const src = readFileSync(new URL("../lib/summary/index.js", import.meta.url), "utf8");
  for (const local of ["getFullYear(", "getMonth(", "getDate(", "getHours(", "toISOString"]) {
    assert.equal(src.includes(local), false, `${local} must not appear in lib/summary`);
  }
  const eslint = readFileSync(new URL("../eslint.config.js", import.meta.url), "utf8");
  assert.ok(eslint.includes("js.configs.recommended"), "recommended rules (no-unreachable as error) are active");
  assert.match(eslint, /"no-unused-vars":\s*\["error"/);
});

test("countBy groups by a key or a key function", () => {
  const rows = [{ status: "open" }, { status: "done" }, { status: "open" }, {}];
  assert.deepEqual(countBy(rows, "status"), { open: 2, done: 1, "": 1 });
  assert.deepEqual(countBy(rows, (r) => (r.status === "open" ? "pending" : "other")), { pending: 2, other: 2 });
  assert.deepEqual(countBy([], "x"), {});
});

test("formatSlackSummary renders a title and bullet lines", () => {
  assert.equal(formatSlackSummary("Daily Summary, 11.05.2026", ["3 reminders today", "0 overdue"]), "📊 *Daily Summary, 11.05.2026*\n\n• 3 reminders today\n• 0 overdue");
  assert.equal(formatSlackSummary("Empty", []), "📊 *Empty*");
});

test("categorySummary and formatCategorySummary (routing twin)", () => {
  const s = categorySummary({ accounting: 3, spam: "5", offers: 0 });
  assert.deepEqual(s, {
    total: 8,
    categories: [{ name: "spam", count: 5 }, { name: "accounting", count: 3 }, { name: "offers", count: 0 }],
    hasActivity: true,
    topCategory: { name: "spam", count: 5 },
  });
  assert.equal(formatCategorySummary(s), "Daily email routing summary\nTotal: 8\n• spam: 5\n• accounting: 3\n• offers: 0");
  const none = categorySummary({});
  assert.deepEqual(none, { total: 0, categories: [], hasActivity: false, topCategory: null });
  assert.equal(formatCategorySummary(none), "No routed email activity was recorded today.");
});

test("dailyStatusSummary counts today's actions, tomorrow's open appointments and overdue items", () => {
  const window = dayWindow("Europe/Berlin", new Date("2026-05-11T06:00:00Z"));
  const actionRows = [
    { ActionType: "REMINDER_SMS", SentAt: "11.05.2026" },
    { ActionType: "REMINDER_SMS", SentAt: "2026-05-11T05:00:00Z" },
    { ActionType: "OTHER", SentAt: "11.05.2026" },
    { ActionType: "REMINDER_SMS", SentAt: "10.05.2026" },
  ];
  const trackingRows = [
    { AppointmentDate: "12.05.2026", Status: "pending", SentAt: "11.05.2026" },
    { AppointmentDate: "12.05.2026", Status: "RESOLVED", SentAt: "01.05.2026" },
    { AppointmentDate: "20.05.2026", Status: "PENDING", SentAt: "08.05.2026" },
    { AppointmentDate: "20.05.2026", Status: "PENDING", SentAt: "09.05.2026" },
    { AppointmentDate: "", Status: "PENDING", SentAt: "" },
  ];
  const out = dailyStatusSummary({ actionRows, trackingRows, window, typeToCount: "REMINDER_SMS", overdueDays: 2 });
  assert.deepEqual(out.counts, { today: 2, tomorrow: 1, overdue: 1 });
  assert.equal(
    out.message,
    "📊 *Daily Summary, 11.05.2026*\n\n• 2 reminder sms action(s) today\n• 1 appointment(s) tomorrow with unresolved status\n• 1 item(s) overdue (sent > 2 days ago, still pending)",
  );
});

const REPORT_HEADER = ["Company", "Customer", "Address", "Phone", "Priority", "Assigned", "Notes", "Reported on", "x", "y", "z", "a", "b", "c", "Status", "d", "Value", "e", "Paid on"];
/** @param {Record<string, any>} o */
const row = (o) => {
  const r = new Array(REPORT_HEADER.length).fill("");
  for (const [k, v] of Object.entries(o)) r[REPORT_HEADER.indexOf(k)] = v;
  return r;
};
const REGIONS = [
  {
    label: "Region A",
    rows: [
      row({ Company: "Company" }),
      row({ Company: "Acme", "Reported on": "11.05.2026", Status: "In Progress", Value: "1.234,50" }),
      row({ Company: "Beta", "Reported on": "2026-05-20", Status: "Completed", Value: "100", "Paid on": "21.05.2026" }),
      row({ Company: "▸ Section" }),
      row({ Company: "Gamma", "Reported on": "01.04.2026", Status: "On Hold", Value: "50" }),
    ],
  },
  { label: "Region B", rows: [row({ Company: "Delta", "Reported on": "12.05.2026", Status: "Cancelled", Value: "10" })] },
  { label: "Region C", rows: [] },
];

test("N2 caseReport aggregates per region through the column mapper", () => {
  const mapper = columnMapperFromHeader(REPORT_HEADER, CASE_REPORT_COLUMNS);
  const out = caseReport({ regions: REGIONS, mapper, from: "2026-05-01", to: "2026-05-31" });
  assert.deepEqual(out.results, [
    { label: "Region A", count: 2, inProgress: 1, completed: 1, onHold: 0, cancelled: 0, totalValue: 1334.5, totalPaid: 100 },
    { label: "Region B", count: 1, inProgress: 0, completed: 0, onHold: 0, cancelled: 1, totalValue: 10, totalPaid: 0 },
  ]);
  assert.equal(out.grandTotalValue, 1344.5);
  assert.equal(out.grandTotalPaid, 100);
  assert.equal(out.grandCount, 3);
  assert.equal(out.period, "2026-05-01, 2026-05-31");
  assert.equal(out.regionTitle, "All regions");
  const one = caseReport({ regions: REGIONS, mapper, region: "Region C" });
  assert.deepEqual(one.results, [{ label: "Region C", count: 0, inProgress: 0, completed: 0, onHold: 0, cancelled: 0, totalValue: 0, totalPaid: 0 }]);
  assert.equal(one.period, "All time");
  assert.equal(one.regionTitle, "Region C");
  const all = caseReport({ regions: REGIONS, mapper });
  assert.equal(all.grandCount, 4);
});

test("N2 caseReport still works when the sheet's columns are renamed and reordered", () => {
  const header = ["Reported", "Firma", "Betrag", "Bezahlt am", "Status"];
  const mapper = columnMapperFromHeader(header, CASE_REPORT_COLUMNS);
  const regions = [{ label: "Region A", rows: [["11.05.2026", "Acme", "20", "", "In Progress"], ["12.05.2026", "Beta", "5", "12.05.2026", "Completed"]] }];
  const out = caseReport({ regions, mapper });
  assert.deepEqual(out.results[0], { label: "Region A", count: 2, inProgress: 1, completed: 1, onHold: 0, cancelled: 0, totalValue: 25, totalPaid: 5 });
});
