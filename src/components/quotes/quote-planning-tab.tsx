/**
 * Quote Planning tab — stages + dependencies + allocations.
 * No Gantt yet (Phase C). Plain tables only.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Trash2, Plus, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { QuoteGantt } from "@/components/quotes/quote-gantt";
import { QuoteWarningsBanner } from "@/components/quotes/quote-warnings-banner";
import {
  useQuoteStages, useUpsertQuoteStage, useDeleteQuoteStage,
} from "@/lib/quotes/use-quote-stages";
import {
  useQuoteAllocations, useUpsertQuoteAllocation, useDeleteQuoteAllocation,
} from "@/lib/quotes/use-quote-allocations";
import {
  useQuoteDependencies, useCreateQuoteDependency, useDeleteQuoteDependency,
} from "@/lib/quotes/use-quote-dependencies";
import { useUpdateQuoteDependency } from "@/lib/quotes/use-quote-planner";
import { useQuoteExternalServices } from "@/lib/quotes/use-quote-external-services";
import {
  useDefaultResourceRates, effectiveRates,
} from "@/lib/projects/use-default-rates";
import { useQuotePlanningPool } from "@/lib/quotes/use-quote-planning-pool";
import { QUOTE_DEP_TYPES, type QuoteDepType } from "@/lib/quotes/types";
import { rollupQuote, quoteAllocationLine } from "@/lib/quotes/financial-rollups";
import { buildQuoteWarnings } from "@/lib/quotes/quote-warnings";
import { formatEUR } from "@/lib/crm/types";
import { useProposalRoles } from "@/lib/proposal-roles";


const PCT_PRESETS = [100, 80, 50, 20, 10] as const;
const pctToHpd = (pct: number) => Math.max(0, Math.min(24, (pct / 100) * 8));

const today = () => new Date().toISOString().slice(0, 10);

export function QuotePlanningTab({
  quoteId,
  pricingMultiplier = 1,
}: {
  quoteId: string;
  pricingMultiplier?: number;
}) {
  const { t, i18n } = useTranslation("crm");
  const stagesQ = useQuoteStages(quoteId);
  const depsQ = useQuoteDependencies(quoteId);
  const allocQ = useQuoteAllocations(quoteId);
  const externalQ = useQuoteExternalServices(quoteId);
  const upsertStage = useUpsertQuoteStage(quoteId);
  const delStage = useDeleteQuoteStage(quoteId);
  const createDep = useCreateQuoteDependency(quoteId);
  const delDep = useDeleteQuoteDependency(quoteId);
  const updateDep = useUpdateQuoteDependency(quoteId);
  const upsertAlloc = useUpsertQuoteAllocation(quoteId);
  const delAlloc = useDeleteQuoteAllocation(quoteId);

  const stages = stagesQ.data ?? [];
  const deps = depsQ.data ?? [];
  const allocations = allocQ.data ?? [];
  const externalServices = externalQ.data ?? [];

  // Selectable team pool for the manual allocation dropdown — same filter
  // as the Gantt resource pool (active + collaborator.include_in_planning +
  // collaborator.archived_at IS NULL).
  const { poolResources: resources } = useQuotePlanningPool();
  const { data: defaults } = useDefaultResourceRates();
  const { data: proposalRoles = [] } = useProposalRoles();
  const isPt = (i18n.language ?? "").startsWith("pt");
  const roleLabel = useMemo(() => {
    const byCode: Record<string, string> = {};
    for (const r of proposalRoles) {
      byCode[r.code] = isPt ? r.label_pt : r.label_en;
    }
    return (code: string | null | undefined): string => {
      if (!code) return isPt ? "Sem título" : "Untitled";
      return byCode[code] ?? code;
    };
  }, [proposalRoles, isPt]);

  const stageMap = useMemo(
    () => Object.fromEntries(stages.map((s) => [s.id, s])),
    [stages],
  );

  // Per-stage rollup: hours / cost / fee derived from allocations.
  const stageRollups = useMemo(() => {
    const m = new Map<string, { hours: number; cost: number; fee: number }>();
    for (const a of allocations) {
      const line = quoteAllocationLine(a);
      const cur = m.get(a.stage_id) ?? { hours: 0, cost: 0, fee: 0 };
      cur.hours += line.hours;
      cur.cost += line.cost;
      cur.fee += line.revenue * (pricingMultiplier > 0 ? pricingMultiplier : 1);
      m.set(a.stage_id, cur);
    }
    return m;
  }, [allocations, pricingMultiplier]);

  // Lightweight, non-blocking warnings driven by the same rollup as the
  // financial summary so users get consistent signals across tabs.
  const warnings = useMemo(() => {
    const summary = rollupQuote({
      allocations,
      externalServices,
      pricingMultiplier,
    });
    return buildQuoteWarnings({
      stages,
      allocations,
      externalServices,
      summary,
    });
  }, [stages, allocations, externalServices, pricingMultiplier]);

  // ---- Stage row state -------------------------------------------------
  const [newStage, setNewStage] = useState({
    name: "",
    start_date: today(),
    end_date: today(),
    budget: "",
  });

  // Optional override for the sale margin (% of revenue). When set, the
  // displayed sale value per stage = cost / (1 − margin/100), and the
  // implied margin % is taken from the override directly. When empty, we
  // fall back to the Gantt allocations' actual sale rates.
  const [marginOverride, setMarginOverride] = useState<string>("");
  const marginOverrideNum = useMemo(() => {
    const n = Number(marginOverride);
    if (!Number.isFinite(n) || n <= 0 || n >= 100) return null;
    return n;
  }, [marginOverride]);


  const handleAddStage = async () => {
    if (!newStage.name.trim()) return toast.error(t("workspace.planning.errorStageName"));
    if (newStage.end_date < newStage.start_date)
      return toast.error(t("workspace.planning.errorStageDates"));
    try {
      await upsertStage.mutateAsync({
        quote_id: quoteId,
        name: newStage.name.trim(),
        start_date: newStage.start_date,
        end_date: newStage.end_date,
        budget: newStage.budget ? Number(newStage.budget) : 0,
        sort_order: stages.length,
      });
      setNewStage({ name: "", start_date: today(), end_date: today(), budget: "" });
      toast.success(t("workspace.planning.stageCreated"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // ---- Dependency state ------------------------------------------------
  const [newDep, setNewDep] = useState<{
    pred: string; succ: string; type: QuoteDepType; lag: string;
  }>({ pred: "", succ: "", type: "FS", lag: "0" });

  const handleAddDep = async () => {
    if (!newDep.pred || !newDep.succ || newDep.pred === newDep.succ)
      return toast.error(t("workspace.planning.errorDepStages"));
    try {
      await createDep.mutateAsync({
        quote_id: quoteId,
        predecessor_stage_id: newDep.pred,
        successor_stage_id: newDep.succ,
        type: newDep.type,
        lag_days: Number(newDep.lag) || 0,
      });
      setNewDep({ pred: "", succ: "", type: "FS", lag: "0" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // ---- Allocation state ------------------------------------------------
  const [newAlloc, setNewAlloc] = useState({
    resource_id: "",
    stage_id: "",
    start_date: today(),
    end_date: today(),
    pct: "100",
    hpd: "8",
  });

  const handleAddAlloc = async () => {
    if (!newAlloc.resource_id || !newAlloc.stage_id)
      return toast.error(t("workspace.planning.errorAllocResStage"));
    if (newAlloc.end_date < newAlloc.start_date)
      return toast.error(t("workspace.planning.errorStageDates"));
    const res = resources.find((r) => r.id === newAlloc.resource_id);
    if (!res) return;
    const rates = effectiveRates(res, defaults);
    try {
      await upsertAlloc.mutateAsync({
        quote_id: quoteId,
        resource_id: newAlloc.resource_id,
        stage_id: newAlloc.stage_id,
        start_date: newAlloc.start_date,
        end_date: newAlloc.end_date,
        hours_per_day: Number(newAlloc.hpd) || 8,
        allocation_percentage: Number(newAlloc.pct) || 100,
        cost_rate_snapshot: rates.cost,
        sale_rate_snapshot: rates.sale,
      });
      setNewAlloc((p) => ({ ...p, resource_id: "", stage_id: "" }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Non-blocking warnings (no team, negative profit, missing supplier…) */}
      <QuoteWarningsBanner warnings={warnings} />

      {/* Fee-driver hint — clarifies what shapes the headline number */}
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        {t("workspace.planning.feeDriverHint", {
          defaultValue: "Your fee is driven by team time and external services.",
        })}
      </div>

      {/* GANTT — primary planning surface */}
      <QuoteGantt quoteId={quoteId} />

      {/* Manual planning tables (always open) */}
      <div className="space-y-6 pt-4">

      {/* STAGES */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("workspace.planning.stagesTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sale-margin override — applies to the displayed sale & margin
              columns only; does not mutate any allocation rate. */}
          <div className="flex flex-wrap items-end justify-end gap-2 text-xs">
            <div className="flex flex-col">
              <Label className="text-xs text-muted-foreground">
                {t("workspace.planning.marginOverrideLabel", {
                  defaultValue: "Override sale margin (%)",
                })}
              </Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                max={99}
                className="h-8 w-32 text-right"
                placeholder={t("workspace.planning.marginOverridePh", {
                  defaultValue: "From Gantt",
                })}
                value={marginOverride}
                onChange={(e) => setMarginOverride(e.target.value)}
              />
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead className="w-36">{t("workspace.planning.startDate")}</TableHead>
                <TableHead className="w-36">{t("workspace.planning.endDate")}</TableHead>
                <TableHead className="w-32 text-right">{t("workspace.planning.budget")}</TableHead>
                <TableHead className="w-28 text-right">{t("workspace.planning.gantCost", { defaultValue: "Cost (Gantt)" })}</TableHead>
                <TableHead className="w-28 text-right">{t("workspace.planning.gantSale", { defaultValue: "Sale" })}</TableHead>
                <TableHead className="w-20 text-right">{t("workspace.planning.marginPct", { defaultValue: "Margin %" })}</TableHead>
                <TableHead className="w-44">{t("workspace.planning.billing", { defaultValue: "Group / Billing" })}</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {stages.map((s, i) => {
                const r = stageRollups.get(s.id);
                const cost = r?.cost ?? 0;
                const ganttSale = r?.fee ?? 0;
                const sale =
                  marginOverrideNum != null
                    ? cost > 0
                      ? cost / (1 - marginOverrideNum / 100)
                      : 0
                    : ganttSale;
                const marginPct =
                  marginOverrideNum != null
                    ? marginOverrideNum
                    : sale > 0
                      ? ((sale - cost) / sale) * 100
                      : null;
                return (
                <TableRow key={s.id}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Input
                        key={`name-${s.id}-${s.updated_at}`}
                        defaultValue={s.name}
                        onBlur={(e) => {
                          if (e.target.value.trim() && e.target.value !== s.name) {
                            upsertStage.mutate({ id: s.id, name: e.target.value.trim() });
                          }
                        }}
                      />
                      {/* Lightweight ontology provenance badges. Only render
                          when the row actually carries the metadata so manual
                          legacy stages stay visually clean. */}
                      {s.manual_override ? (
                        <span
                          className="text-[10px] uppercase tracking-wide rounded border px-1.5 py-0.5 text-muted-foreground bg-muted/40"
                          title={t("ontology.manualTooltip")}
                        >
                          {t("ontology.manualBadge")}
                        </span>
                      ) : s.is_generated ? (
                        <span
                          className="text-[10px] uppercase tracking-wide rounded border border-emerald-500/40 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
                          title={t("ontology.generatedTooltip")}
                        >
                          {t("ontology.generatedBadge")}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      key={`sd-${s.id}-${s.start_date}`}
                      defaultValue={s.start_date}
                      onBlur={(e) => {
                        if (e.target.value !== s.start_date) {
                          upsertStage.mutate({ id: s.id, start_date: e.target.value });
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      key={`ed-${s.id}-${s.end_date}`}
                      defaultValue={s.end_date}
                      onBlur={(e) => {
                        if (e.target.value !== s.end_date) {
                          upsertStage.mutate({ id: s.id, end_date: e.target.value });
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step="0.01"
                      className="text-right"
                      key={`b-${s.id}-${s.budget}`}
                      defaultValue={s.budget}
                      onBlur={(e) => {
                        const v = Number(e.target.value) || 0;
                        if (v !== Number(s.budget)) {
                          upsertStage.mutate({ id: s.id, budget: v });
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {r ? formatEUR(cost) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {r ? (
                      <span className={marginOverrideNum != null ? "font-medium text-primary" : ""}>
                        {formatEUR(sale)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {marginPct != null && r ? (
                      `${marginPct.toFixed(1)}%`
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={s.billing_model ?? "stage"}
                      onValueChange={(v) => upsertStage.mutate({ id: s.id, billing_model: v as "stage" | "monthly" | "retainer" })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stage">{t("workspace.planning.billingStage", { defaultValue: "Stage payment" })}</SelectItem>
                        <SelectItem value="monthly">{t("workspace.planning.billingMonthly", { defaultValue: "Monthly payment" })}</SelectItem>
                        <SelectItem value="retainer">{t("workspace.planning.billingRetainer", { defaultValue: "Retainer" })}</SelectItem>
                      </SelectContent>
                    </Select>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(t("workspace.planning.deleteStageConfirm"))) {
                          delStage.mutate(s.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
                );
              })}
              {stages.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-6">
                    {t("workspace.planning.noStages")}
                  </TableCell>
                </TableRow>
              )}
              {stages.length > 0 && (() => {
                let totalBudget = 0;
                let totalCost = 0;
                let totalSale = 0;
                for (const s of stages) {
                  totalBudget += Number(s.budget ?? 0);
                  const r = stageRollups.get(s.id);
                  if (!r) continue;
                  const cost = r.cost ?? 0;
                  const ganttSale = r.fee ?? 0;
                  const sale =
                    marginOverrideNum != null
                      ? cost > 0 ? cost / (1 - marginOverrideNum / 100) : 0
                      : ganttSale;
                  totalCost += cost;
                  totalSale += sale;
                }
                const totalMargin =
                  marginOverrideNum != null
                    ? marginOverrideNum
                    : totalSale > 0
                      ? ((totalSale - totalCost) / totalSale) * 100
                      : null;
                return (
                  <TableRow className="bg-muted/40 font-medium">
                    <TableCell colSpan={4} className="text-right text-xs uppercase tracking-wide text-muted-foreground">
                      {t("common.total", { defaultValue: "Total" })}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{formatEUR(totalBudget)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{formatEUR(totalCost)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{formatEUR(totalSale)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {totalMargin != null ? `${totalMargin.toFixed(1)}%` : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                );
              })()}

            </TableBody>
          </Table>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end border-t pt-4">
            <div className="md:col-span-2">
              <Label>{t("common.name")}</Label>
              <Input
                value={newStage.name}
                onChange={(e) => setNewStage((p) => ({ ...p, name: e.target.value }))}
                placeholder={t("workspace.planning.stagePlaceholder")}
              />
            </div>
            <div>
              <Label>{t("workspace.planning.startDate")}</Label>
              <Input
                type="date"
                value={newStage.start_date}
                onChange={(e) => setNewStage((p) => ({ ...p, start_date: e.target.value }))}
              />
            </div>
            <div>
              <Label>{t("workspace.planning.endDate")}</Label>
              <Input
                type="date"
                value={newStage.end_date}
                onChange={(e) => setNewStage((p) => ({ ...p, end_date: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label>{t("workspace.planning.budget")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newStage.budget}
                  onChange={(e) => setNewStage((p) => ({ ...p, budget: e.target.value }))}
                />
              </div>
              <Button onClick={handleAddStage} className="self-end">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DEPENDENCIES */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("workspace.planning.depsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("workspace.planning.predecessor")}</TableHead>
                <TableHead className="w-32">{t("workspace.planning.depType")}</TableHead>
                <TableHead>{t("workspace.planning.successor")}</TableHead>
                <TableHead className="w-24 text-right">{t("workspace.planning.lagDays")}</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {deps.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{stageMap[d.predecessor_stage_id]?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Select
                      value={d.type}
                      onValueChange={(v) =>
                        updateDep
                          .mutateAsync({ id: d.id, patch: { type: v as QuoteDepType } })
                          .catch((e) => toast.error((e as Error).message))
                      }
                    >
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {QUOTE_DEP_TYPES.map((dt) => (
                          <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>{stageMap[d.successor_stage_id]?.name ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      className="h-8 text-right"
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
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => delDep.mutate(d.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {deps.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                    {t("workspace.planning.noDeps")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {stages.length >= 2 && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end border-t pt-4">
              <div>
                <Label>{t("workspace.planning.predecessor")}</Label>
                <Select value={newDep.pred} onValueChange={(v) => setNewDep((p) => ({ ...p, pred: v }))}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("workspace.planning.depType")}</Label>
                <Select value={newDep.type} onValueChange={(v) => setNewDep((p) => ({ ...p, type: v as QuoteDepType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {QUOTE_DEP_TYPES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("workspace.planning.successor")}</Label>
                <Select value={newDep.succ} onValueChange={(v) => setNewDep((p) => ({ ...p, succ: v }))}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>{t("workspace.planning.lagDays")}</Label>
                  <Input
                    type="number"
                    value={newDep.lag}
                    onChange={(e) => setNewDep((p) => ({ ...p, lag: e.target.value }))}
                  />
                </div>
                <Button onClick={handleAddDep} className="self-end">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ALLOCATIONS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("workspace.planning.allocTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("workspace.planning.resource")}</TableHead>
                <TableHead>{t("common.stage")}</TableHead>
                <TableHead className="w-32">{t("workspace.planning.startDate")}</TableHead>
                <TableHead className="w-32">{t("workspace.planning.endDate")}</TableHead>
                <TableHead className="w-20 text-right">%</TableHead>
                <TableHead className="w-28 text-right">{t("workspace.planning.costRate")}</TableHead>
                <TableHead className="w-28 text-right">{t("workspace.planning.saleRate")}</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: a.resource?.color ?? "#a78bfa" }}
                      />
                      <span className="font-medium">
                        {roleLabel(a.resource?.proposal_role)}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>{stageMap[a.stage_id]?.name ?? "—"}</TableCell>
                  <TableCell>{a.start_date}</TableCell>
                  <TableCell>{a.end_date}</TableCell>
                  <TableCell className="text-right">
                    {a.allocation_percentage ?? 100}%
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatEUR(Number(a.cost_rate_snapshot))}/h
                  </TableCell>
                  <TableCell className="text-right">
                    {formatEUR(Number(a.sale_rate_snapshot))}/h
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => delAlloc.mutate(a.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {allocations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                    {t("workspace.planning.noAllocs")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {stages.length > 0 && resources.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end border-t pt-4">
              <div>
                <Label>{t("workspace.planning.resource")}</Label>
                <Select
                  value={newAlloc.resource_id}
                  onValueChange={(v) => setNewAlloc((p) => ({ ...p, resource_id: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {resources.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {roleLabel(r.proposal_role)}
                        <span className="ml-2 text-xs text-muted-foreground">{r.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>

                </Select>
              </div>
              <div>
                <Label>{t("common.stage")}</Label>
                <Select
                  value={newAlloc.stage_id}
                  onValueChange={(v) => setNewAlloc((p) => ({ ...p, stage_id: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("workspace.planning.startDate")}</Label>
                <Input
                  type="date"
                  value={newAlloc.start_date}
                  onChange={(e) => setNewAlloc((p) => ({ ...p, start_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t("workspace.planning.endDate")}</Label>
                <Input
                  type="date"
                  value={newAlloc.end_date}
                  onChange={(e) => setNewAlloc((p) => ({ ...p, end_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>%</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={newAlloc.pct}
                  onChange={(e) => setNewAlloc((p) => ({ ...p, pct: e.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>h/d</Label>
                  <Input
                    type="number"
                    min="0"
                    max="24"
                    value={newAlloc.hpd}
                    onChange={(e) => setNewAlloc((p) => ({ ...p, hpd: e.target.value }))}
                  />
                </div>
                <Button onClick={handleAddAlloc} className="self-end">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          {(stages.length === 0 || resources.length === 0) && (
            <p className="text-xs text-muted-foreground border-t pt-3">
              {t("workspace.planning.allocPrereq")}
            </p>
          )}
        </CardContent>
      </Card>
      </div>

    </div>
  );
}
