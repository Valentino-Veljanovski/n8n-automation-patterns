# n8n-automation-patterns

The patterns here come from production n8n systems I built and operate. Everything in this repository was re-implemented for it: no employer code, data, identifiers or workflow exports.

Plain JavaScript helpers for the work an n8n Code node ends up doing between integrations: reading dates that arrive in four formats, cleaning text a mail client or a language model produced, turning phone numbers and email addresses into one shape, pulling a DocuSign envelope ID out of a notification, and checking a webhook signature. Each function is pure, tested, and independent of the machine's time zone. Node wrappers that read `$input` and return items sit apart from the logic, so the logic can be tested without n8n.

## Modules

| Module | What it does | Status |
|---|---|---|
| `lib/dates` | `parseDate` for German, ISO, English-month and Excel-serial input; `toIsoDay`, `formatDate`, `isSameDay`, `daysBetween`, `weekArchiveName` | available |
| `lib/text` | `stripInvisible`, `collapseWhitespace`, `decodeHtmlEntities`, `stripHtml`, `escapeHtml`, `truncate`, `safeFileName`, `safePath`, `cleanQuery`, `parseAmountDe`, `cleanAssistantReply` | available |
| `lib/phone` | `normalizePhone` → E.164 or null | available |
| `lib/email` | `extractEmail`, `isValidEmail`, `normalizeEmail`, `normalizeInboundMail`, `decideRoute` | available |
| `lib/docusign` | `extractEnvelopeId`, `verifyHmac`, `getSignatureHeader`, `parseConnectEvent` | available |
| `lib/llm` | `parseModelJson`, `sanitizeExtraction` | available |
| `lib/llm` | `buildPrompt`, `toolRegistry` | planned |
| `lib/slack` | `parseInteraction` (allow-list injected), `threadContext`, `normalizeMessage`, `routeCommand`, Block Kit builders | planned |
| `lib/graph` | Excel column mapper, `sendMailPayload`, `splitBatches`, drive crawl queue, folder ranker, result formatter, binary fan-out | planned |
| `lib/approval` | `createApprovalGate(kind)` | planned |
| `lib/summary` | `countBy`, `formatSlackSummary`, `dayWindow(tz)` | planned |
| `nodes/` | one file per n8n Code node; the only place `$input`, `$json` and `$('…')` appear | planned |
| `docs/` | architecture notes | planned |

## Using a function

```js
import { parseDate, toIsoDay } from "n8n-automation-patterns/dates";
import { normalizePhone } from "n8n-automation-patterns/phone";

toIsoDay(parseDate("11.05.2026 14:30")); // "2026-05-11"
toIsoDay(parseDate(46153));              // "2026-05-11" (Excel serial)
normalizePhone("+49 (0) 89 1234567");    // "+49891234567"
```

Inside an n8n Code node the same code is pasted in; the `nodes/` folder will hold those wrappers.

## Running the tests

Requirements: Node 20 or newer. No runtime dependencies.

```sh
npm ci
npm run lint
npm run typecheck
npm test
```

`npm test` runs the whole suite twice, once with `TZ=Pacific/Kiritimati` and once with `TZ=America/Los_Angeles`, so that no date function depends on where the machine stands. `npm run test:once` runs it a single time in the current zone.

### Differential tests

The functions were written from the behaviour of earlier snippet repositories, not copied from them. The tests under `test/differential/` prove equivalence: for every input those snippets document, the new function returns what the old one returned. Where the old behaviour was a bug, the test records the old output next to the new one. These tests load the old snippets from outside this repository and skip themselves unless `INPUT_DIR` points at the folder that holds the cloned snippet repositories:

```sh
INPUT_DIR=../input npm test
```

## Licence

MIT, see `LICENSE`.

Valentino Veljanovski · AI Automation Engineer · n8n · Microsoft 365
