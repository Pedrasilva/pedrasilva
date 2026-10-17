# CRM value fallback and milestone date changes

## Changes
1. Use a positive active quoted total when available; otherwise show the estimated fee labelled Estimated. Reuse the shared value resolver for cards, column/header totals and CRM Overview.
2. Limit milestone work to dates and dragging, as selected. Ensure dragging uses the existing atomic multi-stage save and Undo path, including dependent stages and resource dates. Keep creation, deletion, names and ordering unchanged.

## Light verification
- Focused unit tests for zero/empty quote fallback and totals, plus milestone move/save/Undo and failed-save behavior.
- One signed-in check on a temporary copy, then delete it. Never test changes on real projects or proposals.
- Report results and any verification limit in no more than four lines.

## Technical details
- Keep the existing scheduler, revision guards and save history; milestone date changes already reach the atomic save through stage hooks, so no new database function is planned.
- No new packages, access changes or unrelated refactors.
