// Cálculo do preço de venda à hora por colaborador de Projecto.
//
// Fluxo (acordado com o utilizador):
//   1. Cota de BO por colaborador de Projecto = (custos operacionais + VBG total Backoffice) / Nº colab. Projecto
//   2. Custo total anual do colaborador = VBG_próprio + cota_BO
//   3. Custo / hora = custo_total_anual / (dias_uteis × horas_dia)
//   4. Venda / hora = custo/hora × (1 + margem_lucro)
//      A margem é a global (bo_settings.margem_lucro_pct) excepto se o colaborador
//      tiver um override (collaborators.margem_lucro_pct_override).
//
// Nota: removido o multiplicador de desperdício de 20% — o custo/hora reflecte
// directamente salário + alocação de overhead, sem uplifts assumidos.

export const TAXA_DESPERDICIO = 0; // sem uplift de desperdício

export type PricingInputs = {
  vbgColaborador: number;
  cotaBoAnual: number;
  diasUteis: number;
  horasDia: number;
  margemLucroPct: number; // 0.25 = 25%
};

export function computePricing(args: PricingInputs) {
  const custoAnual = args.vbgColaborador + args.cotaBoAnual;
  const horasAno = Math.max(1, args.diasUteis * args.horasDia);
  const custoHora = custoAnual / horasAno;
  const custoHoraDesperdicio = custoHora * (1 + TAXA_DESPERDICIO);
  const vendaHora = custoHoraDesperdicio * (1 + args.margemLucroPct);
  return {
    custoAnual,
    custoHora,
    custoHoraDesperdicio,
    vendaHora,
  };
}

// BO overhead per Projecto collaborator.
//
// Historically this divided by raw `numColabProjecto` (headcount), which
// over-allocated overhead to part-timers and under-allocated to full-timers.
// When `fteTotalProjecto` is provided (sum of derived FTE units for Projecto
// collaborators — see `computeCollaboratorFte`), it takes precedence and the
// allocation becomes FTE-weighted: a 0.5 FTE absorbs half the overhead of a
// 1.0 FTE. `numColabProjecto` remains the safe legacy fallback.
export function cotaBoPorColabProjecto(args: {
  custosOperacionais: number;
  custoBackofficeVbg: number;
  numColabProjecto: number;
  fteTotalProjecto?: number;
}) {
  const denom =
    typeof args.fteTotalProjecto === "number" && args.fteTotalProjecto > 0
      ? args.fteTotalProjecto
      : args.numColabProjecto;
  if (!denom || denom <= 0) return 0;
  return (args.custosOperacionais + args.custoBackofficeVbg) / denom;
}
