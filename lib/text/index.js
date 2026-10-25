/**
 * String cleaning for data that arrives from spreadsheets, email clients,
 * Slack and language models. Every function accepts null/undefined and
 * returns a string.
 */

const INVISIBLE = /[\u200B-\u200D\uFEFF\u00AD\u2060]/g;

/** @param {unknown} value */
function str(value) {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * Removes zero-width characters and soft hyphens, then trims.
 * @param {unknown} value
 */
export function stripInvisible(value) {
  return str(value).replace(INVISIBLE, "").trim();
}

/**
 * Collapses every run of whitespace (line breaks, tabs, nbsp included) to a
 * single space and trims.
 * @param {unknown} value
 */
export function collapseWhitespace(value) {
  return str(value).replace(/\s+/g, " ").trim();
}

/** @type {Record<string, string>} */
const NAMED_ENTITIES = {
  lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00A0",
  euro: "€", pound: "£", yen: "¥", cent: "¢", copy: "©", reg: "®", trade: "™",
  ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", bull: "•", middot: "·",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", sbquo: "‚", bdquo: "„",
  szlig: "ß", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü",
  eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", aacute: "á", acirc: "â",
  ccedil: "ç", ntilde: "ñ", oacute: "ó", ograve: "ò", uacute: "ú", ugrave: "ù", iacute: "í",
  deg: "°", sect: "§", para: "¶", times: "×", divide: "÷", plusmn: "±", frac12: "½",
  zwj: "\u200D", zwnj: "\u200C", shy: "\u00AD",
};

/**
 * Decodes numeric entities first, then named ones, and `&amp;` last so that
 * "&amp;lt;" becomes "&lt;" and not "<".
 * @param {unknown} value
 */
export function decodeHtmlEntities(value) {
  return str(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([A-Za-z][A-Za-z0-9]{1,8});/g, (whole, name) => (name === "amp" ? whole : NAMED_ENTITIES[name] ?? whole))
    .replace(/&amp;/g, "&");
}

const BLOCK_TAGS = new Set([
  "p", "div", "br", "tr", "li", "ul", "ol", "table", "thead", "tbody", "tfoot",
  "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "hr", "pre", "section",
  "article", "header", "footer", "address", "dd", "dt", "dl", "fieldset", "form",
]);

// One tag, quoted attribute values may contain ">".
const TAG_RE = /<\/?([A-Za-z][A-Za-z0-9:-]*)(?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*\s*\/?>/g;

/**
 * HTML → plain text. Drops comments (Outlook's conditional comments
 * included), style/script/head blocks, then tags; block-level tags become
 * line breaks. Entities are decoded, lines trimmed, blank runs reduced to
 * one empty line.
 * @param {unknown} value
 */
export function stripHtml(value) {
  const text = str(value)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[endif\]>/gi, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<(style|script|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(TAG_RE, (_, name) => (BLOCK_TAGS.has(String(name).toLowerCase()) ? "\n" : ""));
  return decodeHtmlEntities(text)
    .replace(/\r\n?/g, "\n")
    .replace(/\u00A0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** @param {unknown} value */
export function escapeHtml(value) {
  return str(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Shortens to `max` code points; the ellipsis counts towards the limit.
 * @param {unknown} value
 * @param {number} max
 * @param {string} [ellipsis]
 */
export function truncate(value, max, ellipsis = "…") {
  const chars = Array.from(str(value));
  if (chars.length <= max) return chars.join("");
  const keep = Math.max(0, max - Array.from(ellipsis).length);
  return chars.slice(0, keep).join("") + ellipsis;
}

const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const FALLBACK_STEM = "Dokument";

/**
 * UTF-8 byte length computed here, because a Code node's sandbox does not
 * promise Node's byte-length helpers. A lone surrogate counts 3 bytes, as
 * its replacement character would.
 * @param {string} s
 */
function byteLength(s) {
  let bytes = 0;
  for (const ch of s) {
    const cp = /** @type {number} */ (ch.codePointAt(0));
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/**
 * A file name that Windows, SharePoint and OneDrive accept: letters of any
 * script, digits, space, `_ . -`; no trailing dots or spaces; reserved
 * device names get a `_` suffix; the stem is shortened by code points until
 * stem + extension fit in `maxBytes` (UTF-8). An empty stem becomes
 * "Dokument".
 * @param {unknown} name
 * @param {{ ext?: string, maxBytes?: number }} [options]
 */
export function safeFileName(name, { ext = "", maxBytes = 255 } = {}) {
  let stem = stripInvisible(name);
  if (ext && stem.toLowerCase().endsWith(ext.toLowerCase())) stem = stem.slice(0, -ext.length);
  stem = stem
    .replace(/[^\p{L}\p{M}\p{N} _.-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  if (!stem) stem = FALLBACK_STEM;
  if (RESERVED_NAMES.test(stem)) stem += "_";
  const budget = maxBytes - byteLength(ext);
  let chars = Array.from(stem);
  while (chars.length > 1 && byteLength(chars.join("")) > budget) chars.pop();
  stem = chars.join("").replace(/[. ]+$/, "") || FALLBACK_STEM;
  return stem + ext;
}

/**
 * `<documentType>_<folderName><ext>` through safeFileName; a missing
 * documentType reads "Dokument".
 * @param {{ documentType?: unknown, folderName?: unknown }} parts
 * @param {string} [ext]
 */
export function documentFileName({ documentType, folderName } = {}, ext = ".pdf") {
  const type = collapseWhitespace(documentType) || FALLBACK_STEM;
  const folder = collapseWhitespace(folderName);
  return safeFileName(folder ? `${type}_${folder}` : type, { ext });
}

/**
 * A folder or path segment: characters illegal in Windows/SharePoint paths
 * become "-", whitespace collapses, trailing dots and spaces go.
 * @param {unknown} value
 */
export function safePath(value) {
  return stripInvisible(value)
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
}

/** Words that describe a file type rather than its content (EN + DE). */
export const FILE_TYPE_WORDS = new Set([
  "image", "images", "photo", "photos", "picture", "pictures",
  "bild", "bilder", "foto", "fotos",
  "pdf", "pdfs", "document", "documents", "dokument", "dokumente",
  "email", "emails", "e-mail", "e-mails", "mail", "mails",
  "excel", "spreadsheet", "word", "txt", "text",
  "file", "files", "datei", "dateien",
]);

/**
 * Removes file-type words from a natural-language search request.
 * @param {unknown} value
 * @param {{ stopWords?: Set<string>, lowercase?: boolean }} [options]
 */
export function cleanQuery(value, { stopWords = FILE_TYPE_WORDS, lowercase = true } = {}) {
  const text = lowercase ? stripInvisible(value).toLowerCase() : stripInvisible(value);
  return text
    .split(/\s+/)
    .filter((word) => word && !stopWords.has(word.toLowerCase()))
    .join(" ")
    .trim();
}

/**
 * Prepares a folder hint for a Microsoft Graph search string: slashes
 * become spaces, quotes are dropped, whitespace collapses.
 * @param {unknown} value
 */
export function cleanFolderQuery(value) {
  return collapseWhitespace(stripInvisible(value).replace(/[/\\]/g, " ").replace(/['"]/g, ""));
}

/**
 * "1.234,56" → 1234.56, "1234.56" → 1234.56, "€ 500" → 500, "1,234.56" →
 * 1234.56, missing or unreadable → 0. The last separator wins as decimal
 * mark when both appear; a lone "." followed by exactly three digits is a
 * thousands separator (German).
 * @param {unknown} value
 */
export function parseAmountDe(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let s = stripInvisible(value).replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma !== -1) {
    s = (s.match(/,/g) ?? []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot !== -1) {
    const dots = (s.match(/\./g) ?? []).length;
    if (dots > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// A filler only counts when the whole phrase stands alone before punctuation
// or whitespace, so "Surely" and "Sure thing" survive.
const FILLER_RE = /^(?:sure|of course|certainly|absolutely|here is what i found|here's what i found|i can help with that)(?=[\s!.,:;])[!.,:;]*\s*/i;

/**
 * Trims a model reply for posting: leading filler phrases go, long blank
 * runs shrink to one empty line. Nothing inside the text is rewritten.
 * @param {unknown} value
 */
export function cleanAssistantReply(value) {
  let text = str(value).trim();
  for (let i = 0; i < 3; i++) {
    const next = text.replace(FILLER_RE, "");
    if (next === text) break;
    text = next;
  }
  return text.replace(/\n{3,}/g, "\n\n").trim();
}
