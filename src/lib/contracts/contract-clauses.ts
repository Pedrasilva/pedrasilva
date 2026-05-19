/**
 * Stage 5A — Contract Generator Foundation
 *
 * Deterministic clause templates. No AI, no jurisdictional drafting.
 * Wording is intentionally plain — these are editable draft seeds, not
 * final legal language. Each clause renders from the sealed snapshot,
 * so re-rendering is reproducible.
 */
import type {
  ContractSnapshotBundle,
  ResolvedClause,
} from "./types";

type ClauseBuilder = (snap: ContractSnapshotBundle) => ResolvedClause | null;

const fmtEUR = (n: number, currency: string) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: currency || "EUR" }).format(n || 0);

const isPT = (snap: ContractSnapshotBundle) =>
  // language is on the contract row, not the snapshot — clauses stay
  // language-neutral for now and use PT-leaning labels by default.
  true && snap; // referenced to satisfy lint

/* -------------------------------------------------------------------------- */
/* Individual clause builders                                                  */
/* -------------------------------------------------------------------------- */

const partiesClause: ClauseBuilder = (snap) => ({
  clause_key: "parties",
  title: "Partes",
  content: [
    `Entre o Prestador (a completar) e o Cliente ${snap.proposal.company.name ?? "(a indicar)"},`,
    `é celebrado o presente contrato relativo à proposta "${snap.proposal.title}".`,
  ].join(" "),
  sort_order: 10,
  source_resolver: "contracts.parties.v1",
  source_ontology_component: null,
});

const scopeClause: ClauseBuilder = (snap) => ({
  clause_key: "scope",
  title: "Âmbito dos serviços",
  content: [
    `O Prestador obriga-se a executar os serviços profissionais descritos no Anexo "Âmbito",`,
    snap.ontology.family_code
      ? `enquadrados na família "${snap.ontology.family_code}"`
      : "",
    snap.ontology.preset_code
      ? `seguindo o referencial "${snap.ontology.preset_code}".`
      : ".",
  ].filter(Boolean).join(" "),
  sort_order: 20,
  source_resolver: "contracts.scope.v1",
  source_ontology_component: snap.ontology.preset_code,
});

const phasesClause: ClauseBuilder = (snap) => {
  if (!snap.ontology.enabled_phases.length) return null;
  const lines = snap.ontology.enabled_phases.map(
    (p) => `· ${p.name}${p.duration_days ? ` (${p.duration_days} dias)` : ""}`,
  );
  return {
    clause_key: "phases",
    title: "Fases e entregáveis",
    content: [
      "Os serviços organizam-se nas seguintes fases, conforme detalhado no Anexo \"Fases\":",
      ...lines,
    ].join("\n"),
    sort_order: 30,
    source_resolver: "contracts.phases.v1",
    source_ontology_component: snap.ontology.preset_code,
  };
};

const feesClause: ClauseBuilder = (snap) => ({
  clause_key: "fees",
  title: "Honorários",
  content: [
    `Os honorários totais ascendem a ${fmtEUR(snap.commercial.total_fee, snap.proposal.currency)},`,
    "acrescidos de IVA à taxa legal em vigor, conforme decomposição constante do Anexo \"Honorários\".",
  ].join(" "),
  sort_order: 40,
  source_resolver: "contracts.fees.v1",
  source_ontology_component: null,
});

const paymentScheduleClause: ClauseBuilder = (snap) => {
  if (!snap.commercial.payment_schedule.length) return null;
  const recurring = snap.commercial.recurring;
  return {
    clause_key: "payment_schedule",
    title: recurring ? "Faturação recorrente" : "Calendário de pagamentos",
    content: recurring
      ? "A faturação dos serviços segue o regime recorrente descrito no Anexo \"Calendário de pagamentos\"."
      : `Os pagamentos serão efetuados de acordo com os ${snap.commercial.payment_schedule.length} marcos definidos no Anexo \"Calendário de pagamentos\".`,
    sort_order: 50,
    source_resolver: "contracts.payments.v1",
    source_ontology_component: snap.ontology.delivery_mode,
  };
};

const reimbursableClause: ClauseBuilder = () => ({
  clause_key: "reimbursable_expenses",
  title: "Despesas reembolsáveis",
  content:
    "Despesas extraordinárias (deslocações, impressões, vistorias e taxas) serão faturadas ao custo, sujeitas a aprovação prévia escrita do Cliente.",
  sort_order: 60,
  source_resolver: "contracts.reimbursable.v1",
  source_ontology_component: null,
});

const consultantResponsibilitiesClause: ClauseBuilder = () => ({
  clause_key: "consultant_responsibilities",
  title: "Responsabilidades do Prestador",
  content:
    "O Prestador compromete-se a executar os serviços com zelo e diligência profissionais, cumprindo a regulamentação aplicável e os prazos acordados.",
  sort_order: 70,
  source_resolver: "contracts.consultant.v1",
  source_ontology_component: null,
});

