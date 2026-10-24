# Marketing Planner — A only

Readiness and clearance remain computed warnings, not approval, request, scheduling or Instagram publishing gates. Existing approval content hashes, role checks, private assets, send locks and ambiguous-response protection remain intact.

## Saved evidence
- `src/routes/_app.marketing.posts.tsx`, line 646: `<Button size="sm" onClick={approve} disabled={saving}>`.
- `src/components/marketing/post-approval-controls.tsx`: request disabled only while busy; approver confirmation uses the named-client warning dialog.
- `src/components/marketing/draft-warning-confirm.tsx`: review current/edited content, show the specific confidentiality concern, save edits and confirm the exact hash before approval.
- `src/i18n/locales/{en,pt-PT}/marketing.json`: advisory wording and confirmation labels.
- `drizzle/migrations/0174_marketing_advisory_approvals.sql` and matching `supabase/migrations/20261024143500_marketing_advisory_approvals.sql`.
- `drizzle/migrations/0175_marketing_warning_evidence_guards.sql` and matching `supabase/migrations/20261024144600_marketing_warning_evidence_guards.sql`.
- `scripts/test-marketing-advisory-approvals.sql`, `AGENTS.md`, `src/lib/marketing/AGENTS.md`, `roadmap.md`, generated database types.

## Verification
- Browser: a disposable Instagram copy of an existing unknown-clearance draft was approved while readiness remained `needs_approval`, with actor/time/hash/note recorded, then scheduled for 2099. It was deleted before ending the test; no publication occurred.
- Browser: a disposable project/copy containing a forbidden place name showed the precise confidentiality dialog. Explicit confirmation allowed approval, recorded the concern and `named_client_confirmed=true`, and allowed scheduling. Fixtures deleted.
- Rollback-only SQL: unknown and internal-only clearance both permit request, colleague approval, scheduling and publishing preflight; a named-client concern requires confirmation; subsequent content edits invalidate approval and confirmation.
- Fifteen calendar/grid tests pass; EN/PT translation parity passes; latest preview build reports OK.

More copy (B) is deliberately not implemented in this delivery. Pending Finance changes are untouched. No real draft, project or Instagram post was changed by verification.