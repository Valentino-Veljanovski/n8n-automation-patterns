# What the n8n task runner executes

A Code node in n8n 2.x runs its code in a JavaScript task runner, not in the main process. The runner is a sandbox with its own rules, and a script that passes in Node can still fail there. This note records what was observed and the rule the build follows because of it.

## The observation

Date: 25 October 2026. Host: n8n 2.44.6, self-hosted in Docker. The first build of `dist/` in this repository bundled each script as an IIFE whose result was an export object, the way esbuild emits one, and ended with `return __node.run(...)`. Pasted into a Code node in Run Once for All Items mode, with five fixture items, the node failed:

```
TypeError: __node.run is not a function [line 63]
```

thrown in `JsTaskRunnerSandbox.runCodeAllItems`. A probe in the same runner, with the results verbatim:

| Code in the node | Result |
|---|---|
| `Object.defineProperty(out, "run", { get: () => run, enumerable: true })` | `typeof out.run` is `"undefined"`; `Object.keys(out)` is `[]` |
| `return { run }` | `typeof` is `"function"` |
| `typeof $json` in Run Once for All Items mode | `"object"` (defined; reading it does not throw) |

`Object.defineProperty` has no effect inside the runner sandbox.

## Why a bundler's export object breaks there

esbuild, and other bundlers, build the export object of a module with `Object.defineProperty`: an `__export` helper defines a getter per exported name, and `__toCommonJS` copies them onto the object the IIFE returns. In the runner those calls do nothing, so the returned object has no `run` property and the final line fails with the error above. The 179 tests that were green before this was found ran the same file through `new Function` in Node, where `defineProperty` works. An emulator proves the logic, never the host.

## The rule

Every file in `dist/` holds plain declarations only, and one top-level `return`:

- The build emits an ES module and strips its `export { run }` line, so what remains is `function` and `var` declarations.
- The build fails if anything else remains: an import or export statement, `defineProperty`, `__defProp`, `__export`, `__toCommonJS`, `__esModule`, `__name(` or `__node`.
- The last line calls `run` directly with what the header's "Reads:" line names, and that line is the only clock read.
- The tests run each dist file in a vm context modelled on the probe (`Object.defineProperty` and `Object.defineProperties` replaced by no-ops, the Object, Array and Function prototypes frozen, no Node globals) and compare the result with the source `run()`.

The model is built from one probe on one version. It is modelled on the runner, not identical to it. A claim that a script runs in n8n needs a run in n8n, with the version and the date.

Implemented in: scripts/build-nodes.mjs (stripExports, wrapperFor), test/helpers/n8n-context.js (runCodeNodeLikeRunner), test/nodes.test.js (B1, B3, B4, W1, W2)

## Verification

29 October 2026, n8n 2.45.6, self-hosted in Docker Desktop on Windows. The rebuilt `dist/` files (plain declarations, one `return`, commit 8364c08) were pasted into Code nodes of one workflow with a Manual Trigger and three branches:

| Script | Mode | Input | Result |
|---|---|---|---|
| `dist/batch-dedup.js` | Run Once for All Items | 5 fixture items, 3 keys | 3 items (ids 1, 2, 4), each with `_dedupKey` |
| `dist/approval-gate.js` | Run Once for All Items (the node's default; not the script's mode, see Run-mode validation) | 1 email draft, `gateKind: "email"` | 1 item, `action: "hold_draft"`, preview `reply_preview` / `awaiting_approval`. Not a verification of this script |
| `dist/scheduled-summary.js` | Run Once for All Items | the trigger's single empty item | 1 item, `counts` 0/0/0, the summary message |

The same three branches ran a second time with `N8N_BLOCK_ENV_ACCESS_IN_NODE=true` on the instance (checked with `printenv` inside the container) and returned identical items; the `readEnv` helper in `scheduled-summary` caught the blocked access and the script used its defaults. The seven other scripts have not been run in n8n yet. The probe above was made on 2.44.6; the new `dist/` files were only run on 2.45.6.

