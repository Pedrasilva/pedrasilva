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

    // Pick the snapshot that should drive project cost rates TODAY.
    // Rules (in order):
    //   1. Use `project_cost_effective_from` when set; otherwise `effective_from`
    //      as the lower bound. This is what makes a salary be retroactive for
    //      HR/payroll while only affecting project margins from a chosen later date.
    //   2. The upper bound is `effective_to` (exclusive) or open-ended.
    //   3. Among matches, pick the one with the most recent lower bound.
    //   4. Fallback: if no snapshot matches the window (e.g. all are in the
    //      future), use the most recent past one anyway so projects always
    //      have a rate; failing that, the `is_effective` flag; failing that,
    //      the newest by reference_date.
    const today = new Date().toISOString().slice(0, 10);
    const pickSnapshotForProjectCost = (sns: Snapshot[]): Snapshot | null => {
      if (sns.length === 0) return null;
      const withBounds = sns.map((s) => ({
        s,
        lower: s.project_cost_effective_from ?? s.effective_from ?? s.reference_date,
        upper: s.effective_to,
      }));
      const active = withBounds
        .filter((x) => x.lower <= today && (x.upper == null || today < x.upper))
        .sort((a, b) => b.lower.localeCompare(a.lower));
      if (active.length > 0) return active[0].s;
      const past = withBounds
        .filter((x) => x.lower <= today)
        .sort((a, b) => b.lower.localeCompare(a.lower));
      if (past.length > 0) return past[0].s;
      return sns.find((s) => s.is_effective) ?? sns[0] ?? null;
    };

    type Agg = { collab: Collaborator; vbg: number };
    const byCollab = new Map<string, Agg>();
    for (const c of collaborators) {
      const sns = snapshots.filter((s) => s.collaborator_id === c.id);
      const ref = pickSnapshotForProjectCost(sns);
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
