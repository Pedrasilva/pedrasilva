// Cálculos salariais — espelham as fórmulas do Excel original.
// Inputs (células amarelas) → outputs (células com fórmula).

export type SubsidiosModo = "tradicional" | "duodecimos_50" | "duodecimos_100";

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
  // v2 — agregado familiar e cálculo automático IRS
  localizacao: string;
  estado_civil: string;
  numero_titulares: number;
  numero_dependentes: number;
  dependentes_com_deficiencia: number;
  ano_fiscal: number;
  irs_calculado_auto: boolean;
  // v3 — modo de pagamento dos subsídios (duodécimos)
  subsidios_modo: SubsidiosModo;
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
  dias_ferias_extra: number;
  // Agregado familiar (contexto fiscal partilhado por todas as fichas)
  localizacao: string;
  estado_civil: string;
  numero_titulares: number;
  numero_dependentes: number;
  dependentes_com_deficiencia: number;
  ano_fiscal: number;
};

export const SUBSIDIOS_MODO_LABEL: Record<SubsidiosModo, string> = {
  tradicional: "Tradicional (14 meses)",
  duodecimos_50: "Duodécimos a 50%",
  duodecimos_100: "Duodécimos a 100%",
};

export const SUBSIDIOS_MODO_DESC: Record<SubsidiosModo, string> = {
  tradicional:
    "Subsídios de férias e Natal pagos integralmente em Junho e Novembro (14 ordenados).",
  duodecimos_50:
    "Metade de cada subsídio diluída pelos 12 meses do ano; a outra metade paga em Junho e Novembro.",
  duodecimos_100:
    "Subsídios de férias e Natal totalmente diluídos pelos 12 meses do ano (sem extras em Jun/Nov).",
};

export function computeSnapshot(s: Snapshot) {
  const base = s.valor_base || 0;
  const meses = s.meses_pagos || 14;
  const modo: SubsidiosModo = s.subsidios_modo ?? "tradicional";

  // Bloco 1 — Base contractual (cálculo "puro" por mês de pagamento)
  const ssAtelierMensal = base * s.ss_atelier_pct;
  const ssColaboradorMensal = base * s.ss_colaborador_pct;
  const irsMensal = base * s.irs_pct;
  const baseAnual = base * meses;
  const ssAtelierAnual = ssAtelierMensal * meses;
  const ssColaboradorAnual = ssColaboradorMensal * meses;
  const irsAnual = irsMensal * meses;

  const liquido14m = base - ssColaboradorMensal - irsMensal; // por mês de pagamento
  const liquidoAnual = liquido14m * meses;
  const liquido12m = liquidoAnual / 12;

  // --- Decomposição "12 ordenados + subsídios" para vista pedagógica
  // Assume meses = 12 (ordenados) + nº subsídios (0, 1 ou 2)
  const subsidiosCount = Math.max(0, meses - 12);
  // Fração do subsídio diluída por mês (em duodécimos)
  const fraccaoDuodecimos =
    modo === "tradicional" ? 0 : modo === "duodecimos_50" ? 0.5 : 1;
  // Subsídio "extra" pago no mês de Jun/Nov (parte não diluída)
  const fraccaoExtra = 1 - fraccaoDuodecimos;

  // Líquido base (12 meses de ordenado)
  const liquidoOrdenado = liquido14m; // por mês de ordenado é igual ao base líquido
  // Parte do subsídio que entra todos os meses (em duodécimos)
  const liquidoSubsidiosDiluidoMes =
    (subsidiosCount * fraccaoDuodecimos * liquido14m) / 12;
  // Mês "normal" (sem subsídio extra)
  const liquidoMesNormal = liquidoOrdenado + liquidoSubsidiosDiluidoMes;
  // Mês com subsídio (Jun/Nov) — recebe o ordenado + a parte extra do subsídio
  const liquidoSubsidioExtra = fraccaoExtra * liquido14m;
  const liquidoMesComSubsidio = liquidoOrdenado + liquidoSubsidiosDiluidoMes + liquidoSubsidioExtra;

  // Equivalente para o BRUTO
  const brutoMesNormal = base + (subsidiosCount * fraccaoDuodecimos * base) / 12;
  const brutoMesComSubsidio = brutoMesNormal + fraccaoExtra * base;

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
  const baseMensal12 = baseAnual / 12;
  const ssAtelier12 = ssAtelierAnual / 12;
  const brutoMensal = baseMensal12 + ssAtelier12 + alimentacaoMensal + ajudasMensal;
  const beneficiosAnualTmp =
    s.beneficio_carro + s.beneficio_ticket + s.premio_associado + s.outros_beneficios;
  const brutoAnual = brutoMensal * 12 + beneficiosAnualTmp;

  // Líquido total mensal (líquido + alimentação + ajudas)
  const liquidoTotalMensal = liquido12m + alimentacaoMensal + ajudasMensal;

  // VBG / Custo total RH (incluindo benefícios)
  const custoVBG = brutoAnual + beneficiosAnual + s.ajudas_custo_anual;

  // Take-home "do bolso" — líquido + alimentação + ajudas, separando mês normal vs com subsídio
  const takeHomeMesNormal = liquidoMesNormal + alimentacaoMensal + ajudasMensal;
  const takeHomeMesComSubsidio = liquidoMesComSubsidio + alimentacaoMensal + ajudasMensal;

  // % retenção efectiva (IRS+SS sobre o bruto base)
  const totalDescontosAnuais = ssColaboradorAnual + irsAnual;
  const pctRetencao = baseAnual > 0 ? totalDescontosAnuais / baseAnual : 0;

  return {
    base,
    meses,
    modo,
    subsidiosCount,
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
    // decomposição duodécimos
    liquidoMesNormal,
    liquidoMesComSubsidio,
    liquidoSubsidioExtra,
    brutoMesNormal,
    brutoMesComSubsidio,
    fraccaoDuodecimos,
    fraccaoExtra,
    // outros
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
    takeHomeMesNormal,
    takeHomeMesComSubsidio,
    pctRetencao,
  };
}

export type Computed = ReturnType<typeof computeSnapshot>;

export const fmtEUR = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return "—";
  // Formato: 1 234,56€ — espaço fino como separador de milhares, vírgula decimal, € colado.
  const formatted = new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  })
    .format(n)
    .replace(/[\s\u202F\u00A0]/g, "\u00A0");
  return `${formatted}€`;
};

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
    irs_pct: 0,
    meses_pagos: 14,
    subsidio_alimentacao_diario: 0,
    dias_uteis: 230,
    ajudas_custo_anual: 0,
    beneficio_carro: 0,
    beneficio_ticket: 0,
    premio_associado: 0,
    outros_beneficios: 0,
    notas: null,
    localizacao: "continente",
    estado_civil: "solteiro",
    numero_titulares: 1,
    numero_dependentes: 0,
    dependentes_com_deficiencia: 0,
    ano_fiscal: 2026,
    irs_calculado_auto: true,
    subsidios_modo: "tradicional",
  };
}
