/**
 * Quote planner inspector — right-hand drawer that edits the selected stage.
 *
 * Three tabs:
 *  - Plan         : name, start, end, milestone toggle, delete
 *  - Dependencies : predecessors + successors (FS/SS/FF/SF + lag)
 *  - Resources    : assignments on this stage (resource + dates + %)
 *
 * This replaces the old in-tab Stages/Dependencies/Allocations tables and
 * the standalone Consultants panel.
 */
import { useMemo, useState } from "react";
import { addDays, addWeeks, addMonths, differenceInCalendarDays, parseISO, format } from "date-fns";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { X, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  useUpsertQuoteStage, useDeleteQuoteStage,
} from "@/lib/quotes/use-quote-stages";
import {
  useQuoteDependencies, useCreateQuoteDependency, useDeleteQuoteDependency,
} from "@/lib/quotes/use-quote-dependencies";
import { useUpdateQuoteDependency } from "@/lib/quotes/use-quote-planner";
import {
  useQuoteAllocations, useUpsertQuoteAllocation, useDeleteQuoteAllocation,
} from "@/lib/quotes/use-quote-allocations";
import { useQuotePlanningPool } from "@/lib/quotes/use-quote-planning-pool";
import { useDefaultResourceRates, effectiveRates } from "@/lib/projects/use-default-rates";
import { useQuoteStages } from "@/lib/quotes/use-quote-stages";
import { QUOTE_DEP_TYPES, type QuoteDepType } from "@/lib/quotes/types";

interface Props {
  quoteId: string;
  stageId: string;
  onClose: () => void;
}

