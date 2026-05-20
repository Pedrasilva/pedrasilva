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
import {
  lookupSectionTemplate,
  lookupPhaseTemplate,
} from "./registries/section-templates";
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

const WORKPLACE_CANONICAL_PHASES = [
  { code: "P1", name: "Workplace Strategy / Programme Definition" },
  { code: "P2", name: "Concept Design" },
  { code: "P3", name: "Developed / Schematic Design" },
  { code: "P5", name: "Technical Design" },
  { code: "P6", name: "Procurement / Tender Support" },
  { code: "P7", name: "Construction Assistance" },
  { code: "P8", name: "Close Out" },
];

function phasesForAssembly(input: AssemblyInput): AssemblyInput["data"]["stages"] {
  if (input.family !== "workplace") return [];
  const liveByCode = new Map(input.data.stages.map((s) => [s.code, s]));
  return WORKPLACE_CANONICAL_PHASES.map((p) => ({
    ...p,
    ...liveByCode.get(p.code),
    code: p.code,
    name: p.name,
  }));
}

function phaseMetadata(s: AssemblyInput["data"]["stages"][number], currency: string | null | undefined, language: AssemblyInput["language"]): string {
  const bits: string[] = [];
  if (s.duration_days != null) bits.push(language === "pt-PT" ? `Duração: ${s.duration_days} dias úteis` : `Duration: ${s.duration_days} working days`);
  if (s.estimated_hours != null) bits.push(language === "pt-PT" ? `Horas estimadas: ${s.estimated_hours}` : `Estimated hours: ${s.estimated_hours}`);
  if (s.fee != null) {
    const formatted = new Intl.NumberFormat("en-GB", { style: "currency", currency: currency ?? "EUR", maximumFractionDigits: 2 }).format(Number(s.fee));
    bits.push(language === "pt-PT" ? `Honorários: ${formatted}` : `Fee: ${formatted}`);
  }
  return bits.length ? `\n${language === "pt-PT" ? "Metadados" : "Metadata"}: ${bits.join(" · ")}.` : "";
}

