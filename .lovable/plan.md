# Proposal Container & Assembly Layer — Milestone 1

Build the **structured prefilled proposal container** system. Not an AI generator — a deterministic assembly engine that emits **editable blocks** seeded from ontology, fee engine, planning engine, and CRM data. First canonical target: `workplace / large_corporate_fitout / psa_led` → **Workplace Proposal Template V1**.

Additive only. Existing proposal builder, generated_content, blocks, drag/drop, fee calculator, payment generator, Gantt, and legacy proposals stay untouched.

---

## 1. New module: `src/lib/proposal-assembly/`

Pure / deterministic. No React, no Supabase calls — receives data, returns container tree.

```
src/lib/proposal-assembly/
├── types.ts                       # ProposalContainer, ProposalSection, Attachment, Placeholder, AssemblyInput/Output, Provenance
├── registries/
│   ├── families.ts                # workplace, residential, retail… (V1: workplace only)
│   ├── presets.ts                 # large_corporate_fitout, small_fitout… (V1: large_corporate_fitout)
│   ├── delivery-modes.ts          # psa_led, consultant_led, design_build (V1: psa_led)
│   ├── section-templates.ts       # MAIN section catalog with seeded narratives (EN/PT)
│   ├── attachment-templates.ts    # Attachments I–VI definitions
│   └── clause-templates.ts        # General Conditions clauses (reuses existing CLAUSE_REGISTRY where possible)
├── placeholders/
│   ├── catalog.ts                 # {project_name}, {phase_duration_P1}, {construction_monthly_fee}, …
│   └── resolve.ts                 # resolvePlaceholders(text, ctx) → string
├── renderers/
│   ├── cover-page.ts
│   ├── cover-letter.ts
│   ├── executive-summary.ts
│   ├── phase-narratives.ts        # delegates to existing resolveAllPhaseNarratives
│   ├── fee-summary.ts             # from fee-calculator output
│   ├── exclusions.ts              # derived from family + add-ons + delivery_mode
│   ├── programme.ts               # Attachment III — wraps existing quote-gantt as appendix block
│   ├── fee-payment-appendix.ts    # Attachment IV
│   ├── scope-deliverables.ts      # Attachment II
│   ├── optional-services.ts       # Attachment V
│   ├── consultant-interfaces.ts   # Attachment VI
│   └── general-conditions.ts      # Attachment I (semi-locked clauses)
├── assemble.ts                    # main orchestrator: AssemblyInput → AssembledProposal
└── index.ts
```

### Container shape

```ts
type ProposalContainer = {
  id: string;                       // stable per (assemblyKey, sectionId)
  kind: "main" | "attachment";
  sectionId: string;                // cover_page, exec_summary, attachment_iii, …
  title: { en: string; pt: string };
  order: number;
  enabled: boolean;                 // toggleable
  locked: "none" | "semi" | "full"; // semi = general conditions
  blocks: ProposalBlock[];          // shape compatible with existing block schema
  provenance: {
    source: "ontology" | "fee_engine" | "planning_engine" | "crm" | "clause_template" | "manual";
    templateKey?: string;
    seededAt: string;
    placeholdersResolved: string[];
  };
};
```

Output blocks use the existing `proposal_blocks` schema so the editor keeps full edit/delete/reorder/hide capability post-insertion.

---

## 2. Assembly engine

```ts
assembleProposal({
  quoteId,
  family: "workplace",
  preset: "large_corporate_fitout",
  deliveryMode: "psa_led",
  language: "pt-PT" | "en",
  flags: { showHours, showDurations, showConsultantTrack, … },
  addOns: string[],
  appendices: { I: true, II: true, III: true, IV: true, V: false, VI: false },
  data: { quote, stages, dependencies, allocations, feeBreakdown, paymentSchedule, ontology, project }
}) → AssembledProposal { containers, unresolvedPlaceholders, warnings }
```

Composition order (when enabled):
1. cover_page → cover_letter → exec_summary → project_understanding → design_approach → scope_overview → phase_narratives → fee_summary → signature
2. attachment_i (General Conditions) → attachment_ii (Scope Matrix) → attachment_iii (Programme/Gantt) → attachment_iv (Fee & Payment) → attachment_v (Optional) → attachment_vi (Consultants)

Each renderer:
- pulls its seed narrative from `section-templates.ts` for `(family, preset, deliveryMode, language)`,
- runs `resolvePlaceholders(text, ctx)`,
- emits 1–N editable blocks,
- records provenance.

---

## 3. Placeholder catalog (V1)

Resolved against `RenderContext` + quote data:

