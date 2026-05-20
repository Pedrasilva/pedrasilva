/**
 * V1 attachment definitions (I–VI). Title pairs and seed bodies only;
 * structured payloads (gantt settings, fee tables, payment schedule) are
 * filled in by the respective renderer at assembly time.
 */
import type { AssemblyAppendixId, AssemblyLockLevel } from "../types";

export interface AttachmentTemplate {
  id: AssemblyAppendixId;
  sectionId:
    | "attachment_i"
    | "attachment_ii"
    | "attachment_iii"
    | "attachment_iv"
    | "attachment_v"
    | "attachment_vi";
  titleEn: string;
  titlePt: string;
  defaultEnabled: boolean;
  locked: AssemblyLockLevel;
  introEn: string;
  introPt: string;
}

export const ATTACHMENT_TEMPLATES: AttachmentTemplate[] = [
  {
    id: "I",
    sectionId: "attachment_i",
    titleEn: "Attachment I — General Conditions",
    titlePt: "Anexo I — Condições Gerais",
    defaultEnabled: true,
    locked: "semi",
    introEn:
      "The following general conditions apply to the engagement described in this proposal. " +
      "These clauses are semi-locked: edit only where the client engagement specifically requires it.",
    introPt:
      "As condições gerais que se seguem aplicam-se à contratação descrita nesta proposta. " +
      "Estas cláusulas são semi-bloqueadas: editar apenas quando a contratação o exigir.",
  },
  {
    id: "II",
    sectionId: "attachment_ii",
    titleEn: "Attachment II — Scope & Deliverables Matrix",
    titlePt: "Anexo II — Matriz de Âmbito e Entregáveis",
    defaultEnabled: true,
    locked: "none",
    introEn:
      "The matrix below lists deliverables per project phase, including responsibility and format.",
    introPt:
      "A matriz seguinte lista os entregáveis por fase do projecto, incluindo responsabilidade e formato.",
  },
  {
    id: "III",
    sectionId: "attachment_iii",
    titleEn: "Attachment III — Programme",
    titlePt: "Anexo III — Programa",
    defaultEnabled: true,
    locked: "none",
    introEn:
      "Programme overview for {project_name}. Total duration {overall_project_duration} days. " +
      "{proposal_gantt}",
    introPt:
      "Programa geral para {project_name}. Duração total: {overall_project_duration} dias. " +
      "{proposal_gantt}",
  },
  {
    id: "IV",
    sectionId: "attachment_iv",
    titleEn: "Attachment IV — Fee & Payment Schedule",
    titlePt: "Anexo IV — Honorários e Calendário de Pagamentos",
    defaultEnabled: true,
    locked: "none",
    introEn:
      "Detailed fees per phase and corresponding payment milestones.\n\n" +
      "{project_stage_fee_table}\n\n{construction_stage_fee_table}\n\n{payment_schedule_table}",
    introPt:
      "Honorários detalhados por fase e respectivos marcos de pagamento.\n\n" +
      "{project_stage_fee_table}\n\n{construction_stage_fee_table}\n\n{payment_schedule_table}",
  },
  {
    id: "V",
    sectionId: "attachment_v",
    titleEn: "Attachment V — Optional Services",
    titlePt: "Anexo V — Serviços Opcionais",
    defaultEnabled: false,
    locked: "none",
    introEn:
      "Optional services available on request, priced separately and not included in the base fee.",
    introPt:
      "Serviços opcionais disponíveis a pedido, com orçamento separado e não incluídos no honorário base.",
  },
  {
    id: "VI",
    sectionId: "attachment_vi",
    titleEn: "Attachment VI — Consultant Interfaces",
    titlePt: "Anexo VI — Interfaces com Consultores",
    defaultEnabled: false,
    locked: "none",
    introEn:
      "Coordination interfaces with external consultants engaged directly by the client.",
    introPt:
      "Interfaces de coordenação com consultores externos contratados directamente pelo cliente.",
  },
];

export function findAttachment(id: AssemblyAppendixId): AttachmentTemplate {
  const t = ATTACHMENT_TEMPLATES.find((a) => a.id === id);
  if (!t) throw new Error(`Unknown attachment id ${id}`);
  return t;
}
