import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type HrCapacityEntry = {
  vacationId: string;
  collaboratorId: string;
  collaboratorName: string;
  startDate: string;
  endDate: string;
  diasUteis: number;
  tipo: string;
  status: "current" | "upcoming";
};

export type HrCapacityOverview = {
  current: HrCapacityEntry[];
  upcoming14: HrCapacityEntry[];
  upcoming30: HrCapacityEntry[];
  overlapsNext30: number;
  activeCollaborators: number;
};

export function useHrCapacityOverview() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["hr-capacity-overview", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<HrCapacityOverview> => {
      const today = new Date();
      const todayIso = today.toISOString().slice(0, 10);
      const in14 = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);
      const in30 = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);

      const [{ data: vacs }, { count: activeCount }] = await Promise.all([
        supabase
          .from("vacation_requests")
          .select("id, collaborator_id, data_inicio, data_fim, dias_uteis, tipo, estado")
          .eq("estado", "aprovada")
          .lte("data_inicio", in30)
          .gte("data_fim", todayIso)
          .order("data_inicio", { ascending: true }),
        supabase
          .from("collaborators")
          .select("id", { count: "exact", head: true })
          .is("archived_at", null),
      ]);

      const rows = (vacs ?? []) as Array<{
        id: string;
        collaborator_id: string;
        data_inicio: string;
        data_fim: string;
        dias_uteis: number;
        tipo: string;
        estado: string;
      }>;

      const collabIds = Array.from(new Set(rows.map((r) => r.collaborator_id)));
      const nameMap = new Map<string, string>();
      if (collabIds.length) {
        const { data: cols } = await supabase
          .from("collaborators")
          .select("id, nome")
          .in("id", collabIds);
        for (const c of (cols ?? []) as Array<{ id: string; nome: string }>) {
          nameMap.set(c.id, c.nome);
        }
      }

      const make = (r: (typeof rows)[number]): HrCapacityEntry => ({
        vacationId: r.id,
        collaboratorId: r.collaborator_id,
        collaboratorName: nameMap.get(r.collaborator_id) ?? "—",
        startDate: r.data_inicio,
        endDate: r.data_fim,
        diasUteis: r.dias_uteis,
        tipo: r.tipo,
        status: r.data_inicio <= todayIso ? "current" : "upcoming",
      });

      const all = rows.map(make);
      const current = all.filter((e) => e.status === "current");
      const upcoming14 = all.filter(
        (e) => e.status === "upcoming" && e.startDate <= in14,
      );
      const upcoming30 = all.filter((e) => e.status === "upcoming");

      // Overlap detection (any two entries sharing a day in the next 30d window)
      let overlaps = 0;
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i], b = all[j];
          if (a.startDate <= b.endDate && b.startDate <= a.endDate) overlaps++;
        }
      }

      return {
        current,
        upcoming14,
        upcoming30,
        overlapsNext30: overlaps,
        activeCollaborators: activeCount ?? 0,
      };
    },
  });
}
