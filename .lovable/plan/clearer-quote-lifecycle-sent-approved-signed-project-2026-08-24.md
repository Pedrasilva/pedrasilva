# Clearer quote lifecycle: Sent → Approved → Signed → Project

## Why convert is unavailable right now

Checked this quote in the database: "2663 Alteração de loteamento - Ericeira" has status **sent** (locked at 11:36 today) and no project attached. Conversion is deliberately gated on status = **approved**, so nothing is broken — the button simply isn't offered yet. Pressing "Mark as approved" would unlock it. The real problem is that nothing on screen says that, and there are three different places that can create a project (header button, Publish step card, and the separate Contract → Bootstrap card), so the route is genuinely unclear.

## The lifecycle we'll make explicit

```text
Draft ──send──▶ Sent ──approve──▶ Approved ──sign──▶ Signed ──convert──▶ Project
                  │                    │                │
                  └── Mark as lost ────┘                └── DocuSign complete (auto)
                                                            or "Mark as signed" (manual)
```

- **Signed becomes a real, recorded milestone on the quote**, not something implied by a contract record or a DocuSign envelope buried in the composer.
- Signature can arrive two ways, both landing in the same place: automatically when the DocuSign envelope completes, or manually ("Mark as signed" with date + optional note/attachment reference) for quotes signed on paper or by email.
- **Convert to project becomes the single action available on a Signed quote.** Admins keep an explicit "convert without signature" escape hatch (confirmation dialog naming that the signature is missing), so approved-but-unsigned work is never blocked.

## What changes in the UI

**1. One status rail, one primary action**
The quote header shows the five-state rail (Draft/Sent/Approved/Signed/Converted) with the current state highlighted, plus exactly one primary button = the next step. Secondary/edge actions (Mark as lost, revert status, admin override) move into the "…" overflow. This removes the situation where the primary button silently disappears with no explanation of what's needed.

**2. Step 3 renamed and rebuilt: "Sign & convert"**
The current "Preview & Publish" step becomes the signature-and-handover checkpoint containing, in order:
- Signature status card: envelope state or manual signature record, with "Send for signature" / "Mark as signed".
- Documents card (existing, unchanged) for sent + countersigned PDFs.
- Convert-to-project card: enabled on Signed, with a clear disabled reason ("Awaiting signature") otherwise, and the admin override.
- Optional contract path shown as a single secondary link ("Generate formal contract"), not a competing conversion route.

**3. Proposal builder toolbar declutter**
Keep visible: revision selector, Preview, Download, Send proposal, Send for signature. Move into the "…" overflow: Import template, Settings, Convert to contract, Autosaves. Remove "Mark as won / Mark as lost" from the composer entirely — those are quote-level and already in the header, and duplicating them there is what makes the screen feel button-heavy.

**4. Locked-quote banner gets the next step**
The amber "Proposta bloqueada — foi enviada" banner keeps "Criar nova revisão" but also states what the quote is waiting for (approval / signature), so a locked quote reads as "waiting on X", not "dead end".

## Technical notes

- Migration on `fee_proposals`: add `signed_at timestamptz`, `signed_method text` (`docusign` | `manual`), `signed_notes text`, `signed_by_collaborator_id uuid`. No new enum value on `quote_status` — signature is an attribute of an approved quote, which keeps existing status triggers, locks and reporting untouched.
- Signed is a locked state (same DB guards as sent/approved); "Create new revision" remains the only way back to editing and clears the signature fields on the new revision.
- DocuSign webhook (`docusign-connect`) writes `signed_at`/`signed_method='docusign'` when the envelope completes, in the same transaction that updates `psa_proposal_signatures`.
- Conversion logic in `src/routes/_app.crm.quotes.$quoteId.tsx` is unchanged apart from the gate: `approved` → `approved && (signed_at || override)`.
- `QuoteWorkflowActions` becomes state-driven with a single primary + overflow; `QuoteWorkflowStepper` labels updated; `QuotePublishStep` gains the signature card; `composer-top-bar.tsx` regrouped.
- Contract generation/bootstrap stays available but is presented as the optional formal-contract branch; the bootstrap card no longer competes as a second "create the project" entry point.
- All new strings added to EN and PT-PT in the same edit, per project i18n rules.
