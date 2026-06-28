// Team pricing averages — used by the quote financial summary to translate
// fixed-fee architecture stages into implied man-hours, cost and profit using
// the *same* pricing model that drives `_app.hr.resumo.tsx` "Pricing — Project
// Team" table. We deliberately mirror that logic (BO share + chargeability +
// global margin) instead of reading `pm_resources.hourly_rate/sale_rate`,
// which are not the source of truth.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type Collaborator, type Snapshot, computeSnapshot } from "@/lib/salary";
import { computePricing, cotaBoPorColabProjecto } from "@/lib/pricing";
import { computeCollaboratorFte, effectiveDailyHours } from "@/lib/hr/fte";

export type TeamPricingAverages = {
  avgCostPerHour: number;
  avgSalePerHour: number;
  marginPct: number;
  sampleSize: number;
};

export function useTeamPricingAverages() {
  return useQuery<TeamPricingAverages>({
    queryKey: ["team-pricing-averages"],
    queryFn: async () => {
      const [collabRes, snapRes, boRes] = await Promise.all([
        supabase
          .from("collaborators")
          .select("*")
          .is("archived_at", null)
          .eq("departamento", "Projecto"),
        supabase.from("salary_snapshots").select("*").eq("is_effective", true),
        supabase.from("bo_settings").select("*").limit(1).maybeSingle(),
      ]);
      if (collabRes.error) throw collabRes.error;
      if (snapRes.error) throw snapRes.error;
      if (boRes.error) throw boRes.error;

      const projecto = (collabRes.data ?? []) as Collaborator[];
      const snapshots = (snapRes.data ?? []) as Snapshot[];
      const bo = boRes.data as {
        custos_operacionais_anual: number;
        dias_uteis: number;
        horas_dia: number;
        margem_lucro_pct: number;
      } | null;

      // Also need backoffice total VBG to compute BO share. Fetch separately.
      const { data: allCollabs, error: allErr } = await supabase
        .from("collaborators")
        .select("*")
        .is("archived_at", null);
      if (allErr) throw allErr;
      const backoffice = ((allCollabs ?? []) as Collaborator[]).filter(
        (c) => c.departamento === "Backoffice",
      );

      const custosOp = Number(bo?.custos_operacionais_anual ?? 0);
      const diasUteis = Number(bo?.dias_uteis ?? 220);
      const horasDia = Number(bo?.horas_dia ?? 8);
      // Default to the recommended 50% margin (matches HR › Pricing scenario)
      // when bo_settings.margem_lucro_pct is unset or 0.
      const margem = Number(bo?.margem_lucro_pct) || 0.5;


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

      const costs: number[] = [];
      const sales: number[] = [];
      for (const c of projecto) {
        const vbg = vbgFor(c);
        if (!vbg) continue;
        const collabHorasDia = effectiveDailyHours(c.daily_hours, horasDia);
        const fte = computeCollaboratorFte(c.daily_hours, c.days_per_week, horasDia);
        const chargeability =
          c.target_chargeability_pct != null
            ? Number(c.target_chargeability_pct) / 100
            : undefined;
        const p = computePricing({
          vbgColaborador: vbg,
          cotaBoAnual: cotaBo * fte,
          diasUteis,
          horasDia: collabHorasDia,
          margemLucroPct: c.margem_lucro_pct_override ?? margem,
          chargeabilityPct: chargeability,
        });
        costs.push(p.custoHoraDesperdicio);
        sales.push(p.vendaHora);
      }

      const avg = (xs: number[]) =>
        xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

      return {
        avgCostPerHour: avg(costs),
        avgSalePerHour: avg(sales),
        marginPct: margem,
        sampleSize: costs.length,
      };
    },
  });
}
