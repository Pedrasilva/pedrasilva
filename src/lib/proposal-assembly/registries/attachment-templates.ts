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
      "The general conditions below govern the engagement described in this proposal. They " +
      "are semi-locked: edit only where the specific client contract requires deviation from " +
      "PSA's standard terms.",
    introPt:
      "As condições gerais que se seguem regem a contratação descrita nesta proposta. São " +
      "semi-bloqueadas: editar apenas quando o contrato específico do cliente exigir desvio " +
      "face aos termos-padrão da PSA.",
  },
  {
    id: "II",
    sectionId: "attachment_ii",
    titleEn: "Attachment II — Scope & Deliverables Matrix",
    titlePt: "Anexo II — Matriz de Âmbito e Entregáveis",
    defaultEnabled: true,
    locked: "none",
    introEn:
      "The matrix below lists deliverables per project phase — drawings, schedules, " +
      "specifications and coordination outputs — with responsibility (PSA, consultant, " +
      "client, contractor) and issue format. It is the procurement-facing reference for " +
      "what each fee buys.",
    introPt:
      "A matriz seguinte lista os entregáveis por fase do projecto — desenhos, mapas, " +
      "especificações e outputs de coordenação — com responsabilidade (PSA, consultor, " +
      "cliente, empreiteiro) e formato de entrega. É a referência para procurement do que " +
      "cada honorário cobre.",
  },
  {
    id: "III",
    sectionId: "attachment_iii",
    titleEn: "Attachment III — Programme",
    titlePt: "Anexo III — Programa",
    defaultEnabled: true,
    locked: "none",
    introEn:
      "Programme overview for {project_name}. The working programme will be validated with " +
      "the client team before detailed mobilisation. Where dates or durations are not yet " +
      "confirmed, this attachment provides a readable phase sequence rather than an empty " +
      "Gantt placeholder.",
    introPt:
      "Programa geral para {project_name}. O programa de trabalho será validado com a equipa " +
      "do cliente antes da mobilização detalhada. Quando datas ou durações ainda não estejam " +
      "confirmadas, este anexo apresenta uma sequência de fases legível em vez de um Gantt vazio.",
  },
  {
    id: "IV",
    sectionId: "attachment_iv",
    titleEn: "Attachment IV — Fee & Payment Schedule",
    titlePt: "Anexo IV — Honorários e Calendário de Pagamentos",
    defaultEnabled: true,
    locked: "none",
    introEn:
      "Detailed commercial schedules are confirmed once the stage scope, fee basis and " +
      "payment milestones are validated. Project stages are intended to operate as fixed-fee " +
      "milestones, while Construction Assistance, where included, is structured as a monthly " +
      "retainer aligned with the construction programme.",
    introPt:
      "Os quadros comerciais detalhados são confirmados após validação do âmbito das fases, " +
      "base de honorários e marcos de pagamento. As fases de projecto operam como marcos de " +
      "honorários fixos, enquanto a Assistência à Obra, quando incluída, é estruturada como " +
      "retainer mensal alinhado com o programa de obra.",
  },
  {
    id: "V",
    sectionId: "attachment_v",
    titleEn: "Attachment V — Optional Services",
    titlePt: "Anexo V — Serviços Opcionais",
    defaultEnabled: false,
    locked: "none",
    introEn:
      "Services available on request, priced separately and not included in the base fee. " +
      "Typical add-ons include BIM uplift, sustainability certification support, post-" +
      "occupancy studies and wayfinding/signage design.",
    introPt:
      "Serviços disponíveis a pedido, com orçamento separado e não incluídos no honorário " +
      "base. Add-ons típicos incluem upgrade BIM, apoio a certificação de sustentabilidade, " +
      "estudos pós-ocupação e design de sinalética/wayfinding.",
  },
  {
    id: "VI",
    sectionId: "attachment_vi",
    titleEn: "Attachment VI — Consultant Interfaces",
    titlePt: "Anexo VI — Interfaces com Consultores",
    defaultEnabled: false,
    locked: "none",
    introEn:
      "Coordination interfaces with external consultants engaged directly by the client " +
      "(MEP, structure, QS, acoustics, AV, security, fire). Includes the cadence of " +
      "coordination meetings, the model/drawing exchange protocol and the issue-resolution " +
      "path during design and construction.",
    introPt:
      "Interfaces de coordenação com consultores externos contratados directamente pelo " +
      "cliente (MEP, estrutura, QS, acústica, AV, segurança, incêndio). Inclui a cadência de " +
      "reuniões de coordenação, o protocolo de troca de modelos/desenhos e o circuito de " +
      "resolução de issues em projecto e obra.",
  },
];

export function findAttachment(id: AssemblyAppendixId): AttachmentTemplate {
  const t = ATTACHMENT_TEMPLATES.find((a) => a.id === id);
  if (!t) throw new Error(`Unknown attachment id ${id}`);
  return t;
}
