# Splitting workflows by coupling

n8n lets any number of triggers and branches share one canvas. The question is never whether a system *can* live in one workflow, but which parts belong together.

## The rule

Two responsibilities belong in the same workflow when they are **temporally coupled**: they run at the same time on the same data. They belong in separate workflows when they are **causally coupled**: one causes the other, and the time in between is not under your control.

A daily summary that counts three things from the same two sheets is temporally coupled. Reading the sheets once and computing three counts is cheaper and simpler than three workflows reading the same sheets three times. It stays one workflow with one schedule trigger and one error handler.

Sending a document for signature and reacting to the signature are causally coupled. The customer signs minutes or days later. A workflow that sends and then waits would hold an execution open for days and hit its timeout. So the send side writes the envelope ID to a tracking row and ends, and a second workflow, triggered by the completion notification, picks the row up by that ID.

## Splitting by trigger type

A Slack tool usually has three different entry points: the Events API (someone opened the App Home), the interactions URL (someone clicked a button or submitted a modal), and a third-party webhook such as DocuSign Connect. Each has its own latency expectation. The home tab should render while the user is still looking; a webhook only needs a quick acknowledgement. Keeping them in separate workflows means a slow path in one cannot make another feel broken, and a change to signature verification cannot break modal handling.

## One router, not one workflow per action

Every Slack interaction arrives in the same envelope and goes through the same prefix: parse the payload, decide whether the user is allowed, work out the region and the action. If each action were its own workflow, that prefix would be copied into each of them, and the allow-list would live in several places. One router workflow keeps the prefix in one place and branches after it. When the router grows too large to read, the escape hatch is to keep the parser and dispatcher and move each action behind an `executeWorkflow` call.

## Search, crawl, deliver

A document search assistant splits the same way: a search workflow that decides, a crawl workflow that traverses with a hard limit, and a delivery workflow that downloads and uploads. Each can be tested on its own and called from another workflow.

Implemented in: lib/summary (one aggregation over merged rows), lib/slack (one parser for every interaction shape), dist/scheduled-summary, dist/slack-interaction
