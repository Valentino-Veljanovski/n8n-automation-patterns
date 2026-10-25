# Scheduled summaries

Event-driven workflows do the work; scheduled ones tell people what happened. Three kinds recur in an operations system.

- **Day-before reminders.** Early in the morning, read the appointments table, keep the rows for tomorrow, send each customer a preparation message, log each send.
- **The daily summary.** At the end of the day, count what went out today, what is open for tomorrow and what has waited too long, and post one message.
- **Overdue escalation.** A few times a day, find rows that have waited longer than a threshold and have not been reminded yet, remind them, and set the flag that stops the next run from reminding again.

## A summary at zero

When nothing went out today and nothing is due tomorrow, the summary still gets posted with zeros. Silence is ambiguous: did the schedule fire, did the workflow break, or was there nothing to say? A line that reads "0 today, 0 tomorrow" answers the question. The summary script therefore returns an item even when it received none.

## A day is a day in a named time zone

"Today" is not the machine's date. n8n often runs in UTC; the operations team lives in Europe/Berlin. Taking the date from the server clock gives the wrong day for a few hours every night, and the wrong day across a daylight-saving switch. The summary asks `Intl.DateTimeFormat` for the calendar date in the team's zone and compares calendar parts, never time stamps. The clock itself is injected into the function, so the same input gives the same summary in a test.

## Dates in sheets are not one format

A date column that was typed by hand holds German `DD.MM.YYYY` next to ISO `YYYY-MM-DD` next to Excel serial numbers that appeared when someone changed the column type. The parser accepts all of them and returns calendar parts, so a real appointment is never dropped because its row was typed differently.

## How often

Once a day for anything anchored to a day. A few times a day for escalations that benefit from a faster reply. Hourly only when an external API with its own rate limit needs syncing. Not every minute: if a scheduled workflow does the same thing as an event-driven one, delete the scheduled one.

Implemented in: lib/summary (dayWindow, dailyStatusSummary), lib/dates (parseDate), dist/scheduled-summary
