import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BirthdayItem = {
  id: string;
  nome: string;
  date: string; // ISO YYYY-MM-DD of next occurrence
  daysAway: number;
  age?: number; // age they are turning (birthday)
  years?: number; // years at PSA (work anniversary)
  kind: "birthday" | "anniversary";
};

export type VacationActiveItem = {
  id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
  tipo: string;
};

export type HolidayItem = {
  id: string;
  nome: string;
  data: string;
  daysAway: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function nextOccurrence(monthDay: { m: number; d: number }, today: Date): Date {
  const year = today.getFullYear();
  const candidate = new Date(year, monthDay.m, monthDay.d);
  // strip time
  const todayMid = new Date(year, today.getMonth(), today.getDate());
  if (candidate < todayMid) {
    return new Date(year + 1, monthDay.m, monthDay.d);
  }
  return candidate;
}

function diffDays(a: Date, b: Date): number {
  const ams = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bms = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ams - bms) / DAY_MS);
}

function parseDate(s: string): Date {
  // YYYY-MM-DD safe parse
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * Returns upcoming birthdays + PSA work anniversaries within `windowDays` days.
 */
export function useUpcomingCelebrations(windowDays = 45) {
  return useQuery<BirthdayItem[]>({
    queryKey: ["home", "celebrations", windowDays],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators")
        .select("id, nome, data_nascimento, inicio_carreira");
      if (error) throw error;
      const today = new Date();
      const items: BirthdayItem[] = [];

      for (const c of data ?? []) {
        if (c.data_nascimento) {
          const birth = parseDate(c.data_nascimento);
          const next = nextOccurrence(
            { m: birth.getMonth(), d: birth.getDate() },
            today,
          );
          const days = diffDays(next, today);
          if (days <= windowDays) {
            items.push({
              id: `b-${c.id}`,
              nome: c.nome,
              date: toIsoDate(next),
              daysAway: days,
              age: next.getFullYear() - birth.getFullYear(),
              kind: "birthday",
            });
          }
        }
        if (c.inicio_carreira) {
          const start = parseDate(c.inicio_carreira);
          const next = nextOccurrence(
            { m: start.getMonth(), d: start.getDate() },
            today,
          );
          const days = diffDays(next, today);
          const years = next.getFullYear() - start.getFullYear();
          // Only celebrate from year 1 onwards
          if (days <= windowDays && years >= 1) {
            items.push({
              id: `a-${c.id}`,
              nome: c.nome,
              date: toIsoDate(next),
              daysAway: days,
              years,
              kind: "anniversary",
            });
          }
        }
      }
      items.sort((x, y) => x.daysAway - y.daysAway);
      return items;
    },
  });
}

/**
 * Returns colleagues currently on approved vacation (today between start/end).
 */
export function useWhoIsOff() {
  return useQuery<VacationActiveItem[]>({
    queryKey: ["home", "who-is-off"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const today = toIsoDate(new Date());
      const { data, error } = await supabase
        .from("vacation_requests")
        .select("id, data_inicio, data_fim, tipo, estado, collaborator_id, collaborators:collaborator_id(nome)")
        .eq("estado", "aprovada")
        .lte("data_inicio", today)
        .gte("data_fim", today)
        .order("data_inicio");
      if (error) throw error;
      type Row = {
        id: string;
        data_inicio: string;
        data_fim: string;
        tipo: string;
        collaborators: { nome: string } | null;
      };
      return (data as unknown as Row[] ?? []).map((r) => ({
        id: r.id,
        nome: r.collaborators?.nome ?? "—",
        data_inicio: r.data_inicio,
        data_fim: r.data_fim,
        tipo: r.tipo,
      }));
    },
  });
}

/**
 * Returns next holidays within `windowDays` days.
 */
export function useUpcomingHolidays(windowDays = 60) {
  return useQuery<HolidayItem[]>({
    queryKey: ["home", "holidays", windowDays],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const today = new Date();
      const todayIso = toIsoDate(today);
      const limit = new Date(today.getTime() + windowDays * DAY_MS);
      const limitIso = toIsoDate(limit);
      const { data, error } = await supabase
        .from("holidays")
        .select("id, nome, data")
        .gte("data", todayIso)
        .lte("data", limitIso)
        .order("data");
      if (error) throw error;
      return (data ?? []).map((h) => {
        const d = parseDate(h.data);
        return {
          id: h.id,
          nome: h.nome,
          data: h.data,
          daysAway: diffDays(d, today),
        };
      });
    },
  });
}
