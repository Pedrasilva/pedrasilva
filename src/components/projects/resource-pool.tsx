import { useMemo } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import type { Resource } from "@/lib/projects/types";
import { useAllAllocations } from "@/lib/projects/use-planner";
import { allocationHours, euros } from "@/lib/projects/gantt-utils";
import { CollaboratorAvatar } from "@/components/CollaboratorAvatar";
import { AlertTriangle, GripVertical } from "lucide-react";

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

export function ResourcePool({ resources }: Props) {
  const { data: allocs } = useAllAllocations();

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
          const cap = Number(r.weekly_capacity);
          const ratio = cap > 0 ? wh / cap : 0;
          const over = wh > cap;
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
                {over && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
              </div>
              <div className="mt-2">
                <div className="flex items-baseline justify-between text-[10px]">
                  <span className="text-muted-foreground">{euros(Number(r.hourly_rate))}/h</span>
                  <span
                    className={`font-mono ${over ? "text-destructive font-semibold" : "text-muted-foreground"}`}
                  >
                    {wh.toFixed(0)}/{cap.toFixed(0)} h
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
