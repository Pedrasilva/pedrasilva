/**
 * Read-only team availability data for the HR month dashboard.
 *
 * Everything here is derived from data that already exists:
 *   - `vacation_requests`  (leave and other authorised absences, incl. half-days)
 *   - `remote_work_requests` (working off-site — counted as AVAILABLE)
 *   - `holidays`           (Portuguese public holidays)
 *   - `collaborators`      (working pattern, department, leave allowance)
 *   - `pm_resources` + `pm_project_team` + `pm_projects` (project filter only)
 *
 * No new tables, no writes, no changes to the existing leave calculations.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISODate } from "@/lib/dates";
import { computeCollaboratorFte } from "@/lib/hr/fte";

export type AbsenceType =
  | "ferias"
  | "casamento"
  | "falecimento_familiar"
  | "assistencia_filho"
  | "nascimento_filho"
  | "trabalhador_estudante"
  | "doacao_sangue"
  | "autorizada_paga"
  | "autorizada_nao_paga";

export type LeaveRow = {
  id: string;
  collaborator_id: string;
  data_inicio: string;
  data_fim: string;
  dias_uteis: number;
  estado: "pendente" | "aprovada" | "rejeitada";
  tipo: AbsenceType;
  periodo: string | null;
};

export type AvailabilityPerson = {
  id: string;
  nome: string;
  foto_path: string | null;
  departamento: string | null;
  includeInPlanning: boolean;
  fte: number;
  daysPerWeek: number | null;
  projectIds: string[];
  /** Leave balance, using the exact existing formula (holiday type only). */
  allowance: number;
  extra: number;
  carryOver: number;
  taken: number;
  booked: number;
};

/** What a single person/day cell shows. */
export type CellKind =
  | "available"
  | "remote"
  | "absent"
  | "absent-half"
  | "pending"
  | "holiday"
  | "weekend";

export type Cell = {
  kind: CellKind;
  /** Absence type — only rendered for viewers allowed to see detail. */
  tipo?: AbsenceType;
  estado?: LeaveRow["estado"];
  /** "manha" | "tarde" for half-days. */
  periodo?: string | null;
  holidayName?: string;
};

export type DayColumn = {
  iso: string;
  date: Date;
  dayOfMonth: number;
  weekday: number;
  isWeekend: boolean;
  isToday: boolean;
  holidayName: string | null;
  /** Working day for the studio (not weekend, not public holiday). */
  isWorkingDay: boolean;
};

export type Coverage = {
  iso: string;
  /** Heads expected to work that day. */
  total: number;
  /** Heads available (present or working remotely; half-days count 0.5). */
  available: number;
  pct: number;
  /** FTE-weighted capacity percentage. */
  capacityPct: number;
  /** Departments / projects with two or more people away at once. */
  clashes: string[];
};

export type TeamAvailability = {
  people: AvailabilityPerson[];
  days: DayColumn[];
  /** person id -> ISO date -> cell */
  cells: Record<string, Record<string, Cell>>;
  coverage: Coverage[];
  projects: { id: string; name: string }[];
  departments: string[];
  /** True when someone works < 5 days a week: we cannot know WHICH days. */
  partTimeScheduleUnknown: boolean;
  loading: boolean;
};

const HALF = new Set(["manha", "tarde"]);

