import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  parseDate,
  toIsoDay,
  formatDate,
  isSameDay,
  daysBetween,
  pad2,
  fromExcelSerial,
  toExcelSerial,
  weekArchiveName,
  parseWeekArchiveName,
} from "../lib/dates/index.js";

// E1 — the runner executes this file under TZ=Pacific/Kiritimati and
// TZ=America/Los_Angeles; every assertion here must hold in both.

test("E1 parseDate: German short day.month.year", () => {
  assert.deepEqual(parseDate("1.5.2026"), { year: 2026, month: 5, day: 1 });
  assert.equal(toIsoDay(parseDate("1.5.2026")), "2026-05-01");
});

test("E1 parseDate: German date with time", () => {
  assert.deepEqual(parseDate("11.05.2026 14:30"), {
    year: 2026,
    month: 5,
    day: 11,
    hour: 14,
    minute: 30,
  });
});

test("E1 parseDate: English month name", () => {
  assert.deepEqual(parseDate("May 11, 2026"), { year: 2026, month: 5, day: 11 });
  assert.deepEqual(parseDate("11 May 2026"), { year: 2026, month: 5, day: 11 });
  assert.deepEqual(parseDate("11. Mai 2026"), { year: 2026, month: 5, day: 11 });
});

test("E1 parseDate: ISO forms keep the written wall-clock parts", () => {
  assert.deepEqual(parseDate("2026-05-11"), { year: 2026, month: 5, day: 11 });
  assert.deepEqual(parseDate("2026-05-11T14:30"), { year: 2026, month: 5, day: 11, hour: 14, minute: 30 });
  assert.deepEqual(parseDate("2026-05-11T14:30:00Z"), { year: 2026, month: 5, day: 11, hour: 14, minute: 30 });
  assert.deepEqual(parseDate("2026-05-11T14:30:00.000+02:00"), { year: 2026, month: 5, day: 11, hour: 14, minute: 30 });
});

test("E1 toIsoDay never goes through Date#toISOString or local getters", () => {
  const src = readFileSync(new URL("../lib/dates/index.js", import.meta.url), "utf8");
  assert.equal(src.includes("toISOString"), false, "toISOString must not appear in lib/dates");
  for (const local of ["getFullYear(", "getMonth(", "getDate(", "getHours(", "getMinutes("]) {
    assert.equal(src.includes(local), false, `${local} must not appear in lib/dates (use UTC getters)`);
  }
});

test("E9 parseDate: Excel serial as number and numeric string", () => {
  assert.deepEqual(parseDate("46153"), { year: 2026, month: 5, day: 11 });
  assert.deepEqual(parseDate(46153), { year: 2026, month: 5, day: 11 });
  assert.deepEqual(parseDate(45234.5), { year: 2023, month: 11, day: 4, hour: 12, minute: 0 });
  assert.deepEqual(parseDate("45234.5833"), { year: 2023, month: 11, day: 4, hour: 14, minute: 0 });
});

test("parseDate: invisible characters and padding are ignored", () => {
  assert.deepEqual(parseDate("\u200B 11.05.2026 \uFEFF"), { year: 2026, month: 5, day: 11 });
});

test("parseDate: rejects empty, garbage and impossible dates", () => {
  assert.equal(parseDate(""), null);
  assert.equal(parseDate(null), null);
  assert.equal(parseDate(undefined), null);
  assert.equal(parseDate("garbage"), null);
  assert.equal(parseDate("31.02.2026"), null);
  assert.equal(parseDate("11.13.2026"), null);
  assert.equal(parseDate("2026-05-11 25:00"), null);
  assert.equal(parseDate(0), null);
  assert.equal(parseDate(-5), null);
});

test("parseDate: a Date instance is read in UTC", () => {
  assert.deepEqual(parseDate(new Date(Date.UTC(2026, 4, 11, 14, 30))), {
    year: 2026,
    month: 5,
    day: 11,
    hour: 14,
    minute: 30,
  });
  assert.equal(parseDate(new Date("nonsense")), null);
});

test("toIsoDay pads and tolerates null", () => {
  assert.equal(toIsoDay({ year: 2026, month: 5, day: 1 }), "2026-05-01");
  assert.equal(toIsoDay(null), null);
});

test("formatDate: de and iso, with and without time", () => {
  const p = { year: 2026, month: 5, day: 1, hour: 9, minute: 5 };
  assert.equal(formatDate(p, "de"), "01.05.2026");
  assert.equal(formatDate(p, "de", { time: true }), "01.05.2026 09:05");
  assert.equal(formatDate(p, "iso"), "2026-05-01");
  assert.equal(formatDate(p, "iso", { time: true }), "2026-05-01 09:05");
  assert.equal(formatDate({ year: 2026, month: 5, day: 1 }, "de", { time: true }), "01.05.2026 00:00");
  assert.equal(formatDate(null, "de"), "");
});

test("isSameDay compares the calendar day only", () => {
  assert.equal(isSameDay({ year: 2026, month: 5, day: 1, hour: 1 }, { year: 2026, month: 5, day: 1, hour: 23 }), true);
  assert.equal(isSameDay({ year: 2026, month: 5, day: 1 }, { year: 2026, month: 5, day: 2 }), false);
  assert.equal(isSameDay(null, { year: 2026, month: 5, day: 2 }), false);
});

test("daysBetween is a whole number of calendar days, sign included", () => {
  assert.equal(daysBetween({ year: 2026, month: 5, day: 11 }, { year: 2026, month: 5, day: 9 }), 2);
  assert.equal(daysBetween({ year: 2026, month: 5, day: 9 }, { year: 2026, month: 5, day: 11 }), -2);
  assert.equal(daysBetween({ year: 2026, month: 3, day: 1 }, { year: 2026, month: 2, day: 28 }), 1);
  assert.equal(daysBetween({ year: 2026, month: 5, day: 11, hour: 23 }, { year: 2026, month: 5, day: 11, hour: 1 }), 0);
});

test("pad2", () => {
  assert.equal(pad2(5), "05");
  assert.equal(pad2(12), "12");
});

test("Excel serial conversion uses the 1899-12-30 epoch and round-trips", () => {
  assert.deepEqual(fromExcelSerial(1), { year: 1899, month: 12, day: 31 });
  assert.deepEqual(fromExcelSerial(45234), { year: 2023, month: 11, day: 4 });
  assert.equal(toExcelSerial({ year: 2026, month: 5, day: 11 }), 46153);
  assert.equal(toExcelSerial({ year: 2023, month: 11, day: 4, hour: 12, minute: 0 }), 45234.5);
  assert.equal(fromExcelSerial("abc"), null);
  assert.equal(fromExcelSerial(0), null);
});

test("weekArchiveName / parseWeekArchiveName", () => {
  assert.equal(weekArchiveName({ year: 2026, month: 5, day: 1 }), "Week_01_05_2026");
  assert.deepEqual(parseWeekArchiveName("Week_01_05_2026"), { year: 2026, month: 5, day: 1 });
  assert.equal(parseWeekArchiveName("Week_x"), null);
  assert.equal(parseWeekArchiveName("Week_31_02_2026"), null);
});
