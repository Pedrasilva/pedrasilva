# Project-expense blocker regressions

Run only on an empty isolated PostgreSQL copy of the public schema, with fixture `auth.users`, `auth.uid()`, `auth.role()` and `auth.jwt()` helpers. Never run against the app database. No production data is needed. The two applied migrations must be present before testing.

Use local socket `/tmp/bugs-db`, port 55439, database postgres (created exclusively for this test). Load `seed.sql` once, then run `branches.sql`, `company-card.sql`, and `intake-visibility.sql` with `psql -v ON_ERROR_STOP=1`. Every scenario rolls back. The only persistent local rows are fictitious auth/entity/permission setup; destroy the isolated database after the run.

- Branches: all ten actions, existing personal save/edit/receipt, idempotence, rejection/reapproval, batches, partial settlement/reversal, invoice/VAT/credit/receipt/reversal.
- Card: existing attached receipt, GBP 53.80 / EUR 63.70, edit/save/submit twice.
- Intake: PSA-only supplier, auto-match on current queue, explicit link, cross-entity refusals in both directions, Rioja-linked supplier.

Before the fix, the same card test reproduces `column reference "o.id" is ambiguous`; intake reproduces `Counterparty not visible in this entity`.
