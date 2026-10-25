# Webhook signature verification

A DocuSign Connect webhook marks a case as signed, downloads the document and tells the team the scan can start. If anyone can call that URL, anyone can mark a case as signed. DocuSign signs every request with HMAC-SHA256 over the raw body and puts the result in the `X-DocuSign-Signature-1` header. The endpoint verifies it before doing anything else.

## Hash the raw bytes

The signature covers the bytes DocuSign sent. A framework that parses the JSON and re-serialises it changes key order, whitespace or escapes, and the hash no longer matches. Verify against the raw body string, never against a parsed object. The verifier in this repository refuses an object for that reason.

## Headers are case-insensitive, object keys are not

HTTP says `x-docusign-signature-1` and `X-DocuSign-Signature-1` are the same header. JavaScript says they are different keys. Depending on the proxy in front of n8n, either spelling arrives. Look the header up case-insensitively.

## Compare in constant time

A plain string comparison stops at the first differing byte and takes measurably longer the more bytes match. `crypto.timingSafeEqual` compares every byte. The digest must never be compared with `===`.

## Keep the secret out of the workflow

The secret lives in an n8n credential or an environment variable, not in the Code node. Anyone who can read the workflow export can otherwise forge webhooks. DocuSign supports several secrets at once, so a rotation adds the new secret, lets both verify for a while, then removes the old one.

## Two ways in: webhook and email

The same completion also arrives as a notification email. That path needs no signature, but it needs a robust way to find the envelope ID, because DocuSign's email template has changed more than once. The extractor tries the link parameter first, then older parameters, then a path, then a label, then any UUID, and reports which strategy matched. A match on the last strategies is the signal to look at the template again.

Implemented in: lib/docusign (verifyHmac, getSignatureHeader, parseConnectEvent, extractEnvelopeId), dist/docusign-envelope
