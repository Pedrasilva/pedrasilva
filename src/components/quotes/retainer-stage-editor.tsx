/**
 * RetainerStageEditor — UI for a `stage_kind='retainer_monthly'` quote stage.
 *
 * A retainer stage represents ONE calendar month of resource allocations
 * that repeats N times (12 / 18 / 24 / custom). Allocations are clamped to
 * the anchor month; the user works in either % allocation or hours/month
 * (two-way bound, % drives hours by default).
 *
 * Monthly fee and total budget are derived live from allocations. The total
 * is persisted to quote_stages.budget so the financial summary tab keeps
 * showing a meaningful figure (Phase 3 will adapt the rollup to count the
 * monthly hours × N instead of single-month hours).
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Repeat2, Settings2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { RetainerMonthlyReadings } from "@/components/quotes/retainer-monthly-readings";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { formatEUR } from "@/lib/crm/types";
import {
  useUpsertQuoteAllocation,
  useDeleteQuoteAllocation,
} from "@/lib/quotes/use-quote-allocations";
import type { QuoteAllocationWithResource } from "@/lib/quotes/use-quote-allocations";
import { useUpsertQuoteStage, useDeleteQuoteStage } from "@/lib/quotes/use-quote-stages";
import { useQuotePlanningPool } from "@/lib/quotes/use-quote-planning-pool";
import { useDefaultResourceRates, effectiveRates } from "@/lib/projects/use-default-rates";
import { useProposalRoles } from "@/lib/proposal-roles";
import type { QuoteStage } from "@/lib/quotes/types";

import {
  DEFAULT_RETAINER_CAPACITY_HPM,
  RETAINER_MONTH_PRESETS,
  allocationMonthlyHours,
  anchorMonthEnd,
  anchorMonthStart,
  formatAnchorMonth,
  hoursPerMonthToHpd,
  hoursPerMonthToPct,
  monthWorkingDays,
  pctToHoursPerMonth,
  retainerMonthlyCost,
  retainerMonthlyFee,
  retainerMonthlyHours,
  retainerTotalBudget,
} from "@/lib/quotes/retainer-monthly";

interface Props {
  quoteId: string;
  stage: QuoteStage;
  allocations: QuoteAllocationWithResource[];
}

export function RetainerStageEditor({ quoteId, stage, allocations }: Props) {
  const { t, i18n } = useTranslation("crm");

  const upsertStage = useUpsertQuoteStage(quoteId);
  const delStage = useDeleteQuoteStage(quoteId);
  const upsertAlloc = useUpsertQuoteAllocation(quoteId);
  const delAlloc = useDeleteQuoteAllocation(quoteId);

  const { poolResources: resources } = useQuotePlanningPool();
  const { data: defaults } = useDefaultResourceRates();
  const { data: proposalRoles = [] } = useProposalRoles();
  const isPt = (i18n.language ?? "").startsWith("pt");

  const roleLabel = useMemo(() => {
    const byCode: Record<string, string> = {};
    for (const r of proposalRoles) byCode[r.code] = isPt ? r.label_pt : r.label_en;
    return (code: string | null | undefined): string => {
      if (!code) return isPt ? "Sem título" : "Untitled";
      return byCode[code] ?? code;
    };
  }, [proposalRoles, isPt]);

  // Local UI state for "add resource" controls.
  const [picker, setPicker] = useState<{ resource_id: string; pct: string }>(
    { resource_id: "", pct: "50" },
  );

  const anchor = stage.retainer_anchor_month ?? stage.start_date;
  const months = stage.retainer_months ?? 12;
  const capacity =
    stage.retainer_capacity_hours_per_month ?? DEFAULT_RETAINER_CAPACITY_HPM;
  const workdays = monthWorkingDays(anchor);
  // Fee-only retainers skip allocations: monthly amount × months IS the budget.
  // `is_fee_only` defaults to true at the DB level (new retainers).
  const isFeeOnly =
    (stage as { is_fee_only?: boolean | null }).is_fee_only ?? true;
  const manualMonthly = Number(
    (stage as { retainer_monthly_amount?: number | string | null }).retainer_monthly_amount ?? 0,
  );

  // Filter allocations to those on this retainer stage.
  const stageAllocs = useMemo(
    () => allocations.filter((a) => a.stage_id === stage.id),
    [allocations, stage.id],
  );

  const allocMonthlyHours = retainerMonthlyHours(stageAllocs);
  const allocMonthlyFee = retainerMonthlyFee(stageAllocs);
  const allocMonthlyCost = retainerMonthlyCost(stageAllocs);

  // Fee-only mode: monthly fee comes from a user-entered amount, not from
  // allocations. Planned mode: derive from allocations as before.
  const monthlyHours = isFeeOnly ? 0 : allocMonthlyHours;
  const monthlyFee = isFeeOnly ? manualMonthly : allocMonthlyFee;
  const monthlyCost = isFeeOnly ? 0 : allocMonthlyCost;
  const totalBudget = retainerTotalBudget(monthlyFee, months);

  // Keep quote_stages.budget in sync with monthly × months so downstream
  // summaries reflect the retainer's contractual value. Only write when it
  // actually differs.
  useEffect(() => {
    const target = Math.round(totalBudget * 100) / 100;
    const current = Math.round(Number(stage.budget || 0) * 100) / 100;
    if (target !== current) {
      upsertStage.mutate({ id: stage.id, budget: target });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalBudget, stage.id]);

  // ---- handlers ----

  const setMonths = (n: number) => {
    if (n < 1 || n > 120) return;
    upsertStage.mutate({ id: stage.id, retainer_months: n });
  };

  const setAnchorMonth = (firstOfMonth: string) => {
    // Snap to first-of-month and update both anchor + the stage start/end so
    // the Gantt-style date range stays in sync.
    const start = anchorMonthStart(firstOfMonth);
    const end = anchorMonthEnd(firstOfMonth);
    upsertStage.mutate({
      id: stage.id,
      retainer_anchor_month: start,
      start_date: start,
      end_date: end,
    });
    // Also nudge allocations so they stay inside the new month.
    for (const a of stageAllocs) {
      if (a.start_date !== start || a.end_date !== end) {
        upsertAlloc.mutate({ id: a.id, start_date: start, end_date: end });
      }
    }
  };

  const setCapacity = (hpm: number) => {
    if (hpm < 1) return;
    upsertStage.mutate({ id: stage.id, retainer_capacity_hours_per_month: hpm });
  };

  const updateAllocPct = (a: QuoteAllocationWithResource, pctNext: number) => {
    const pct = Math.max(0, Math.min(100, pctNext));
    const hpm = pctToHoursPerMonth(pct, capacity);
    const hpd = hoursPerMonthToHpd(hpm, anchor);
    upsertAlloc.mutate({
      id: a.id,
      allocation_percentage: pct,
      hours_per_day: hpd,
    });
  };

  const updateAllocHpm = (a: QuoteAllocationWithResource, hpmNext: number) => {
    const hpm = Math.max(0, hpmNext);
    const pct = hoursPerMonthToPct(hpm, capacity);
    const hpd = hoursPerMonthToHpd(hpm, anchor);
    upsertAlloc.mutate({
      id: a.id,
      allocation_percentage: pct,
      hours_per_day: hpd,
    });
  };

  const handleAddResource = async () => {
    if (!picker.resource_id) {
      toast.error(t("workspace.planning.errorAllocResStage"));
      return;
    }
    const res = resources.find((r) => r.id === picker.resource_id);
    if (!res) return;
    const pct = Math.max(0, Math.min(100, Number(picker.pct) || 0));
    const hpm = pctToHoursPerMonth(pct, capacity);
    const hpd = hoursPerMonthToHpd(hpm, anchor);
    const rates = effectiveRates(res, defaults);
    try {
      await upsertAlloc.mutateAsync({
        quote_id: quoteId,
        stage_id: stage.id,
        resource_id: picker.resource_id,
        start_date: anchorMonthStart(anchor),
        end_date: anchorMonthEnd(anchor),
        hours_per_day: hpd,
        allocation_percentage: pct,
        cost_rate_snapshot: rates.cost,
        sale_rate_snapshot: rates.sale,
      });
      setPicker({ resource_id: "", pct: "50" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card className="border-primary/40">
      <CardHeader className="space-y-3 pb-3">
        {/* Title row + remove */}
        <div className="flex items-center gap-2">
          <Repeat2 className="h-4 w-4 text-primary" />
          <Input
            key={`name-${stage.id}-${stage.updated_at}`}
            defaultValue={stage.name}
            className="h-8 max-w-xs font-semibold"
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== stage.name) {
                upsertStage.mutate({ id: stage.id, name: e.target.value.trim() });
              }
            }}
          />
          <span className="text-[10px] uppercase tracking-wide rounded border border-primary/40 px-1.5 py-0.5 text-primary bg-primary/5">
            {t("workspace.planning.retainerMonthly.badge", { defaultValue: "Monthly retainer" })}
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-2 mr-1">
            <Switch
              id={`feeonly-${stage.id}`}
              checked={isFeeOnly}
              onCheckedChange={(v) =>
                upsertStage.mutate({
                  id: stage.id,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ...({ is_fee_only: v } as any),
                })
              }
            />
            <Label htmlFor={`feeonly-${stage.id}`} className="text-xs cursor-pointer">
              {t("workspace.planning.retainerMonthly.feeOnly", {
                defaultValue: "Fee-only",
              })}
            </Label>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8">
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">
                  {t("workspace.planning.retainerMonthly.capacity", {
                    defaultValue: "Monthly capacity (h)",
                  })}
                </Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  defaultValue={capacity}
                  onBlur={(e) => {
                    const v = Number(e.target.value) || 0;
                    if (v !== capacity) setCapacity(v);
                  }}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t("workspace.planning.retainerMonthly.capacityHint", {
                    defaultValue: "Drives % ↔ hours/month conversion. Default 160h.",
                  })}
                </p>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-destructive"
            onClick={() => {
              if (confirm(t("workspace.planning.deleteStageConfirm"))) {
                delStage.mutate(stage.id);
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Anchor month + months selector */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">
              {t("workspace.planning.retainerMonthly.anchor", {
                defaultValue: "Anchor month",
              })}
            </Label>
            <Input
              type="month"
              className="h-9 w-40"
              value={anchor.slice(0, 7)}
              onChange={(e) => {
                const v = e.target.value;
                if (v) setAnchorMonth(`${v}-01`);
              }}
            />
          </div>
          <div>
            <Label className="text-xs">
              {t("workspace.planning.retainerMonthly.duration", {
                defaultValue: "Repeats over",
              })}
            </Label>
            <div className="flex items-center gap-1">
              {RETAINER_MONTH_PRESETS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={months === m ? "default" : "outline"}
                  size="sm"
                  className="h-9 px-3 text-xs"
                  onClick={() => setMonths(m)}
                >
                  {m}m
                </Button>
              ))}
              <Input
                type="number"
                min={1}
                max={120}
                className="h-9 w-20"
                key={`m-${stage.id}-${months}`}
                defaultValue={months}
                onBlur={(e) => {
                  const v = Number(e.target.value) || 0;
                  if (v >= 1 && v <= 120 && v !== months) setMonths(v);
                }}
              />
              <span className="text-xs text-muted-foreground">
                {t("workspace.planning.retainerMonthly.monthsUnit", { defaultValue: "months" })}
              </span>
            </div>
          </div>

          {/* Live totals badge */}
          <div className="ml-auto flex flex-col items-end text-right">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("workspace.planning.retainerMonthly.summary", {
                defaultValue: "{{anchor}} · {{months}} months",
                anchor: formatAnchorMonth(anchor, isPt ? "pt-PT" : "en"),
                months,
              })}
            </div>
            <div className="text-sm tabular-nums">
              <span className="text-muted-foreground">
                {t("workspace.planning.retainerMonthly.monthly", { defaultValue: "Monthly" })}
              </span>{" "}
              <span className="font-medium">{formatEUR(monthlyFee)}</span>
              <span className="text-muted-foreground"> × {months} = </span>
              <span className="font-semibold text-primary">{formatEUR(totalBudget)}</span>
            </div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {monthlyHours.toFixed(1)}{" "}
              {t("workspace.planning.retainerMonthly.hoursPerMonth", {
                defaultValue: "h/month",
              })}{" "}
              · {t("workspace.planning.retainerMonthly.cost", { defaultValue: "cost" })}{" "}
              {formatEUR(monthlyCost)} / mo · {workdays}{" "}
              {t("workspace.planning.retainerMonthly.workdays", {
                defaultValue: "workdays",
              })}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {isFeeOnly ? (
          <>
            {/* Monthly fee input (fee-only mode) */}
            <div className="flex flex-wrap items-end gap-3 border-t pt-3">
              <div>
                <Label className="text-xs">
                  {t("workspace.planning.retainerMonthly.monthlyAmount", {
                    defaultValue: "Monthly amount (€)",
                  })}
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={50}
                  className="h-9 w-40 text-right tabular-nums"
                  key={`amt-${stage.id}-${manualMonthly}`}
                  defaultValue={manualMonthly}
                  onBlur={(e) => {
                    const v = Number(e.target.value) || 0;
                    if (Math.abs(v - manualMonthly) > 0.005) {
                      upsertStage.mutate({
                        id: stage.id,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        ...({ retainer_monthly_amount: v } as any),
                      });
                    }
                  }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground max-w-md">
                {t("workspace.planning.retainerMonthly.feeOnlyHint", {
                  defaultValue:
                    "Fee-only mode: skip resource planning. Anyone logs hours below; we compute cost & value vs the monthly fee.",
                })}
              </p>
            </div>

            <RetainerMonthlyReadings
              quoteId={quoteId}
              stageId={stage.id}
              anchorMonth={anchor}
              months={months}
              monthlyFee={monthlyFee}
            />
          </>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("workspace.planning.resource")}</TableHead>
                  <TableHead className="w-24 text-right">%</TableHead>
                  <TableHead className="w-32 text-right">
                    {t("workspace.planning.retainerMonthly.hoursPerMonthCol", {
                      defaultValue: "h / month",
                    })}
                  </TableHead>
                  <TableHead className="w-28 text-right">{t("workspace.planning.costRate")}</TableHead>
                  <TableHead className="w-28 text-right">{t("workspace.planning.saleRate")}</TableHead>
                  <TableHead className="w-32 text-right">
                    {t("workspace.planning.retainerMonthly.monthlyFee", {
                      defaultValue: "Monthly fee",
                    })}
                  </TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {stageAllocs.map((a) => {
                  const hpm = allocationMonthlyHours(a);
                  const pct = a.allocation_percentage ?? hoursPerMonthToPct(hpm, capacity);
                  const sale = Number(a.sale_rate_snapshot || 0);
                  const cost = Number(a.cost_rate_snapshot || 0);
                  const fee = hpm * sale;
                  return (
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
                          <span className="text-xs text-muted-foreground">
                            {a.resource?.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={5}
                          className="h-8 text-right tabular-nums"
                          key={`pct-${a.id}-${pct}`}
                          defaultValue={Math.round(pct)}
                          onBlur={(e) => {
                            const v = Number(e.target.value) || 0;
                            if (Math.abs(v - pct) > 0.01) updateAllocPct(a, v);
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          className="h-8 text-right tabular-nums"
                          key={`hpm-${a.id}-${hpm}`}
                          defaultValue={hpm.toFixed(1)}
                          onBlur={(e) => {
                            const v = Number(e.target.value) || 0;
                            if (Math.abs(v - hpm) > 0.01) updateAllocHpm(a, v);
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                        {formatEUR(cost)}/h
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {formatEUR(sale)}/h
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {formatEUR(fee)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => delAlloc.mutate(a.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {stageAllocs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-4">
                      {t("workspace.planning.retainerMonthly.empty", {
                        defaultValue: "No resources allocated yet. Add one below.",
                      })}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Add resource */}
            {resources.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end border-t pt-3">
                <div className="md:col-span-3">
                  <Label className="text-xs">{t("workspace.planning.resource")}</Label>
                  <Select
                    value={picker.resource_id}
                    onValueChange={(v) => setPicker((p) => ({ ...p, resource_id: v }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
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
                  <Label className="text-xs">%</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={picker.pct}
                    onChange={(e) => setPicker((p) => ({ ...p, pct: e.target.value }))}
                    className="h-9 text-right"
                  />
                </div>
                <div className="text-xs text-muted-foreground md:col-span-1 self-center">
                  ≈ {pctToHoursPerMonth(Number(picker.pct) || 0, capacity).toFixed(1)}{" "}
                  {t("workspace.planning.retainerMonthly.hoursPerMonth", { defaultValue: "h/month" })}
                </div>
                <Button onClick={handleAddResource} className="h-9">
                  <Plus className="h-4 w-4 mr-1" />
                  {t("workspace.planning.retainerMonthly.addResource", {
                    defaultValue: "Add resource",
                  })}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
