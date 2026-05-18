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
import { supabase } from "@/integrations/supabase/client";
import { computeSnapshot, type Collaborator, type Snapshot } from "@/lib/salary";
import { computePricing, cotaBoPorColabProjecto } from "@/lib/pricing";
import { computeCollaboratorFte, effectiveDailyHours } from "@/lib/hr/fte";

export const PROJECT_DEFAULT_MARGIN = 0.75;

export type DefaultRateInfo = {
  sale: number; // 75% band — project default
  sale100?: number; // 100% band — reference
  cost: number;
};

export function useDefaultResourceRates() {
  return useQuery({
    queryKey: ["pm-default-rates-from-hr"],
    queryFn: async (): Promise<Map<string, DefaultRateInfo>> => {
      const [collabs, snaps, bo, resources] = await Promise.all([
        supabase.from("collaborators").select("*").is("archived_at", null),
        supabase.from("salary_snapshots").select("*").order("reference_date", { ascending: false }),
        supabase.from("bo_settings").select("*").limit(1).maybeSingle(),
        supabase.from("pm_resources_public").select("id, collaborator_id"),
      ]);
      if (collabs.error) throw collabs.error;
      if (snaps.error) throw snaps.error;
      if (bo.error) throw bo.error;
      if (resources.error) throw resources.error;

      const collaborators = (collabs.data ?? []) as Collaborator[];
      const snapshots = (snaps.data ?? []) as Snapshot[];
      const settings = bo.data as
        | { custos_operacionais_anual: number; dias_uteis: number; horas_dia: number }
        | null;
      const links = (resources.data ?? []) as { id: string; collaborator_id: string | null }[];

      const custosOp = Number(settings?.custos_operacionais_anual ?? 0);
      const diasUteis = Number(settings?.dias_uteis ?? 220);
      const horasDia = Number(settings?.horas_dia ?? 8);

      // Agregar VBG por colaborador (usa ficha efectiva, ou proposta se não houver)
      type Agg = { collab: Collaborator; vbg: number };
      const byCollab = new Map<string, Agg>();
      for (const c of collaborators) {
        const sns = snapshots.filter((s) => s.collaborator_id === c.id);
        const ref = sns.find((s) => s.is_effective) ?? sns[0] ?? null;
        const vbg = ref ? computeSnapshot(ref).custoVBG : 0;
        byCollab.set(c.id, { collab: c, vbg });
      }

      const projecto = [...byCollab.values()].filter((a) => a.collab.departamento === "Projecto");
      const backoffice = [...byCollab.values()].filter((a) => a.collab.departamento === "Backoffice");
      const totalBackoffice = backoffice.reduce((acc, a) => acc + a.vbg, 0);

      // FTE-weighted BO overhead allocation: total pool is distributed
      // proportionally to each collaborator's FTE. `cotaBoPerFte` is the
      // BO share for 1.0 FTE; each collaborator absorbs `cotaBoPerFte × fte`.
      const fteTotalProjecto = projecto.reduce(
        (acc, a) => acc + computeCollaboratorFte(a.collab.daily_hours, a.collab.days_per_week, horasDia),
        0,
      );

      const cotaBoPerFte = cotaBoPorColabProjecto({
        custosOperacionais: custosOp,
        custoBackofficeVbg: totalBackoffice,
        numColabProjecto: projecto.length,
        fteTotalProjecto,
      });

      // Calcular default por colaborador de Projecto
      const byCollabRate = new Map<string, DefaultRateInfo>();
      for (const a of projecto) {
        if (a.vbg <= 0) continue;
        // Per-collaborator daily hours → part-timers get correct €/h
        // (their actual annual cost divided by their own productive hours).
        // The collaborator's own salary (VBG) is already the part-time annual
        // cost — do NOT gross it up. Only the BO share is FTE-scaled so a
        // 0.5 FTE absorbs half the overhead pool.
        const collabHorasDia = effectiveDailyHours(a.collab.daily_hours, horasDia);
        const fte = computeCollaboratorFte(a.collab.daily_hours, a.collab.days_per_week, horasDia);
        const baseArgs = {
          vbgColaborador: a.vbg,
          cotaBoAnual: cotaBoPerFte * fte,
          diasUteis,
          horasDia: collabHorasDia,
        };
        const p75 = computePricing({ ...baseArgs, margemLucroPct: PROJECT_DEFAULT_MARGIN });
        const p100 = computePricing({ ...baseArgs, margemLucroPct: 1.0 });
        byCollabRate.set(a.collab.id, {
          sale: Math.round(p75.vendaHora * 100) / 100,
          sale100: Math.round(p100.vendaHora * 100) / 100,
          cost: Math.round(p75.custoHoraDesperdicio * 100) / 100,
        });
      }

      // Mapear para resource_id via collaborator_id
      const byResource = new Map<string, DefaultRateInfo>();
      for (const link of links) {
        if (!link.collaborator_id) continue;
        const def = byCollabRate.get(link.collaborator_id);
        if (def) byResource.set(link.id, def);
      }
      return byResource;
    },
  });
}

// Helper: devolve o rate efectivo (manual se definido > 0, senão o default do HR, senão 0)
export function effectiveSaleRate(
  manualRate: number | null | undefined,
  resourceId: string,
  defaults: Map<string, DefaultRateInfo> | undefined,
): number {
  const m = Number(manualRate ?? 0);
  if (m > 0) return m;
  return defaults?.get(resourceId)?.sale ?? 0;
}

// Helper: devolve o custo/h efectivo. Se houver cost_rate manual > 0, usa-o.
// Senão, cai no custo/h calculado no HR (custoHoraDesperdicio).
export function effectiveCostRate(
  manualCost: number | null | undefined,
  resourceId: string,
  defaults: Map<string, DefaultRateInfo> | undefined,
): number {
  const m = Number(manualCost ?? 0);
  if (m > 0) return m;
  return defaults?.get(resourceId)?.cost ?? 0;
}

// Devolve ambos os rates efectivos para um recurso de Projecto.
// resource pode trazer hourly_rate (venda) e cost_rate (custo) manuais.
export function effectiveRates(
  resource: { id: string; hourly_rate?: number | null; cost_rate?: number | null },
  defaults: Map<string, DefaultRateInfo> | undefined,
): { sale: number; cost: number } {
  return {
    sale: effectiveSaleRate(resource.hourly_rate, resource.id, defaults),
    cost: effectiveCostRate(resource.cost_rate, resource.id, defaults),
  };
}
