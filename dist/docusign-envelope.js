/**
 * Run mode:   Run Once for All Items
 * Script:     docusign-envelope — the envelope ID out of each DocuSign
 *             notification email, tried in order of reliability (m= link
 *             parameter, envelopeId= parameter, envelopes/<id> path,
 *             "Envelope ID:" label, any UUID)
 * Input:      mail items from the Outlook trigger: json.subject, json.body
 *             ({ content } or string) or json.bodyPreview
 * Output:     one item per mail: json = { envelopeId, source, sourceSubject }
 *             A mail without an envelope ID stops the run and names the subject,
 *             so the operator can inspect it. `source` = "loose" or "label"
 *             is the signal that DocuSign changed its template.
 * Reads:      $input
 * Uses:       lib/docusign extractEnvelopeId
 * Built-ins:  none
 */
// lib/text/index.js
function str(value) {
  return value === null || value === void 0 ? "" : String(value);
}
var NAMED_ENTITIES = {
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\xA0",
  euro: "\u20AC",
  pound: "\xA3",
  yen: "\xA5",
  cent: "\xA2",
  copy: "\xA9",
  reg: "\xAE",
  trade: "\u2122",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  laquo: "\xAB",
  raquo: "\xBB",
  bull: "\u2022",
  middot: "\xB7",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  sbquo: "\u201A",
  bdquo: "\u201E",
  szlig: "\xDF",
  auml: "\xE4",
  ouml: "\xF6",
  uuml: "\xFC",
  Auml: "\xC4",
  Ouml: "\xD6",
  Uuml: "\xDC",
  eacute: "\xE9",
  egrave: "\xE8",
  ecirc: "\xEA",
  agrave: "\xE0",
  aacute: "\xE1",
  acirc: "\xE2",
  ccedil: "\xE7",
  ntilde: "\xF1",
  oacute: "\xF3",
  ograve: "\xF2",
  uacute: "\xFA",
  ugrave: "\xF9",
  iacute: "\xED",
  deg: "\xB0",
  sect: "\xA7",
  para: "\xB6",
  times: "\xD7",
  divide: "\xF7",
  plusmn: "\xB1",
  frac12: "\xBD",
  zwj: "\u200D",
  zwnj: "\u200C",
  shy: "\xAD"
};
function decodeHtmlEntities(value) {
  return str(value).replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec))).replace(/&([A-Za-z][A-Za-z0-9]{1,8});/g, (whole, name) => name === "amp" ? whole : NAMED_ENTITIES[name] ?? whole).replace(/&amp;/g, "&");
}

// lib/docusign/envelope.js
var UUID = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";
var STRATEGIES = [
  { source: "query-m", re: new RegExp(`[?&]m=${UUID}`, "i") },
  { source: "query-envelopeId", re: new RegExp(`[?&]envelopeId=${UUID}`, "i") },
  { source: "path", re: new RegExp(`envelopes/${UUID}`, "i") },
  { source: "label", re: new RegExp(`envelope\\s*id\\s*[:\\-]?\\s*${UUID}`, "i") },
  { source: "loose", re: new RegExp(UUID, "i") }
];
function textOf(input) {
  if (typeof input === "string") return input;
  if (!input || typeof input !== "object") return "";
  const body = input.body;
  if (body && typeof body === "object" && typeof body.content === "string") return body.content;
  if (typeof body === "string") return body;
  return typeof input.bodyPreview === "string" ? input.bodyPreview : "";
}
function extractEnvelopeId(input) {
  const text = decodeHtmlEntities(textOf(input));
  if (!text) return null;
  for (const { source, re } of STRATEGIES) {
    const m = re.exec(text);
    if (m) return { id: m[1].toLowerCase(), source: (
      /** @type {any} */
      source
    ) };
  }
  return null;
}

// nodes/docusign-envelope.js
function run({ $input }) {
  return $input.all().map((item) => {
    const json = item?.json ?? {};
    const subject = String(json.subject ?? "").trim();
    const found = extractEnvelopeId(json);
    if (!found) throw new Error(`docusign-envelope: no envelope ID found in message "${subject}"`);
    return { json: { envelopeId: found.id, source: found.source, sourceSubject: subject } };
  });
}
return run({ $input, $: $, now: new Date() });
