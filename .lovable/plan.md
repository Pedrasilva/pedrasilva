## Goal

Turn the uploaded Word proposal into our first official, reusable template. Picking it on a new quote pre-populates the Gantt with the 5 stages, hours, fees, resources and payment rules. From then on the Gantt is the source of truth — the in-app proposal table and the .docx export both read live values from it. All paragraphs remain editable per project; structure and wording are preserved.

## What I'll build

### 1. Quote Template: "Habitação — Construção Nova" (PT)
Seeded via a migration into the existing `quote_templates` system so it appears in the template picker for new quotes (category: `project`, project_type: `residential`).

**Stages (seed the Gantt):**

| # | Stage | Duration | Senior hrs | Architect hrs | Fee (€) |
|---|---|---|---|---|---|
| 1 | Programa Base / Conceito | 1 week | 10 | — | 400 |
| 2 | Estudo Prévio | 4 weeks | 80 | 120 | 7,400 |
| 3 | Licenciamento | 2 weeks | 60 | 60 | 4,500 |
| 4 | Projeto de Execução | 5 weeks | 100 | 150 | 9,250 |
| 5 | Assistência Técnica | 12 months | 8/mo | 12/mo | 776/month |

**Dependencies:** sequential (1→2→3→4→5).
**Payment rules:** 10% adjudication on signature; per project stage 45% at start + 45% at completion; AT billed monthly during construction.
**Proposal blocks:** one editable block per section of the Word doc (Descrição, Fases [1]–[5], Honorários, Condições de Pagamento, Prazos, Exclusões, Validade, Termo de Aceitação) — wording preserved exactly, with placeholders for `{{client_name}}`, `{{project_title}}`, `{{address}}`, `{{typology}}`, `{{area_m2}}`, `{{floors}}`, `{{proposal_code}}`, `{{proposal_date}}`.

### 2. Dynamic fields on the quote
Add a small "Project brief" section on the quote (residential category only) for:
- Project title (e.g. "Construção nova de moradia")
- Address
- Client name
- Typology (T4), area (m²), floors

These flow into both the in-app proposal and the .docx.

### 3. Live fee/hours table
The Honorários table renders from current Gantt stages — durations, hours, resources, fees — so edits in the Gantt are immediately reflected in the proposal preview.

### 4. .docx export
New "Export Word" button on the quote proposal tab. Generates a .docx that mirrors the original layout (PSA logo, Lisbon footer, RIBA/Ordem mark, page breaks, fee table). Uses docx-js server-side. Cover page pulls proposal code + date + project brief; body pulls editable section blocks; fee table pulls live Gantt values.

### Out of scope (for this first cut)
- Reverse sync (editing the .docx back into the Gantt).
- Change orders / amendments.
- Other proposal families (office, hotel, etc.) — the same pattern can be cloned later.

## Technical notes (for reference)

- Migration inserts rows into `quote_templates`, `quote_template_stages`, `quote_template_dependencies`, `quote_template_payment_rules`, `quote_template_blocks`. RPC `quote_instantiate_template` already handles seeding into a quote.
- Proposal blocks store HTML; placeholders resolved at render time against the quote + brief fields. Reuses the existing `quote_proposal_documents` / `quote_proposal_document_blocks` editor.
- .docx generation runs in a `createServerFn` using `docx` (already a known pattern). Logo + footer assets stored in `src/assets/proposal-habitacao/`.
- New small table `quote_project_brief` (one row per quote: title, address, typology, area_m2, floors) — or, simpler, reuse free columns on `fee_proposals`. I'll prefer reusing existing columns where possible to avoid schema sprawl; otherwise add the table with RLS scoped like other quote-child tables.

## Confirmations needed before I start

1. PT-PT only for v1, or also EN? (Word doc is PT.)
2. Use the existing PSA logo asset in the repo, or do you want to upload a higher-res one for the .docx?
3. Should AT (Assistência Técnica) appear in the Gantt as a single 12-month bar, or as 12 monthly bars for billing tracking? (My default: single bar, monthly billing rule.)
