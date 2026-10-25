/**
 * One phone normaliser. Output is E.164 ("+49891234567") or null.
 */

/** Calling codes for the default-country option. */
export const COUNTRY_CODES = /** @type {const} */ ({
  DE: "49", AT: "43", CH: "41", MK: "389", GR: "30", RO: "40", BG: "359", RS: "381",
  AL: "355", GB: "44", FR: "33", IT: "39", ES: "34", NL: "31", BE: "32", PL: "48",
  CZ: "420", US: "1",
});

// Countries whose national numbers start with a trunk "0" that must be
// dropped in international format. Italy keeps its leading zero.
const TRUNK_ZERO = new Set(["49", "43", "41", "389", "30", "40", "359", "381", "355", "44", "33", "31", "32", "48"]);

const CODES_LONGEST_FIRST = [...new Set(Object.values(COUNTRY_CODES))].sort((a, b) => b.length - a.length);

const INVISIBLE = /[\u200B-\u200D\uFEFF\u00AD\u2060]/g;

/**
 * @param {unknown} raw
 * @param {{ defaultCountry?: keyof typeof COUNTRY_CODES | string }} [options]
 * @returns {string | null}
 */
export function normalizePhone(raw, { defaultCountry = "DE" } = {}) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).replace(INVISIBLE, "").trim().replace(/^tel:/i, "");
  if (!s || /\p{L}/u.test(s)) return null;

  // "(0)" after a country code is a trunk prefix written for domestic readers.
  s = s.replace(/\(\s*0\s*\)/g, "");
  const international = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;

  let number;
  if (international) {
    number = digits;
  } else if (digits.startsWith("00")) {
    number = digits.slice(2);
  } else {
    const code = COUNTRY_CODES[/** @type {keyof typeof COUNTRY_CODES} */ (String(defaultCountry).toUpperCase())];
    if (!code) throw new Error(`normalizePhone: unknown default country "${defaultCountry}"`);
    number = code + (digits.startsWith("0") ? digits.slice(1) : digits);
  }

  for (const code of CODES_LONGEST_FIRST) {
    if (number.startsWith(code)) {
      if (TRUNK_ZERO.has(code) && number[code.length] === "0") number = code + number.slice(code.length + 1);
      break;
    }
  }

  if (number.length < 8 || number.length > 15) return null;
  return "+" + number;
}
