import { useMemo } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import type { Resource } from "@/lib/projects/types";
import { useAllAllocations } from "@/lib/projects/use-planner";
import { allocationHours, euros } from "@/lib/projects/gantt-utils";
import { CollaboratorAvatar } from "@/components/CollaboratorAvatar";
import { AlertTriangle, GripVertical, CalendarOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { computeResourceCapacity, type LeaveInterval } from "@/lib/projects/leave-capacity";

interface Props {
  resources: Resource[];
}

function weekHoursForResource(
  resourceId: string,
  weekStart: Date,
  weekEnd: Date,
  allocs: { resource_id: string; start_date: string; end_date: string; hours_per_day: number }[],
): number {
  let total = 0;
  for (const a of allocs) {
    if (a.resource_id !== resourceId) continue;
    const aS = new Date(a.start_date);
    const aE = new Date(a.end_date);
    const overlapStart = aS > weekStart ? aS : weekStart;
    const overlapEnd = aE < weekEnd ? aE : weekEnd;
    if (overlapStart > overlapEnd) continue;
    total += allocationHours({
      start_date: format(overlapStart, "yyyy-MM-dd"),
      end_date: format(overlapEnd, "yyyy-MM-dd"),
      hours_per_day: Number(a.hours_per_day),
    });
  }
  return total;
}

// Map of resource_id -> approved leave intervals (anywhere). Cached by react-query
// so the small list survives re-renders cheaply.
function useLeaveByResource() {
  return useQuery({
    queryKey: ["pool-leave-by-resource"],
    queryFn: async (): Promise<Map<string, LeaveInterval[]>> => {
      const { data: resources, error: rErr } = await supabase
        .from("pm_resources")
        .select("id, collaborator_id");
      if (rErr) throw rErr;
      const collabToResource = new Map<string, string>();
      for (const r of (resources ?? []) as { id: string; collaborator_id: string | null }[]) {
        if (r.collaborator_id) collabToResource.set(r.collaborator_id, r.id);
      }
      const { data: leaves, error: lErr } = await supabase
        .from("vacation_requests")
        .select("collaborator_id, data_inicio, data_fim, estado")
        .in("estado", ["aprovado", "aprovada"]);
      if (lErr) throw lErr;
      const map = new Map<string, LeaveInterval[]>();
      for (const l of (leaves ?? []) as Array<{
        collaborator_id: string;
        data_inicio: string;
        data_fim: string;
      }>) {
        const resId = collabToResource.get(l.collaborator_id);
        if (!resId) continue;
        const arr = map.get(resId) ?? [];
        arr.push({ start: parseISO(l.data_inicio), end: parseISO(l.data_fim) });
        map.set(resId, arr);
      }
      return map;
    },
  });
}

function useHolidaySet() {
  return useQuery({
    queryKey: ["pool-holidays"],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from("holidays").select("data");
      if (error) throw error;
      return new Set(((data ?? []) as Array<{ data: string }>).map((h) => h.data));
    },
  });
}

export function ResourcePool({ resources }: Props) {
  const { data: allocs } = useAllAllocations();
  const { data: leaveByResource } = useLeaveByResource();
  const { data: holidays } = useHolidaySet();

  const activeResources = useMemo(
    () => resources.filter((r) => (r as Resource & { active?: boolean }).active !== false),
    [resources],
  );

  const thisWeek = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    const end = addDays(start, 6);
    return { start, end };
  }, []);

  return (
    <aside className="flex h-full w-72 flex-col border-l border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Drag onto stage</p>
        <h2 className="font-display text-lg font-semibold">Team pool</h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          This week · {format(thisWeek.start, "MMM d")} – {format(thisWeek.end, "MMM d")}
        </p>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {activeResources.map((r) => {
          const wh = weekHoursForResource(r.id, thisWeek.start, thisWeek.end, allocs ?? []);
          const intervals = leaveByResource?.get(r.id) ?? [];
          // Effective weekly capacity = scheduled working days × 8h, minus leave hours.
          // We use the calendar week so the bar reflects this week's actual availability.
          const cap = computeResourceCapacity(thisWeek.start, thisWeek.end, intervals, holidays);
          // Fall back to contractual weekly_capacity if no working days in the week
          // (extreme edge case — full-week public-holiday window).
          const baseCap = cap.rawCapacityHours > 0 ? cap.rawCapacityHours : Number(r.weekly_capacity);
          const effCap = cap.rawCapacityHours > 0 ? cap.effectiveCapacityHours : Number(r.weekly_capacity);
          const ratio = effCap > 0 ? wh / effCap : wh > 0 ? 1.5 : 0;
          const over = wh > effCap + 0.01;
          const reducedByLeave = cap.leaveHours > 0;
          const fullyOnLeave = cap.rawCapacityHours > 0 && cap.effectiveCapacityHours === 0;

          return (
            <div
              key={r.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-resource-id", r.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              className="group cursor-grab rounded-md border border-border bg-background p-3 transition hover:border-foreground/30 active:cursor-grabbing"
            >
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground opacity-50 group-hover:opacity-100" />
                <CollaboratorAvatar
                  collaboratorId={r.collaborator_id}
                  name={r.name}
                  color={r.color}
                  size={26}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  {r.role && <p className="truncate text-[11px] text-muted-foreground">{r.role}</p>}
                </div>
                {reducedByLeave && (
                  <TooltipProvider delayDuration={120}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className={`inline-flex items-center ${
                            fullyOnLeave ? "text-destructive" : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          <CalendarOff className="h-3.5 w-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-xs">
                        {fullyOnLeave
                          ? "On leave all week — 0h capacity"
                          : `−${cap.leaveHours.toFixed(0)}h this week (leave)`}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {over && !reducedByLeave && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                {over && reducedByLeave && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
              </div>
              <div className="mt-2">
                <div className="flex items-baseline justify-between text-[10px]">
                  <span className="text-muted-foreground">{euros(Number(r.hourly_rate))}/h</span>
                  <span
                    className={`font-mono ${over ? "text-destructive font-semibold" : "text-muted-foreground"}`}
                  >
                    {wh.toFixed(0)}/{effCap.toFixed(0)} h
                    {reducedByLeave && (
                      <span className="ml-1 text-[9px] text-muted-foreground/70 line-through">
                        {baseCap.toFixed(0)}
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${Math.min(100, ratio * 100)}%`,
                      backgroundColor: over ? "var(--color-destructive)" : "var(--color-budget-spent)",
                    }}
                  />
                </div>
                {reducedByLeave && (
                  <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
                    Capacity reduced {cap.reductionPct.toFixed(0)}% by leave
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {!activeResources.length && (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            No active team members. Add or activate someone in the Team tab to start allocating.
          </div>
        )}
      </div>
    </aside>
  );
}

