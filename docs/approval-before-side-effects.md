# Human approval before side effects

Draft first, show the preview, execute only after a person approved it. The rule applies wherever a workflow would otherwise send email, delete a contact or change a calendar on its own.

## Why

Natural language is ambiguous. A contact name matches two people; a date is read the wrong way round; a tone comes out too casual. The preview is where that gets caught, before anything leaves the system.

## The gate

A preview is an object with a type, a status, the fields to review and the actions a person may take. It starts as `awaiting_approval`. A click in Slack sets it to `approved`. Only a preview of the expected type with that status releases the action; anything else holds. One gate implementation covers both uses in this repository, the executive-assistant email flow and the routed-mail reply flow, differing only in wording and action names.

## A trigger word that cannot be said by accident

Inside a case thread, the email-drafting agent sends only when the user types the trigger word on its own. The word is uppercase and specific, so "please send it tomorrow" never triggers a send. The system prompt states the rule, and the prompt is rebuilt from the case fields and the thread on every turn, so the agent has no memory to drift in.

## One tool

The drafting agent has one tool: send through Outlook. It cannot read the sheet or search anything. A narrow tool set is what makes the gate meaningful.

Implemented in: lib/approval (createApprovalGate), lib/llm (buildPrompt), dist/approval-gate
