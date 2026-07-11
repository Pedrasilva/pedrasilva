/**
 * TimesheetRetainerStages — surfaces every retainer stage the current
 * user can see (via RLS) in the timesheet, regardless of allocations.
 * Retainer stages use "open logging": anyone on the team can clock hours
 * against them via `pm_time_entries.pm_stage_id` without needing a task
 * or allocation. This panel is a shortcut so those stages don't have to
 * be discovered from within a specific project detail page.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Repeat } from "lucide-react";
import { LogRetainerHoursDialog } from "@/components/projects/log-retainer-hours-dialog";
import { format, parseISO } from "date-fns";

interface RetainerParent {
  id: string;
  name: string;
  project_id: string;
  project_name: string;
  monthly_fee: number;
  color: string | null;
  children: Array<{ id: string; monthDate: string; month: string }>;
}

export function TimesheetRetainerStages() {
  const [logOpenFor, setLogOpenFor] = useState<string | null>(null);

  const { data: retainers } = useQuery({
    queryKey: ["timesheet-retainer-stages"],
    queryFn: async (): Promise<RetainerParent[]> => {
      const { data: parents, error: pErr } = await supabase
        .from("pm_stages")
        .select(
          "id, name, project_id, color, retainer_monthly_amount, pm_projects(name)",
        )
        .eq("stage_kind", "retainer_monthly");
      if (pErr) throw pErr;
      const parentRows = (parents ?? []) as Array<{
        id: string;
        name: string;
        project_id: string;
        color: string | null;
        retainer_monthly_amount: number | string | null;
        pm_projects: { name: string } | null;
      }>;
      if (parentRows.length === 0) return [];

      const parentIds = parentRows.map((p) => p.id);
      const { data: children } = await supabase
        .from("pm_stages")
        .select("id, name, parent_stage_id, start_date")
        .in("parent_stage_id", parentIds)
        .order("start_date", { ascending: true });
      const kids = (children ?? []) as Array<{
        id: string;
        name: string;
        parent_stage_id: string;
        start_date: string;
      }>;
      const byParent = new Map<string, RetainerParent["children"]>();
      for (const k of kids) {
        const arr = byParent.get(k.parent_stage_id) ?? [];
        arr.push({
          id: k.id,
          monthDate: k.start_date,
          month: format(parseISO(k.start_date), "MMM yyyy"),
        });
        byParent.set(k.parent_stage_id, arr);
      }
      return parentRows.map((p) => ({
        id: p.id,
        name: p.name,
        project_id: p.project_id,
        project_name: p.pm_projects?.name ?? "—",
        monthly_fee: Number(p.retainer_monthly_amount ?? 0),
        color: p.color,
        children: byParent.get(p.id) ?? [],
      }));
    },
  });

  const list = useMemo(() => retainers ?? [], [retainers]);
  if (list.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Repeat className="h-4 w-4 text-muted-foreground" />
        Retainer stages
        <span className="text-[11px] font-normal text-muted-foreground">
          open logging — no allocation required
        </span>
      </div>
      <ul className="divide-y divide-border">
        {list.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2 text-sm">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: r.color ?? "#94a3b8" }}
              />
              <span className="text-muted-foreground">{r.project_name}</span>
              <span>·</span>
              <span className="font-medium">{r.name}</span>
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                €{r.monthly_fee.toLocaleString()}/mo
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => setLogOpenFor(r.id)}
              disabled={r.children.length === 0}
            >
              <Plus className="mr-1 h-3 w-3" />
              Log hours
            </Button>
            <LogRetainerHoursDialog
              open={logOpenFor === r.id}
              onOpenChange={(v) => setLogOpenFor(v ? r.id : null)}
              parentStageName={`${r.project_name} · ${r.name}`}
              monthlyChildren={r.children}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