export function QuotePlannerInspector({ quoteId, stageId, onClose }: Props) {
  const { t } = useTranslation("crm");
  const stagesQ = useQuoteStages(quoteId);
  const depsQ = useQuoteDependencies(quoteId);
  const allocQ = useQuoteAllocations(quoteId);
  const { poolResources } = useQuotePlanningPool();
  const { data: defaultRates } = useDefaultResourceRates();

  const upsertStage = useUpsertQuoteStage(quoteId);
  const delStage = useDeleteQuoteStage(quoteId);
  const createDep = useCreateQuoteDependency(quoteId);
  const updateDep = useUpdateQuoteDependency(quoteId);
  const delDep = useDeleteQuoteDependency(quoteId);
  const upsertAlloc = useUpsertQuoteAllocation(quoteId);
  const delAlloc = useDeleteQuoteAllocation(quoteId);

  const stage = (stagesQ.data ?? []).find((s) => s.id === stageId);
  const allStages = stagesQ.data ?? [];
  const deps = depsQ.data ?? [];
  const allocs = (allocQ.data ?? []).filter((a) => a.stage_id === stageId);

  const stageMap = useMemo(
    () => Object.fromEntries(allStages.map((s) => [s.id, s])),
    [allStages],
  );

  const predecessors = deps.filter((d) => d.successor_stage_id === stageId);
  const successors = deps.filter((d) => d.predecessor_stage_id === stageId);

  // New-dependency form (used in both panels)
  const [newPred, setNewPred] = useState<{ pred: string; type: QuoteDepType; lag: string }>(
    { pred: "", type: "FS", lag: "0" },
  );
  const [newSucc, setNewSucc] = useState<{ succ: string; type: QuoteDepType; lag: string }>(
    { succ: "", type: "FS", lag: "0" },
  );
  const [newAlloc, setNewAlloc] = useState({ resource_id: "", pct: "100", hpd: "8" });

  if (!stage) {
    return (
      <aside className="w-[340px] shrink-0 border-l border-border bg-card p-4">
        <div className="text-sm text-muted-foreground">
          {t("workspace.planning.inspector.empty", { defaultValue: "Select a row to edit it." })}
        </div>
      </aside>
    );
  }

  const handleAddPred = async () => {
    if (!newPred.pred || newPred.pred === stageId) return;
    try {
      await createDep.mutateAsync({
        quote_id: quoteId,
        predecessor_stage_id: newPred.pred,
        successor_stage_id: stageId,
        type: newPred.type,
        lag_days: Number(newPred.lag) || 0,
      });
      setNewPred({ pred: "", type: "FS", lag: "0" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleAddSucc = async () => {
    if (!newSucc.succ || newSucc.succ === stageId) return;
    try {
      await createDep.mutateAsync({
        quote_id: quoteId,
        predecessor_stage_id: stageId,
        successor_stage_id: newSucc.succ,
        type: newSucc.type,
        lag_days: Number(newSucc.lag) || 0,
      });
      setNewSucc({ succ: "", type: "FS", lag: "0" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleAddAlloc = async () => {
    if (!newAlloc.resource_id) {
      toast.error(t("workspace.planning.pickResourceFirst", { defaultValue: "Pick a resource first." }));
      return;
    }
    const res = poolResources.find((r) => r.id === newAlloc.resource_id);
    if (!res) {
      toast.error(t("workspace.planning.resourceUnavailable", { defaultValue: "Selected resource is no longer available." }));
      return;
    }
    const rates = effectiveRates(res, defaultRates);
    try {
      await upsertAlloc.mutateAsync({
        quote_id: quoteId,
        stage_id: stageId,
        resource_id: newAlloc.resource_id,
        start_date: stage.start_date,
        end_date: stage.end_date,
        hours_per_day: Number(newAlloc.hpd) || 8,
        allocation_percentage: Number(newAlloc.pct) || 100,
        cost_rate_snapshot: rates.cost,
        sale_rate_snapshot: rates.sale,
      });
      setNewAlloc({ resource_id: "", pct: "100", hpd: "8" });
      toast.success(t("workspace.planning.resourceAdded", { defaultValue: "Resource added." }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };


  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold" title={stage.name}>
            {stage.name}
          </div>
          <div className="font-mono text-[10px] text-muted-foreground">
            {stage.start_date} → {stage.end_date}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </header>

      <Tabs defaultValue="plan" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-3 mt-2 grid grid-cols-3">
          <TabsTrigger value="plan">
            {t("workspace.planning.inspector.plan", { defaultValue: "Plan" })}
          </TabsTrigger>
          <TabsTrigger value="deps">
            {t("workspace.planning.inspector.dependencies", { defaultValue: "Dependencies" })}
          </TabsTrigger>
          <TabsTrigger value="resources">
            {t("workspace.planning.inspector.resources", { defaultValue: "Resources" })}
          </TabsTrigger>
        </TabsList>

        {/* PLAN */}
        <TabsContent value="plan" className="flex-1 space-y-3 overflow-auto px-3 pb-4 pt-3">
          <div className="space-y-1">
            <Label className="text-xs">{t("common.name", { defaultValue: "Name" })}</Label>
            <Input
              key={`name-${stage.id}-${stage.updated_at}`}
              defaultValue={stage.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== stage.name) upsertStage.mutate({ id: stage.id, name: v });
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">
                {t("workspace.planning.startDate", { defaultValue: "Start" })}
              </Label>
              <Input
                type="date"
                key={`sd-${stage.id}-${stage.start_date}`}
                defaultValue={stage.start_date}
                onBlur={(e) => {
                  if (e.target.value !== stage.start_date)
                    upsertStage.mutate({ id: stage.id, start_date: e.target.value });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                {t("workspace.planning.endDate", { defaultValue: "End" })}
              </Label>
              <Input
                type="date"
                key={`ed-${stage.id}-${stage.end_date}`}
                defaultValue={stage.end_date}
                onBlur={(e) => {
                  if (e.target.value !== stage.end_date)
                    upsertStage.mutate({ id: stage.id, end_date: e.target.value });
                }}
              />
          </div>
          <DurationField
            stageId={stage.id}
            startDate={stage.start_date}
            endDate={stage.end_date}
            onChange={(end_date) => upsertStage.mutate({ id: stage.id, end_date })}
          />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              {t("workspace.planning.budget", { defaultValue: "Budget" })}
            </Label>
            <Input
              type="number"
              step="0.01"
              key={`b-${stage.id}-${stage.budget}`}
              defaultValue={stage.budget ?? 0}
              onBlur={(e) => {
                const v = Number(e.target.value) || 0;
                if (v !== Number(stage.budget)) upsertStage.mutate({ id: stage.id, budget: v });
              }}
            />
          </div>
          <div className="pt-2">
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => {
                if (confirm(t("workspace.planning.deleteStageConfirm"))) {
                  delStage.mutate(stage.id);
                  onClose();
                }
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t("workspace.planning.inspector.deleteStage", { defaultValue: "Delete stage" })}
            </Button>
          </div>
        </TabsContent>

        {/* DEPENDENCIES */}
        <TabsContent value="deps" className="flex-1 space-y-4 overflow-auto px-3 pb-4 pt-3">
          {/* Predecessors */}
          <section>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("workspace.planning.inspector.predecessors", { defaultValue: "Predecessors" })}
            </h4>
            <ul className="space-y-1.5">
              {predecessors.map((d) => (
                <li key={d.id} className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5">
                  <span className="flex-1 truncate text-xs" title={stageMap[d.predecessor_stage_id]?.name}>
                    {stageMap[d.predecessor_stage_id]?.name ?? "—"}
                  </span>
                  <Select
                    value={d.type}
                    onValueChange={(v) =>
                      updateDep
                        .mutateAsync({ id: d.id, patch: { type: v as QuoteDepType } })
                        .catch((e) => toast.error((e as Error).message))
                    }
                  >
                    <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {QUOTE_DEP_TYPES.map((dt) => (
                        <SelectItem key={dt.value} value={dt.value}>{dt.value}</SelectItem>
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
                      updateDep
                        .mutateAsync({ id: d.id, patch: { lag_days: v } })
                        .catch((err) => toast.error((err as Error).message));
                    }}
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => delDep.mutate(d.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
              {predecessors.length === 0 && (
                <li className="text-xs text-muted-foreground">
                  {t("workspace.planning.noDeps", { defaultValue: "No predecessors." })}
                </li>
              )}
            </ul>
            <div className="mt-2 flex items-end gap-1.5">
              <Select value={newPred.pred} onValueChange={(v) => setNewPred((p) => ({ ...p, pred: v }))}>
                <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {allStages.filter((s) => s.id !== stageId).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={newPred.type} onValueChange={(v) => setNewPred((p) => ({ ...p, type: v as QuoteDepType }))}>
                <SelectTrigger className="h-8 w-16 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUOTE_DEP_TYPES.map((dt) => <SelectItem key={dt.value} value={dt.value}>{dt.value}</SelectItem>)}
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

          {/* Successors */}
          <section>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("workspace.planning.inspector.successors", { defaultValue: "Successors" })}
            </h4>
            <ul className="space-y-1.5">
              {successors.map((d) => (
                <li key={d.id} className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5">
                  <span className="flex-1 truncate text-xs" title={stageMap[d.successor_stage_id]?.name}>
                    {stageMap[d.successor_stage_id]?.name ?? "—"}
                  </span>
                  <Select
                    value={d.type}
                    onValueChange={(v) =>
                      updateDep
                        .mutateAsync({ id: d.id, patch: { type: v as QuoteDepType } })
                        .catch((e) => toast.error((e as Error).message))
                    }
                  >
                    <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {QUOTE_DEP_TYPES.map((dt) => (
                        <SelectItem key={dt.value} value={dt.value}>{dt.value}</SelectItem>
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
                      updateDep
                        .mutateAsync({ id: d.id, patch: { lag_days: v } })
                        .catch((err) => toast.error((err as Error).message));
                    }}
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => delDep.mutate(d.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
              {successors.length === 0 && (
                <li className="text-xs text-muted-foreground">
                  {t("workspace.planning.noDeps", { defaultValue: "No successors." })}
                </li>
              )}
            </ul>
            <div className="mt-2 flex items-end gap-1.5">
              <Select value={newSucc.succ} onValueChange={(v) => setNewSucc((p) => ({ ...p, succ: v }))}>
                <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {allStages.filter((s) => s.id !== stageId).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={newSucc.type} onValueChange={(v) => setNewSucc((p) => ({ ...p, type: v as QuoteDepType }))}>
                <SelectTrigger className="h-8 w-16 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUOTE_DEP_TYPES.map((dt) => <SelectItem key={dt.value} value={dt.value}>{dt.value}</SelectItem>)}
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
                  {a.allocation_percentage ?? 100}%
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => delAlloc.mutate(a.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
            {allocs.length === 0 && (
              <li className="text-xs text-muted-foreground">
                {t("workspace.planning.noAllocs", { defaultValue: "No resources yet." })}
              </li>
            )}
          </ul>

          {poolResources.length > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              <div>
                <Label className="text-xs">{t("workspace.planning.resource", { defaultValue: "Resource" })}</Label>
                <Select
                  value={newAlloc.resource_id}
                  onValueChange={(v) => setNewAlloc((p) => ({ ...p, resource_id: v }))}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {poolResources.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">%</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    className="h-8 text-xs"
                    value={newAlloc.pct}
                    onChange={(e) => setNewAlloc((p) => ({ ...p, pct: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">h/d</Label>
                  <Input
                    type="number"
                    min="0"
                    max="24"
                    className="h-8 text-xs"
                    value={newAlloc.hpd}
                    onChange={(e) => setNewAlloc((p) => ({ ...p, hpd: e.target.value }))}
                  />
                </div>
              </div>
              <Button size="sm" className="w-full" onClick={handleAddAlloc}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("workspace.planning.inspector.addResource", { defaultValue: "Add resource" })}
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
  const { t } = useTranslation("crm");
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
    let newEnd: Date;
    const start = parseISO(startDate);
    if (unit === "days") newEnd = addDays(start, Math.max(1, Math.round(n)) - 1);
    else if (unit === "weeks") newEnd = addDays(addWeeks(start, Math.floor(n)), Math.round((n % 1) * 7) - 1);
    else newEnd = addDays(addMonths(start, Math.floor(n)), Math.round((n % 1) * 30) - 1);
    const iso = format(newEnd, "yyyy-MM-dd");
    if (iso !== endDate) onChange(iso);
  };

  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {t("workspace.planning.duration", { defaultValue: "Duration" })}
      </Label>
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
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="days">{t("workspace.planning.days", { defaultValue: "Days" })}</SelectItem>
            <SelectItem value="weeks">{t("workspace.planning.weeks", { defaultValue: "Weeks" })}</SelectItem>
            <SelectItem value="months">{t("workspace.planning.months", { defaultValue: "Months" })}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