function eachDayOfMonth(year: number, month: number): Date[] {
  const out: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function useTeamAvailability(year: number, month: number): TeamAvailability {
  const collabsQ = useQuery({
    queryKey: ["availability", "collaborators"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators")
        .select(
          "id, nome, foto_path, departamento, include_in_planning, daily_hours, days_per_week, dias_ferias_anuais, dias_ferias_extra, saldo_ferias_anterior, archived_at",
        )
        .is("archived_at", null)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const leaveQ = useQuery({
    queryKey: ["availability", "vacation_requests", year],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vacation_requests")
        .select(
          "id, collaborator_id, data_inicio, data_fim, dias_uteis, estado, tipo, periodo",
        )
        .neq("estado", "rejeitada")
        .lte("data_inicio", `${year + 1}-01-31`)
        .gte("data_fim", `${year - 1}-12-01`);
      if (error) throw error;
      return (data ?? []) as LeaveRow[];
    },
  });

  const remoteQ = useQuery({
    queryKey: ["availability", "remote_work", year],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remote_work_requests")
        .select("collaborator_id, data, estado, location_type")
        .eq("estado", "aprovada")
        .gte("data", `${year}-01-01`)
        .lte("data", `${year}-12-31`);
      if (error) throw error;
      return data ?? [];
    },
  });

  const holidaysQ = useQuery({
    queryKey: ["availability", "holidays"],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("holidays").select("data, nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const teamQ = useQuery({
    queryKey: ["availability", "project-team"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [resources, team, projects] = await Promise.all([
        supabase.from("pm_resources").select("id, collaborator_id"),
        supabase.from("pm_project_team").select("project_id, resource_id"),
        supabase.from("pm_projects").select("id, name, status"),
      ]);
      if (resources.error) throw resources.error;
      if (team.error) throw team.error;
      if (projects.error) throw projects.error;
      return {
        resources: resources.data ?? [],
        team: team.data ?? [],
        projects: projects.data ?? [],
      };
    },
  });

  return useMemo(() => {
    const todayISO = toLocalISODate(new Date());
    const holidayMap = new Map<string, string>(
      (holidaysQ.data ?? []).map((h) => [h.data as string, h.nome as string]),
    );

    const days: DayColumn[] = eachDayOfMonth(year, month).map((date) => {
      const iso = toLocalISODate(date);
      const weekday = date.getDay();
      const isWeekend = weekday === 0 || weekday === 6;
      const holidayName = holidayMap.get(iso) ?? null;
      return {
        iso,
        date,
        dayOfMonth: date.getDate(),
        weekday,
        isWeekend,
        isToday: iso === todayISO,
        holidayName,
        isWorkingDay: !isWeekend && !holidayName,
      };
    });

    // Project membership per collaborator.
    const resourceToCollab = new Map<string, string>();
    for (const r of teamQ.data?.resources ?? []) {
      if (r.collaborator_id) resourceToCollab.set(r.id as string, r.collaborator_id as string);
    }
    const projectsByCollab = new Map<string, string[]>();
    for (const row of teamQ.data?.team ?? []) {
      const cid = resourceToCollab.get(row.resource_id as string);
      if (!cid) continue;
      const list = projectsByCollab.get(cid) ?? [];
      list.push(row.project_id as string);
      projectsByCollab.set(cid, list);
    }

    const leave = leaveQ.data ?? [];

    const people: AvailabilityPerson[] = (collabsQ.data ?? []).map((c) => {
      const mine = leave.filter(
        (l) =>
          l.collaborator_id === c.id &&
          l.tipo === "ferias" &&
          new Date(l.data_inicio).getFullYear() === year,
      );
      const sum = (state: LeaveRow["estado"]) =>
        mine
          .filter((l) => l.estado === state)
          .reduce((s, l) => s + (Number(l.dias_uteis) || 0), 0);
      return {
        id: c.id as string,
        nome: c.nome as string,
        foto_path: (c.foto_path as string | null) ?? null,
        departamento: (c.departamento as string | null) ?? null,
        includeInPlanning: c.include_in_planning !== false,
        fte: computeCollaboratorFte(c.daily_hours as number, c.days_per_week as number),
        daysPerWeek: (c.days_per_week as number | null) ?? null,
        projectIds: projectsByCollab.get(c.id as string) ?? [],
        allowance: Number(c.dias_ferias_anuais) || 0,
        extra: Number(c.dias_ferias_extra) || 0,
        carryOver: Number(c.saldo_ferias_anterior) || 0,
        taken: sum("aprovada"),
        booked: sum("pendente"),
      };
    });

    // Build the person/day matrix.
    const cells: Record<string, Record<string, Cell>> = {};
    for (const p of people) cells[p.id] = {};

    for (const day of days) {
      for (const p of people) {
        cells[p.id]![day.iso] = {
          kind: day.isWeekend ? "weekend" : day.holidayName ? "holiday" : "available",
          holidayName: day.holidayName ?? undefined,
        };
      }
    }

    for (const l of leave) {
      const row = cells[l.collaborator_id];
      if (!row) continue;
      for (const day of days) {
        if (day.iso < l.data_inicio || day.iso > l.data_fim) continue;
        if (!day.isWorkingDay) continue; // weekends/holidays never consume leave
        const half = HALF.has(l.periodo ?? "");
        row[day.iso] = {
          kind: l.estado === "pendente" ? "pending" : half ? "absent-half" : "absent",
          tipo: l.tipo,
          estado: l.estado,
          periodo: l.periodo,
        };
      }
    }

    for (const r of remoteQ.data ?? []) {
      const row = cells[r.collaborator_id as string];
      if (!row) continue;
      const iso = r.data as string;
      const current = row[iso];
      if (!current || current.kind !== "available") continue; // leave wins
      row[iso] = { kind: "remote" };
    }

    // Coverage — active people flagged for planning.
    const pool = people.filter((p) => p.includeInPlanning);
    const totalFte = pool.reduce((s, p) => s + p.fte, 0);

    const coverage: Coverage[] = days.map((day) => {
      if (!day.isWorkingDay) {
        return { iso: day.iso, total: 0, available: 0, pct: 100, capacityPct: 100, clashes: [] };
      }
      let available = 0;
      let fteAvailable = 0;
      const awayByGroup = new Map<string, number>();
      for (const p of pool) {
        const cell = cells[p.id]?.[day.iso];
        const factor =
          cell?.kind === "absent" ? 0 : cell?.kind === "absent-half" ? 0.5 : 1;
        available += factor;
        fteAvailable += p.fte * factor;
        if (factor < 1) {
          if (p.departamento) {
            awayByGroup.set(p.departamento, (awayByGroup.get(p.departamento) ?? 0) + 1);
          }
          for (const pid of p.projectIds) {
            awayByGroup.set(`p:${pid}`, (awayByGroup.get(`p:${pid}`) ?? 0) + 1);
          }
        }
      }
      const clashes = [...awayByGroup.entries()]
        .filter(([, n]) => n >= 2)
        .map(([k]) => k);
      return {
        iso: day.iso,
        total: pool.length,
        available,
        pct: pool.length ? (available / pool.length) * 100 : 100,
        capacityPct: totalFte ? (fteAvailable / totalFte) * 100 : 100,
        clashes,
      };
    });

    const projectIdsInUse = new Set(people.flatMap((p) => p.projectIds));
    const projects = (teamQ.data?.projects ?? [])
      .filter((p) => projectIdsInUse.has(p.id as string))
      .map((p) => ({ id: p.id as string, name: p.name as string }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const departments = [
      ...new Set(people.map((p) => p.departamento).filter(Boolean) as string[]),
    ].sort();

    return {
      people,
      days,
      cells,
      coverage,
      projects,
      departments,
      partTimeScheduleUnknown: pool.some((p) => (p.daysPerWeek ?? 5) < 5),
      loading:
        collabsQ.isLoading || leaveQ.isLoading || remoteQ.isLoading || holidaysQ.isLoading,
    };
  }, [
    year,
    month,
    collabsQ.data,
    collabsQ.isLoading,
    leaveQ.data,
    leaveQ.isLoading,
    remoteQ.data,
    remoteQ.isLoading,
    holidaysQ.data,
    holidaysQ.isLoading,
    teamQ.data,
  ]);
}

/** Yearly per-person, per-month absence day counts for the annual heatmap. */
export function useYearlyAbsenceMatrix(year: number) {
  return useQuery({
    queryKey: ["availability", "year-matrix", year],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vacation_requests")
        .select("collaborator_id, data_inicio, data_fim, estado, tipo, periodo")
        .neq("estado", "rejeitada")
        .lte("data_inicio", `${year}-12-31`)
        .gte("data_fim", `${year}-01-01`);
      if (error) throw error;
      const { data: hol, error: he } = await supabase.from("holidays").select("data");
      if (he) throw he;
      const holidays = new Set((hol ?? []).map((h) => h.data as string));

      const matrix: Record<string, number[]> = {};
      for (const r of data ?? []) {
        const arr = (matrix[r.collaborator_id as string] ??= Array(12).fill(0));
        const cur = new Date((r.data_inicio as string) + "T00:00:00");
        const end = new Date((r.data_fim as string) + "T00:00:00");
        while (cur <= end) {
          const iso = toLocalISODate(cur);
          const wd = cur.getDay();
          if (
            cur.getFullYear() === year &&
            wd !== 0 &&
            wd !== 6 &&
            !holidays.has(iso)
          ) {
            arr[cur.getMonth()] += HALF.has((r.periodo as string) ?? "") ? 0.5 : 1;
          }
          cur.setDate(cur.getDate() + 1);
        }
      }
      return matrix;
    },
  });
}
