/**
 * NewRetainerStageDialog — creates a retainer parent stage on a project
 * plus N monthly children (one per calendar month). Retainer stages are
 * distinct from regular Gantt stages: they represent a fixed monthly fee
 * subscription (`retainer_monthly_amount`) over a span of months, with
 * open logging via `pm_time_entries.pm_stage_id`.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
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
import { Repeat } from "lucide-react";
import { toast } from "sonner";
import { addMonths, endOfMonth, format, parseISO, startOfMonth } from "date-fns";

const COLORS = ["#a78bfa", "#fb7185", "#22d3ee", "#fdba74", "#34d399"];

interface Props {
  projectId: string;
  nextOrder: number;
}

export function NewRetainerStageDialog({ projectId, nextOrder }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Construction retainer");
  const [monthlyFee, setMonthlyFee] = useState<number>(1320);
  const [months, setMonths] = useState<number>(6);
  const today = new Date();
  const [anchor, setAnchor] = useState<string>(format(startOfMonth(today), "yyyy-MM-dd"));
  const [color, setColor] = useState(COLORS[nextOrder % COLORS.length]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || monthlyFee <= 0 || months <= 0) return;
    setBusy(true);
    try {
      const start = startOfMonth(parseISO(anchor));
      const end = endOfMonth(addMonths(start, months - 1));
      const parentBudget = monthlyFee * months;
      const { data: parent, error: pErr } = await supabase
        .from("pm_stages")
        .insert({
          project_id: projectId,
          name: name.trim(),
          budget: parentBudget,
          start_date: format(start, "yyyy-MM-dd"),
          end_date: format(end, "yyyy-MM-dd"),
          color,
          sort_order: nextOrder,
          stage_kind: "retainer_monthly",
          retainer_monthly_amount: monthlyFee,
          retainer_anchor_month: format(start, "yyyy-MM-dd"),
          retainer_months: months,
        } as never)
        .select("id")
        .single();
      if (pErr) throw pErr;

      // Monthly children
      const rows = Array.from({ length: months }, (_, i) => {
        const m = addMonths(start, i);
        return {
          project_id: projectId,
          parent_stage_id: (parent as { id: string }).id,
          name: format(m, "MMM yyyy"),
          budget: monthlyFee,
          start_date: format(startOfMonth(m), "yyyy-MM-dd"),
          end_date: format(endOfMonth(m), "yyyy-MM-dd"),
          color,
          sort_order: i,
          stage_kind: "retainer_month",
        };
      });
      const { error: cErr } = await supabase.from("pm_stages").insert(rows as never);
      if (cErr) throw cErr;

      await qc.invalidateQueries({ queryKey: ["pm-project", projectId] });
      await qc.invalidateQueries({ queryKey: ["pm-stages-all"] });
      toast.success("Retainer stage created");
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Repeat className="mr-1 h-3.5 w-3.5" />
          New retainer stage
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl">New retainer stage</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="r-name">Name</Label>
            <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="r-fee">Monthly fee (€)</Label>
              <Input
                id="r-fee"
                type="number"
                min={0}
                step={10}
                value={monthlyFee}
                onChange={(e) => setMonthlyFee(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="r-months">Months</Label>
              <Input
                id="r-months"
                type="number"
                min={1}
                max={60}
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="r-anchor">First month</Label>
            <Input
              id="r-anchor"
              type="month"
              value={anchor.slice(0, 7)}
              onChange={(e) => setAnchor(`${e.target.value}-01`)}
            />
          </div>
          <div>
            <Label>Color</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {COLORS.map((c) => (
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
          <p className="text-[11px] text-muted-foreground">
            {months} monthly children will be created. Total: €{(monthlyFee * months).toLocaleString()}.
          </p>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create retainer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