## Run-mode validation

21 November 2026, n8n 2.45.6, self-hosted in Docker Desktop on Windows. The export of the workflow above showed no `mode` parameter on the `dist/approval-gate.js` node. n8n's default is Run Once for All Items, so the run of 29 October was not in the script's own mode. With one input item the output looked right, and nobody checked the mode. An earlier version of this note listed that run as Run Once for Each Item. That was wrong.

With the node switched to Run Once for Each Item and the same input, n8n refused the code before running it:

```
Can't use .first() here [line 76, for item 0]
This is only available in 'Run Once for All Items' mode
```

Line 76 of that `dist/approval-gate.js` read the current item as `$json ?? ($input.item ?? $input.first())?.json`. `dist/extraction-sanitize.js` had the same fallback. Both Each-Item scripts therefore failed in the mode their header names. The tests were green because the harness executed the code, and n8n checks the source text first.

The check, from n8n's source at tag `n8n@2.45.6`, `packages/nodes-base/nodes/Code/JsCodeValidator.ts`, lines 8 to 36, called from `runCodeForEachItem` in `JsTaskRunnerSandbox.ts`, line 79:

```ts
const match = code.match(/\$input\.(?<disallowedMethod>first|last|all|itemMatching)/);
```

It looks at the text, not at what runs: a fallback that is never reached is rejected, and so is a mention in a comment when a code line contains the same word. Only the `.first()` case was observed in n8n; `last`, `all` and `itemMatching` are read from that source.

Reading the same tag showed a second fault that the first one had hidden. Both scripts returned an array holding one item. In Each Item mode the runner takes the returned value as one item (`packages/@n8n/task-runner/src/js-task-runner/js-task-runner.ts`, lines 443 to 463 and 517 to 528), and the node then requires the item's `json` to be an object (`packages/nodes-base/nodes/Code/result-validation.ts`, lines 86 to 124). By that source an array is rejected with `A 'json' property isn't an object`. This was read, not observed in n8n: the scripts never got that far.

The rule that follows:

- An Each-Item script never contains `$input.first`, `$input.last`, `$input.all` or `$input.itemMatching`, not even in a comment. It reads the current item from `$json`, with `$input.item` as the only fallback.
- An Each-Item script returns one item, `{ json }`. An All-Items script returns an array of items.
- The tests run every dist file in the mode its header names. For Each Item that means the source check above, one run per input item, and the result check.
- Every run in n8n records the mode from the node itself, next to the version and the date. A run in another mode is not a verification.

Both scripts were fixed on 21 November 2026 (commit 66d76bb).

### Verification of the Each-Item scripts

21 November 2026, n8n 2.45.6, self-hosted in Docker Desktop on Windows. The `dist/` files of commit 66d76bb were pasted into Code nodes of the same workflow. The mode was read from each node.

| Script | Mode | Input | Result |
|---|---|---|---|
| `dist/approval-gate.js` | Run Once for Each Item | 1 email draft (`recipient`, `subject`, `body`), `gateKind: "email"` | 1 item, `action: "hold_draft"`, the manual-approval message, preview `reply_preview` / `awaiting_approval` with the draft's three fields and the actions `approve_send`, `decline`, `manual_review`; no `gateKind` in the preview |
| `dist/extraction-sanitize.js` | Run Once for Each Item | 2 items: one extraction under `json.output`, one directly in `json` with an invalid email | 2 items, equal field for field to what the test expects: the first clean with an empty `_issues`, the second with `customerEmail: ""` and one issue of kind `email` |

The same `dist/extraction-sanitize.js` node with the same two input items in the default mode, Run Once for All Items, returned 1 item, the first extraction only. That is the wrong mode for this script: it does not fail there, it drops every item after the first.

Neither of the two scripts was run with `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`. Neither reads `$env`.

Implemented in: nodes/approval-gate.js, nodes/extraction-sanitize.js, test/helpers/n8n-context.js (validateRunForEachSource, runCodeNodeInMode), test/nodes.test.js (M1 to M5)
