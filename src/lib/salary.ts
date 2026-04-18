// Cálculos salariais — espelham as fórmulas do Excel original.
// Inputs (células amarelas) → outputs (células com fórmula).

export type Snapshot = {
  id: string;
  collaborator_id: string;
  label: string;
  reference_date: string;
  is_effective: boolean;
  valor_base: number;
  ss_atelier_pct: number;
  ss_colaborador_pct: number;
  irs_pct: number;
  meses_pagos: number;
  subsidio_alimentacao_diario: number;
  dias_uteis: number;
  ajudas_custo_anual: number;
  beneficio_carro: number;
  beneficio_ticket: number;
  premio_associado: number;
  outros_beneficios: number;
  notas: string | null;
};

export type Collaborator = {
  id: string;
  numero_colaborador: string | null;
  nome: string;
  email: string | null;
  data_nascimento: string | null;
  inicio_carreira: string | null;
  situacao_contractual: string | null;
  departamento: "Projecto" | "Backoffice";
  margem_lucro_pct_override: number | null;
  dias_ferias_anuais: number;
  saldo_ferias_anterior: number;
};

export function computeSnapshot(s: Snapshot) {
  const base = s.valor_base || 0;
  const meses = s.meses_pagos || 14;

  // Bloco 1 — Base contractual
  const ssAtelierMensal = base * s.ss_atelier_pct;
  const ssColaboradorMensal = base * s.ss_colaborador_pct;
  const irsMensal = base * s.irs_pct;
  const baseAnual = base * meses;
  const ssAtelierAnual = ssAtelierMensal * meses;
  const ssColaboradorAnual = ssColaboradorMensal * meses;
  const irsAnual = irsMensal * meses;

  const liquido14m = base - ssColaboradorMensal - irsMensal; // por mês de pagamento (14)
  const liquidoAnual = liquido14m * meses;
  const liquido12m = liquidoAnual / 12;

  // Bloco 2 — Subsídio alimentação
  const alimentacaoAnual = s.subsidio_alimentacao_diario * s.dias_uteis;
  const alimentacaoMensal = alimentacaoAnual / 12;

  // Bloco 3 — Ajudas de custo
  const ajudasMensal = s.ajudas_custo_anual / 12;

  // Bloco 4 — Benefícios
  const beneficiosAnual =
    s.beneficio_carro + s.beneficio_ticket + s.premio_associado + s.outros_beneficios;
  const beneficiosMensal = beneficiosAnual / 12;

  // Resumo Bruto
  // C41 = E15 + E14 + D26 + D30  (mensal: base12m + ssAtelier12m + alimentacao + ajudas)
  const baseMensal12 = baseAnual / 12;
  const ssAtelier12 = ssAtelierAnual / 12;
  const brutoMensal = baseMensal12 + ssAtelier12 + alimentacaoMensal + ajudasMensal;
  // D41 = C41*12 + D37 (inclui benefícios anuais — alinhado com Excel original)
  const beneficiosAnualTmp =
    s.beneficio_carro + s.beneficio_ticket + s.premio_associado + s.outros_beneficios;
  const brutoAnual = brutoMensal * 12 + beneficiosAnualTmp;

  // Líquido total mensal (líquido + alimentação + ajudas)
  const liquidoTotalMensal = liquido12m + alimentacaoMensal + ajudasMensal;

  // VBG / Custo total RH (incluindo benefícios)
  const custoVBG = brutoAnual + beneficiosAnual + s.ajudas_custo_anual;

  return {
    base,
    meses,
    ssAtelierMensal,
    ssColaboradorMensal,
    irsMensal,
    baseAnual,
    ssAtelierAnual,
    ssColaboradorAnual,
    irsAnual,
    liquido14m,
    liquidoAnual,
    liquido12m,
    alimentacaoAnual,
    alimentacaoMensal,
    ajudasMensal,
    beneficiosAnual,
    beneficiosMensal,
    baseMensal12,
    ssAtelier12,
    brutoMensal,
    brutoAnual,
    liquidoTotalMensal,
    custoVBG,
  };
}

export type Computed = ReturnType<typeof computeSnapshot>;

export const fmtEUR = (n: number | null | undefined) =>
  n == null || isNaN(n)
    ? "—"
    : new Intl.NumberFormat("pt-PT", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 2,
      }).format(n);

export const fmtPct = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "percent",
    maximumFractionDigits: 2,
    minimumFractionDigits: 1,
  }).format(n);

export const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("pt-PT") : "—";

export function defaultSnapshot(
  collaborator_id: string,
  label = "Actual",
  is_effective = true,
): Omit<Snapshot, "id"> {
  return {
    collaborator_id,
    label,
    reference_date: new Date().toISOString().slice(0, 10),
    is_effective,
    valor_base: 0,
    ss_atelier_pct: 0.2375,
    ss_colaborador_pct: 0.11,
    irs_pct: 0.135,
    meses_pagos: 14,
    subsidio_alimentacao_diario: 0,
    dias_uteis: 220,
    ajudas_custo_anual: 0,
    beneficio_carro: 0,
    beneficio_ticket: 0,
    premio_associado: 0,
    outros_beneficios: 0,
    notas: null,
  };
}
