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
