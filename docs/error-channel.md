# One error channel

A silent failure in an operations workflow is found by the customer. The reminder did not go out, nobody noticed, and the complaint arrives the next day. Two habits prevent that.

## Fail loudly inside Code nodes

A Code node that cannot do its job should throw with a message a person can act on: the row index, the field that was missing, the subject of the mail it could not read. "Row 17: missing BookingID" tells the operator where to look. "[object Object]" and "Cannot read properties of undefined" tell them nothing. Returning a half-filled item instead of throwing is worse than either: the bad row travels on, is written to a sheet, and is discovered weeks later.

The scripts in this repository follow that rule. A body without content, a row without a booking ID, a notification without an envelope ID stop the run and say why.

## Report what you could not fix

Some values are not errors but still need eyes: an email address the model extracted that does not validate, a date it wrote in a shape nobody recognises. The sanitiser keeps the run going, sets the field to an empty value or the cleaned text, and lists every such field in an `_issues` array on the item. The node after it can route items with issues to a review channel without the workflow stopping for a typo.

## One channel for every workflow

Every workflow gets the same catch path: post to one private Slack channel with the workflow name, the failing step, the error message and the link to the execution. One channel, read once in the morning, is the operations checklist. Ten channels are ten places to forget.

Implemented in: lib/llm (sanitizeExtraction returns values and issues), dist/extraction-sanitize, dist/html-strip, dist/column-map, dist/docusign-envelope
