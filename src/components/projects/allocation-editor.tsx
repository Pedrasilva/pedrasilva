import { useTranslation } from "react-i18next";
import i18n from "@/i18n/index";
import { useEffect, useState } from "react";
import type { AllocationWithResource } from "@/lib/projects/types";
import type { PlannerAdapter } from "@/lib/projects/planner-adapter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2, Lock, FileQuestion } from "lucide-react";
import { toast } from "sonner";
import { AllocationRemoveDialog } from "./allocation-remove-dialog";
import { allocationCost, allocationHours, effortHolidays, euros, workingDays } from "@/lib/projects/gantt-utils";
import { useResourceSchedules } from "@/lib/projects/use-resource-schedules";
import { useDefaultResourceRates, effectiveSaleRate, effectiveCostRate } from "@/lib/projects/use-default-rates";

type AllocationStatus = "tentative" | "committed";

interface Props {
  allocation: AllocationWithResource;
  /** Scoping ID for the underlying mode (project_id in project mode, quote_id in quote mode). */
  projectId: string;
  adapter: PlannerAdapter;
  /** Parent stage bounds — allocations are always clamped within these. */
  stageStart?: string;
  stageEnd?: string;
}

type AllocationWithStatus = AllocationWithResource & {
  status?: AllocationStatus | null;
  allocation_percentage?: number | null;
};

