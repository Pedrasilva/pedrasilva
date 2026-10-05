// Locked project cost rates (server-only).
//
// pm_cost_rate_periods holds one cost €/h per resource per salary window,
// computed with the SAME formula as default-rates.functions.ts:
//   cost/h = (own VBG + BO share × FTE) ÷ (working days × the person's daily hours)
// A manual cost_rate override on pm_resources (hourly_rate_is_override) wins
// from its rate_effective_from date. The DB trigger on pm_time_entries reads
// these periods to stamp cost_rate_snapshot; rebuilding periods never touches
// saved entries (only the admin "recalculate" RPC does).
import { computeSnapshot, type Collaborator, type Snapshot } from "@/lib/salary";
import { computePricing, cotaBoPorColabProjecto } from "@/lib/pricing";
import { computeCollaboratorFte, effectiveDailyHours } from "@/lib/hr/fte";

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

const MARGIN = 0.75; // irrelevant for cost; mirrors default-rates
const FAR_PAST = "1900-01-01";

type CollabRow = Collaborator & { archived_at: string | null };
type ResourceRow = {
  id: string;
  collaborator_id: string | null;
  cost_rate: number | null;
  hourly_rate_is_override: boolean | null;
  rate_effective_from: string | null;
};

export type Inputs = {
  collabs: CollabRow[];
  snaps: Snapshot[];
  custosOp: number;
  diasUteis: number;
  horasDia: number;
  resources: ResourceRow[];
};

export async function loadInputs(db: Db): Promise<Inputs> {
  const [c, s, b, r] = await Promise.all([
    db.from("collaborators").select("*"),
    db.from("salary_snapshots").select("*"),
    db.from("bo_settings").select("*").limit(1).maybeSingle(),
    db.from("pm_resources").select("id, collaborator_id, cost_rate, hourly_rate_is_override, rate_effective_from"),
  ]);
  for (const x of [c, s, b, r]) if (x.error) throw x.error;
  const bo = b.data as { custos_operacionais_anual: number; dias_uteis: number; horas_dia: number } | null;
  return {
    collabs: (c.data ?? []) as unknown as CollabRow[],
    snaps: (s.data ?? []) as unknown as Snapshot[],
    custosOp: Number(bo?.custos_operacionais_anual ?? 0),
    diasUteis: Number(bo?.dias_uteis ?? 220),
    horasDia: Number(bo?.horas_dia ?? 8),
    resources: (r.data ?? []) as ResourceRow[],
  };
}

const lowerOf = (s: Snapshot) => s.project_cost_effective_from ?? s.effective_from ?? s.reference_date;

/** Snapshot that drives project cost on date d (same rules as default-rates). */
export function pickAt(sns: Snapshot[], d: string): Snapshot | null {
  const b = sns.map((s) => ({ s, lower: lowerOf(s), upper: s.effective_to }));
  const active = b.filter((x) => x.lower <= d && (x.upper == null || d < x.upper)).sort((a, z) => z.lower.localeCompare(a.lower));
  if (active.length) return active[0].s;
  const past = b.filter((x) => x.lower <= d).sort((a, z) => z.lower.localeCompare(a.lower));
  return past[0]?.s ?? null;
}

function existedOn(c: CollabRow, d: string) {
  return !c.archived_at || c.archived_at.slice(0, 10) > d;
}

/** BO share per FTE on date d, using salaries valid on `salaryDate`. */
function boPerFte(inp: Inputs, d: string, salaryDate: string) {
  const live = inp.collabs.filter((c) => existedOn(c, d));
  const vbg = (c: CollabRow) => {
    const s = pickAt(inp.snaps.filter((x) => x.collaborator_id === c.id), salaryDate);
    return s ? computeSnapshot(s).custoVBG : 0;
  };
  const projecto = live.filter((c) => c.departamento === "Projecto");
  const backoffice = live.filter((c) => c.departamento === "Backoffice");
  const fteTotal = projecto.reduce((a, c) => a + computeCollaboratorFte(c.daily_hours, c.days_per_week, inp.horasDia), 0);
  const totalBo = backoffice.reduce((a, c) => a + vbg(c), 0);
  return {
    perFte: cotaBoPorColabProjecto({
      custosOperacionais: inp.custosOp,
      custoBackofficeVbg: totalBo,
      numColabProjecto: projecto.length,
      fteTotalProjecto: fteTotal,
    }),
    fteTotal,
    backofficeVbg: totalBo,
  };
}

