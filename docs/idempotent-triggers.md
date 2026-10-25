# Idempotent triggers and side effects

A workflow will run twice. Someone clicks "Execute workflow" after the schedule already fired, a webhook is delivered again, or a run crashed halfway and is retried. Every side effect has to be safe to repeat.

## Mark before you delegate

A mail trigger that hands the message to a sub-workflow should mark the message as read, or move it to a processed folder, *before* delegating. If the sub-workflow is briefly unavailable, the trigger does not keep re-firing on the same message.

## Log before you send

For an SMS or email, write the log row first, then call the API, then update the same row with the result. A re-run finds the row and skips the send. Appending the log row after the call means a crash between the call and the append sends the message twice on retry.

## Update by key, do not append

A tracking sheet updated by "append" grows a duplicate on every retry. Updating the row by its key (envelope ID, booking ID) is the same operation the second time.

## A status is the idempotency check

When a signature completion arrives twice, the tracking row already says completed. The handler reads the status first and stops. The same goes for a reminder: a `ReminderSent` flag on the row is what stops the next scheduled run from sending the reminder again.

## Dedupe inside a batch

One batch may hold several bookings for the same project manager. The summary email to that manager should go out once. Deriving a stable key from the row (manager email plus name) and keeping only the first item per key, before the send node, makes the batch itself idempotent. The old approach, remembering keys in loop context between iterations, depended on execution order and was hard to test; a single pass over the batch is not.

## Include the day in what you post

A Slack summary that carries its date is obviously a duplicate when it is posted twice. A summary without one leaves the reader guessing.

Implemented in: lib/graph (binaryFanOut keeps one item per attachment), lib/dates (one date parser for the keys), dist/batch-dedup, dist/binary-fan-out