const FALLBACK_DAILY_HOURS = 8;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function parseDecimal(text: string): number | null {
  const normalized = text.trim().replace(",", ".");
  if (normalized === "") return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatDecimal(n: number): string {
  return String(round1(n));
}

export function AllocationEditor({ allocation, projectId, adapter, stageStart, stageEnd }: Props) {
  useTranslation();
  const [open, setOpen] = useState(false);
  const allocWithExtras = allocation as AllocationWithStatus;

  // Clamp any date to the stage window so allocations can never bleed outside.
  const clampToStage = (iso: string): string => {
    if (!iso) return iso;
    if (stageStart && iso < stageStart) return stageStart;
    if (stageEnd && iso > stageEnd) return stageEnd;
    return iso;
  };

  const { data: schedules } = useResourceSchedules();
  const schedule = schedules?.get(allocation.resource.id);
  const { data: defaultRates } = useDefaultResourceRates();

  // Effective sale rate = explicit project override OR HR default @ 75%.
  // Legacy pm_resources.hourly_rate defaults (100€/h) are ignored unless
  // hourly_rate_is_override is true.
  const resourceWithFlag = allocation.resource as typeof allocation.resource & {
    hourly_rate_is_override?: boolean | null;
  };
  const isOverride =
    resourceWithFlag.hourly_rate_is_override == null
      ? undefined
      : !!resourceWithFlag.hourly_rate_is_override;
  const effectiveSale = effectiveSaleRate(
    allocation.resource.hourly_rate,
    allocation.resource.id,
    defaultRates,
    isOverride,
  );
  const hrDefaultSale = defaultRates?.get(allocation.resource.id)?.sale ?? 0;
  const showsOverride = isOverride === true && Number(allocation.resource.hourly_rate) > 0;

  // Recoverable capacity per day from HR (daily_hours × target_chargeability_pct).
  // Falls back to contractual daily_hours, then to 8h when the resource is not
  // linked to an HR collaborator.
  const recoverableHoursPerDay =
    schedule?.recoverableHoursPerDay ?? schedule?.dailyHours ?? FALLBACK_DAILY_HOURS;

  // Derive initial pct: prefer stored allocation_percentage; otherwise back-compute
  // from existing hours_per_day vs. recoverable capacity.
  const storedPct =
    typeof allocWithExtras.allocation_percentage === "number"
      ? allocWithExtras.allocation_percentage
      : null;
  const backComputedPct =
    recoverableHoursPerDay > 0
      ? Math.round((Number(allocation.hours_per_day) / recoverableHoursPerDay) * 100)
      : 100;
  const initialPct = storedPct ?? Math.min(100, Math.max(0, backComputedPct));
  const [pct, setPct] = useState<number>(initialPct);
  const [pctText, setPctText] = useState<string>(String(initialPct));
  const [hours, setHours] = useState(Number(allocation.hours_per_day));
  const [hoursText, setHoursText] = useState<string>(String(round1(Number(allocation.hours_per_day))));
  const [start, setStart] = useState(allocation.start_date);
  const [end, setEnd] = useState(allocation.end_date);
  const initialStatus: AllocationStatus =
    (allocWithExtras.status ?? "committed") as AllocationStatus;
  const [status, setStatus] = useState<AllocationStatus>(initialStatus);

  // Re-sync local edit state whenever the popover opens or the underlying
  // allocation changes (e.g. user resized the bar in the Gantt before
  // opening the editor). Without this, the inputs show stale dates/hours
  // from the first mount.
  useEffect(() => {
    if (!open) return;
    setStart(clampToStage(allocation.start_date));
    setEnd(clampToStage(allocation.end_date));
    const h = Number(allocation.hours_per_day);
    setHours(h);
    setHoursText(String(round1(h)));
    const p = storedPct ?? Math.min(100, Math.max(0, backComputedPct));
    setPct(p);
    setPctText(String(p));
    setStatus(initialStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, allocation.start_date, allocation.end_date, allocation.hours_per_day]);

  const showStatusToggle = adapter.features.statusToggle && !!adapter.setAllocationStatus;
  const showPercentage = adapter.features.allocationPercentage;
  const pending = adapter.pending.allocation;

  // Derived hours/day when % drives the allocation.
  const derivedHours = round1((pct / 100) * recoverableHoursPerDay);
  const effectiveHours = hours;

  const effortCal = effortHolidays(adapter.mode);
  const wd = workingDays(start, end, effortCal);
  const totalH = allocationHours({
    start_date: start,
    end_date: end,
    hours_per_day: effectiveHours,
  }, effortCal);
  const effectiveCost = effectiveCostRate(
    (allocation.resource as typeof allocation.resource & { cost_rate?: number | null }).cost_rate,
    allocation.resource.id,
    defaultRates,
    isOverride,
  );
  const revenue = allocationCost({
    start_date: start,
    end_date: end,
    hours_per_day: effectiveHours,
    hourly_rate: effectiveSale,
  }, effortCal);
  const cost = allocationCost({
    start_date: start,
    end_date: end,
    hours_per_day: effectiveHours,
    hourly_rate: effectiveCost,
  }, effortCal);
  const margin = revenue - cost;

  function applyPct(nextPct: number) {
    const clamped = Math.max(0, Math.min(100, nextPct));
    setPct(clamped);
    setPctText(formatDecimal(clamped));
    const h = round1((clamped / 100) * recoverableHoursPerDay);
    setHours(h);
    setHoursText(formatDecimal(h));
  }

  function onPctChange(text: string) {
    setPctText(text);
    const n = parseDecimal(text);
    if (n == null) return;
    const clamped = Math.max(0, Math.min(100, n));
    setPct(clamped);
    const h = round1((clamped / 100) * recoverableHoursPerDay);
    setHours(h);
    setHoursText(formatDecimal(h));
  }

  function onHoursChange(text: string) {
    setHoursText(text);
    const n = parseDecimal(text);
    if (n == null) return;
    const clamped = Math.max(0, Math.min(24, n));
    setHours(clamped);
    if (recoverableHoursPerDay > 0) {
      const p = round1(Math.max(0, Math.min(100, (clamped / recoverableHoursPerDay) * 100)));
      setPct(p);
      setPctText(formatDecimal(p));
    }
  }


  async function save() {
    try {
      // In allocation-% mode HR-recoverable × pct/100 drives hours/day; otherwise
      // the manual hours field is the source of truth.
      const parsedHours = parseDecimal(hoursText);
      const parsedPct = parseDecimal(pctText);
      const hoursToSave = parsedHours == null ? hours : Math.max(0, Math.min(24, parsedHours));
      const pctToSave = parsedPct == null ? pct : Math.max(0, Math.min(100, parsedPct));
      // Enforce stage-boundary invariant at save time.
      const clampedStart = clampToStage(start);
      const clampedEnd = clampToStage(end);
      const safeStart = clampedStart > clampedEnd ? clampedEnd : clampedStart;
      const patch: Parameters<typeof adapter.updateAllocation>[0]["patch"] = showStatusToggle
        ? { start_date: safeStart, end_date: clampedEnd, hours_per_day: hoursToSave, status }
        : { start_date: safeStart, end_date: clampedEnd, hours_per_day: hoursToSave };
      if (showPercentage) {
        patch.allocation_percentage = pctToSave;
      }
      await adapter.updateAllocation({
        id: allocation.id,
        projectId,
        patch,
      });
      toast.success(i18n.t("common:updated"));
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function quickToggleStatus() {
    if (!adapter.setAllocationStatus) return;
    const next: AllocationStatus = status === "committed" ? "tentative" : "committed";
    try {
      await adapter.setAllocationStatus({ id: allocation.id, projectId, status: next });
      setStatus(next);
      toast.success(next === "committed" ? i18n.t("projects:allocation.status.committed") : i18n.t("projects:allocationEditor.ui.allocationTentative"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const [removing, setRemoving] = useState(false);
  async function remove() {
    if (adapter.mode === "project") { setRemoving(true); return; }
    if (!confirm(i18n.t("projects:allocationEditor.ui.removeAllocationConfirm", { value1: allocation.resource.name }))) return;
    try {
      await adapter.deleteAllocation({ id: allocation.id, projectId });
      toast.success(i18n.t("common:removed"));
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <>
    {adapter.mode === "project" && <AllocationRemoveDialog open={removing} onOpenChange={setRemoving} allocationId={allocation.id} name={allocation.resource.name} onRemove={async (mode) => { await adapter.deleteAllocation({ id: allocation.id, projectId, mode }); setOpen(false); }} />}
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="absolute inset-0 rounded-md"
          aria-label={i18n.t("projects:allocationEditor.ui.editResource", { value1: allocation.resource.name })}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        />
      </PopoverTrigger>
      <PopoverContent
        className="z-[100] w-80"
        align="start"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: allocation.resource.color }} />
            <p className="text-base font-semibold">{allocation.resource.name}</p>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="ml-auto inline-flex cursor-help flex-col items-end leading-tight">
                    <span className="text-xs text-muted-foreground">{euros(effectiveSale)} {i18n.t("common:units.perHour")} </span>
                    <span
                      className={`text-[10px] uppercase tracking-wider ${
                        showsOverride ? "text-amber-600" : "text-muted-foreground"
                      }`}
                    >
                      {showsOverride ? i18n.t("projects:resources.ui.override") : i18n.t("projects:resources.ui.hrDefault75")}
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs text-left">
                  {showsOverride ? (
                    <div className="space-y-1">
                      <p className="font-medium"> {i18n.t("projects:resources.ui.override")} </p>
                      <p className="text-[11px] opacity-90">
                         {i18n.t("projects:allocationEditor.ui.saleOverrideHint")} </p>
                      {hrDefaultSale > 0 && (
                        <p className="text-[11px] opacity-75">
                           {i18n.t("projects:allocationEditor.ui.hrDefaultWouldBe")} {euros(hrDefaultSale)}  {i18n.t("projects:allocationEditor.ui.saleBandSuffix")} </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="font-medium"> {i18n.t("projects:resources.ui.hrDefault75")} </p>
                      <p className="text-[11px] opacity-90">
                         {i18n.t("projects:allocationEditor.ui.hrSalePriceHint")} </p>
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Status toggle: tentative ↔ committed (project-mode only) */}
          {showStatusToggle && (
            <div>
              <Label className="text-xs"> {i18n.t("projects:allocationEditor.ui.allocationStatus")} </Label>
              <div className="mt-1 grid grid-cols-2 gap-1 rounded-md border border-border p-0.5">
                <button
                  type="button"
                  onClick={() => setStatus("tentative")}
                  className={`flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs transition ${
                    status === "tentative"
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <FileQuestion className="h-3 w-3" />
                   {i18n.t("projects:allocation.status.tentative")} </button>
                <button
                  type="button"
                  onClick={() => setStatus("committed")}
                  className={`flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs transition ${
                    status === "committed"
                      ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <Lock className="h-3 w-3" />
                   {i18n.t("projects:allocation.status.committed")} </button>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {status === "tentative"
                  ? i18n.t("projects:allocationEditor.ui.tentativeHint")
                  : i18n.t("projects:allocationEditor.ui.committedHint")}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="a-start" className="text-xs"> {i18n.t("projects:detail.ui.start")} </Label>
              <Input
                id="a-start"
                type="date"
                value={start}
                min={stageStart}
                max={stageEnd}
                onChange={(e) => setStart(clampToStage(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="a-end" className="text-xs"> {i18n.t("projects:detail.ui.end")} </Label>
              <Input
                id="a-end"
                type="date"
                value={end}
                min={stageStart}
                max={stageEnd}
                onChange={(e) => setEnd(clampToStage(e.target.value))}
              />
            </div>
          </div>
          {showPercentage ? (
            <>
              <div className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground"> {i18n.t("projects:allocationEditor.ui.billableCapacity")} </span>
                  <span className="font-mono">{round1(recoverableHoursPerDay)} {i18n.t("common:units.hoursPerDayShort")} </span>
                </div>
                {schedule?.targetChargeabilityPct != null && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {round1(schedule.dailyHours)} {i18n.t("common:units.hoursTimes")} {schedule.targetChargeabilityPct} {i18n.t("common:hrPercentSuffix")} </p>
                )}
                {schedule?.targetChargeabilityPct == null && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                     {i18n.t("projects:allocationEditor.ui.missingChargeability")} {round1(recoverableHoursPerDay)} {i18n.t("common:units.hoursPerDayEnd")} </p>
                )}
              </div>
              <div>
                <Label htmlFor="a-pct" className="text-xs"> {i18n.t("projects:allocationEditor.ui.projectAllocationPercent")} </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="a-pct"
                    type="text"
                    inputMode="decimal"
                    value={pctText}
                    onChange={(e) => onPctChange(e.target.value)}
                    onBlur={() => {
                      const n = parseDecimal(pctText);
                      if (n == null) {
                        setPctText(formatDecimal(pct));
                      } else {
                        const clamped = Math.max(0, Math.min(100, n));
                        setPct(clamped);
                        setPctText(formatDecimal(clamped));
                      }
                    }}
                    className="w-24"
                  />
                  <div className="flex flex-wrap gap-1">
                    {[100, 80, 50, 20, 10].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => applyPct(p)}
                        className={`rounded border px-2 py-0.5 text-[11px] transition ${
                          pct === p
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {p}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-md bg-muted/60 px-2.5 py-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground"> {i18n.t("projects:allocationEditor.ui.hoursPerDay")} </span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={hoursText}
                      onChange={(e) => onHoursChange(e.target.value)}
                      onBlur={() => {
                        const n = parseDecimal(hoursText);
                        if (n == null) {
                          setHoursText(formatDecimal(hours));
                        } else {
                          const clamped = Math.max(0, Math.min(24, n));
                          setHours(clamped);
                          setHoursText(formatDecimal(clamped));
                        }
                      }}
                      className="h-7 w-20 text-right font-mono text-[11px]"
                    />

                    <span className="text-muted-foreground"> {i18n.t("common:units.hoursPerDayShort")} </span>
                  </div>
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {pct}% × {round1(recoverableHoursPerDay)} {i18n.t("projects:allocationEditor.ui.billableHoursEditable")} </p>
              </div>
            </>

          ) : (
            <div>
              <Label htmlFor="a-h" className="text-xs"> {i18n.t("projects:allocationEditor.ui.hoursPerWorkingDay")} </Label>
              <Input
                id="a-h"
                type="number"
                min={0}
                max={12}
                step={0.5}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
              />
            </div>
          )}
          <div className="rounded-md bg-muted/60 p-3 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground"> {i18n.t("projects:allocationEditor.ui.diasTeis")} </span><span className="font-mono">{wd}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground"> {i18n.t("projects:allocationEditor.ui.totalHours")} </span><span className="font-mono">{(totalH).toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}  {i18n.t("common:units.hoursShort")} </span></div>
            <div className="mt-1 flex justify-between border-t border-border pt-1">
              <span className="text-muted-foreground"> {i18n.t("glossary:financial.cost")} <span className="opacity-70">@ {euros(effectiveCost)} {i18n.t("common:units.perHour")} </span></span>
              <span className="font-mono font-semibold">{euros(cost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground"> {i18n.t("projects:detail.retainerMonitor.saleCol")} <span className="opacity-70">@ {euros(effectiveSale)} {i18n.t("common:units.perHour")} </span></span>
              <span className="font-mono font-semibold">{euros(revenue)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-border pt-1">
              <span className="text-muted-foreground"> {i18n.t("glossary:financial.margin")} </span>
              <span className={`font-mono font-semibold ${margin < 0 ? "text-destructive" : ""}`}>{euros(margin)}</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={remove} className="text-destructive hover:text-destructive">
              <Trash2 className="mr-1 h-3.5 w-3.5" />  {i18n.t("common:remove")} </Button>
            <div className="flex items-center gap-2">
              {showStatusToggle && (
                <Button variant="ghost" size="sm" onClick={quickToggleStatus} disabled={pending}>
                  {status === "committed" ? i18n.t("projects:allocationEditor.ui.markTentative") : i18n.t("projects:allocationEditor.ui.confirmAllocation")}
                </Button>
              )}
              <Button size="sm" onClick={save} disabled={pending}>
                {pending ? i18n.t("common:saving") : i18n.t("common:save")}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
    </>
  );
}