/** HR cost rate for one collaborator: own salary on `salaryDate`, BO share from `bo`. */
function hrRate(inp: Inputs, c: CollabRow, salaryDate: string, bo: ReturnType<typeof boPerFte>) {
  if (c.departamento !== "Projecto") return null;
  const s = pickAt(inp.snaps.filter((x) => x.collaborator_id === c.id), salaryDate);
  if (!s) return null;
  const ownVbg = computeSnapshot(s).custoVBG;
  if (ownVbg <= 0) return null;
  const fte = computeCollaboratorFte(c.daily_hours, c.days_per_week, inp.horasDia);
  const hpd = effectiveDailyHours(c.daily_hours, inp.horasDia);
  const p = computePricing({
    vbgColaborador: ownVbg,
    cotaBoAnual: bo.perFte * fte,
    diasUteis: inp.diasUteis,
    horasDia: hpd,
    margemLucroPct: MARGIN,
  });
  return {
    rate: Math.round(p.custoHoraDesperdicio * 100) / 100,
    inputs: {
      salary_snapshot_id: s.id,
      own_vbg: Math.round(ownVbg * 100) / 100,
      bo_share_per_fte: Math.round(bo.perFte * 100) / 100,
      bo_share: Math.round(bo.perFte * fte * 100) / 100,
      fte,
      working_days: inp.diasUteis,
      hours_per_day: hpd,
      operating_costs: inp.custosOp,
      backoffice_vbg: Math.round(bo.backofficeVbg * 100) / 100,
      fte_total_projecto: bo.fteTotal,
    },
  };
}

type Period = { resource_id: string; valid_from: string; valid_to: string | null; cost_rate: number; inputs: Record<string, unknown> };

export function computePeriods(inp: Inputs): Period[] {
  const bps = new Set<string>();
  for (const s of inp.snaps) {
    bps.add(lowerOf(s));
    if (s.effective_to) bps.add(s.effective_to);
  }
  for (const c of inp.collabs) if (c.archived_at) bps.add(c.archived_at.slice(0, 10));
  const points = [...bps].sort();
  const collabById = new Map(inp.collabs.map((c) => [c.id, c]));
  const out: Period[] = [];
  for (const r of inp.resources) {
    const manual = !!r.hourly_rate_is_override && Number(r.cost_rate ?? 0) > 0;
    const manualFrom = manual ? (r.rate_effective_from ?? FAR_PAST) : null;
    const c = r.collaborator_id ? collabById.get(r.collaborator_id) : undefined;
    const list: Period[] = [];
    if (c) {
      for (let i = 0; i < points.length; i++) {
        const from = points[i];
        const to = points[i + 1] ?? null;
        if (manualFrom && from >= manualFrom) break;
        const bo = boPerFte(inp, from, from);
        const hr = hrRate(inp, c, from, bo);
        if (!hr) continue;
        const end = manualFrom && (to == null || to > manualFrom) ? manualFrom : to;
        const prev = list[list.length - 1];
        if (prev && prev.valid_to === from && prev.cost_rate === hr.rate) prev.valid_to = end;
        else list.push({ resource_id: r.id, valid_from: from, valid_to: end, cost_rate: hr.rate, inputs: { source: "hr", ...hr.inputs } });
      }
    }
    if (manualFrom) {
      list.push({ resource_id: r.id, valid_from: manualFrom, valid_to: null, cost_rate: Number(r.cost_rate), inputs: { source: "manual_override", cost_rate: Number(r.cost_rate) } });
    }
    out.push(...list);
  }
  return out;
}

