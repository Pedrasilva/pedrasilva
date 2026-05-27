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
  // Productive daily hours for THIS collaborator. Pass the collaborator's
  // contractual `daily_hours` so part-timers get an FTE-aware €/h. Fall back
  // to `bo_settings.horas_dia` only when no schedule is available.
  horasDia: number;
  margemLucroPct: number; // 0.25 = 25%
  // Optional target chargeability as a fraction (0..1). When provided and > 0,
  // the cost per hour is computed over BILLABLE hours only — i.e. divided by
  // (diasUteis × horasDia × chargeability) — so non-billable time is recovered
  // through the rate. Defaults to 1.0 (legacy behaviour: assumes 100% of
  // available hours are billable).
  chargeabilityPct?: number;
};

export function computePricing(args: PricingInputs) {
  const custoAnual = args.vbgColaborador + args.cotaBoAnual;
  const chargeability =
    typeof args.chargeabilityPct === "number" && args.chargeabilityPct > 0
      ? Math.min(1, args.chargeabilityPct)
      : 1;
  const horasAno = Math.max(1, args.diasUteis * args.horasDia);
  const horasFacturaveis = Math.max(1, horasAno * chargeability);
  const custoHora = custoAnual / horasFacturaveis;
  const custoHoraDesperdicio = custoHora * (1 + TAXA_DESPERDICIO);
  const vendaHora = custoHoraDesperdicio * (1 + args.margemLucroPct);
  return {
    custoAnual,
    custoHora,
    custoHoraDesperdicio,
    vendaHora,
    chargeabilityPct: chargeability,
    horasFacturaveis,
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
