/**
 * Project planner inspector — right-hand drawer that edits the selected
 * pm_stage. Mirrors the CRM QuotePlannerInspector but is wired to
 * pm_stages / pm_allocations / pm_stage_dependencies. Quote-only concerns
 * (supplier picker, billing model, retainer, supplier_phase WBS) are
 * intentionally omitted — they don't apply to live projects.
 *
 * Three tabs:
 *  - Plan         : name, start/end, milestone, color, status (active /
 *                   cancelled), delete
 *  - Dependencies : predecessors + successors (FS/SS/FF/SF + lag, cycle-safe)
 *  - Resources    : per-stage allocations (resource + hours/day + delete)
 */
import { useMemo, useState } from "react";
import { addDays, addMonths, addWeeks, differenceInCalendarDays, format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { X, Trash2, Plus, Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  useUpdateStage,
  useDeleteStage,
  useStageDependencies,
  useCreateDependency,
  useUpdateDependency,
  useDeleteDependency,
  useResources,
  useCreateAllocation,
  useDeleteAllocation,
} from "@/lib/projects/use-planner";
import type { StageWithAllocations } from "@/lib/projects/types";
import type { DepType } from "@/lib/projects/dependencies";

const DEP_TYPES: DepType[] = ["FS", "SS", "FF", "SF"];

const STAGE_COLORS = [
  "#0f172a", "#1e293b", "#334155", "#475569",
  "#0e7490", "#0891b2", "#0284c7", "#1d4ed8",
  "#7c3aed", "#a21caf", "#be185d", "#dc2626",
  "#ea580c", "#d97706", "#65a30d", "#16a34a",
];

interface Props {
  projectId: string;
  stages: StageWithAllocations[];
  stageId: string;
  onClose: () => void;
  /** When true, all editing controls are disabled / hidden. */
  readOnly?: boolean;
}

export function ProjectPlannerInspector({ projectId, stages, stageId, onClose, readOnly = false }: Props) {
  const { t } = useTranslation(["projects"]);

  const depsQ = useStageDependencies();
  const { data: allResources } = useResources();
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();
  const createDep = useCreateDependency();
  const updateDep = useUpdateDependency();
  const deleteDep = useDeleteDependency();
  const createAlloc = useCreateAllocation();
  const deleteAlloc = useDeleteAllocation();

  const stage = stages.find((s) => s.id === stageId);
  const deps = depsQ.data ?? [];
  const allocs = stage?.allocations ?? [];
  const resources = (allResources ?? []).filter((r) => r.active !== false);

  const stageMap = useMemo(
    () => Object.fromEntries(stages.map((s) => [s.id, s])),
    [stages],
  );

  const labelForStage = (id: string) => stageMap[id]?.name ?? "—";

  const predecessors = deps.filter((d) => d.successor_id === stageId);
  const successors = deps.filter((d) => d.predecessor_id === stageId);

  // Cycle-safe candidate lists: exclude self, existing, descendants for
  // predecessor adds, and ancestors for successor adds.
  const predecessorOptions = useMemo(() => {
    const existing = new Set(predecessors.map((d) => d.predecessor_id));
    const descendants = new Set<string>();
    const queue = [stageId];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const d of deps) {
        if (d.predecessor_id === cur && !descendants.has(d.successor_id)) {
          descendants.add(d.successor_id);
          queue.push(d.successor_id);
        }
      }
    }
    return stages.filter(
      (s) => s.id !== stageId && !existing.has(s.id) && !descendants.has(s.id),
    );
  }, [stages, deps, predecessors, stageId]);

  const successorOptions = useMemo(() => {
    const existing = new Set(successors.map((d) => d.successor_id));
    const ancestors = new Set<string>();
    const queue = [stageId];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const d of deps) {
        if (d.successor_id === cur && !ancestors.has(d.predecessor_id)) {
          ancestors.add(d.predecessor_id);
          queue.push(d.predecessor_id);
        }
      }
    }
    return stages.filter(
      (s) => s.id !== stageId && !existing.has(s.id) && !ancestors.has(s.id),
    );
  }, [stages, deps, successors, stageId]);

  const [newPred, setNewPred] = useState<{ pred: string; type: DepType; lag: string }>(
    { pred: "", type: "FS", lag: "0" },
  );
  const [newSucc, setNewSucc] = useState<{ succ: string; type: DepType; lag: string }>(
    { succ: "", type: "FS", lag: "0" },
  );
  const [newAlloc, setNewAlloc] = useState({ resource_id: "", hpd: "8" });

  if (!stage) {
    return (
      <aside className="w-[340px] shrink-0 border-l border-border bg-card p-4">
        <div className="text-sm text-muted-foreground">
          {t("projects:gantt.inspector.empty", { defaultValue: "Select a row to edit it." })}
        </div>
      </aside>
    );
  }

  const isCancelled = (stage as { status?: string }).status === "cancelled";
  const isMilestone = (stage as { is_milestone?: boolean }).is_milestone === true;

  // Patch helper — widened to Record<string, unknown> so the same call can
  // set hook-typed fields (name/dates/color/status) as well as schema fields
  // not whitelisted in the hook's narrow Pick (is_milestone). The hook
  // forwards the patch object to Supabase, which type-checks per column.
  const patch = (p: Record<string, unknown>) => {
    if (readOnly) return Promise.resolve();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return updateStage.mutateAsync({ id: stage.id, patch: p as any, projectId });
  };

  const handleAddPred = async () => {
    if (readOnly) return;
    if (!newPred.pred || newPred.pred === stageId) return;
    try {
      await createDep.mutateAsync({
        predecessor_id: newPred.pred,
        successor_id: stageId,
        type: newPred.type,
        lag_days: Number(newPred.lag) || 0,
      });
      setNewPred({ pred: "", type: "FS", lag: "0" });
      toast.success(t("projects:gantt.inspector.depSaved", { defaultValue: "Dependency saved." }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleAddSucc = async () => {
    if (readOnly) return;
    if (!newSucc.succ || newSucc.succ === stageId) return;
    try {
      await createDep.mutateAsync({
        predecessor_id: stageId,
        successor_id: newSucc.succ,
        type: newSucc.type,
        lag_days: Number(newSucc.lag) || 0,
      });
      setNewSucc({ succ: "", type: "FS", lag: "0" });
      toast.success(t("projects:gantt.inspector.depSaved", { defaultValue: "Dependency saved." }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleAddAlloc = async () => {
    if (readOnly) return;
    if (!newAlloc.resource_id) {
      toast.error(t("projects:gantt.inspector.pickResource", { defaultValue: "Pick a resource first." }));
      return;
    }
    try {
      await createAlloc.mutateAsync({
        stage_id: stage.id,
        resource_id: newAlloc.resource_id,
        start_date: stage.start_date,
        end_date: stage.end_date,
        hours_per_day: Number(newAlloc.hpd) || 8,
        projectId,
      });
      setNewAlloc({ resource_id: "", hpd: "8" });
      toast.success(t("projects:gantt.inspector.resourceAdded", { defaultValue: "Resource added." }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-semibold" title={stage.name}>
              {stage.name}
            </div>
            {isCancelled && (
              <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
                {t("projects:gantt.inspector.cancelled", { defaultValue: "Cancelled" })}
              </span>
            )}
          </div>
          <div className="font-mono text-[10px] text-muted-foreground">
            {stage.start_date} → {stage.end_date}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </header>

      {readOnly && (
        <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {t("projects:gantt.readOnly.badge", { defaultValue: "Read-only" })}
        </div>
      )}

      <fieldset disabled={readOnly} className="contents">
      <Tabs defaultValue="plan" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-3 mt-2 grid grid-cols-3">
          <TabsTrigger value="plan">
            {t("projects:gantt.inspector.plan", { defaultValue: "Plan" })}
          </TabsTrigger>
          <TabsTrigger value="deps">
            {t("projects:gantt.inspector.dependencies", { defaultValue: "Dependencies" })}
          </TabsTrigger>
          <TabsTrigger value="resources">
            {t("projects:gantt.inspector.resources", { defaultValue: "Resources" })}
          </TabsTrigger>
        </TabsList>

        {/* PLAN */}
        <TabsContent value="plan" className="flex-1 space-y-3 overflow-auto px-3 pb-4 pt-3">
          <div className="space-y-1">
            <Label className="text-xs">{t("projects:gantt.inspector.name", { defaultValue: "Name" })}</Label>
            <Input
              key={`name-${stage.id}-${stage.updated_at}`}
              defaultValue={stage.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== stage.name) patch({ name: v });
              }}
            />
          </div>

          <label className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-2 text-sm">
            <input
              type="checkbox"
              checked={isMilestone}
              onChange={(e) => {
                const on = e.target.checked;
                patch(on
                  ? ({ end_date: stage.start_date, is_milestone: true })
                  : ({ is_milestone: false }));
              }}
              className="h-4 w-4"
            />
            <span className="font-medium">
              {t("projects:gantt.inspector.milestone", { defaultValue: "Milestone" })}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("projects:gantt.inspector.milestoneHint", { defaultValue: "Single-date marker" })}
            </span>
          </label>

          {!isMilestone && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">
                    {t("projects:gantt.inspector.start", { defaultValue: "Start" })}
                  </Label>
                  <Input
                    type="date"
                    key={`sd-${stage.id}-${stage.start_date}`}
                    defaultValue={stage.start_date}
                    onBlur={(e) => {
                      if (e.target.value && e.target.value !== stage.start_date)
                        patch({ start_date: e.target.value });
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    {t("projects:gantt.inspector.end", { defaultValue: "End" })}
                  </Label>
                  <Input
                    type="date"
                    key={`ed-${stage.id}-${stage.end_date}`}
                    defaultValue={stage.end_date}
                    onBlur={(e) => {
                      if (e.target.value && e.target.value !== stage.end_date)
                        patch({ end_date: e.target.value });
                    }}
                  />
                </div>
              </div>
              <DurationField
                stageId={stage.id}
                startDate={stage.start_date}
                endDate={stage.end_date}
                onChange={(end_date) => patch({ end_date })}
              />
            </>
          )}

          <div className="space-y-1">
            <Label className="text-xs">
              {t("projects:gantt.inspector.budget", { defaultValue: "Budget" })}
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                €
              </span>
              <Input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                className="pl-6"
                key={`bg-${stage.id}-${stage.budget}`}
                defaultValue={Number(stage.budget ?? 0)}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v) || v < 0) return;
                  if (v !== Number(stage.budget ?? 0)) patch({ budget: v });
                }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {t("projects:gantt.inspector.budgetHint", {
                defaultValue: "Fee allocated to this stage. Drives profit and over/under tracking.",
              })}
            </p>
          </div>



          <div className="space-y-1">
            <Label className="text-xs">{t("projects:gantt.inspector.color", { defaultValue: "Color" })}</Label>
            <div className="flex flex-wrap gap-1.5">
              {STAGE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`h-6 w-6 rounded-md border ${stage.color === c ? "ring-2 ring-foreground ring-offset-1" : "border-border"}`}
                  style={{ background: c }}
                  onClick={() => patch({ color: c })}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          {/* Status: active / cancelled (Phase-1-deferred Cancel-stage action) */}
          <div className="space-y-1 rounded-md border bg-muted/20 p-2.5">
            <Label className="text-xs font-medium">
              {t("projects:gantt.inspector.status", { defaultValue: "Status" })}
            </Label>
            <p className="text-[11px] text-muted-foreground">
              {isCancelled
                ? t("projects:gantt.inspector.cancelledHint", {
                    defaultValue: "Hidden from the Gantt and rollups. Restore to bring it back into the schedule.",
                  })
                : t("projects:gantt.inspector.activeHint", {
                    defaultValue: "Cancelling preserves the row and its history but hides it from the live plan.",
                  })}
            </p>
            {isCancelled ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  patch({ status: "active" }).then(() =>
                    toast.success(t("projects:gantt.inspector.restored", { defaultValue: "Stage restored" })),
                  );
                }}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {t("projects:gantt.inspector.restoreStage", { defaultValue: "Restore stage" })}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  if (
                    confirm(
                      t("projects:gantt.inspector.cancelConfirm", {
                        defaultValue:
                          "Cancel this stage? It will be hidden from the Gantt and rollups but kept on file.",
                      }),
                    )
                  ) {
                    patch({ status: "cancelled" }).then(() => {
                      toast.success(t("projects:gantt.inspector.cancelled", { defaultValue: "Cancelled" }));
                      onClose();
                    });
                  }
                }}
              >
                <Ban className="mr-1.5 h-3.5 w-3.5" />
                {t("projects:gantt.inspector.cancelStage", { defaultValue: "Cancel stage" })}
              </Button>
            )}
          </div>

          <div className="pt-2">
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => {
                if (confirm(t("projects:gantt.inspector.deleteConfirm", {
                  defaultValue: "Delete this stage permanently? Allocations and dependencies will be removed.",
                }))) {
                  deleteStage.mutateAsync({ id: stage.id, projectId }).then(
                    () => {
                      toast.success(t("projects:gantt.inspector.deleted", { defaultValue: "Stage deleted" }));
                      onClose();
                    },
                    (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to delete stage"),
                  );
                }
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t("projects:gantt.inspector.deleteStage", { defaultValue: "Delete stage" })}
            </Button>
          </div>
        </TabsContent>

        {/* DEPENDENCIES */}
        <TabsContent value="deps" className="flex-1 space-y-4 overflow-auto px-3 pb-4 pt-3">
          <section>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("projects:gantt.inspector.predecessors", { defaultValue: "Predecessors" })}
            </h4>
            <ul className="space-y-1.5">
              {predecessors.map((d) => (
                <li key={d.id} className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5">
                  <span className="flex-1 truncate text-xs" title={labelForStage(d.predecessor_id)}>
                    {labelForStage(d.predecessor_id)}
                  </span>
                  <Select
                    value={d.type}
                    onValueChange={(v) =>
                      updateDep.mutateAsync({ id: d.id, patch: { type: v as DepType } })
                        .catch((e) => toast.error((e as Error).message))
                    }
                  >
                    <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEP_TYPES.map((dt) => (
                        <SelectItem key={dt} value={dt}>{dt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    className="h-7 w-14 text-right text-xs"
                    key={`lag-${d.id}-${d.lag_days}`}
                    defaultValue={d.lag_days}
                    onBlur={(e) => {
                      const v = Number(e.target.value) || 0;
                      if (v === d.lag_days) return;
                      updateDep.mutateAsync({ id: d.id, patch: { lag_days: v } })
                        .catch((err) => toast.error((err as Error).message));
                    }}
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteDep.mutate(d.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
              {predecessors.length === 0 && (
                <li className="text-xs text-muted-foreground">
                  {t("projects:gantt.inspector.noPredecessors", { defaultValue: "No predecessors." })}
                </li>
              )}
            </ul>
            <div className="mt-2 flex items-end gap-1.5">
              <Select value={newPred.pred} onValueChange={(v) => setNewPred((p) => ({ ...p, pred: v }))}>
                <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {predecessorOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={newPred.type} onValueChange={(v) => setNewPred((p) => ({ ...p, type: v as DepType }))}>
                <SelectTrigger className="h-8 w-16 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEP_TYPES.map((dt) => <SelectItem key={dt} value={dt}>{dt}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                type="number"
                className="h-8 w-14 text-right text-xs"
                value={newPred.lag}
                onChange={(e) => setNewPred((p) => ({ ...p, lag: e.target.value }))}
              />
              <Button size="icon" className="h-8 w-8" onClick={handleAddPred}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </section>

          <section>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("projects:gantt.inspector.successors", { defaultValue: "Successors" })}
            </h4>
            <ul className="space-y-1.5">
              {successors.map((d) => (
                <li key={d.id} className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5">
                  <span className="flex-1 truncate text-xs" title={labelForStage(d.successor_id)}>
                    {labelForStage(d.successor_id)}
                  </span>
                  <Select
                    value={d.type}
                    onValueChange={(v) =>
                      updateDep.mutateAsync({ id: d.id, patch: { type: v as DepType } })
                        .catch((e) => toast.error((e as Error).message))
                    }
                  >
                    <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEP_TYPES.map((dt) => (
                        <SelectItem key={dt} value={dt}>{dt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    className="h-7 w-14 text-right text-xs"
                    key={`lag-${d.id}-${d.lag_days}`}
                    defaultValue={d.lag_days}
                    onBlur={(e) => {
                      const v = Number(e.target.value) || 0;
                      if (v === d.lag_days) return;
                      updateDep.mutateAsync({ id: d.id, patch: { lag_days: v } })
                        .catch((err) => toast.error((err as Error).message));
                    }}
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteDep.mutate(d.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
              {successors.length === 0 && (
                <li className="text-xs text-muted-foreground">
                  {t("projects:gantt.inspector.noSuccessors", { defaultValue: "No successors." })}
                </li>
              )}
            </ul>
            <div className="mt-2 flex items-end gap-1.5">
              <Select value={newSucc.succ} onValueChange={(v) => setNewSucc((p) => ({ ...p, succ: v }))}>
                <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {successorOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={newSucc.type} onValueChange={(v) => setNewSucc((p) => ({ ...p, type: v as DepType }))}>
                <SelectTrigger className="h-8 w-16 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEP_TYPES.map((dt) => <SelectItem key={dt} value={dt}>{dt}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                type="number"
                className="h-8 w-14 text-right text-xs"
                value={newSucc.lag}
                onChange={(e) => setNewSucc((p) => ({ ...p, lag: e.target.value }))}
              />
              <Button size="icon" className="h-8 w-8" onClick={handleAddSucc}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </section>
        </TabsContent>

        {/* RESOURCES */}
        <TabsContent value="resources" className="flex-1 space-y-3 overflow-auto px-3 pb-4 pt-3">
          <ul className="space-y-1.5">
            {allocs.map((a) => (
              <li key={a.id} className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: a.resource?.color ?? "#a78bfa" }}
                />
                <span className="flex-1 truncate text-xs">{a.resource?.name ?? "—"}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {a.hours_per_day} h/d
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => deleteAlloc.mutate({ id: a.id, projectId })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
            {allocs.length === 0 && (
              <li className="text-xs text-muted-foreground">
                {t("projects:gantt.inspector.noAllocs", { defaultValue: "No resources yet." })}
              </li>
            )}
          </ul>

          {resources.length > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              <div>
                <Label className="text-xs">{t("projects:gantt.inspector.resource", { defaultValue: "Resource" })}</Label>
                <Select
                  value={newAlloc.resource_id}
                  onValueChange={(v) => setNewAlloc((p) => ({ ...p, resource_id: v }))}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {resources.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t("projects:gantt.inspector.hoursPerDay", { defaultValue: "h/d" })}</Label>
                <Input
                  type="number"
                  min="0"
                  max="24"
                  className="h-8 text-xs"
                  value={newAlloc.hpd}
                  onChange={(e) => setNewAlloc((p) => ({ ...p, hpd: e.target.value }))}
                />
              </div>
              <Button size="sm" className="w-full" onClick={handleAddAlloc}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("projects:gantt.inspector.addResource", { defaultValue: "Add resource" })}
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </aside>
  );
}

type DurationUnit = "days" | "weeks" | "months";

function DurationField({
  stageId,
  startDate,
  endDate,
  onChange,
}: {
  stageId: string;
  startDate: string;
  endDate: string;
  onChange: (endDate: string) => void;
}) {
  const { t } = useTranslation(["projects"]);
  const [unit, setUnit] = useState<DurationUnit>("weeks");

  const totalDays = useMemo(() => {
    try {
      return Math.max(1, differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1);
    } catch {
      return 1;
    }
  }, [startDate, endDate]);

  const value = useMemo(() => {
    if (unit === "days") return totalDays;
    if (unit === "weeks") return Math.round((totalDays / 7) * 10) / 10;
    return Math.round((totalDays / 30) * 10) / 10;
  }, [totalDays, unit]);

  const commit = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return;
    const start = parseISO(startDate);
    let newEnd: Date;
    if (unit === "days") newEnd = addDays(start, Math.max(1, Math.round(n)) - 1);
    else if (unit === "weeks") newEnd = addDays(addWeeks(start, Math.floor(n)), Math.round((n % 1) * 7) - 1);
    else newEnd = addDays(addMonths(start, Math.floor(n)), Math.round((n % 1) * 30) - 1);
    const iso = format(newEnd, "yyyy-MM-dd");
    if (iso !== endDate) onChange(iso);
  };

  return (
    <div className="space-y-1">
      <Label className="text-xs">{t("projects:gantt.inspector.duration", { defaultValue: "Duration" })}</Label>
      <div className="flex gap-2">
        <Input
          type="number"
          step="0.5"
          min="0.5"
          key={`dur-${stageId}-${startDate}-${endDate}-${unit}`}
          defaultValue={value}
          onBlur={(e) => commit(e.target.value)}
          className="flex-1"
        />
        <Select value={unit} onValueChange={(v) => setUnit(v as DurationUnit)}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="days">{t("projects:gantt.inspector.days", { defaultValue: "Days" })}</SelectItem>
            <SelectItem value="weeks">{t("projects:gantt.inspector.weeks", { defaultValue: "Weeks" })}</SelectItem>
            <SelectItem value="months">{t("projects:gantt.inspector.months", { defaultValue: "Months" })}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