const clientResponsibilitiesClause: ClauseBuilder = () => ({
  clause_key: "client_responsibilities",
  title: "Responsabilidades do Cliente",
  content:
    "O Cliente disponibilizará tempestivamente todos os elementos necessários ao desenvolvimento dos trabalhos e nomeará um interlocutor responsável.",
  sort_order: 80,
  source_resolver: "contracts.client.v1",
  source_ontology_component: null,
});

const deliveryModeClause: ClauseBuilder = (snap) => {
  if (!snap.ontology.delivery_mode) return null;
  return {
    clause_key: "delivery_mode",
    title: "Modo de prestação e parceiro local",
    content: `O modo de prestação adotado é \"${snap.ontology.delivery_mode}\". Quando aplicável, será mobilizado consultor local nos termos do Anexo \"Âmbito\".`,
    sort_order: 90,
    source_resolver: "contracts.delivery.v1",
    source_ontology_component: snap.ontology.delivery_mode,
  };
};

const atClause: ClauseBuilder = (snap) => {
  if (!snap.commercial.has_at_retainer) return null;
  return {
    clause_key: "at_standby",
    title: "Assistência Técnica em obra",
    content:
      "A Assistência Técnica em obra é prestada em regime de avença, conforme alocação e tetos definidos no Anexo \"Fases\". Períodos de standby ou suspensão são faturados de acordo com as condições aí descritas.",
    sort_order: 100,
    source_resolver: "contracts.at.v1",
    source_ontology_component: "addon:at_retainer",
  };
};

const suspensionClause: ClauseBuilder = () => ({
  clause_key: "suspension",
  title: "Suspensão e standby",
  content:
    "Em caso de suspensão imputável ao Cliente por período superior a 30 dias, o Prestador reserva-se o direito de rever prazos e condições económicas.",
  sort_order: 110,
  source_resolver: "contracts.suspension.v1",
  source_ontology_component: null,
});

const exclusionsClause: ClauseBuilder = () => ({
  clause_key: "exclusions",
  title: "Exclusões",
  content:
    "Salvo menção expressa em contrário, ficam excluídos os trabalhos de especialidades não listadas, levantamentos topográficos, estudos geotécnicos, mobiliário (FF&E) e licenciamentos por entidades terceiras.",
  sort_order: 120,
  source_resolver: "contracts.exclusions.v1",
  source_ontology_component: null,
});

const bimClause: ClauseBuilder = (snap) => {
  const flags = snap.ontology.flags ?? {};
  const bim = (flags as Record<string, unknown>)["bim"];
  if (!bim) return null;
  return {
    clause_key: "bim",
    title: "Metodologia BIM",
    content:
      "Os trabalhos serão desenvolvidos em ambiente BIM, com nível de informação e protocolo de colaboração a definir em BEP (BIM Execution Plan) específico.",
    sort_order: 130,
    source_resolver: "contracts.bim.v1",
    source_ontology_component: "flag:bim",
  };
};

const ipClause: ClauseBuilder = () => ({
  clause_key: "intellectual_property",
  title: "Propriedade intelectual e uso dos documentos",
  content:
    "Os direitos de autor sobre os documentos entregues pertencem ao Prestador. O Cliente fica autorizado a usá-los para os fins do projeto, mantendo-se interdita qualquer reutilização noutros empreendimentos sem autorização escrita.",
  sort_order: 140,
  source_resolver: "contracts.ip.v1",
  source_ontology_component: null,
});

const acceptanceClause: ClauseBuilder = () => ({
  clause_key: "acceptance",
  title: "Aceitação e assinatura",
  content:
    "O presente contrato considera-se aceite com a aposição das assinaturas das Partes nos espaços previstos no fim do documento (anexo a definir em fase posterior).",
  sort_order: 150,
  source_resolver: "contracts.acceptance.v1",
  source_ontology_component: null,
});

const BUILDERS: ClauseBuilder[] = [
  partiesClause,
  scopeClause,
  phasesClause,
  feesClause,
  paymentScheduleClause,
  reimbursableClause,
  consultantResponsibilitiesClause,
  clientResponsibilitiesClause,
  deliveryModeClause,
  atClause,
  suspensionClause,
  exclusionsClause,
  bimClause,
  ipClause,
  acceptanceClause,
];

export function buildClausesFromSnapshot(snap: ContractSnapshotBundle): ResolvedClause[] {
  // Touch isPT so future jurisdictional branching has a single chokepoint.
  void isPT(snap);
  return BUILDERS.map((b) => b(snap)).filter((c): c is ResolvedClause => c !== null);
}
