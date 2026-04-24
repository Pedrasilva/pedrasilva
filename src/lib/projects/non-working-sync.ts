// Centralized source-of-truth for "non-working" time persistence.
//
// Non-working entries (vacations + public holidays) live in two places:
//
//   1. The *source*: `vacation_requests` (approved) and `holidays`.
//   2. The *materialised view*: `pm_time_entries` rows of type
//      `non_working`, used by Financials, Forecast and capacity logic.
//
// The materialised rows used to be created lazily by the Weekly Timesheet
// when a user opened a given week. That lazy path was fragile (silent enum
// drift, weeks never visited, etc.), so this helper centralises:
//
//   - the canonical list of "approved" status labels,
//   - the date expansion logic (skip weekends, use HR daily_hours),
//   - the idempotent upsert,
//   - and a reconciliation diff for any [start,end] range.
//
// The Weekly Timesheet, the Monthly Financials view and the one-off backfill
// script all flow through here, so a label change or schema tweak only needs
// to be edited once.

import { supabase } from "@/integrations/supabase/client";

// --- Approved status labels (i18n / enum safety guard) -----------------
//
// `vacation_requests.estado` is plain text, not an enum, and historical rows
// have used both the masculine ("aprovado") and feminine ("aprovada")
// Portuguese forms. New rows from the HR module write "aprovada"; older /
// imported rows may still use "aprovado". We always match on the union so
// neither form silently disappears from non-working aggregates.
export const APPROVED_LEAVE_STATES = ["aprovada", "aprovado"] as const;
export type ApprovedLeaveState = (typeof APPROVED_LEAVE_STATES)[number];

export function isApprovedLeave(estado: string | null | undefined): boolean {
  return !!estado && (APPROVED_LEAVE_STATES as readonly string[]).includes(estado);
}

// --- Types -------------------------------------------------------------

export type NonWorkingExpansion = {
  user_id: string;
  collaborator_id: string;
  entry_date: string; // yyyy-mm-dd
  hours: number;
  leave_type: string; // human label, persisted as-is to pm_time_entries.leave_type
  source_kind: "vacation" | "holiday";
};

export type ReconciliationRow = {
  user_id: string;
  collaborator_id: string;
  collaborator_nome: string;
  expected_hours: number;
  persisted_hours: number;
  missing_hours: number;
};

// --- Helpers -----------------------------------------------------------

export function leaveLabelFor(tipo: string): string {
  switch (tipo) {
    case "ferias":
      return "Vacation";
    case "casamento":
      return "Wedding leave";
    case "falecimento_familiar":
      return "Bereavement";
    case "assistencia_filho":
      return "Child assistance";
    case "nascimento_filho":
      return "Parental leave";
    case "trabalhador_estudante":
      return "Student worker";
    case "doacao_sangue":
      return "Blood donation";
    case "autorizada_paga":
      return "Authorized (paid)";
    case "autorizada_nao_paga":
      return "Authorized (unpaid)";
    default:
      return tipo;
  }
}

