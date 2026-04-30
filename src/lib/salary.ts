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
  passe_anual: number;
  beneficio_carro: number;
  beneficio_ticket: number;
  premio_associado: number;
  outros_beneficios: number;
  beneficio_variavel: number;
  notas: string | null;
  // v2 — agregado familiar e cálculo automático IRS
  localizacao: string;
  estado_civil: string;
  numero_titulares: number;
  numero_dependentes: number;
  dependentes_com_deficiencia: number;
  ano_fiscal: number;
  irs_calculado_auto: boolean;
  // Regime de pagamento dos subsídios de férias e Natal
  subsidios_modo: SubsidiosModo;
  // Override manual do subsídio de alimentação (em vez de usar a tabela anual)
  subsidio_alimentacao_manual: boolean;
  subsidio_alimentacao_diario_manual: number;
  // v3 — explicit effective-date range + provenance
  effective_from: string; // YYYY-MM-DD; required
  effective_to: string | null; // YYYY-MM-DD or null = open-ended
  source: "manual" | "excel_import" | "api";
  import_log_id: string | null;
};

export type SubsidiosModo = "tradicional" | "duodecimos_50" | "duodecimos_100";

export const SUBSIDIOS_MODO_OPTIONS: { value: SubsidiosModo; label: string; hint: string }[] = [
  {
    value: "tradicional",
    label: "Tradicional · 14 meses",
    hint: "Recebo os dois subsídios por inteiro (Junho e Novembro).",
  },
  {
    value: "duodecimos_50",
    label: "50% em duodécimos · 13 meses",
    hint: "Metade de cada subsídio diluída nos 12 meses; a outra metade paga por inteiro.",
  },
  {
    value: "duodecimos_100",
    label: "100% em duodécimos · 12 meses",
    hint: "Subsídios totalmente diluídos nos 12 meses.",
  },
];

export function mesesFromSubsidios(modo: SubsidiosModo): number {
  switch (modo) {
    case "duodecimos_100": return 12;
    case "duodecimos_50": return 13;
    case "tradicional":
    default: return 14;
  }
}

export function subsidiosFromMeses(meses: number): SubsidiosModo {
  if (meses <= 12) return "duodecimos_100";
  if (meses === 13) return "duodecimos_50";
  return "tradicional";
}

export type Collaborator = {
  id: string;
  numero_colaborador: string | null;
  nome: string;
  email: string | null;
  foto_path: string | null;
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
  // Working schedule (HR contract) — drives capacity, leave-impact and
  // forecast calculations across the project module.
  daily_hours: number;
  days_per_week: number;
  // Soft-archive metadata. archived_at = null means active. Archived
  // collaborators are hidden from operational pickers but historical
  // records (snapshots, vacations, benefits) remain intact.
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
};

