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
import { CompanyPicker } from "@/components/crm/company-picker";

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
          <div className="space-y-1">
            <Label className="text-xs">
              {t("workspace.planning.category", { defaultValue: "Category" })}
            </Label>
            <Select
              value={((stage as { stage_role?: string | null }).stage_role ?? "architecture")}
              onValueChange={(v) =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                upsertStage.mutate({ id: stage.id, stage_role: v } as any)
              }
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="architecture">
                  {t("workspace.planning.roleArchitecture", { defaultValue: "Architecture (project & cashflow)" })}
                </SelectItem>
                <SelectItem value="client">
                  {t("workspace.planning.roleClient", { defaultValue: "Client (approvals, no cost)" })}
                </SelectItem>
                <SelectItem value="supplier_group">
                  {t("workspace.planning.roleSupplier", { defaultValue: "Supplier (billed to client)" })}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              {t("workspace.planning.supplier", { defaultValue: "Supplier" })}
            </Label>
            <CompanyPicker
              value={(stage as { supplier_company_id?: string | null }).supplier_company_id ?? null}
              onChange={(companyId) =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                upsertStage.mutate({ id: stage.id, supplier_company_id: companyId } as any)
              }
              placeholder={t("workspace.planning.supplierPlaceholder", { defaultValue: "Pedra Silva Arquitectos (us)" })}
            />
            <p className="text-[11px] text-muted-foreground">
              {t("workspace.planning.supplierHint", { defaultValue: "Defaults to ourselves; pick a third-party to derive an outflow." })}
            </p>
          </div>


          <div className="space-y-1">
            <Label className="text-xs">
              {t("workspace.planning.color", { defaultValue: "Color" })}
            </Label>
            <ColorPicker
              value={stage.color ?? null}
              onChange={(c) =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                upsertStage.mutate({ id: stage.id, color: c } as any)
              }
            />
          </div>
          <label className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-2 text-sm">
            <input
              type="checkbox"
              checked={!!(stage as { is_milestone?: boolean }).is_milestone}
              onChange={(e) => {
                const on = e.target.checked;
                upsertStage.mutate({
                  id: stage.id,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ...(on ? { is_milestone: true, end_date: stage.start_date } : { is_milestone: false }),
                } as any);
              }}
              className="h-4 w-4"
            />
            <span className="font-medium">
              {t("workspace.planning.milestone", { defaultValue: "Milestone" })}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("workspace.planning.milestoneHint", { defaultValue: "Single-date marker" })}
            </span>
          </label>
          {!(stage as { is_milestone?: boolean }).is_milestone && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">
                    {t("workspace.planning.startDate", { defaultValue: "Start" })}
                  </Label>
                  <Input
                    type="date"
                    key={`sd2-${stage.id}-${stage.start_date}`}
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
                    key={`ed2-${stage.id}-${stage.end_date}`}
                    defaultValue={stage.end_date}
                    onBlur={(e) => {
                      if (e.target.value !== stage.end_date)
                        upsertStage.mutate({ id: stage.id, end_date: e.target.value });
                    }}
                  />
                </div>
              </div>
              <DurationField
                stageId={stage.id}
                startDate={stage.start_date}
                endDate={stage.end_date}
                onChange={(end_date: string) => upsertStage.mutate({ id: stage.id, end_date })}
              />
              {(() => {
                const sx = stage as typeof stage & {
                  budget_mode?: string | null;
                  billing_model?: string | null;
                  stage_billing_timing?: string | null;
                  parent_stage_id?: string | null;
                };
                const children = allStages.filter(
                  (c) => (c as { parent_stage_id?: string | null }).parent_stage_id === stage.id,
                );
                const isParent = children.length > 0;
                const mode = (sx.budget_mode ?? "calculated") as "calculated" | "fixed";
                const sumChildren = (id: string): number => {
                  const kids = allStages.filter(
                    (c) => (c as { parent_stage_id?: string | null }).parent_stage_id === id,
                  );
                  if (kids.length === 0) {
                    const me = allStages.find((s) => s.id === id);
                    return Number(me?.budget ?? 0) || 0;
                  }
                  const km = (allStages.find((s) => s.id === id) as { budget_mode?: string | null } | undefined)?.budget_mode ?? "calculated";
                  if (km === "fixed") {
                    const me = allStages.find((s) => s.id === id);
                    return Number(me?.budget ?? 0) || 0;
                  }
                  return kids.reduce((sum, k) => sum + sumChildren(k.id), 0);
                };
                const calculated = isParent ? sumChildren(stage.id) : Number(stage.budget ?? 0);
                const billingModel = (sx.billing_model ?? "stage") as "stage" | "monthly" | "retainer";
                const timing = (sx.stage_billing_timing ?? "end") as "end" | "start" | "split";
                return (
                  <>
                    {isParent && (
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {t("workspace.planning.budgetMode", { defaultValue: "Budget mode" })}
                        </Label>
                        <div className="flex gap-1 rounded-md border border-border p-0.5">
                          {(["calculated", "fixed"] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                if (m === mode) return;
                                upsertStage.mutate({ id: stage.id, budget_mode: m });
                              }}
                              className={`flex-1 rounded px-2 py-1 text-[11px] transition ${
                                mode === m
                                  ? "bg-foreground text-background"
                                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
                              }`}
                            >
                              {m === "calculated"
                                ? t("workspace.planning.budgetCalculated", { defaultValue: "Calculated (sum of children)" })
                                : t("workspace.planning.budgetFixed", { defaultValue: "Fixed" })}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label className="text-xs">
                        {t("workspace.planning.budget", { defaultValue: "Budget" })}
                      </Label>
                      {isParent && mode === "calculated" ? (
                        <Input
                          readOnly
                          value={new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(calculated)}
                          className="bg-muted/40 font-mono"
                        />
                      ) : (
                        <CurrencyInput
                          key={`b-${stage.id}-${stage.budget}`}
                          value={Number(stage.budget ?? 0)}
                          onCommit={(v: number) => {
                            if (v !== Number(stage.budget)) upsertStage.mutate({ id: stage.id, budget: v });
                          }}
                        />
                      )}
                    </div>
                    {billingModel === "stage" && (
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {t("workspace.planning.billingTiming", { defaultValue: "Billing timing" })}
                        </Label>
                        <div className="flex gap-1 rounded-md border border-border p-0.5">
                          {(["end", "start", "split"] as const).map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                if (opt === timing) return;
                                upsertStage.mutate({ id: stage.id, stage_billing_timing: opt });
                              }}
                              className={`flex-1 rounded px-2 py-1 text-[11px] transition ${
                                timing === opt
                                  ? "bg-foreground text-background"
                                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
                              }`}
                            >
                              {opt === "end"
                                ? t("workspace.planning.timingEnd", { defaultValue: "End" })
                                : opt === "start"
                                  ? t("workspace.planning.timingStart", { defaultValue: "Start" })
                                  : t("workspace.planning.timingSplit", { defaultValue: "Start + End (50/50)" })}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          )}
          {(stage as { is_milestone?: boolean }).is_milestone && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">
                  {t("workspace.planning.milestoneDate", { defaultValue: "Date" })}
                </Label>
                <Input
                  type="date"
                  key={`ms-${stage.id}-${stage.start_date}`}
                  defaultValue={stage.start_date}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v && v !== stage.start_date)
                      upsertStage.mutate({ id: stage.id, start_date: v, end_date: v });
                  }}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  type S = (typeof allStages)[number] & {
                    stage_role?: string | null;
                    parent_stage_id?: string | null;
                    sort_order?: number | null;
                  };
                  const all = allStages as S[];
                  const anchor = all.find((s) => s.id === stage.id) as S | undefined;
                  if (!anchor) return;
                  const anchorRole = anchor.stage_role ?? "architecture";
                  const anchorParent = anchor.parent_stage_id ?? null;
                  const siblings = all
                    .filter(
                      (s) =>
                        (s.parent_stage_id ?? null) === anchorParent &&
                        (s.stage_role ?? "architecture") === anchorRole,
                    )
                    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
                  const idx = siblings.findIndex((s) => s.id === anchor.id);
                  const next = siblings[idx + 1];
                  const a = anchor.sort_order ?? 0;
                  const b = next?.sort_order ?? a + 20;
                  let baseSort = Math.floor((a + b) / 2);
                  if (baseSort === a || baseSort === b) baseSort = a + 5;
                  const start = addDays(parseISO(anchor.end_date), 1);
                  const end = addDays(start, 5);
                  const fmtDate = (d: Date) => format(d, "yyyy-MM-dd");
                  upsertStage.mutate({
                    quote_id: quoteId,
                    name: t("workspace.planning.newStage", { defaultValue: "New stage" }),
                    start_date: fmtDate(start),
                    end_date: fmtDate(end),
                    sort_order: baseSort,
                    parent_stage_id: anchorParent,
                    stage_role: anchorRole,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  } as any);
                }}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("workspace.planning.addStageBelow", { defaultValue: "Add stage below" })}
              </Button>
            </>
          )}
          <div className="pt-2">
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => {
                if (confirm(t("workspace.planning.deleteStageConfirm"))) {
                  delStage.mutate(stage.id, {
                    onSuccess: () => {
                      toast.success(t("workspace.planning.inspector.deleteStage", { defaultValue: "Stage deleted" }));
                      onClose();
                    },
                    onError: (e: unknown) => {
                      toast.error(e instanceof Error ? e.message : "Failed to delete stage");
                    },
                  });
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

function CurrencyInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (v: number) => void;
}) {
  const fmt = (n: number) =>
    new Intl.NumberFormat("pt-PT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(n) ? n : 0);
  const [text, setText] = useState<string>(fmt(value));

  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        value={text}
        onFocus={(e) => {
          const raw = String(value ?? 0).replace(".", ",");
          setText(raw);
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const normalized = text.replace(/\s|\u00a0/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
          const n = Number(normalized);
          const v = Number.isFinite(n) ? n : 0;
          setText(fmt(v));
          onCommit(v);
        }}
        className="pr-7 text-right"
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        €
      </span>
    </div>
  );
}

const STAGE_COLOR_PALETTE = [
  "#60a5fa", "#34d399", "#fbbf24", "#f472b6",
  "#a78bfa", "#fb7185", "#22d3ee", "#fdba74",
  "#94a3b8", "#4ade80", "#facc15", "#f87171",
];

function ColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {STAGE_COLOR_PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full border-2 transition ${
            value === c ? "border-foreground scale-110" : "border-transparent"
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
      <label className="relative inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-dashed border-border text-[10px] text-muted-foreground">
        +
        <input
          type="color"
          value={value ?? "#60a5fa"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
