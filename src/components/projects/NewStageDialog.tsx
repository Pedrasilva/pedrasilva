import { useState } from "react";
import { useCreateStage } from "@/lib/projects/use-planner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { addDays, format } from "date-fns";

const STAGE_COLORS = ["#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#fb7185", "#22d3ee", "#fdba74"];

interface Props {
  projectId: string;
  defaultStart: string;
  nextOrder: number;
}

export function NewStageDialog({ projectId, defaultStart, nextOrder }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [budget, setBudget] = useState(10000);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(format(addDays(new Date(defaultStart), 14), "yyyy-MM-dd"));
  const [color, setColor] = useState(STAGE_COLORS[nextOrder % STAGE_COLORS.length]);
  const create = useCreateStage();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await create.mutateAsync({
        project_id: projectId,
        name: name.trim(),
        budget: Number(budget),
        start_date: start,
        end_date: end,
        color,
        sort_order: nextOrder,
      });
      toast.success("Fase adicionada");
      setOpen(false);
      setName("");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-1 h-3.5 w-3.5" />
          Adicionar fase
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Nova fase</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="s-name">Nome</Label>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Conceito" autoFocus />
          </div>
          <div>
            <Label htmlFor="s-budget">Orçamento (€) — fixo</Label>
            <Input id="s-budget" type="number" min={0} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="s-start">Início</Label>
              <Input id="s-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="s-end">Fim</Label>
              <Input id="s-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Cor</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {STAGE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "A adicionar…" : "Adicionar fase"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