export function computeSnapshot(s: Snapshot) {
  const base = s.valor_base || 0;
  // O regime de subsídios determina os meses pagos. Mantemos meses_pagos como
  // fallback legado para fichas antigas sem subsidios_modo definido.
  const meses = s.subsidios_modo
    ? mesesFromSubsidios(s.subsidios_modo)
    : (s.meses_pagos || 14);

  // Bloco 1 — Base contractual
  // A SS e o IRS incidem sobre o valor efectivamente pago em cada mês.
  // - tradicional (14m): base mensal tributada = valor_base; os subsídios
  //   são pagos por inteiro em Jun/Nov e tributados nesses meses.
  //   Anual SS = base × 14 × ss_pct.
  // - duodécimos 50% (13m): base mensal tributada = base + (50% × base × 2)/12
  //   = base × 13/12; metade restante paga por inteiro em Jun/Nov.
  //   Anual SS = base × 13 × ss_pct.
  // - duodécimos 100% (12m): base mensal tributada = base × 14/12;
  //   nada pago por inteiro. Anual SS = base × 14 × ss_pct.
  const modo = s.subsidios_modo ?? subsidiosFromMeses(meses);
  const duodecimosFactor =
    modo === "duodecimos_100" ? 2 / 12 : modo === "duodecimos_50" ? 1 / 12 : 0;
  const baseMensalTributavel = base * (1 + duodecimosFactor);

  // Total anual de remuneração base sujeita a SS/IRS:
  // tradicional → base × 14 (12 meses + 2 subsídios inteiros)
  // duodecimos_50 → base × 13 (12 mensais alargados + 1 subsídio inteiro)
  // duodecimos_100 → base × 14 (12 mensais alargados, sem subsídios inteiros)
  const baseAnual = base * meses;

  const ssAtelierMensal = baseMensalTributavel * s.ss_atelier_pct;
  const ssColaboradorMensal = baseMensalTributavel * s.ss_colaborador_pct;
  const irsMensal = baseMensalTributavel * s.irs_pct;
  const ssAtelierAnual = baseAnual * s.ss_atelier_pct;
  const ssColaboradorAnual = baseAnual * s.ss_colaborador_pct;
  const irsAnual = baseAnual * s.irs_pct;

  // Líquido "por mês típico" — base mensal tributável menos descontos sobre ela.
  // No tradicional ≡ liquido de um mês normal (14 vezes no ano).
  // Em duodécimos ≡ liquido mensal médio (com a parte diluída já incluída).
  const liquido14m = baseMensalTributavel - ssColaboradorMensal - irsMensal;
  const liquidoAnual = baseAnual - ssColaboradorAnual - irsAnual;
  const liquido12m = liquidoAnual / 12;

  // Bloco 2 — Subsídio alimentação
  const alimentacaoAnual = s.subsidio_alimentacao_diario * s.dias_uteis;
  const alimentacaoMensal = alimentacaoAnual / 12;

  // Bloco 3 — Ajudas de custo
  const ajudasMensal = s.ajudas_custo_anual / 12;

  // Bloco 3b — Passe / Transporte público (ajuda de custo anual separada)
  const passeAnual = s.passe_anual ?? 0;
  const passeMensal = passeAnual / 12;

  // Bloco 4 — Benefícios
  const beneficiosAnual =
    s.beneficio_carro + s.beneficio_ticket + s.premio_associado + s.outros_beneficios + (s.beneficio_variavel ?? 0);
  const beneficiosMensal = beneficiosAnual / 12;

  // Resumo Bruto
  // C41 = E15 + E14 + D26 + D30  (mensal: base12m + ssAtelier12m + alimentacao + ajudas)
  const baseMensal12 = baseAnual / 12;
  const ssAtelier12 = ssAtelierAnual / 12;
  const brutoMensal = baseMensal12 + ssAtelier12 + alimentacaoMensal + ajudasMensal + passeMensal;
  // D41 = C41*12 + D37 (inclui benefícios anuais — alinhado com Excel original)
  const beneficiosAnualTmp =
    s.beneficio_carro + s.beneficio_ticket + s.premio_associado + s.outros_beneficios + (s.beneficio_variavel ?? 0);
  const brutoAnual = brutoMensal * 12 + beneficiosAnualTmp;

  // Líquido total mensal (líquido + alimentação + ajudas)
  // Passe não entra no líquido — é um benefício isento pago pela empresa.
  const liquidoTotalMensal = liquido12m + alimentacaoMensal + ajudasMensal;

  // VBG / Custo total RH (incluindo benefícios + passe)
  const custoVBG = brutoAnual + beneficiosAnual + s.ajudas_custo_anual + passeAnual;

  return {
    base,
    meses,
    baseMensalTributavel,
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
    beneficio_variavel: 0,
    notas: null,
    localizacao: "continente",
    estado_civil: "solteiro",
    numero_titulares: 1,
    numero_dependentes: 0,
    dependentes_com_deficiencia: 0,
    ano_fiscal: 2026,
    irs_calculado_auto: true,
    subsidios_modo: "tradicional",
    subsidio_alimentacao_manual: false,
    subsidio_alimentacao_diario_manual: 0,
    effective_from: new Date().toISOString().slice(0, 10),
    effective_to: null,
    source: "manual",
    import_log_id: null,
  };
}
