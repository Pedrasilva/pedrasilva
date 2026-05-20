/**
 * Proposal assembly orchestrator.
 *
 * Deterministic: given the same input, returns the same containers in the
 * same order with the same ids. Pure / no I/O. Inserts happen elsewhere via
 * `useAssembleProposalInsert` which calls into the existing
 * `quote_proposal_document_blocks` writer.
 */
import type {
  AssembledProposal,
  AssemblyInput,
  AssemblyMainSectionId,
  ProposalBlockSeed,
  ProposalContainer,
} from "./types";
import {
  buildPlaceholderMap,
  resolvePlaceholders,
} from "./placeholders/resolve";
import { lookupSectionTemplate } from "./registries/section-templates";
import {
  ATTACHMENT_TEMPLATES,
  type AttachmentTemplate,
} from "./registries/attachment-templates";

const MAIN_ORDER: AssemblyMainSectionId[] = [
  "cover_page",
  "cover_letter",
  "executive_summary",
  "project_understanding",
  "design_approach",
  "scope_overview",
  "phase_narratives",
  "fee_summary",
  "signature",
];

export function assembleProposal(input: AssemblyInput): AssembledProposal {
  const map = buildPlaceholderMap(input.data);
  map.language = input.language;

  const containers: ProposalContainer[] = [];
  const unresolved = new Set<string>();
  const warnings: string[] = [];
  const seededAt = new Date().toISOString();

  // --- MAIN SECTIONS ---
  let order = 0;
  for (const sectionId of MAIN_ORDER) {
    const tpl = lookupSectionTemplate(
      input.family,
      input.preset,
      input.deliveryMode,
      sectionId,
    );
    if (!tpl) {
      warnings.push(`No template for ${input.family}/${input.preset}/${input.deliveryMode}/${sectionId}`);
      continue;
    }
    const body = input.language === "pt-PT" ? tpl.bodyPt : tpl.bodyEn;
    const title = input.language === "pt-PT" ? tpl.titlePt : tpl.titleEn;
    const resolved = resolvePlaceholders(body, map);
    resolved.unresolved.forEach((u) => unresolved.add(u));

    const blocks: ProposalBlockSeed[] = [
      {
        localId: `${sectionId}.body`,
        title,
        content: resolved.output,
      },
    ];

    // Phase narratives section emits one extra editable block per stage.
    if (sectionId === "phase_narratives") {
      for (const s of input.data.stages) {
        const phaseTitle =
          input.language === "pt-PT" ? `Fase ${s.code} — ${s.name}` : `Phase ${s.code} — ${s.name}`;
        const phaseBody =
          input.language === "pt-PT"
            ? `Duração estimada: ${s.duration_days ?? "—"} dias. Honorários: ${
                s.fee != null ? `${s.fee} ${input.data.quote.currency ?? "EUR"}` : "—"
              }.`
            : `Estimated duration: ${s.duration_days ?? "—"} days. Fee: ${
                s.fee != null ? `${s.fee} ${input.data.quote.currency ?? "EUR"}` : "—"
              }.`;
        blocks.push({
          localId: `${sectionId}.${s.code}`,
          title: phaseTitle,
          content: phaseBody,
          payload: { stageCode: s.code },
        });
      }
    }

    containers.push({
      id: `${input.assemblyKey}:${sectionId}`,
      kind: "main",
      sectionId,
      title: { en: tpl.titleEn, pt: tpl.titlePt },
      order: order++,
      enabled: true,
      locked: "none",
      blocks,
      provenance: {
        source: sectionId === "fee_summary" ? "fee_engine" : "ontology",
        templateKey: `${input.family}:${input.preset}:${input.deliveryMode}:${sectionId}`,
        seededAt,
        placeholdersResolved: resolved.resolved,
        assemblyKey: input.assemblyKey,
      },
    });
  }

  // --- ATTACHMENTS ---
  for (const att of ATTACHMENT_TEMPLATES) {
    if (!input.appendices[att.id]) continue;
    const intro = input.language === "pt-PT" ? att.introPt : att.introEn;
    const title = input.language === "pt-PT" ? att.titlePt : att.titleEn;
    const resolved = resolvePlaceholders(intro, map);
    resolved.unresolved.forEach((u) => unresolved.add(u));

    const blocks: ProposalBlockSeed[] = [
      {
        localId: `${att.sectionId}.intro`,
        title,
        content: resolved.output,
      },
    ];

    // Attach structured payloads for renderers that need them.
    addAttachmentPayloads(att, input, blocks);

    containers.push({
      id: `${input.assemblyKey}:${att.sectionId}`,
      kind: "attachment",
      sectionId: att.sectionId,
      title: { en: att.titleEn, pt: att.titlePt },
      order: order++,
      enabled: true,
      locked: att.locked,
      blocks,
      provenance: {
        source: attachmentSource(att.id),
        templateKey: `attachment:${att.id}`,
        seededAt,
        placeholdersResolved: resolved.resolved,
        assemblyKey: input.assemblyKey,
      },
    });
  }

  return {
    input,
    containers,
    unresolvedPlaceholders: [...unresolved],
    warnings,
  };
}

function attachmentSource(id: string) {
  switch (id) {
    case "I":
      return "clause_template" as const;
    case "III":
      return "planning_engine" as const;
    case "IV":
      return "fee_engine" as const;
    default:
      return "ontology" as const;
  }
}

function addAttachmentPayloads(
  att: AttachmentTemplate,
  input: AssemblyInput,
  blocks: ProposalBlockSeed[],
) {
  if (att.id === "III") {
    // Gantt appendix — payload reference only; rendered by gantt-appendix block.
    blocks.push({
      localId: `${att.sectionId}.gantt`,
      title: input.language === "pt-PT" ? "Diagrama de Gantt" : "Gantt Diagram",
      content: "[[proposal_gantt]]",
      payload: {
        kind: "gantt_appendix",
        quoteId: input.data.quote.id,
        settings: {
          showMilestones: true,
          showConsultants: input.flags.showConsultantTrack,
          showProcurement: false,
          landscape: true,
          detailLevel: "executive",
        },
      },
    });
  }
  if (att.id === "IV") {
    blocks.push({
      localId: `${att.sectionId}.fee_table`,
      title: input.language === "pt-PT" ? "Quadro de Honorários" : "Fee Table",
      content: input.data.stages
        .map((s) => `${s.code} — ${s.name}: ${s.fee ?? "—"}`)
        .join("\n"),
      payload: { kind: "fee_table", stages: input.data.stages },
    });
    if (input.data.paymentSchedule.length > 0) {
      blocks.push({
        localId: `${att.sectionId}.payment_schedule`,
        title:
          input.language === "pt-PT" ? "Calendário de Pagamentos" : "Payment Schedule",
        content: input.data.paymentSchedule
          .map((p) => `${p.label} (${p.trigger}): ${p.amount}`)
          .join("\n"),
        payload: { kind: "payment_schedule", rows: input.data.paymentSchedule },
      });
    }
  }
  if (att.id === "V" && input.addOns.length > 0) {
    blocks.push({
      localId: `${att.sectionId}.addons`,
      title: input.language === "pt-PT" ? "Serviços opcionais" : "Optional services",
      content: input.addOns.map((a) => `• ${a}`).join("\n"),
    });
  }
}
