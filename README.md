# n8n-automation-patterns

[![CI](https://github.com/Valentino-Veljanovski/n8n-automation-patterns/actions/workflows/ci.yml/badge.svg)](https://github.com/Valentino-Veljanovski/n8n-automation-patterns/actions/workflows/ci.yml)

The patterns here come from production n8n systems I built and operate. Everything in this repository was re-implemented for it: no employer code, data, identifiers or workflow exports.

This is the code an n8n Code node ends up holding between two integrations: reading a date that arrives in four formats, cleaning the text a mail client or a language model produced, turning phone numbers and addresses into one shape, finding a DocuSign envelope ID in a notification, parsing whatever Slack sent, and counting rows for a daily summary. The logic lives in `lib/` as plain functions with tests. Ten of the recurring Code nodes are built from those functions into `dist/`, one self-contained file each, ready to paste into a Code node. The functions were used in production dispatch and Slack automation systems.

## Modules

| Module | Functions |
|---|---|
| `lib/dates` | `parseDate` (German, ISO, English-month, Excel serial), `toIsoDay`, `formatDate`, `isSameDay`, `daysBetween`, `weekArchiveName` |
| `lib/text` | `stripInvisible`, `collapseWhitespace`, `decodeHtmlEntities`, `stripHtml`, `escapeHtml`, `truncate`, `safeFileName`, `documentFileName`, `safePath`, `cleanQuery`, `parseAmountDe`, `cleanAssistantReply` |
| `lib/phone` | `normalizePhone` to E.164 or null |
| `lib/email` | `extractEmail`, `isValidEmail`, `normalizeEmail`, `normalizeInboundMail`, `decideRoute` |
| `lib/docusign` | `extractEnvelopeId`, `parseConnectEvent`, `verifyHmac`, `getSignatureHeader` |
| `lib/llm` | `parseModelJson`, `sanitizeExtraction`, `buildPrompt`, `TOOL_REGISTRY` |
| `lib/slack` | `parseInteraction` (allow-list injected), `threadContext`, `normalizeMessage`, `routeCommand`, `checkUploadSize`, `buildHomeTab`, Block Kit builders |
| `lib/graph` | `createColumnMapper`, `columnMapperFromHeader`, `safeGet`, `sendMailPayload`, `splitBatches`, crawl queue, `rankFolders`, `formatFileResults`, `binaryFanOut` |
| `lib/approval` | `createApprovalGate(kind)` |
| `lib/summary` | `countBy`, `formatSlackSummary`, `dayWindow(timeZone, now)`, `categorySummary`, `dailyStatusSummary`, `caseReport` |

No function in `lib/` reads the clock; `now` is always passed in. The sources of the node scripts are in `nodes/`, the architecture notes in `docs/`.

## Using a script in n8n

A Code node cannot import local files, so each script in `dist/` has the library code inlined. To use one:

1. Add a Code node and set its mode to the one named in the first line of the script's header (Run Once for All Items, or Run Once for Each Item).
2. Paste the whole file from `dist/<name>.js` into the node.
3. Feed it the items the header's "Input" line describes; the "Output" line says what comes out.

| Script | Run mode | What it does | Built-ins |
|---|---|---|---|
| `dist/html-strip.js` | Run Once for All Items | mail body HTML to plain text, every item | none |
| `dist/batch-dedup.js` | Run Once for All Items | first item per key across the batch | none |
| `dist/column-map.js` | Run Once for All Items | sheet rows with German or English headers to one camelCase shape | none |
| `dist/binary-fan-out.js` | Run Once for All Items | one item per mail attachment | none |
| `dist/folder-path.js` | Run Once for All Items | safe folder and file names, service subfolder | none |
| `dist/scheduled-summary.js` | Run Once for All Items | the daily counts and the Slack message, also at zero input | none |
| `dist/extraction-sanitize.js` | Run Once for Each Item | clean a model's extraction, list what could not be cleaned | none |
| `dist/docusign-envelope.js` | Run Once for All Items | envelope ID from each notification mail | none |
| `dist/slack-interaction.js` | Run Once for All Items | one flat object from any Slack interaction, allow-list from `$env` or the item | none |
| `dist/approval-gate.js` | Run Once for Each Item | hold until a preview is approved | none |

None of the ten scripts needs a Node.js built-in module. Should a future script need one, its header will say so. On n8n Cloud, the Code node cannot import external npm modules and makes only the `crypto` and `moment` modules available (n8n docs, [Code node](https://docs.n8n.io/code/code-node/)). On a self-hosted instance, built-in modules are enabled with `NODE_FUNCTION_ALLOW_BUILTIN`, for example `NODE_FUNCTION_ALLOW_BUILTIN=crypto` (n8n docs, [Enable modules in Code node](https://docs.n8n.io/hosting/configuration/configuration-examples/modules-in-code-node/)).

The last line of every script is `return __node.run({ $input, $json, $, $env, now: new Date() })`: that is the only place the clock is read, and `$env` is only read by the scripts whose header lists a variable.

## Running the tests

Requirements: Node 20 or newer. No runtime dependencies.

```sh
npm ci
npm run lint
npm run typecheck
npm test
```

`npm test` runs the whole suite twice, once with `TZ=Pacific/Kiritimati` and once with `TZ=America/Los_Angeles`, so that no date function depends on where the machine stands. `npm run test:once` runs it a single time in the current zone.

Every node script is tested in both layers: the source `run()` under `test/helpers/n8n-context.js`, which emulates `$input`, `$json` and `$('…')`, and the built `dist/` file executed as a Code-node body. Both must return the same items.

### Differential tests

The functions were written from the behaviour of earlier snippet repositories, not copied from them. The tests under `test/differential/` prove equivalence: for every input those snippets document, the new function returns what the old one returned. Where the old behaviour was a bug, the test records the old output next to the new one. These tests load the old snippets from outside this repository and skip themselves unless `INPUT_DIR` points at the folder that holds the cloned snippet repositories:

```sh
INPUT_DIR=../input npm test
```

## Building the paste-ready scripts

```sh
npm run build
```

`scripts/build-nodes.mjs` bundles each `nodes/<name>.js` with esbuild (a dev dependency; the package itself has none) into an IIFE, repeats the header comment at the top and appends the single `return` line. The result in `dist/` is committed. CI rebuilds it and fails when the committed files differ from the sources, so `dist/` is never stale.

## Licence

MIT, see `LICENSE`.

Valentino Veljanovski · AI Automation Engineer · n8n · Microsoft 365
