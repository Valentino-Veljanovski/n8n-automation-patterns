# The App Home as a per-user dashboard

The App Home tab is the private space between a Slack app and one user. `views.publish` with that user's ID replaces what that one person sees. It is the natural place for a dashboard with action buttons, and it is rendered fresh every time the user opens it.

## Render per user, per role

The `app_home_opened` event carries the user's ID. The workflow looks the user up in a users sheet, then renders one of three things: an access-denied block when there is no row, a deactivated block when the row says so, or the role's block list. Quick actions appear for everyone; reports for admins; user management for the super admin. The greeting follows the hour in the team's time zone, not the server's.

## Not the security boundary

Hiding a button does not stop anyone from sending the button's payload to the interactions URL by hand. The interaction router checks the user's role again before it runs anything. The home tab is a convenience for the eyes; the check in the router is the control.

## Read the sheet through a column mapper

Rows from Microsoft Graph arrive as positional arrays. `row.values[0][6]` works until someone inserts a column, and then every index after it points at the wrong data without an error. A column mapper built from the header row resolves names to positions once; the renderer asks for `role` and `active`, never for an index. Renaming or reordering a column changes nothing in the renderer. The same mapper serves the reports that aggregate case rows.

## What it is not

Not real time: the tab re-renders when the user opens it. Not a BI tool: Block Kit is text, buttons and simple selects. Not stateful: every render starts from the sheet.

Implemented in: lib/slack (buildHomeTab, findUserBySlackId, blockkit), lib/graph (columnMapperFromHeader), dist/column-map
