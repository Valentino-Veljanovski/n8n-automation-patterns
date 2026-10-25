/**
 * Microsoft Graph sendMail bodies and attachment batching.
 */

/** @param {string} address */
const recipient = (address) => ({ emailAddress: { address } });

/**
 * @typedef {Object} Attachment
 * @property {string} name
 * @property {string} [contentType]
 * @property {string} contentBytes base64
 */

/**
 * Body for `POST /users/{id}/sendMail`.
 * @param {{ subject: string, bodyHtml?: string, bodyText?: string, to: string | string[], cc?: string[], bcc?: string[], from?: string, attachments?: Attachment[], saveToSentItems?: boolean }} options
 */
export function sendMailPayload({ subject, bodyHtml, bodyText, to, cc, bcc, from, attachments, saveToSentItems = true }) {
  const toList = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!toList.length) throw new Error("sendMailPayload: at least one recipient is required");
  /** @type {Record<string, any>} */
  const message = {
    subject: String(subject ?? ""),
    body: bodyHtml !== undefined ? { contentType: "HTML", content: bodyHtml } : { contentType: "Text", content: String(bodyText ?? "") },
    toRecipients: toList.map(recipient),
  };
  if (cc?.length) message.ccRecipients = cc.map(recipient);
  if (bcc?.length) message.bccRecipients = bcc.map(recipient);
  if (from) message.from = recipient(from);
  if (attachments?.length) {
    message.attachments = attachments.map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.name,
      contentType: a.contentType ?? "application/octet-stream",
      contentBytes: a.contentBytes,
    }));
  }
  return { message, saveToSentItems };
}

/**
 * Packs files into consecutive batches whose byte sum stays under
 * `limitBytes`; a single file larger than the limit travels alone.
 * @param {{ name: string, sizeBytes?: number, contentType?: string, contentBytes: string }[]} files
 * @param {{ limitBytes: number }} options
 * @returns {{ batchNumber: number, totalBatches: number, attachmentCount: number, attachments: Required<Attachment>[] }[]}
 */
export function splitBatches(files, { limitBytes } = /** @type {any} */ ({})) {
  if (!Number.isFinite(limitBytes) || limitBytes <= 0) throw new Error("splitBatches: limitBytes (a positive number) is required");
  /** @type {Required<Attachment>[][]} */
  const batches = [];
  /** @type {Required<Attachment>[]} */
  let current = [];
  let size = 0;
  for (const file of files ?? []) {
    const bytes = Number(file.sizeBytes ?? 0);
    if (current.length && size + bytes > limitBytes) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push({ name: file.name, contentType: file.contentType ?? "application/pdf", contentBytes: file.contentBytes });
    size += bytes;
  }
  if (current.length) batches.push(current);
  return batches.map((attachments, i) => ({
    batchNumber: i + 1,
    totalBatches: batches.length,
    attachmentCount: attachments.length,
    attachments,
  }));
}
