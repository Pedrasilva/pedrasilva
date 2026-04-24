import { useState } from "react";
import type { AllocationWithResource } from "@/lib/projects/types";
import type { PlannerAdapter } from "@/lib/projects/planner-adapter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2, Lock, FileQuestion } from "lucide-react";
import { toast } from "sonner";
import { allocationCost, allocationHours, euros, workingDays } from "@/lib/projects/gantt-utils";

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

const HOURS_PER_FULL_DAY = 8;

function pctToHours(pct: number): number {
  // 100% = 8h, 50% = 4h, 20% = 1.6h. Round to 1 decimal.
  return Math.round((pct / 100) * HOURS_PER_FULL_DAY * 10) / 10;
}

export function AllocationEditor({ allocation, projectId, adapter }: Props) {
  const [open, setOpen] = useState(false);
  const allocWithExtras = allocation as AllocationWithStatus;
  const initialPct =
    typeof allocWithExtras.allocation_percentage === "number"
      ? allocWithExtras.allocation_percentage
      : 100;
  const [pct, setPct] = useState<number>(initialPct);
  const [hours, setHours] = useState(Number(allocation.hours_per_day));
  const [start, setStart] = useState(allocation.start_date);
  const [end, setEnd] = useState(allocation.end_date);
  const initialStatus: AllocationStatus =
    (allocWithExtras.status ?? "committed") as AllocationStatus;
  const [status, setStatus] = useState<AllocationStatus>(initialStatus);

  const showStatusToggle = adapter.features.statusToggle && !!adapter.setAllocationStatus;
  const showPercentage = adapter.features.allocationPercentage;
  const pending = adapter.pending.allocation;

  const wd = workingDays(start, end);
  const totalH = allocationHours({ start_date: start, end_date: end, hours_per_day: hours });
  const cost = allocationCost({
    start_date: start,
    end_date: end,
    hours_per_day: hours,
    hourly_rate: Number(allocation.resource.hourly_rate),
  });

  function applyPct(nextPct: number) {
    setPct(nextPct);
    // In allocation-% mode, % drives hours/day so the two stay in sync.
    setHours(pctToHours(nextPct));
  }

  async function save() {
    try {
      const patch: Parameters<typeof adapter.updateAllocation>[0]["patch"] = showStatusToggle
        ? { start_date: start, end_date: end, hours_per_day: hours, status }
        : { start_date: start, end_date: end, hours_per_day: hours };
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
            <span className="ml-auto text-xs text-muted-foreground">
              {euros(Number(allocation.resource.hourly_rate))}/h
            </span>
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
          <div className="rounded-md bg-muted/60 p-3 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Dias úteis</span><span className="font-mono">{wd}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total horas</span><span className="font-mono">{totalH.toFixed(1)} h</span></div>
            <div className="mt-1 flex justify-between border-t border-border pt-1"><span className="text-muted-foreground">Custo</span><span className="font-mono font-semibold">{euros(cost)}</span></div>
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
