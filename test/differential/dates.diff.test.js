/**
 * Differential tests: the new lib/dates functions must give the same
 * results as the original snippets for the inputs those snippets document,
 * except where the old behaviour is a listed bug (E1, E9). Those cases
 * record old → new explicitly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseDate, toIsoDay, formatDate, fromExcelSerial, toExcelSerial, weekArchiveName, parseWeekArchiveName } from "../../lib/dates/index.js";
import { skipReason, oldSource, requireOld, extractFunctions } from "./old-loader.js";

const DISPATCH = "multi-region-dispatch-automation-snippets/snippets/";
const CONSENT = "consent-based-3d-scan-control-center-snippets/snippets/";
const RECLAMATION = "internal-reclamation-case-management-snippets/snippets/";
const SIGNED = "signed-document-delivery-automation-snippets/snippets/";

const tz = process.env.TZ ?? "";

test("differential dates: appointment-date-filter parseDateFlexible", { skip: skipReason }, () => {
  const old = extractFunctions(oldSource(DISPATCH + "appointment-date-filter.js"), [
    "pad2",
    "formatDateParts",
    "formatLocalDate",
    "parseDateFlexible",
  ]);
  for (const input of ["2026-05-11", "11.05.2026", "1.5.2026", 46153, 45234.5, "2026-05-11T14:30", "", null, undefined, "garbage"]) {
    assert.equal(toIsoDay(parseDate(input)), old.parseDateFlexible(input), `input ${JSON.stringify(input)}`);
  }
  // E9: a numeric STRING. The old code hands "46153" to new Date(), which
  // reads it as the year 46153; the new code reads it as an Excel serial.
  assert.equal(old.parseDateFlexible("46153"), "46153-01-01");
  assert.equal(toIsoDay(parseDate("46153")), "2026-05-11");
});

test("differential dates: llm-output-sanitizer sanitizeDate", { skip: skipReason }, () => {
  const old = extractFunctions(oldSource(DISPATCH + "llm-output-sanitizer.js"), ["sanitizeDate"]);
  for (const input of ["11.05.2026", "2026-05-11", "", null]) {
    assert.equal(toIsoDay(parseDate(input)) ?? "", old.sanitizeDate(input), `input ${JSON.stringify(input)}`);
  }
  // E1: the old code parses "May 11, 2026" as LOCAL midnight and then
  // formats it through toISOString (UTC). East of UTC the day shifts back.
  const oldOut = old.sanitizeDate("May 11, 2026");
  assert.equal(toIsoDay(parseDate("May 11, 2026")), "2026-05-11");
  if (tz === "Pacific/Kiritimati") assert.equal(oldOut, "2026-05-10", "old → new: 2026-05-10 → 2026-05-11");
  if (tz === "America/Los_Angeles") assert.equal(oldOut, "2026-05-11");
});

test("differential dates: scheduled-summary-aggregator parseGermanOrIso", { skip: skipReason }, () => {
  const old = extractFunctions(oldSource(DISPATCH + "scheduled-summary-aggregator.js"), ["parseGermanOrIso"]);
  for (const input of ["11.05.2026", "2026-05-11", "2026-05-11T14:30:00Z", "", null]) {
    const oldDate = old.parseGermanOrIso(input);
    const oldIso = oldDate ? oldDate.toISOString().slice(0, 10) : null;
    assert.equal(toIsoDay(parseDate(input)), oldIso, `input ${JSON.stringify(input)}`);
  }
});

test("differential dates: excel-serial-date-utils", { skip: skipReason }, () => {
  const old = extractFunctions(oldSource(CONSENT + "excel-serial-date-utils.js"), [
    "excelSerialToDate",
    "dateToExcelSerial",
    "parseAnyDate",
    "formatDate",
  ]);
  for (const serial of [45234, 45234.5, 45234.25, 46153, 1]) {
    const o = old.excelSerialToDate(serial);
    const n = fromExcelSerial(serial);
    if (!n) throw new Error(`fromExcelSerial(${serial}) returned null`);
    assert.deepEqual([n.year, n.month, n.day], [o.getUTCFullYear(), o.getUTCMonth() + 1, o.getUTCDate()], `serial ${serial}`);
    if (n.hour !== undefined) assert.deepEqual([n.hour, n.minute], [o.getUTCHours(), o.getUTCMinutes()], `serial ${serial}`);
  }
  // Deviation (not an E-case, recorded here): a serial with four decimals
  // cannot carry seconds. The old code truncated 45234.5833 to 13:59:57 and
  // reported 13:59; the new code rounds to the minute and reports 14:00.
  const oldFraction = old.excelSerialToDate("45234.5833");
  assert.deepEqual([oldFraction.getUTCHours(), oldFraction.getUTCMinutes()], [13, 59]);
  const newFraction = fromExcelSerial("45234.5833");
  assert.deepEqual([newFraction?.hour, newFraction?.minute], [14, 0]);
  assert.equal(toExcelSerial({ year: 2026, month: 5, day: 11 }), old.dateToExcelSerial(new Date(Date.UTC(2026, 4, 11))));
  for (const input of ["11.05.2026", "2026-05-11", "2026-05-11T14:30:00Z", 46153, "", null]) {
    const o = old.parseAnyDate(input);
    const oldIso = o ? o.toISOString().slice(0, 10) : null;
    assert.equal(toIsoDay(parseDate(input)), oldIso, `input ${JSON.stringify(input)}`);
  }
  // E1: old formatDate reads a UTC-midnight Date through local getters.
  // West of UTC that is still the previous evening.
  const oldFormatted = old.formatDate(old.parseAnyDate("11.05.2026"), "de", false);
  assert.equal(formatDate(parseDate("11.05.2026"), "de"), "11.05.2026");
  if (tz === "America/Los_Angeles") assert.equal(oldFormatted, "10.05.2026", "old → new: 10.05.2026 → 11.05.2026");
  if (tz === "Pacific/Kiritimati") assert.equal(oldFormatted, "11.05.2026");
});

test("differential dates: date-range-summary-aggregator parseDate (YYYYMMDD integer)", { skip: skipReason }, () => {
  const old = extractFunctions(oldSource(RECLAMATION + "date-range-summary-aggregator.js"), ["parseDate"]);
  for (const input of ["11.05.2026", "2026-05-11", "46153", 46153, "", null, "garbage"]) {
    const parts = parseDate(input);
    const asInt = parts ? Number(String(toIsoDay(parts)).replace(/-/g, "")) : 0;
    assert.equal(asInt, old.parseDate(input), `input ${JSON.stringify(input)}`);
  }
});

test("differential dates: archive-safety-check week archive names", { skip: skipReason }, () => {
  const old = requireOld(SIGNED + "archive-safety-check.js");
  assert.equal(weekArchiveName({ year: 2026, month: 5, day: 1 }), old.buildWeeklyArchiveName(new Date(2026, 4, 1)));
  const parsed = parseWeekArchiveName("Week_11_05_2026");
  // The old parser is not exported; reproduce its contract through splitArchiveItems.
  const result = old.splitArchiveItems(
    [{ type: "folder", name: "Week_11_05_2026" }],
    { now: new Date(2026, 5, 20), retentionDays: 30, expectedArchiveName: "x" },
  );
  assert.equal(result.foldersToDelete.length, 1);
  assert.deepEqual(parsed, { year: 2026, month: 5, day: 11 });
});
