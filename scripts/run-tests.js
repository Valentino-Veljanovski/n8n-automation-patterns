/**
 * Test runner.
 *
 * Runs every `test/**\/*.test.js` file with `node --test`, once per time
 * zone in TIME_ZONES, so that date handling is proven independent of the
 * machine's zone (a UTC+14 zone and a UTC-7/-8 zone bracket the world).
 *
 * `--once` runs the suite a single time in the current zone (handy while
 * iterating). The differential tests under test/differential skip
 * themselves unless INPUT_DIR points at the directory that holds the
 * original snippet repositories.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TIME_ZONES = ["Pacific/Kiritimati", "America/Los_Angeles"];

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testDir = join(root, "test");

/** @param {string} dir @returns {string[]} */
function collect(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (entry.endsWith(".test.js")) out.push(full);
  }
  return out.sort();
}

const files = collect(testDir);
const once = process.argv.includes("--once");
const zones = once ? [process.env.TZ ?? "(machine default)"] : TIME_ZONES;

let failed = false;
for (const tz of zones) {
  const env = { ...process.env };
  if (!once) env.TZ = tz;
  console.log(`\n=== node --test (TZ=${tz}, ${files.length} files) ===\n`);
  const result = spawnSync(process.execPath, ["--test", ...files], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
