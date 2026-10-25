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
 * Uses:       lib/docusign extractEnvelopeId
 * Built-ins:  none
 */
import { extractEnvelopeId } from "../lib/docusign/envelope.js";

/**
 * @param {{ $input: { all: () => any[] } }} ctx
 */
export function run({ $input }) {
  return $input.all().map((item) => {
    const json = item?.json ?? {};
    const subject = String(json.subject ?? "").trim();
    const found = extractEnvelopeId(json);
    if (!found) throw new Error(`docusign-envelope: no envelope ID found in message "${subject}"`);
    return { json: { envelopeId: found.id, source: found.source, sourceSubject: subject } };
  });
}
