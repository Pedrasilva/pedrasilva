// "Saúde da empresa" — full studio cost (server-only maths over salary data).
//
// Salaries never leave the server: this returns only per-month totals
// (project salaries, back-office salaries, operating costs) and the locked
// cost €/h periods already stamped on time entries (pm_cost_rate_periods).
//
//   person cost per working day = annual cost (computeSnapshot().custoVBG of the
//     snapshot valid that day, same pickAt rule as locked cost rates) ÷ bo_settings.dias_uteis
//   counted days = weekdays that are not public holidays, from admission date
//     (data_admissao) until archived_at
//   operating costs per working day = bo_settings.custos_operacionais_anual ÷ dias_uteis
//     (with a department/team filter: × the selected people's FTE share)
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  months: z.array(z.object({ key: z.string(), start: z.string(), end: z.string() })).max(24),
  collaboratorIds: z.array(z.string()).nullable(),
});

export type StudioCostMonth = {
  key: string;
  workingDays: number;
  projectSalary: number;
  backofficeSalary: number;
  opex: number;
  total: number;
};
export type StudioCost = {
  months: StudioCostMonth[];
  inputs: { opexAnnual: number; diasUteis: number; people: number; projectPeople: number; backofficePeople: number; withoutSalary: number; opexShare: number };
  rates: { resource_id: string; valid_from: string; valid_to: string | null; cost_rate: number }[];
};

const addDay = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export const getStudioCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<StudioCost | null> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { computeSnapshot } = await import("@/lib/salary");
    const { computeCollaboratorFte } = await import("@/lib/hr/fte");
    const { pickAt } = await import("@/lib/projects/cost-rates.server");
    type Snap = Parameters<typeof computeSnapshot>[0];
    const first = data.months[0]?.start ?? "2026-06-01";
    const last = data.months[data.months.length - 1]?.end ?? first;
    const [c, s, b, h, r] = await Promise.all([
      supabaseAdmin.from("collaborators").select("id, departamento, data_admissao, archived_at, daily_hours, days_per_week"),
      supabaseAdmin.from("salary_snapshots").select("*"),
      supabaseAdmin.from("bo_settings").select("custos_operacionais_anual, dias_uteis, horas_dia").limit(1).maybeSingle(),
      supabaseAdmin.from("holidays").select("data").gte("data", first).lte("data", last),
      supabaseAdmin.from("pm_cost_rate_periods").select("resource_id, valid_from, valid_to, cost_rate"),
    ]);
    for (const x of [c, s, b, h, r]) if (x.error) throw x.error;
    const opexAnnual = Number(b.data?.custos_operacionais_anual ?? 0);
    const diasUteis = Number(b.data?.dias_uteis ?? 220) || 220;
    const horasDia = Number(b.data?.horas_dia ?? 8) || 8;
    const holidays = new Set((h.data ?? []).map((x) => x.data as string));
    const snaps = (s.data ?? []) as unknown as Snap[];
    type C = { id: string; departamento: string; data_admissao: string | null; archived_at: string | null; daily_hours: number | null; days_per_week: number | null };
    const all = (c.data ?? []) as C[];
    const live = (x: C, d: string) => (!x.data_admissao || x.data_admissao <= d) && (!x.archived_at || x.archived_at.slice(0, 10) > d);
    const inPeriod = all.filter((x) => (!x.data_admissao || x.data_admissao <= last) && (!x.archived_at || x.archived_at.slice(0, 10) > first));
    const chosen = data.collaboratorIds ? inPeriod.filter((x) => data.collaboratorIds!.includes(x.id)) : inPeriod;
    const fte = (x: C) => computeCollaboratorFte(x.daily_hours, x.days_per_week, horasDia);
    const totalFte = inPeriod.reduce((a, x) => a + fte(x), 0);
    const opexShare = data.collaboratorIds ? (totalFte > 0 ? chosen.reduce((a, x) => a + fte(x), 0) / totalFte : 0) : 1;
    const snapsBy = new Map<string, Snap[]>();
    for (const sn of snaps) snapsBy.set(sn.collaborator_id, [...(snapsBy.get(sn.collaborator_id) ?? []), sn]);
    const vbgCache = new Map<string, number>();
    const dailyCost = (x: C, d: string) => {
      const sn = pickAt(snapsBy.get(x.id) ?? [], d);
      if (!sn) return 0;
      let v = vbgCache.get(sn.id);
      if (v == null) vbgCache.set(sn.id, (v = computeSnapshot(sn).custoVBG));
      return v / diasUteis;
    };
    const months: StudioCostMonth[] = data.months.map((m) => {
      let wd = 0, proj = 0, bo = 0;
      for (let d = m.start; d <= m.end; d = addDay(d)) {
        const dow = new Date(d + "T00:00:00Z").getUTCDay();
        if (dow === 0 || dow === 6 || holidays.has(d)) continue;
        wd++;
        for (const x of chosen) {
          if (!live(x, d)) continue;
          const v = dailyCost(x, d);
          if (x.departamento === "Backoffice") bo += v;
          else proj += v;
        }
      }
      const opex = (opexAnnual / diasUteis) * wd * opexShare;
      const r2 = (n: number) => Math.round(n * 100) / 100;
      return { key: m.key, workingDays: wd, projectSalary: r2(proj), backofficeSalary: r2(bo), opex: r2(opex), total: r2(proj + bo + opex) };
    });
    return {
      months,
      inputs: {
        opexAnnual,
        diasUteis,
        people: chosen.length,
        projectPeople: chosen.filter((x) => x.departamento !== "Backoffice").length,
        backofficePeople: chosen.filter((x) => x.departamento === "Backoffice").length,
        withoutSalary: chosen.filter((x) => !(snapsBy.get(x.id) ?? []).length).length,
        opexShare: Math.round(opexShare * 1000) / 1000,
      },
      rates: (r.data ?? []).map((x) => ({ resource_id: x.resource_id, valid_from: x.valid_from, valid_to: x.valid_to, cost_rate: Number(x.cost_rate) })),
    };
  });
