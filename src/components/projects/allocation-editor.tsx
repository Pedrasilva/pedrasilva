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
import { allocationCost, allocationHours, euros, workingDays } from "@/lib/projects/gantt-utils";
import { useResourceSchedules } from "@/lib/projects/use-resource-schedules";
import { useDefaultResourceRates, effectiveSaleRate, effectiveCostRate } from "@/lib/projects/use-default-rates";

type AllocationStatus = "tentative" | "committed";

interface Props {
  allocation: AllocationWithResource;
  /** Scoping ID for the underlying mode (project_id in project mode, quote_id in quote mode). */
  projectId: string;
  adapter: PlannerAdapter;
}

type AllocationWithStatus = AllocationWithResource & {
  status?: AllocationStatus | null;
  allocation_percentage?: number | null;
};

const FALLBACK_DAILY_HOURS = 8;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function AllocationEditor({ allocation, projectId, adapter }: Props) {
  const [open, setOpen] = useState(false);
  const allocWithExtras = allocation as AllocationWithStatus;

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
  const [pct, setPct] = useState<number>(storedPct ?? Math.min(100, Math.max(0, backComputedPct)));
  const [hours, setHours] = useState(Number(allocation.hours_per_day));
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
    setStart(allocation.start_date);
    setEnd(allocation.end_date);
    setHours(Number(allocation.hours_per_day));
    setPct(storedPct ?? Math.min(100, Math.max(0, backComputedPct)));
    setStatus(initialStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, allocation.start_date, allocation.end_date, allocation.hours_per_day]);

  const showStatusToggle = adapter.features.statusToggle && !!adapter.setAllocationStatus;
  const showPercentage = adapter.features.allocationPercentage;
  const pending = adapter.pending.allocation;

  // Derived hours/day when % drives the allocation.
  const derivedHours = round1((pct / 100) * recoverableHoursPerDay);
  const effectiveHours = hours;

  const wd = workingDays(start, end);
  const totalH = allocationHours({
    start_date: start,
    end_date: end,
    hours_per_day: effectiveHours,
  });
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
  });
  const cost = allocationCost({
    start_date: start,
    end_date: end,
    hours_per_day: effectiveHours,
    hourly_rate: effectiveCost,
  });
  const margin = revenue - cost;

  function applyPct(nextPct: number) {
    const clamped = Math.max(0, Math.min(100, nextPct));
    setPct(clamped);
    // Hours/day is derived from HR-recoverable capacity, not a flat 8h base.
    setHours(round1((clamped / 100) * recoverableHoursPerDay));
  }


  async function save() {
    try {
      // In allocation-% mode HR-recoverable × pct/100 drives hours/day; otherwise
      // the manual hours field is the source of truth.
      const hoursToSave = hours;
      const patch: Parameters<typeof adapter.updateAllocation>[0]["patch"] = showStatusToggle
        ? { start_date: start, end_date: end, hours_per_day: hoursToSave, status }
        : { start_date: start, end_date: end, hours_per_day: hoursToSave };
      if (showPercentage) {
        patch.allocation_percentage = pct;
      }
      await adapter.updateAllocation({
        id: allocation.id,
        projectId,
        patch,
      });
      toast.success("Atualizado");
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
      toast.success(next === "committed" ? "Confirmada" : "Marcada como tentativa");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remove() {
    if (!confirm(`Remover alocação de ${allocation.resource.name}?`)) return;
    try {
      await adapter.deleteAllocation({ id: allocation.id, projectId });
      toast.success("Removida");
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="absolute inset-0"
          aria-label={`Editar ${allocation.resource.name}`}
          onClick={(e) => e.stopPropagation()}
        />
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: allocation.resource.color }} />
            <p className="font-display text-base font-semibold">{allocation.resource.name}</p>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="ml-auto inline-flex cursor-help flex-col items-end leading-tight">
                    <span className="text-xs text-muted-foreground">{euros(effectiveSale)}/h</span>
                    <span
                      className={`text-[10px] uppercase tracking-wider ${
                        showsOverride ? "text-amber-600" : "text-muted-foreground"
                      }`}
                    >
                      {showsOverride ? "Project override" : "HR default · 75%"}
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs text-left">
                  {showsOverride ? (
                    <div className="space-y-1">
                      <p className="font-medium">Project override</p>
                      <p className="text-[11px] opacity-90">
                        Manual sale rate set on this project resource. It overrides the HR
                        75% default.
                      </p>
                      {hrDefaultSale > 0 && (
                        <p className="text-[11px] opacity-75">
                          HR default would be {euros(hrDefaultSale)} (75% band).
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="font-medium">HR default · 75%</p>
                      <p className="text-[11px] opacity-90">
                        Derived from the HR pricing table using the 75% sale-rate band.
                      </p>
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Status toggle: tentative ↔ committed (project-mode only) */}
          {showStatusToggle && (
            <div>
              <Label className="text-xs">Estado da alocação</Label>
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
                  Tentativa
                </button>
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
                  Confirmada
                </button>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {status === "tentative"
                  ? "Soft-booking: visível mas não conta como entrega firme."
                  : "Compromisso firme contado em capacidade e KPIs."}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="a-start" className="text-xs">Início</Label>
              <Input id="a-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="a-end" className="text-xs">Fim</Label>
              <Input id="a-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {showPercentage ? (
            <>
              <div className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Capacidade recuperável</span>
                  <span className="font-mono">{round1(recoverableHoursPerDay)}h/dia</span>
                </div>
                {schedule?.targetChargeabilityPct != null && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {round1(schedule.dailyHours)}h × {schedule.targetChargeabilityPct}% (HR)
                  </p>
                )}
                {schedule?.targetChargeabilityPct == null && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Sem chargeability definido em HR — assumido {round1(recoverableHoursPerDay)}h/dia.
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="a-pct" className="text-xs">Alocação ao projecto (%)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="a-pct"
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={pct}
                    onChange={(e) => applyPct(Number(e.target.value))}
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
                  <span className="text-muted-foreground">Horas/dia</span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={24}
                      step={0.1}
                      value={derivedHours}
                      onChange={(e) => {
                        const h = Number(e.target.value);
                        setHours(round1(h));
                        if (recoverableHoursPerDay > 0) {
                          setPct(Math.max(0, Math.min(100, Math.round((h / recoverableHoursPerDay) * 100))));
                        }
                      }}
                      className="h-7 w-20 text-right font-mono text-[11px]"
                    />
                    <span className="text-muted-foreground">h/dia</span>
                  </div>
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {pct}% × {round1(recoverableHoursPerDay)}h recuperável · editável
                </p>
              </div>
            </>

          ) : (
            <div>
              <Label htmlFor="a-h" className="text-xs">Horas por dia útil</Label>
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
            <div className="flex justify-between"><span className="text-muted-foreground">Dias úteis</span><span className="font-mono">{wd}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total horas</span><span className="font-mono">{totalH.toFixed(1)} h</span></div>
            <div className="mt-1 flex justify-between border-t border-border pt-1">
              <span className="text-muted-foreground">Custo <span className="opacity-70">@ {euros(effectiveCost)}/h</span></span>
              <span className="font-mono font-semibold">{euros(cost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Venda <span className="opacity-70">@ {euros(effectiveSale)}/h</span></span>
              <span className="font-mono font-semibold">{euros(revenue)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-border pt-1">
              <span className="text-muted-foreground">Margem</span>
              <span className={`font-mono font-semibold ${margin < 0 ? "text-destructive" : ""}`}>{euros(margin)}</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={remove} className="text-destructive hover:text-destructive">
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover
            </Button>
            <div className="flex items-center gap-2">
              {showStatusToggle && (
                <Button variant="ghost" size="sm" onClick={quickToggleStatus} disabled={pending}>
                  {status === "committed" ? "→ Tentativa" : "→ Confirmar"}
                </Button>
              )}
              <Button size="sm" onClick={save} disabled={pending}>
                {pending ? "A guardar…" : "Guardar"}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
