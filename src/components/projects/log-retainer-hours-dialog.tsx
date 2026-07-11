/**
 * LogRetainerHoursDialog — quick entry for logging hours directly against a
 * retainer stage without going through allocation/task plumbing. Writes to
 * `pm_time_entries` with `pm_stage_id` set (open-logging path enabled by
 * the retainer RLS policies). Snapshots the resource's cost & sale rates
 * at insert-time so historical cost/margin math stays stable.
 */
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useProjectsAuth } from "@/lib/projects/use-auth";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format, parseISO, startOfMonth } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  monthlyChildren: Array<{ id: string; monthDate: string; month: string }>;
  parentStageName: string;
}

export function LogRetainerHoursDialog({
  open,
  onOpenChange,
  monthlyChildren,
  parentStageName,
}: Props) {
  const { user } = useAuth();
  const { profile } = useProjectsAuth();
  const qc = useQueryClient();

  const defaultDate = format(new Date(), "yyyy-MM-dd");
  const [entryDate, setEntryDate] = useState(defaultDate);
  const [hours, setHours] = useState<number>(1);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // Pick the monthly child whose start_date matches this month
  const stageIdForDate = useMemo(() => {
    const monthIso = format(startOfMonth(parseISO(entryDate)), "yyyy-MM-dd");
    const match = monthlyChildren.find((c) => c.monthDate === monthIso);
    return match?.id ?? null;
  }, [entryDate, monthlyChildren]);

  // Resource rates snapshot for the logged-in user
  const { data: rates } = useQuery({
    queryKey: ["retainer-log-rates", profile?.resource_id],
    enabled: !!profile?.resource_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("pm_resources")
        .select("cost_rate, hourly_rate")
        .eq("id", profile!.resource_id!)
        .maybeSingle();
      return {
        cost: Number((data as { cost_rate?: number | null } | null)?.cost_rate ?? 0),
        sale: Number((data as { hourly_rate?: number | null } | null)?.hourly_rate ?? 0),
      };
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id) {
      toast.error("Not signed in");
      return;
    }
    if (!stageIdForDate) {
      toast.error("Selected date does not fall within any retainer month");
      return;
    }
    if (hours <= 0) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("pm_time_entries").insert({
        user_id: user.id,
        entry_date: entryDate,
        hours,
        notes: notes || null,
        billable: true,
        entry_type: "project",
        pm_stage_id: stageIdForDate,
        task_id: null,
        source: "retainer",
        cost_rate_snapshot: rates?.cost ?? null,
        sale_rate_snapshot: rates?.sale ?? null,
      } as never);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["retainer-by-resource"] });
      await qc.invalidateQueries({ queryKey: ["retainer-direct-entries"] });
      await qc.invalidateQueries({ queryKey: ["stage-budget-control"] });
      await qc.invalidateQueries({ queryKey: ["pm-timesheet-entries"] });
      toast.success("Hours logged");
      onOpenChange(false);
      setHours(1);
      setNotes("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl">Log hours — {parentStageName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="l-date">Date</Label>
              <Input
                id="l-date"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="l-hours">Hours</Label>
              <Input
                id="l-hours"
                type="number"
                min={0.25}
                step={0.25}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="l-month">Month</Label>
            <Select
              value={stageIdForDate ?? ""}
              onValueChange={(v) => {
                const c = monthlyChildren.find((m) => m.id === v);
                if (c) setEntryDate(c.monthDate);
              }}
            >
              <SelectTrigger id="l-month">
                <SelectValue placeholder="Pick a month" />
              </SelectTrigger>
              <SelectContent>
                {monthlyChildren.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="l-notes">Notes</Label>
            <Input
              id="l-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Site visit, meeting, etc."
            />
          </div>
          {rates ? (
            <p className="text-[11px] text-muted-foreground">
              Rates snapshot: cost €{rates.cost}/h · sale €{rates.sale}/h
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={busy || !stageIdForDate}>
              {busy ? "Saving…" : "Log hours"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