function eachWeekday(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const start = new Date(startISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function clampISO(iso: string, lo: string, hi: string): string {
  if (iso < lo) return lo;
  if (iso > hi) return hi;
  return iso;
}

// --- Core: expand source rows for a date range -------------------------

export type CollaboratorMapRow = {
  collaborator_id: string;
  user_id: string;
  daily_hours: number;
};

/**
 * Expand approved vacations + holidays in [rangeStart, rangeEnd] into a flat
 * list of (user_id, date, hours, leave_type) rows. Weekends are skipped.
 *
 * `userMap` resolves collaborator_id -> {user_id, daily_hours}. Rows whose
 * collaborator has no auth user are silently skipped (we only persist time
 * entries for real users).
 */
export async function expandNonWorkingForRange(opts: {
  rangeStart: string;
  rangeEnd: string;
  userMap: Map<string, CollaboratorMapRow>;
}): Promise<NonWorkingExpansion[]> {
  const { rangeStart, rangeEnd, userMap } = opts;

  const [vacRes, holRes] = await Promise.all([
    supabase
      .from("vacation_requests")
      .select("collaborator_id, data_inicio, data_fim, tipo, estado")
      .in("estado", APPROVED_LEAVE_STATES as unknown as string[])
      .lte("data_inicio", rangeEnd)
      .gte("data_fim", rangeStart),
    supabase
      .from("holidays")
      .select("data, nome")
      .gte("data", rangeStart)
      .lte("data", rangeEnd),
  ]);
  if (vacRes.error) throw vacRes.error;
  if (holRes.error) throw holRes.error;

  const out: NonWorkingExpansion[] = [];

  // Vacations: per collaborator, weekday range × daily_hours
  for (const v of (vacRes.data ?? []) as Array<{
    collaborator_id: string;
    data_inicio: string;
    data_fim: string;
    tipo: string;
  }>) {
    const map = userMap.get(v.collaborator_id);
    if (!map) continue;
    const lo = clampISO(v.data_inicio, rangeStart, rangeEnd);
    const hi = clampISO(v.data_fim, rangeStart, rangeEnd);
    if (lo > hi) continue;
    const label = leaveLabelFor(v.tipo);
    for (const iso of eachWeekday(lo, hi)) {
      out.push({
        user_id: map.user_id,
        collaborator_id: v.collaborator_id,
        entry_date: iso,
        hours: map.daily_hours,
        leave_type: label,
        source_kind: "vacation",
      });
    }
  }

  // Holidays: applied to every mapped user (skip weekends)
  for (const h of (holRes.data ?? []) as Array<{ data: string; nome: string }>) {
    const dow = new Date(h.data + "T00:00:00").getDay();
    if (dow === 0 || dow === 6) continue;
    const label = `Public holiday — ${h.nome}`;
    for (const map of userMap.values()) {
      out.push({
        user_id: map.user_id,
        collaborator_id: map.collaborator_id,
        entry_date: h.data,
        hours: map.daily_hours,
        leave_type: label,
        source_kind: "holiday",
      });
    }
  }

  return out;
}

/**
 * Loads {collaborator_id -> user_id, daily_hours} for every collaborator that
 * has a matching auth.users row. Used by every flow that materialises
 * non-working entries.
 */
export async function loadCollaboratorUserMap(): Promise<Map<string, CollaboratorMapRow>> {
  const { data, error } = await supabase.rpc("pm_list_user_resource_map");
  if (error) throw error;
  const ids = ((data ?? []) as Array<{ user_id: string; collaborator_id: string | null }>)
    .filter((r) => r.collaborator_id)
    .map((r) => r.collaborator_id as string);

  if (ids.length === 0) return new Map();

  const { data: collabs, error: cErr } = await supabase
    .from("collaborators_directory")
    .select("id, daily_hours")
    .in("id", ids);
  if (cErr) throw cErr;

  const dh = new Map<string, number>();
  for (const c of (collabs ?? []) as Array<{ id: string; daily_hours: number | null }>) {
    dh.set(c.id, Number(c.daily_hours ?? 8));
  }

  const out = new Map<string, CollaboratorMapRow>();
  for (const r of (data ?? []) as Array<{ user_id: string; collaborator_id: string | null }>) {
    if (!r.collaborator_id) continue;
    out.set(r.collaborator_id, {
      collaborator_id: r.collaborator_id,
      user_id: r.user_id,
      daily_hours: dh.get(r.collaborator_id) ?? 8,
    });
  }
  return out;
}

/**
 * Idempotent persistence: insert any expansion rows that are not already
 * present in pm_time_entries (matched on user_id + entry_date + leave_type).
 * Returns the number of rows inserted.
 */
export async function persistNonWorkingExpansions(
  expansions: NonWorkingExpansion[],
): Promise<number> {
  if (expansions.length === 0) return 0;

  // Compute the bounding date range to scope the existing-row lookup.
  let lo = expansions[0].entry_date;
  let hi = expansions[0].entry_date;
  const userIds = new Set<string>();
  for (const e of expansions) {
    if (e.entry_date < lo) lo = e.entry_date;
    if (e.entry_date > hi) hi = e.entry_date;
    userIds.add(e.user_id);
  }

  const { data: existing, error } = await supabase
    .from("pm_time_entries")
    .select("user_id, entry_date, leave_type")
    .eq("entry_type", "non_working")
    .gte("entry_date", lo)
    .lte("entry_date", hi)
    .in("user_id", Array.from(userIds));
  if (error) throw error;

  const seen = new Set<string>();
  for (const r of (existing ?? []) as Array<{
    user_id: string;
    entry_date: string;
    leave_type: string | null;
  }>) {
    seen.add(`${r.user_id}|${r.entry_date}|${r.leave_type ?? ""}`);
  }

  const toInsert = expansions
    .filter((e) => !seen.has(`${e.user_id}|${e.entry_date}|${e.leave_type}`))
    .map((e) => ({
      user_id: e.user_id,
      entry_date: e.entry_date,
      hours: e.hours,
      entry_type: "non_working" as const,
      leave_type: e.leave_type,
      billable: false,
      source: "auto-nonworking",
    }));

  if (toInsert.length === 0) return 0;

  const { error: insErr } = await supabase
    .from("pm_time_entries")
    .insert(toInsert as never);
  if (insErr) throw insErr;
  return toInsert.length;
}

/**
 * High-level convenience: expand + persist for [rangeStart, rangeEnd].
 * Returns the number of rows inserted.
 */
export async function syncNonWorkingForRange(opts: {
  rangeStart: string;
  rangeEnd: string;
}): Promise<number> {
  const userMap = await loadCollaboratorUserMap();
  const expansions = await expandNonWorkingForRange({
    rangeStart: opts.rangeStart,
    rangeEnd: opts.rangeEnd,
    userMap,
  });
  return persistNonWorkingExpansions(expansions);
}

// --- Reconciliation report --------------------------------------------

/**
 * Compares expected non-working hours (from sources) against persisted
 * pm_time_entries rows for the given range. Returns one row per user with
 * a non-zero diff. Used by the Financials banner to flag drift.
 */
export async function reconcileNonWorkingRange(opts: {
  rangeStart: string;
  rangeEnd: string;
}): Promise<{ rows: ReconciliationRow[]; expectedTotal: number; persistedTotal: number }> {
  const userMap = await loadCollaboratorUserMap();
  const expansions = await expandNonWorkingForRange({
    rangeStart: opts.rangeStart,
    rangeEnd: opts.rangeEnd,
    userMap,
  });

  const expectedByUser = new Map<string, number>();
  for (const e of expansions) {
    expectedByUser.set(e.user_id, (expectedByUser.get(e.user_id) ?? 0) + e.hours);
  }

  const userIds = Array.from(
    new Set([...expectedByUser.keys(), ...Array.from(userMap.values()).map((m) => m.user_id)]),
  );
  if (userIds.length === 0) {
    return { rows: [], expectedTotal: 0, persistedTotal: 0 };
  }

  const { data: persisted, error } = await supabase
    .from("pm_time_entries")
    .select("user_id, hours")
    .eq("entry_type", "non_working")
    .gte("entry_date", opts.rangeStart)
    .lte("entry_date", opts.rangeEnd)
    .in("user_id", userIds);
  if (error) throw error;

  const persistedByUser = new Map<string, number>();
  for (const r of (persisted ?? []) as Array<{ user_id: string; hours: number }>) {
    persistedByUser.set(r.user_id, (persistedByUser.get(r.user_id) ?? 0) + Number(r.hours));
  }

  // Resolve names
  const collabIds = Array.from(userMap.values()).map((m) => m.collaborator_id);
  const nameByCollab = new Map<string, string>();
  if (collabIds.length > 0) {
    const { data: collabs } = await supabase
      .from("collaborators_directory")
      .select("id, nome")
      .in("id", collabIds);
    for (const c of (collabs ?? []) as Array<{ id: string; nome: string }>) {
      nameByCollab.set(c.id, c.nome);
    }
  }
  const userToCollab = new Map<string, string>();
  for (const m of userMap.values()) userToCollab.set(m.user_id, m.collaborator_id);

  const rows: ReconciliationRow[] = [];
  let expectedTotal = 0;
  let persistedTotal = 0;
  for (const uid of userIds) {
    const expected = expectedByUser.get(uid) ?? 0;
    const persistedH = persistedByUser.get(uid) ?? 0;
    expectedTotal += expected;
    persistedTotal += persistedH;
    const diff = expected - persistedH;
    if (Math.abs(diff) < 0.01) continue;
    const cid = userToCollab.get(uid) ?? "";
    rows.push({
      user_id: uid,
      collaborator_id: cid,
      collaborator_nome: nameByCollab.get(cid) ?? uid.slice(0, 8),
      expected_hours: expected,
      persisted_hours: persistedH,
      missing_hours: Math.max(0, diff),
    });
  }
  rows.sort((a, b) => b.missing_hours - a.missing_hours);
  return { rows, expectedTotal, persistedTotal };
}
