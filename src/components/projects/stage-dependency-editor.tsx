import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { DepType } from "@/lib/projects/dependencies";
import type { StageWithProject } from "@/components/projects/gantt-chart";
import type { PlannerAdapter } from "@/lib/projects/planner-adapter";

interface Props {
  stage: StageWithProject;
  allStages: StageWithProject[];
  adapter: PlannerAdapter;
}

const TYPE_LABELS: Record<DepType, string> = {
  FS: "Fim → Início",
  SS: "Início → Início",
  FF: "Fim → Fim",
  SF: "Início → Fim",
};

export function StageDependencyEditor({ stage, allStages, adapter }: Props) {
  const [open, setOpen] = useState(false);
  const deps = adapter.dependencies;
  const canEdit = !!adapter.updateDependency;

  const [newPredId, setNewPredId] = useState<string>("");
  const [newType, setNewType] = useState<DepType>("FS");
  const [newLag, setNewLag] = useState(0);

  const stageMap = useMemo(() => new Map(allStages.map((s) => [s.id, s])), [allStages]);

  const incoming = useMemo(
    () => deps.filter((d) => d.successor_id === stage.id),
    [deps, stage.id],
  );

  const eligible = useMemo(() => {
    const descendants = new Set<string>();
    const queue = [stage.id];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const d of deps) {
        if (d.predecessor_id === cur && !descendants.has(d.successor_id)) {
          descendants.add(d.successor_id);
          queue.push(d.successor_id);
        }
      }
    }
    return allStages.filter(
      (s) =>
        s.id !== stage.id &&
        !descendants.has(s.id) &&
        !incoming.some((i) => i.predecessor_id === s.id),
    );
  }, [allStages, deps, stage.id, incoming]);

  async function add() {
    if (!newPredId) return;
    try {
      await adapter.createDependency({
        predecessor_id: newPredId,
        successor_id: stage.id,
        type: newType,
        lag_days: newLag,
      });
      setNewPredId("");
      setNewLag(0);
      setNewType("FS");
      toast.success("Ligação criada");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="rounded p-1 text-foreground/70 opacity-0 transition hover:bg-background/30 hover:text-foreground group-hover:opacity-100"
          aria-label="Gerir dependências"
          title="Dependências"
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="start">
        <div className="space-y-3">
          <div className="border-b border-border pb-2">
            <p className="font-display text-base font-semibold">Dependências de “{stage.name}”</p>
            <p className="text-[11px] text-muted-foreground">
              Esta fase é empurrada quando os predecessores se movem.
            </p>
          </div>

          {incoming.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem predecessores ainda.</p>
          ) : (
            <ul className="space-y-1.5">
              {incoming.map((d) => {
                const pred = stageMap.get(d.predecessor_id);
                return (
                  <li
                    key={d.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {pred?.name ?? "(fase removida)"}
                    </span>
                    <Select
                      value={d.type}
                      disabled={!canEdit}
                      onValueChange={(v) => {
                        if (!adapter.updateDependency) return;
                        adapter
                          .updateDependency({ id: d.id, patch: { type: v as DepType } })
                          .catch((err) => toast.error((err as Error).message));
                      }}
                    >
                      <SelectTrigger className="h-7 w-[110px] text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(TYPE_LABELS) as DepType[]).map((t) => (
                          <SelectItem key={t} value={t} className="text-xs">
                            {TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      defaultValue={d.lag_days}
                      disabled={!canEdit}
                      onBlur={(e) => {
                        if (!adapter.updateDependency) return;
                        const v = Number(e.target.value) || 0;
                        if (v === d.lag_days) return;
                        adapter
                          .updateDependency({ id: d.id, patch: { lag_days: v } })
                          .catch((err) => toast.error((err as Error).message));
                      }}
                      className="h-7 w-16 text-xs"
                      title="Lag (dias úteis)"
                    />
                    <button
                      onClick={() =>
                        adapter
                          .deleteDependency(d.id)
                          .then(() => toast.success("Ligação removida"))
                          .catch((err) => toast.error((err as Error).message))
                      }
                      className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-destructive"
                      aria-label="Remover"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {eligible.length > 0 && (
            <div className="space-y-2 rounded-md border border-dashed border-border p-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Adicionar predecessor
              </Label>
              <Select value={newPredId} onValueChange={setNewPredId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Escolher fase…" />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Select value={newType} onValueChange={(v) => setNewType(v as DepType)}>
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABELS) as DepType[]).map((t) => (
                      <SelectItem key={t} value={t} className="text-xs">
                        {TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={newLag}
                  onChange={(e) => setNewLag(Number(e.target.value) || 0)}
                  className="h-8 w-20 text-xs"
                  title="Lag (dias úteis)"
                  placeholder="Lag"
                />
                <Button size="sm" onClick={add} disabled={!newPredId || adapter.pending.dependency}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Adicionar
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
