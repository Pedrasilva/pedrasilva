## Approach

### #1 — Snapshot payload (the core decision)

Everything the proposal renders already funnels through a single derived object: `LiveQuoteSnapshot` (stages, consultants, payment schedule + invoices, site trips, billable rates, VAT status, project/client header fields). Raw tables are only intermediate inputs.

So the snapshot stores **both**:

- `quote_data.resolved` — the full derived `LiveQuoteSnapshot`, for both languages (`pt-PT` and `en`), captured at send time. This is what renderers read back. It guarantees pixel-parity with what was sent, and is immune to future changes in derivation logic.
- `quote_data.raw` — verbatim rows from `fee_proposals`, `quote_stages`, `quote_stage_dependencies`, `quote_allocations` (with resolved resource role + cost/sale rates), `quote_external_services`, `quote_payment_schedule_items`, `quote_billable_hourly_rates`, `quote_site_trips`, `quote_supplier_markups`. Audit/forensics only — not used for rendering.
- `quote_data.captured_at` + `schema_version: 1`.

Capture happens inside the existing send mutation (`useSendProposal`), alongside the current `{ proposal, blocks }` — no change to the send UX.

### #2 — Dual-mode rendering

Add `RevisionContext` (React context) in `src/lib/psa-proposal/revision-context.tsx`:

- `useLiveQuoteSnapshot(quoteId, lang)` gains a first step: if a historical revision is active in context, return `{ data: snapshot.quote_data.resolved[lang], isLoading: false }` and never touch the network. Signature and return shape stay identical, so `canvas.tsx`, `block-renderer.tsx`, `block-library-panel.tsx`, `block-settings-panel.tsx` need no changes.
- Blocks come from `snapshot.blocks` instead of the live `psa_proposal_blocks` query, via the same context check in `useProposalBlocks`.
- New route `/proposals/$proposalId/composer/revisions/$revisionId` renders `ComposerShell` wrapped in the provider, forced into preview/read-only: no library panel, no settings panel, no drag reorder, no autosave, all mutations short-circuited.
- Amber banner at top: "A ver Revisão 01 — enviada 12 mar 2026. Vista histórica, não reflete o orçamento atual." plus a "Download PDF" and "Voltar à versão atual" action.
- Snapshots that predate this build (no `quote_data`) render a notice: only the archived PDF is available for that revision; the View action is disabled and only Download shows.

### #3 — Server-side revision numbering

Migration adds `public.psa_next_rev_number(p_proposal_id uuid) returns int`: `security definer`, locks the proposal row (`SELECT ... FOR UPDATE` on `psa_proposals`), computes `coalesce(max(rev_number), -1) + 1` over `kind='sent'` rows, returns it. Grant `EXECUTE` to `authenticated`. Also add a unique index on `(proposal_id, rev_number) WHERE kind = 'sent'` as a hard guard.

`useSendProposal` calls the RPC to get the number instead of receiving it from the client; `useNextRevNumber` stays but is downgraded to a display-only hint for the top-bar label.

### #4 — Cover page + filename

- `LiveQuoteSnapshot` gains `revision: { number: number | null; sentAt: string | null; isDraft: boolean }`. Live mode: `{ number: null, sentAt: null, isDraft: true }`. Historical mode: filled from the revision row.
- Cover block renders "Revisão 01 · 12 mar 2026" (or "Rascunho" / "Draft") and prefers `revision.sentAt` over `fee_proposals.data_proposta` when historical.
- Export filename in historical mode uses the stored revision number and its sent date rather than today's.

### #5 — History UI cleanup

- `VersionsPanel` becomes the primary "Histórico de revisões": each sent row shows `Rev NN`, sent date, filename, and two actions — **Ver** (opens the read-only historical route) and **Descarregar PDF**.
- `ProposalHistoryDialog` retitled "Recuperação de autosaves (avançado)", moved behind an overflow menu item, with an explanatory line that it is a low-level recovery tool and not the revision history. Its existing restore stays as-is (it only touches proposal blocks, never quote data).

### Explicitly out of scope

No "restore to live" for sent revisions. Historical mode issues zero writes: the provider hard-disables every mutation hook it wraps.

## Technical notes

- Files touched: `src/lib/psa-proposal/live-data.ts` (context check + `revision` field), new `revision-context.tsx`, new `snapshot-capture.ts`, `use-proposal-revisions.ts` (RPC + payload), `use-psa-proposal.ts` (blocks override), `composer-shell.tsx` (banner + read-only), `versions-panel.tsx`, `proposal-history-dialog.tsx`, `block-renderer.tsx` (cover only), new revision route file.
- One migration: `psa_next_rev_number` function + partial unique index.
- Snapshot size: a large quote resolves to roughly 100–300 KB of JSON for both languages; well within jsonb limits.
