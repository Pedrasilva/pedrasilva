# Weekly planning — Stage 3 scope and decisions

**Planning only. No application code or database changes have been made.** This plan is based on the original FEATURE Weekly planning board brief, the separate Stage 2 draft-editing brief, and Stage 2 hardening brief.

Your latest instruction says “PLAN FIRST, NO CODE”; consequently Tatiana’s approved costing/backfill request remains pending, not executed. Her chosen approach is recorded. Please resolve decision 9 below about sequencing.

## Scope already settled by your briefs

These are requirements, not questions to reopen:

- **Who approves:** PSA-staff planners — admins or collaborators with `projects.edit_planning` at **all** scope. Assigned-project planning permission alone is insufficient. Drafts remain planner-private; all PSA staff see published planning. No financial rates are exposed.
- **Replace, not add:** approval replaces Gantt planning in the **Monday–Sunday window for every active resource on the board**, including people with no draft slots. Clearing someone’s whole draft week clears their replaceable Gantt allocations for that week. Replacement is not limited to the projects selected in the draft.
- **Allocations omitted from the draft:** remove their in-week portion unless locked/imported. The preview must include the Stage 2 panel’s overload and small-hour bookings that the draft does not represent, not just visible cell differences.
- **Protected bookings:** never change locked allocations or `imported_accelo` allocations; list them as skipped. Preserve all portions outside the week. Split allocations spanning both sides, copying their original metadata.
- **Slot conversion:** combine matching morning/afternoon assignments into a full day; otherwise create separate halves. Merge compatible consecutive working days. Use the existing 75% planning utilisation and resource capacity formula. Published allocations are committed, source `week_plan`, and not locked.
- **Stage validation:** require eligible stages covering each slot, with explicitly confirmed extensions handled at approval only. Keep approved leave/holidays read-only. No timesheet, salary, cost-snapshot or Hours Bank changes.
- **Preview and confirmation:** “Aprovar e publicar” shows exactly which allocation rows will be created, changed, split or removed, grouped by person, plus skipped protected bookings and stage extensions. Explicitly state that this replaces the week’s Gantt planning.
- **After approval:** show approver/date and refresh the board and existing Gantt immediately, without changing Gantt rendering.
- **Editing a published week:** create a draft from current allocations; approving it reapplies the week. Reapproval without planning changes must produce no net allocation change.
- **Notifications:** a bell notification to every active PSA staff user, linked to the week, deduplicated by that publication’s approval time. The brief does not request email.

## Open decisions and recommended defaults

Please reply with any exceptions to these defaults, using the decision numbers.

| # | What the briefs leave open | Recommended default |
|---|---|---|
| 1 | Who confirms stage-extension intentions, and how unresolved slots acquire their stage | The approving planner explicitly selects each proposed extension in the preview. Assign a null-stage slot only when a confirmed intention identifies one eligible stage for that resource/project/day. Ambiguous or uncovered slots block approval and return to draft editing; never guess. |
| 2 | Locked stage baselines, dependencies and parent-stage effects of extensions | Warn about a locked baseline, require explicit confirmation, and change scheduling dates only — never the commercial baseline. Do not silently shift dependencies or other stages. If existing scheduling rules cannot accept the extension without additional changes, block it and require correction in the Gantt first. |
| 3 | A protected imported/locked booking overlaps a draft assignment | Preserve and list the protected booking as required. Allow approval only after a separate explicit acknowledgement of the resulting overlap; do not silently drop the draft assignment or hide overbooking. |
| 4 | Allocation changes on paused/archived projects that the active-project board cannot show | Do not silently clear unseen planning. Include those allocations in the preview and block approval for affected board resources until the planner resolves them in the Gantt. Inactive resources remain outside approval scope. |
| 5 | Merging compatible rows with different provenance, notes or links | Merge only when all consequential metadata also matches. Never erase quote/import links, notes or provenance just to join bars. Preserve outside-week pieces; prefer separate bars when merging would change their metadata. |
| 6 | Undo/reopen beyond the specified “edit approved week as a new draft” flow | No one-click destructive undo or silent rollback of Gantt history in v1. Use the specified revise-and-reapprove flow; creating/discarding that draft leaves published allocations unchanged. Preserve the previous approval record while the revision is being edited. |
| 7 | Notifications on no-change reapproval, retries and delivery failure | A deliberate new publication sends one new bell notification per active PSA staff user, including the approver; a retry of the same publication does not duplicate it. Store notifications in the approval transaction so failure rolls back the whole publication. No email. |
| 8 | Stale previews, concurrent approval/editing and approval of past weeks | Reject a stale preview if draft, affected allocations, stages, capacities or approved leave/holidays changed; refresh and require confirmation again. Serialize overlapping writes so edits cannot slip between validation and application. Allow past-week planning publication with a clear warning; it still never changes actual hours. |
| 9 | Tatiana’s accepted costing request appears together with the new “no code” Stage 3 instruction | Keep this turn planning-only. After your answers, execute and verify Tatiana’s scoped backfill as a separate milestone **before** Stage 3 implementation, unless you prefer another order. No full Rebuild/Recalculate and no changes to anyone else’s snapshots/rates. |

## Technical safeguards for implementation after your answers

- One authenticated, permission-checked database transaction per approval; set Stage 2’s transaction-local `app.pm_week_plan_apply` flag only inside the guarded workflow.
- Lock/revalidate the relevant planning records and allocation inputs; bind confirmation to the exact preview. Commit stage extensions, allocation replacement, approval audit fields and bell notifications together, or roll everything back.
- Resolve explicitly approved stage extensions before the final stage-date validation and allocation insert, within that same transaction. The original brief’s numbered list places extensions later, but insertion cannot validly precede the dates it needs.
- Preserve existing auth, permissions, framework, UI patterns, translations, integrations and unrelated functionality. Any schema/function change must have an exact matching source-controlled migration in `supabase/migrations`, with the existing Drizzle mirror.

## Verification boundary

Before reporting completion, test approval on a **rolled-back test week**, never publish a real week during testing:

- Exact preview versus application, full/half days and site visits, clearing a person’s week, omitted small/overload bookings, outside-week trimming/splitting and metadata preservation.
- Protected bookings, stage resolution/extensions, staff/planner access and unauthorized direct approval calls.
- Reapproval without net allocation changes, concurrent/stale attempts, failure after partial work and all-or-nothing recovery.
- Bell recipients/deduplication and existing Gantt/editor/timesheet/forecast/cost regressions. Verify browser flows to the extent possible without committing an approval; explicitly report anything not independently exercised.
- Compare before/after **full-row hashes as well as the count of all 94 existing allocations**, plus stage-date and actual-hour safeguards. Test notifications and test plans must leave no residue.

**Stop here. Implementation waits for your answers to the open decisions.**