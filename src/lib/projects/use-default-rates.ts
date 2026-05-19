// Default project rates derived from the HR pricing table.
//
// The HR Resumo Comparativo computes sale rates at multiple margin bands
// (30%, 50%, 100%). For Project Team billing we standardise on the 75% band
// as the default sale rate, and also expose the 100% band for reference.
//
//   1. cota BO/colaborador = (custos op. + VBG total backoffice) / nº colab. projecto
//   2. custo/h = (VBG_próprio + cota_BO) / (dias_uteis × horas_dia)
//   3. venda/h @ X% = custo/h × (1 + X)
//
// Returns Map<resource_id, { sale (75% band), sale100 (100% band), cost }>.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPmDefaultResourceRates } from "./default-rates.functions";

export const PROJECT_DEFAULT_MARGIN = 0.75;

export type DefaultRateInfo = {
  sale: number; // 75% band — project default
  sale100?: number; // 100% band — reference
  cost: number;
};

// Underlying HR tables (salary_snapshots, bo_settings) are admin-only by RLS
// because they contain personal salary data. Non-admin PMs still need to see
// the derived €/h on the resource list, so the computation runs on the server
// (elevated) and only returns aggregated per-resource numbers.
export function useDefaultResourceRates() {
  const fetchRates = useServerFn(getPmDefaultResourceRates);
  return useQuery({
    queryKey: ["pm-default-rates-from-hr"],
    queryFn: async (): Promise<Map<string, DefaultRateInfo>> => {
      const rows = await fetchRates();
      const byResource = new Map<string, DefaultRateInfo>();
      for (const r of rows) {
        byResource.set(r.resource_id, {
          sale: r.sale,
          sale100: r.sale100,
          cost: r.cost,
        });
      }
      return byResource;
    },
  });
}

// Helper: devolve o rate efectivo.
// `isOverride` é o marcador explícito em pm_resources.hourly_rate_is_override.
//   - true  → usa o valor manual (override do projecto).
//   - false → ignora o valor manual (que pode ser legacy default) e cai no HR.
//   - undefined → comportamento legacy (m>0 ⇒ override). Mantido para callers
//     fora do modo projecto (ex: quotes) onde a flag não se aplica.
export function effectiveSaleRate(
  manualRate: number | null | undefined,
  resourceId: string,
  defaults: Map<string, DefaultRateInfo> | undefined,
  isOverride?: boolean,
): number {
  const m = Number(manualRate ?? 0);
  const hrDefault = defaults?.get(resourceId)?.sale ?? 0;
  if (isOverride === false) return hrDefault;
  if (isOverride === true) return m > 0 ? m : hrDefault;
  if (m > 0) return m;
  return hrDefault;
}

// Helper: devolve o custo/h efectivo. Se houver cost_rate manual > 0, usa-o.
// Senão, cai no custo/h calculado no HR (custoHoraDesperdicio).
export function effectiveCostRate(
  manualCost: number | null | undefined,
  resourceId: string,
  defaults: Map<string, DefaultRateInfo> | undefined,
  isOverride?: boolean,
): number {
  const m = Number(manualCost ?? 0);
  const hrDefault = defaults?.get(resourceId)?.cost ?? 0;
  if (isOverride === false) return hrDefault;
  if (isOverride === true) return m > 0 ? m : hrDefault;
  if (m > 0) return m;
  return hrDefault;
}

// Devolve ambos os rates efectivos para um recurso de Projecto.
// resource traz hourly_rate / cost_rate manuais e hourly_rate_is_override
// (marcador explícito). Quando flag=false, qualquer valor manual é ignorado.
export function effectiveRates(
  resource: {
    id: string;
    hourly_rate?: number | null;
    cost_rate?: number | null;
    hourly_rate_is_override?: boolean | null;
  },
  defaults: Map<string, DefaultRateInfo> | undefined,
): { sale: number; cost: number } {
  const flag =
    resource.hourly_rate_is_override == null
      ? undefined
      : !!resource.hourly_rate_is_override;
  return {
    sale: effectiveSaleRate(resource.hourly_rate, resource.id, defaults, flag),
    cost: effectiveCostRate(resource.cost_rate, resource.id, defaults, flag),
  };
}
