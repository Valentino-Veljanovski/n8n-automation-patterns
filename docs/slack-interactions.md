# Slack interactions through one entry point

Slack sends every interaction of an app to one URL. Button clicks and modal submissions arrive as a URL-encoded `payload` field holding JSON. Events API events arrive as a body with an `event` object. Slash commands arrive as form fields. The user's ID sits in a different place in each: `payload.user.id`, `event.user` (a bare string), `user_id`.

## Extract once, decide once

One Code node at the start of the router reads whichever shape arrived and returns a flat object: type, trigger type, user ID and name, channel, trigger ID, action ID, callback ID, the modal's state and private metadata, and the permission the action implies (`view` for a click, `create` for a submission or a command, `delete` when the action ID says so). Every node after it reads that object and never looks at the raw payload. The five shapes handled are block actions, modal submission, modal close, slash command and event; a new one is one more branch in that node.

## The allow-list is injected

The old parsers kept the allowed user IDs in a literal array inside the node. That is operational state inside code: changing the team means editing and redeploying a workflow, and every copy of the parser is one more list to forget. The parser in this repository has no default list at all. The caller passes a `Set` of IDs, read from an environment variable or a configuration item, and a missing list stops the run instead of letting everyone in. Super-admin IDs are a second injected list, useful to bootstrap the first user and to recover when the users sheet is damaged.

## Context travels in private_metadata

A modal does not remember why it was opened. When the router opens one, it writes the region, the action and the requesting user into the view's `private_metadata`. Slack returns that string unchanged on submission, and the parser reads it back. No session state is kept between the two requests.

## Action IDs carry the region

Buttons are named `<action>_<regionKey>`: `search_region_a`, `report_all`. The parser splits on the first underscore and maps the key to a label. One naming convention, no routing table to keep in sync.

## Answer Slack first, work second

Slack expects a quick acknowledgement and retries otherwise. Anything that reads several sheets responds first and posts the result afterwards with a follow-up message or a view update.

Implemented in: lib/slack (parseInteraction, blockkit), dist/slack-interaction