export function assembleProposal(input: AssemblyInput): AssembledProposal {
  const map = buildPlaceholderMap(input.data, input.language);
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

    // Phase narratives section emits one editable block per stage, using a
    // per-phase template when one is registered for the (family/preset/mode,
    // stageCode) tuple. Unknown stage codes fall back to a one-liner so the
    // block remains useful and editable rather than empty.
    if (sectionId === "phase_narratives") {
      for (const s of phasesForAssembly(input)) {
        const phaseTpl = lookupPhaseTemplate(
          input.family,
          input.preset,
          input.deliveryMode,
          s.code,
        );
        let phaseTitle: string;
        let phaseBodyRaw: string;
        if (phaseTpl) {
          phaseTitle = input.language === "pt-PT" ? phaseTpl.titlePt : phaseTpl.titleEn;
          phaseBodyRaw = input.language === "pt-PT" ? phaseTpl.bodyPt : phaseTpl.bodyEn;
        } else {
          phaseTitle =
            input.language === "pt-PT"
              ? `Fase ${s.code} — ${s.name}`
              : `Phase ${s.code} — ${s.name}`;
          phaseBodyRaw =
            input.language === "pt-PT"
              ? `Duração estimada: ${s.duration_days ?? "—"} dias. Honorários: ${
                  s.fee != null ? `${s.fee} ${input.data.quote.currency ?? "EUR"}` : "—"
                }.`
              : `Estimated duration: ${s.duration_days ?? "—"} days. Fee: ${
                  s.fee != null ? `${s.fee} ${input.data.quote.currency ?? "EUR"}` : "—"
                }.`;
        }
        const phaseResolved = resolvePlaceholders(phaseBodyRaw, map);
        phaseResolved.unresolved.forEach((u) => unresolved.add(u));
        blocks.push({
          localId: `${sectionId}.${s.code}`,
          title: phaseTitle,
          content: `${phaseResolved.output}${phaseMetadata(s, input.data.quote.currency, input.language)}`,
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
  const phases = phasesForAssembly(input);
  const lang = input.language;
  if (att.id === "I") {
    blocks.push({
      localId: `${att.sectionId}.conditions`,
      title: lang === "pt-PT" ? "Condições aplicáveis" : "Applicable conditions",
      content: lang === "pt-PT"
        ? "1. Âmbito: a proposta cobre serviços de arquitectura e coordenação conforme descritos nas fases e anexos.\n2. Exclusões: taxas oficiais, licenças, custos de obra, procurement directo, viagens extraordinárias e serviços de consultores externos não estão incluídos salvo indicação expressa.\n3. Aprovações: cada fase avança após validação escrita do cliente. Alterações após aprovação podem implicar honorários adicionais.\n4. Coordenação: a PSA coordena informação de projecto recebida dentro dos prazos acordados; atrasos de terceiros podem afectar programa e fee.\n5. Propriedade intelectual: desenhos e documentos permanecem propriedade intelectual da PSA até pagamento integral dos honorários aplicáveis."
        : "1. Scope: this proposal covers architectural design and coordination services described in the phases and attachments.\n2. Exclusions: statutory fees, permits, construction costs, direct procurement, extraordinary travel and external consultant services are excluded unless expressly stated.\n3. Approvals: each phase proceeds after written client sign-off. Changes after approval may require additional fees.\n4. Coordination: PSA coordinates project information received within agreed timeframes; third-party delays may affect programme and fee.\n5. Intellectual property: drawings and documents remain PSA intellectual property until the applicable fees are paid in full.",
    });
  }
  if (att.id === "II") {
    blocks.push({
      localId: `${att.sectionId}.matrix`,
      title: lang === "pt-PT" ? "Matriz de fases e entregáveis" : "Phase and deliverables matrix",
      content: renderDeliverablesMatrix(phases, lang),
    });
  }
  if (att.id === "III") {
    blocks.push({
      localId: `${att.sectionId}.gantt`,
      title: input.language === "pt-PT" ? "Sequência indicativa de fases" : "Indicative phase sequence",
      content: renderProgrammeRows(phases, lang),
      payload: {
        kind: "programme_summary",
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
      localId: `${att.sectionId}.basis`,
      title: input.language === "pt-PT" ? "Base comercial" : "Commercial basis",
      content: lang === "pt-PT"
        ? "• As fases de projecto são previstas como honorários fixos, facturados por marco após validação.\n• A Assistência à Obra, quando incluída, opera como retainer mensal alinhado com o programa de obra confirmado.\n• Valores finais, impostos, despesas reembolsáveis e marcos de facturação são confirmados antes da emissão contratual."
        : "• Design stages are intended as fixed-fee milestones, invoiced by milestone after validation.\n• Construction Assistance, where included, operates as a monthly retainer aligned with the confirmed construction programme.\n• Final values, taxes, reimbursable expenses and invoicing milestones are confirmed before contractual issue.",
    });
    blocks.push({
      localId: `${att.sectionId}.fee_table`,
      title: input.language === "pt-PT" ? "Quadro de honorários" : "Fee schedule",
      content: renderFeeScheduleRows(phases, input.data.quote.currency, lang),
      payload: { kind: "fee_summary", stages: phases },
    });
    blocks.push({
      localId: `${att.sectionId}.payment_schedule`,
      title:
        input.language === "pt-PT" ? "Calendário de pagamentos" : "Payment schedule",
      content: renderPaymentScheduleRows(input.data.paymentSchedule, input.data.quote.currency, lang),
      payload: { kind: "payment_summary", rows: input.data.paymentSchedule },
    });
  }
  if (att.id === "V") {
    blocks.push({
      localId: `${att.sectionId}.addons`,
      title: input.language === "pt-PT" ? "Serviços opcionais" : "Optional services",
      content: renderOptionalServices(input.addOns, lang),
    });
  }
  if (att.id === "VI") {
    blocks.push({
      localId: `${att.sectionId}.interfaces`,
      title: input.language === "pt-PT" ? "Interfaces de responsabilidade" : "Responsibility interfaces",
      content: renderConsultantInterfaces(lang),
    });
  }
}

function renderProgrammeRows(phases: AssemblyInput["data"]["stages"], lang: AssemblyInput["language"]): string {
  const rows = phases.filter((s) => s.start_date || s.end_date || s.duration_days);
  if (rows.length === 0) {
    const fallback = phases.length > 0 ? phases : WORKPLACE_CANONICAL_PHASES;
    return [
      lang === "pt-PT"
        ? "Programa a confirmar após validação das fases do projecto. Sequência base proposta:"
        : "Programme to be confirmed following validation of project stages. Proposed baseline sequence:",
      ...fallback.map((s) => `• ${s.name}`),
    ].join("\n");
  }
  return rows
    .map((s) => {
      const dates = [s.start_date, s.end_date].filter(Boolean).join(" → ") || (lang === "pt-PT" ? "datas a confirmar" : "dates to be confirmed");
      const duration = s.duration_days != null ? `${s.duration_days} ${lang === "pt-PT" ? "dias úteis" : "working days"}` : (lang === "pt-PT" ? "duração a confirmar" : "duration to be confirmed");
      return `• ${s.name}: ${dates}; ${duration}.`;
    })
    .join("\n");
}

function renderDeliverablesMatrix(phases: AssemblyInput["data"]["stages"], lang: AssemblyInput["language"]): string {
  const rows = phases.length > 0 ? phases : WORKPLACE_CANONICAL_PHASES;
  return rows.map((s) => lang === "pt-PT"
    ? `${s.name}\n• Tarefas-chave: briefing, desenho, coordenação e revisão adequados à fase.\n• Entregáveis: pacote de desenhos, notas de coordenação, registo de decisões e entregáveis da fase.\n• Responsabilidade: PSA lidera; cliente aprova; consultores/empreiteiro contribuem quando aplicável.`
    : `${s.name}\n• Key tasks: briefing, design, coordination and review appropriate to the phase.\n• Deliverables: drawing package, coordination notes, decision register and phase deliverables.\n• Responsibility: PSA leads; client approves; consultants/contractor contribute where applicable.`)
    .join("\n\n");
}

function renderFeeScheduleRows(phases: AssemblyInput["data"]["stages"], currency: string | null | undefined, lang: AssemblyInput["language"]): string {
  const feeRows = phases.filter((s) => s.fee != null && Number.isFinite(Number(s.fee)) && Number(s.fee) > 0);
  if (feeRows.length === 0) return lang === "pt-PT" ? "Quadro detalhado de honorários a confirmar." : "Detailed fee schedule to be confirmed.";
  return feeRows.map((s) => {
    const formatted = new Intl.NumberFormat("en-GB", { style: "currency", currency: currency ?? "EUR", maximumFractionDigits: 2 }).format(Number(s.fee));
    return `• ${s.name}: ${formatted}`;
  }).join("\n");
}

function renderPaymentScheduleRows(rows: AssemblyInput["data"]["paymentSchedule"], currency: string | null | undefined, lang: AssemblyInput["language"]): string {
  const validRows = rows.filter((p) => Number.isFinite(Number(p.amount)) && Number(p.amount) > 0);
  if (validRows.length === 0) return lang === "pt-PT" ? "Calendário de pagamentos a confirmar." : "Payment schedule to be confirmed.";
  return validRows.map((p) => {
    const formatted = new Intl.NumberFormat("en-GB", { style: "currency", currency: currency ?? "EUR", maximumFractionDigits: 2 }).format(Number(p.amount));
    return `• ${p.label || (lang === "pt-PT" ? "Marco" : "Milestone")}: ${p.trigger || (lang === "pt-PT" ? "a confirmar" : "to be confirmed")} — ${formatted}`;
  }).join("\n");
}

function renderOptionalServices(addOns: string[], lang: AssemblyInput["language"]): string {
  const defaults = lang === "pt-PT"
    ? ["BIM / gestão de modelo", "Sustentabilidade e certificação", "Sinalética e wayfinding", "Estudos pós-ocupação", "Procurement FF&E alargado"]
    : ["BIM / model management", "Sustainability and certification support", "Signage and wayfinding", "Post-occupancy studies", "Extended FF&E procurement"];
  return (addOns.length > 0 ? addOns : defaults).map((a) => `• ${a}`).join("\n");
}

function renderConsultantInterfaces(lang: AssemblyInput["language"]): string {
  return lang === "pt-PT"
    ? "MEP\n• PSA: coordenação de layouts, tectos, equipamentos visíveis e inputs de design intent.\n• Consultor/cliente: dimensionamento técnico, cálculos, desenhos e conformidade regulamentar.\n\nEstrutura\n• PSA: coordenação de interferências e aberturas relevantes.\n• Consultor/cliente: verificação estrutural, detalhes e aprovações técnicas.\n\nQS / Cost Management\n• PSA: alinhamento de scope, clarificações e value-engineering de design.\n• Consultor/cliente: estimativas, BoQ, relatórios de custo e recomendações comerciais.\n\nEmpreiteiro\n• PSA: respostas de design intent, revisão de amostras e shop drawings.\n• Empreiteiro: metodologia, execução, segurança, programa de obra e qualidade final."
    : "MEP\n• PSA: coordinate layouts, ceilings, visible equipment and design-intent inputs.\n• Consultant/client: technical sizing, calculations, drawings and regulatory compliance.\n\nStructure\n• PSA: coordinate relevant clashes, openings and design constraints.\n• Consultant/client: structural verification, details and technical approvals.\n\nQS / Cost Management\n• PSA: align scope, clarifications and design-led value engineering.\n• Consultant/client: estimates, BoQ, cost reporting and commercial recommendations.\n\nContractor\n• PSA: design-intent responses, sample and shop-drawing review.\n• Contractor: methodology, execution, safety, site programme and final quality.";
}