```
{project_name} {project_code} {client_name} {proposal_date} {proposal_version}
{overall_project_duration} {construction_duration}
{phase_duration_P1..P6} {phase_fee_P1..P6} {phase_hours_P1..P6}
{construction_monthly_fee} {construction_monthly_hours}
{project_stage_fee_table} {construction_stage_fee_table}
{proposal_gantt} {payment_schedule_table} {exclusions_list}
{currency} {language}
```

Unknown placeholders are left literal and reported in `unresolvedPlaceholders` (visible in builder warnings).

---

## 4. Gantt appendix (Attachment III)

Do **not** reimplement Gantt. Add a new block type `gantt_appendix` that:
- references quoteId + render settings `{ showMilestones, showConsultants, showProcurement, landscape, detailLevel: "executive" | "detailed" }`,
- renders via a thin wrapper around the existing `quote-gantt.tsx` in read-only "executive" mode,
- placeholder `{proposal_gantt}` in body content resolves to this block reference.

V1 ships executive mode only; flag fields exist in the block payload for future expansion.

---

## 5. Fee & Payment appendix (Attachment IV)

Pulls directly from `fee-calculator.ts` and `payment-generators.ts` outputs. Two sub-tables:
- Project stages fee table (phase × duration × hours × fee)
- Construction assistance retainer block (monthly fee × duration × periodic review wording)

Independent regeneration: each appendix has a "Regenerate from current data" action that re-runs only its renderer.

---

## 6. UI surfaces (minimal, additive)

Add to existing proposal builder (`quote-proposal-tab.tsx` area):

1. **"Assemble proposal" action** — opens a side panel:
   - Family / Preset / Delivery mode (V1: defaults locked to workplace/large_corporate_fitout/psa_led, others disabled)
   - Language toggle
   - Appendix checkboxes (I–VI)
   - Flag toggles (show hours, show durations, show consultant track)
   - "Insert" button → calls `assembleProposal`, inserts containers as blocks via existing `useInsertProposalBlocks` hook, preserves any existing custom blocks (insert at end with confirm if blocks already present).

2. **Container chip in block toolbar** — shows `provenance.source` and a "Regenerate this section" affordance for assembled blocks.

3. **Unresolved placeholders banner** — surfaces `unresolvedPlaceholders` in the existing `quote-warnings-banner.tsx`.

No changes to drag/drop, manual block creation, or the document editor.

---

## 7. Database (single small migration)

Additive columns on `proposal_blocks` only:

- `assembly_section_id text NULL` — e.g. `cover_page`, `attachment_iii`
- `assembly_provenance jsonb NULL` — `{ source, templateKey, seededAt, placeholdersResolved, assemblyKey }`
- `assembly_locked text NULL CHECK (assembly_locked IN ('none','semi','full')) DEFAULT NULL`

No new tables. No data backfill. Legacy blocks have NULL → treated as manual. RLS unchanged (inherits existing `proposal_blocks` policies).

---

## 8. i18n

Add `proposalAssembly` namespace (EN + PT, parity-checked):
- container titles (cover_page, exec_summary, attachment_i…attachment_vi)
- seed narratives for workplace/large_corporate_fitout/psa_led
- assembly panel labels, flag labels, provenance chip labels, regenerate confirmations

All glossary terms (Phase, Stage, Construction Assistance, Fee, Retainer) referenced via `glossary:*` per project memory.

---

## 9. Validation

- `scripts/test-proposal-assembly.mjs` — assembles a fixture quote, asserts:
  - container count + order matches spec,
  - all V1 placeholders resolve against fixture data,
  - appendix toggles correctly include/exclude containers,
  - second assembly call is deterministic (stable container IDs).
- Existing tests untouched.
- Build + i18n parity check.

---

## 10. Out of scope (per spec section 10)

No proposal versioning, no contract gen, no project bootstrap wiring, no detachable export, no AI narrative refinement, no proposal library UI, no jurisdiction clauses, no multilingual rendering beyond EN/PT seed pairs.

---

## Files

**New (~22):** the entire `src/lib/proposal-assembly/` tree, `src/components/quotes/proposal-assembly-panel.tsx`, `src/components/quotes/blocks/gantt-appendix-block.tsx`, migration, test script, 2 i18n files.

**Edited (~6):** `src/components/quotes/quote-proposal-tab.tsx` (add Assemble action), `quote-warnings-banner.tsx` (unresolved placeholders), `use-insert-proposal-blocks.ts` (pass through assembly metadata), `src/integrations/supabase/types.ts` (auto), 2 glossary/hr i18n touch-ups if new shared terms emerge.

Confirm to proceed and I'll start with the migration, then the assembly module, then UI wiring.