/** Rebuild periods from `fromDate` forward. Earlier periods are kept as they are. */
export async function rebuildPeriods(db: Db, fromDate: string = FAR_PAST) {
  const inp = await loadInputs(db);
  const all = computePeriods(inp);
  const now = new Date().toISOString();
  const fresh = all
    .filter((p) => p.valid_to == null || p.valid_to > fromDate)
    .map((p) => ({ ...p, valid_from: p.valid_from < fromDate ? fromDate : p.valid_from, computed_at: now }));
  const del = await db.from("pm_cost_rate_periods").delete().gte("valid_from", fromDate);
  if (del.error) throw del.error;
  const clip = await db
    .from("pm_cost_rate_periods")
    .update({ valid_to: fromDate })
    .lt("valid_from", fromDate)
    .or(`valid_to.is.null,valid_to.gt.${fromDate}`);
  if (clip.error) throw clip.error;
  for (let i = 0; i < fresh.length; i += 500) {
    const ins = await db.from("pm_cost_rate_periods").insert(fresh.slice(i, i + 500) as never);
    if (ins.error) throw ins.error;
  }
  return { periods: fresh.length, from: fromDate };
}

/** Drain the change queue: rebuild from the earliest pending date. */
export async function processQueue(db: Db) {
  const { data, error } = await db
    .from("pm_cost_rate_rebuild_queue")
    .select("id, from_date")
    .is("processed_at", null);
  if (error) throw error;
  const rows = (data ?? []) as { id: string; from_date: string }[];
  if (rows.length === 0) return { processed: 0 };
  const from = rows.map((r) => r.from_date).sort()[0];
  const res = await rebuildPeriods(db, from);
  await db
    .from("pm_cost_rate_rebuild_queue")
    .update({ processed_at: new Date().toISOString() })
    .in("id", rows.map((r) => r.id));
  return { processed: rows.length, ...res };
}

/**
 * Backfill entries that have no snapshot: the person's salary valid on the
 * entry date + TODAY's BO share and settings. Marked cost_rate_source='backfill'.
 */
export async function backfillMissing(db: Db, runBy: string | null) {
  const inp = await loadInputs(db);
  const today = new Date().toISOString().slice(0, 10);
  const bo = boPerFte(inp, today, today);
  const { data, error } = await db.rpc("pm_entries_missing_cost" as never);
  if (error) throw error;
  const rows = (data ?? []) as { id: string; entry_date: string; resource_id: string | null }[];
  const resById = new Map(inp.resources.map((r) => [r.id, r]));
  const collabById = new Map(inp.collabs.map((c) => [c.id, c]));
  const updates: { id: string; rate: number }[] = [];
  const reasons: Record<string, number> = {};
  const skip = (k: string) => (reasons[k] = (reasons[k] ?? 0) + 1);
  for (const e of rows) {
    if (!e.resource_id) { skip("no_resource"); continue; }
    const r = resById.get(e.resource_id)!;
    const manual = !!r?.hourly_rate_is_override && Number(r.cost_rate ?? 0) > 0;
    if (manual && e.entry_date >= (r.rate_effective_from ?? FAR_PAST)) {
      updates.push({ id: e.id, rate: Number(r.cost_rate) });
      continue;
    }
    const c = r?.collaborator_id ? collabById.get(r.collaborator_id) : undefined;
    if (!c) { skip("resource_without_collaborator"); continue; }
    if (c.departamento !== "Projecto") { skip("not_projecto_department"); continue; }
    const hr = hrRate(inp, c, e.entry_date, bo);
    if (!hr) { skip("no_salary_on_date"); continue; }
    updates.push({ id: e.id, rate: hr.rate });
  }
  let written = 0;
  for (let i = 0; i < updates.length; i += 300) {
    const { data: n, error: wErr } = await db.rpc("pm_write_cost_snapshots" as never, {
      _rows: updates.slice(i, i + 300),
      _source: "backfill",
    } as never);
    if (wErr) throw wErr;
    written += Number(n ?? 0);
  }
  await db.from("pm_cost_rate_recalc_log").insert({ run_by: runBy, kind: "backfill", entries_changed: written } as never);
  return { candidates: rows.length, written, skipped: reasons };
}
