# Speeding up the heavy finance and project screens

The slow-loading report is real: some screens ask the database for too much at once and the request is cut off before it finishes. Because the fix touches how several big screens load data, it needs your approval before I change anything.

## What the measurements show

- Time-entry reads are the biggest cost: over 500 requests, the slowest taking about 8 seconds.
- A task-and-allocation lookup runs over 2,000 times and is also slow.
- The screens most affected pull 1,000-2,000 rows in a single go (bank reconciliation, project financials, mailbox intake), and several other screens ask for every column of every row.

## What I would change

1. Add database indexes for the columns these screens filter and sort by (time entries by person, date and type; tasks by allocation; bank transactions by account and date; documents by direction and status).
2. Ask only for the columns each screen actually shows, instead of everything.
3. Load long lists in pages, with a "load more" control, and cap the date range on the finance screens to the selected period.
4. Move the heaviest roll-up calculations (period totals, project financial summaries) into the database so the browser receives a small summary instead of thousands of rows.

## Notes

- No change to what people can see or to any figures — only how the data is fetched.
- I would verify each change by re-measuring the slow queries afterwards.
