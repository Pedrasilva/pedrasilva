import { useState } from "react";
import { useDeleteAllocation, useUpdateAllocation } from "@/lib/projects/use-planner";
import type { AllocationWithResource } from "@/lib/projects/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { allocationCost, allocationHours, euros, workingDays } from "@/lib/projects/gantt-utils";

interface Props {
  allocation: AllocationWithResource;
  projectId: string;
}

export function AllocationEditor({ allocation, projectId }: Props) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(Number(allocation.hours_per_day));
  const [start, setStart] = useState(allocation.start_date);
  const [end, setEnd] = useState(allocation.end_date);
  const update = useUpdateAllocation();
  const del = useDeleteAllocation();

  const wd = workingDays(start, end);
  const totalH = allocationHours({ start_date: start, end_date: end, hours_per_day: hours });
  const cost = allocationCost({
    start_date: start,
    end_date: end,
    hours_per_day: hours,
    hourly_rate: Number(allocation.resource.hourly_rate),
  });

  async function save() {
    try {
      await update.mutateAsync({
        id: allocation.id,
        projectId,
        patch: { start_date: start, end_date: end, hours_per_day: hours },
      });
      toast.success("Atualizado");
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remove() {
    if (!confirm(`Remover alocação de ${allocation.resource.name}?`)) return;
    try {
      await del.mutateAsync({ id: allocation.id, projectId });
      toast.success("Removido");
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
          <div className="flex justify-between gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={remove} className="text-destructive hover:text-destructive">
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover
            </Button>
            <Button size="sm" onClick={save} disabled={update.isPending}>
              {update.isPending ? "A guardar…" : "Guardar"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
