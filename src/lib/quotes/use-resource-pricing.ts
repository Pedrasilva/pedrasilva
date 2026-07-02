// Per-resource pricing derived from the SAME model as HR › Pricing table
// (`_app.hr.resumo.tsx`). Mirrors `useTeamPricingAverages` but returns a
// per-resource map keyed by `pm_resources.id`, so quote-builder features
// (construction assistance, materials, etc.) can price a resource without
// trusting the potentially stale `pm_resources.hourly_rate` column.
//
// Project rule: default sale margin = 50% markup on cost. This is the
// baseline used everywhere in the quote builder for resource cost→sale
// derivations. `bo_settings.margem_lucro_pct` overrides when set;
// `collaborators.margem_lucro_pct_override` overrides per person.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type Collaborator, type Snapshot, computeSnapshot } from "@/lib/salary";
import { computePricing, cotaBoPorColabProjecto } from "@/lib/pricing";
import { computeCollaboratorFte, effectiveDailyHours } from "@/lib/hr/fte";

/** Project-wide default sale margin = 50% markup on cost. */
export const DEFAULT_SALE_MARGIN_PCT = 0.5;

export interface ResourcePricing {
  costPerHour: number;
  salePerHour: number;
  marginPct: number;
}

export function useResourcePricing() {
  return useQuery<Map<string, ResourcePricing>>({
    queryKey: ["resource-pricing", "per-resource"],
    queryFn: async () => {
      const [resourcesRes, collabRes, snapRes, boRes] = await Promise.all([
        supabase.from("pm_resources").select("id, collaborator_id, hourly_rate, hourly_rate_is_override"),
        supabase.from("collaborators").select("*").is("archived_at", null),
        supabase.from("salary_snapshots").select("*").eq("is_effective", true),
        supabase.from("bo_settings").select("*").limit(1).maybeSingle(),
      ]);
      if (resourcesRes.error) throw resourcesRes.error;
      if (collabRes.error) throw collabRes.error;
      if (snapRes.error) throw snapRes.error;
      if (boRes.error) throw boRes.error;

      const resources = resourcesRes.data ?? [];
      const collabs = (collabRes.data ?? []) as Collaborator[];
      const snapshots = (snapRes.data ?? []) as Snapshot[];
      const bo = boRes.data as {
        custos_operacionais_anual?: number;
        dias_uteis?: number;
        horas_dia?: number;
        margem_lucro_pct?: number;
      } | null;

      const custosOp = Number(bo?.custos_operacionais_anual ?? 0);
      const diasUteis = Number(bo?.dias_uteis ?? 220);
      const horasDia = Number(bo?.horas_dia ?? 8);
      // Default to the project-wide 50% markup when bo_settings has none.
      const margemDefault = Number(bo?.margem_lucro_pct) || DEFAULT_SALE_MARGIN_PCT;

      const projecto = collabs.filter((c) => c.departamento === "Projecto");
      const backoffice = collabs.filter((c) => c.departamento === "Backoffice");

      const vbgFor = (c: Collaborator): number => {
        const s = snapshots.find((sn) => sn.collaborator_id === c.id);
        return s ? computeSnapshot(s).custoVBG : 0;
      };
      const totalBackofficeVbg = backoffice.reduce((a, c) => a + vbgFor(c), 0);

      const fteTotalProjecto = projecto.reduce(
        (a, c) => a + computeCollaboratorFte(c.daily_hours, c.days_per_week, horasDia),
        0,
      );
      const cotaBo = cotaBoPorColabProjecto({
        custosOperacionais: custosOp,
        custoBackofficeVbg: totalBackofficeVbg,
        numColabProjecto: projecto.length,
        fteTotalProjecto,
      });

      const collabById = new Map(collabs.map((c) => [c.id, c]));
      const map = new Map<string, ResourcePricing>();

      for (const r of resources) {
        const collab = r.collaborator_id ? collabById.get(r.collaborator_id) : undefined;
        if (!collab) {
          // No HR link — fall back to stored hourly_rate as SALE and derive
          // cost from the default margin so at least the number is consistent.
          const sale = Number(r.hourly_rate) || 0;
          const cost = sale / (1 + margemDefault);
          map.set(r.id, { costPerHour: cost, salePerHour: sale, marginPct: margemDefault });
          continue;
        }
        const vbg = vbgFor(collab);
        if (!vbg) {
          map.set(r.id, { costPerHour: 0, salePerHour: 0, marginPct: margemDefault });
          continue;
        }
        const collabHorasDia = effectiveDailyHours(collab.daily_hours, horasDia);
        const fte = computeCollaboratorFte(collab.daily_hours, collab.days_per_week, horasDia);
        const chargeability =
          collab.target_chargeability_pct != null
            ? Number(collab.target_chargeability_pct) / 100
            : undefined;
        const marginPct = collab.margem_lucro_pct_override ?? margemDefault;
        const p = computePricing({
          vbgColaborador: vbg,
          cotaBoAnual: cotaBo * fte,
          diasUteis,
          horasDia: collabHorasDia,
          margemLucroPct: marginPct,
          chargeabilityPct: chargeability,
        });
        map.set(r.id, {
          costPerHour: p.custoHoraDesperdicio,
          salePerHour: p.vendaHora,
          marginPct,
        });
      }
      return map;
    },
  });
}
