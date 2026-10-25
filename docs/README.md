# Architecture notes

Short notes on the decisions behind the code in `lib/` and the scripts in `dist/`. Each note ends with where the idea is implemented.

- [Splitting workflows by coupling](modular-split.md): when two things belong in one workflow and when they do not.
- [Idempotent triggers and side effects](idempotent-triggers.md): making a re-run harmless.
- [One error channel](error-channel.md): loud failures, one place to read them.
- [Scheduled summaries](scheduled-summaries.md): a summary at zero, a day defined in a named time zone.
- [Webhook signature verification](hmac-verification.md): proving a DocuSign Connect call is real.
- [Slack interactions through one entry point](slack-interactions.md): five payload shapes, one parser, an injected allow-list.
- [The App Home as a per-user dashboard](app-home-pattern.md): role-based rendering that is not the security boundary.
- [Bounded crawl as a fallback](crawl-fallback.md): the cheapest search first, a hard limit on the expensive one.
- [Human approval before side effects](approval-before-side-effects.md): preview, approve, execute.
- [What the n8n task runner executes](runner-sandbox.md): the probe in n8n 2.44.6, why a bundler export object is dead there, plain declarations only.
