// Server function: returns per-resource default rates (cost/sale/sale100)
// derived from HR salary snapshots + BO settings.
//
// Why server-side: salary_snapshots and bo_settings are admin-only by RLS
// (they contain personal salary data). Non-admin PMs still need to see the
// derived €/h for project resources. This fn runs with elevated access but
// only ever returns aggregated per-resource numbers — never raw salaries.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeSnapshot, type Collaborator, type Snapshot } from "@/lib/salary";
import { computePricing, cotaBoPorColabProjecto } from "@/lib/pricing";
import { computeCollaboratorFte, effectiveDailyHours } from "@/lib/hr/fte";

export type DefaultRateEntry = {
  resource_id: string;
  sale: number;
  sale100: number;
  cost: number;
};

const PROJECT_DEFAULT_MARGIN = 0.75;

export const getPmDefaultResourceRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<DefaultRateEntry[]> => {
    const [collabs, snaps, bo, resources] = await Promise.all([
      supabaseAdmin.from("collaborators").select("*").is("archived_at", null),
      supabaseAdmin
        .from("salary_snapshots")
        .select("*")
        .order("reference_date", { ascending: false }),
      supabaseAdmin.from("bo_settings").select("*").limit(1).maybeSingle(),
      supabaseAdmin.from("pm_resources").select("id, collaborator_id"),
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
    const links = (resources.data ?? []) as {
      id: string;
      collaborator_id: string | null;
    }[];

    const custosOp = Number(settings?.custos_operacionais_anual ?? 0);
    const diasUteis = Number(settings?.dias_uteis ?? 220);
    const horasDia = Number(settings?.horas_dia ?? 8);

    type Agg = { collab: Collaborator; vbg: number };
    const byCollab = new Map<string, Agg>();
    for (const c of collaborators) {
      const sns = snapshots.filter((s) => s.collaborator_id === c.id);
      const ref = sns.find((s) => s.is_effective) ?? sns[0] ?? null;
      const vbg = ref ? computeSnapshot(ref).custoVBG : 0;
      byCollab.set(c.id, { collab: c, vbg });
    }

    const projecto = [...byCollab.values()].filter(
      (a) => a.collab.departamento === "Projecto",
    );
    const backoffice = [...byCollab.values()].filter(
      (a) => a.collab.departamento === "Backoffice",
    );
    const totalBackoffice = backoffice.reduce((acc, a) => acc + a.vbg, 0);

    const fteTotalProjecto = projecto.reduce(
      (acc, a) =>
        acc +
        computeCollaboratorFte(a.collab.daily_hours, a.collab.days_per_week, horasDia),
      0,
    );

    const cotaBoPerFte = cotaBoPorColabProjecto({
      custosOperacionais: custosOp,
      custoBackofficeVbg: totalBackoffice,
      numColabProjecto: projecto.length,
      fteTotalProjecto,
    });

    const byCollabRate = new Map<
      string,
      { sale: number; sale100: number; cost: number }
    >();
    for (const a of projecto) {
      if (a.vbg <= 0) continue;
      const collabHorasDia = effectiveDailyHours(a.collab.daily_hours, horasDia);
      const fte = computeCollaboratorFte(
        a.collab.daily_hours,
        a.collab.days_per_week,
        horasDia,
      );
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

    const out: DefaultRateEntry[] = [];
    for (const link of links) {
      if (!link.collaborator_id) continue;
      const def = byCollabRate.get(link.collaborator_id);
      if (def) out.push({ resource_id: link.id, ...def });
    }
    return out;
  });
