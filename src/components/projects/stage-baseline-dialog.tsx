import { useDateLocale } from "@/i18n/use-date-locale";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n/index";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Lock, LockOpen, AlertTriangle } from "lucide-react";
import { toast } from '@/lib/toast';
import { useSetStageBaseline, useClearStageBaseline } from "@/lib/projects/use-planner";
import { allocationHours, euros } from "@/lib/projects/gantt-utils";
import type { StageWithAllocations } from "@/lib/projects/types";
import { isBaselineLocked, type StageWithBaseline } from "@/lib/projects/baseline";
import { format } from "date-fns";

interface Props {
  stage: StageWithAllocations & Partial<StageWithBaseline>;
  projectId: string;
  trigger?: React.ReactNode;
}

/**
 * Lock or re-baseline a stage. Baseline values become the project-control
 * reference (variance comparisons, health, dashboards) and only change via
 * this explicit action — protecting them from drift caused by ordinary
 * edits to working dates/budget.
 */
export function StageBaselineDialog({ stage, projectId, trigger }: Props) {
  const dateLocale = useDateLocale();
  useTranslation();
  const locked = isBaselineLocked(stage as StageWithBaseline);
  const [open, setOpen] = useState(false);

  const livePlannedHours = useMemo(
    () =>
      stage.allocations.reduce(
        (acc, a) =>
          acc +
          allocationHours({
            start_date: a.start_date,
            end_date: a.end_date,
            hours_per_day: Number(a.hours_per_day),
          }),
        0,
      ),
    [stage.allocations],
  );

  const [start, setStart] = useState(stage.start_date);
  const [end, setEnd] = useState(stage.end_date);
  const [budget, setBudget] = useState<number>(Number(stage.budget) || 0);
  const [targetHours, setTargetHours] = useState<number>(
    Number(stage.baseline_target_hours ?? livePlannedHours) || 0,
  );
  const [notes, setNotes] = useState("");

  const setBaseline = useSetStageBaseline();
  const clearBaseline = useClearStageBaseline();

  function resetFromCurrent() {
    setStart(stage.start_date);
    setEnd(stage.end_date);
    setBudget(Number(stage.budget) || 0);
    setTargetHours(livePlannedHours);
    setNotes("");
  }

  async function save() {
    if (!start || !end) {
      toast.error(i18n.t("projects:stageBaselineDialog.ui.baselineDatesRequired"));
      return;
    }
    try {
      await setBaseline.mutateAsync({
        id: stage.id,
        projectId,
        baseline_start_date: start,
        baseline_end_date: end,
        baseline_budget: Number(budget) || 0,
        baseline_target_hours: Number(targetHours) || 0,
        baseline_notes: notes || null,
      });
      toast.success(locked ? i18n.t("projects:stageBaselineDialog.ui.baselineUpdated") : i18n.t("projects:stageBaselineDialog.ui.baselineSet"));
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function clear() {
    if (!confirm(i18n.t("projects:stageBaselineDialog.ui.removeBaselineConfirm"))) return;
    try {
      await clearBaseline.mutateAsync({ id: stage.id, projectId });
      toast.success(i18n.t("projects:stageBaselineDialog.ui.baselineRemoved"));
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) resetFromCurrent();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
            {locked ? i18n.t("projects:stageBaselineDialog.ui.resetBaseline") : i18n.t("projects:stageBaselineDialog.ui.setBaseline")}
          </button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {locked ? <Lock className="h-4 w-4 text-primary" /> : <LockOpen className="h-4 w-4" />}
            {locked ? i18n.t("projects:stageBaselineDialog.ui.resetBaseline") : i18n.t("projects:stageBaselineDialog.ui.setBaseline")} — {stage.name}
          </DialogTitle>
        </DialogHeader>

        {locked && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium"> {i18n.t("projects:stageBaselineDialog.ui.stageHasBaseline")} </p>
              <p>
                 {i18n.t("projects:stageBaselineDialog.ui.lastUpdated")} {" "}
                <span className="font-mono">
                  {stage.baseline_locked_at
                    ? format(new Date(stage.baseline_locked_at), "dd MMM yyyy", { locale: dateLocale })
                    : "—"}
                </span>
                 {i18n.t("projects:stageBaselineDialog.ui.resetBaselineHint")} </p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bl-start" className="text-xs"> {i18n.t("projects:stageBaselineDialog.ui.baselineStart")} </Label>
              <Input id="bl-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="bl-end" className="text-xs"> {i18n.t("projects:stageBaselineDialog.ui.baselineEnd")} </Label>
              <Input id="bl-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bl-budget" className="text-xs"> {i18n.t("projects:stageBaselineDialog.ui.baselineBudgetEuros")} </Label>
              <Input
                id="bl-budget"
                type="number"
                min={0}
                step={100}
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="bl-hours" className="text-xs"> {i18n.t("projects:stageBaselineDialog.ui.baselineTargetHours")} </Label>
              <Input
                id="bl-hours"
                type="number"
                min={0}
                step={1}
                value={targetHours}
                onChange={(e) => setTargetHours(Number(e.target.value))}
              />
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                 {i18n.t("projects:stageBaselineDialog.ui.baselineAllocationSuggestion")} <span className="font-mono">{(livePlannedHours).toLocaleString(i18n.language, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {i18n.t("common:units.hoursShort")} </span>
              </p>
            </div>
          </div>
          <div>
            <Label htmlFor="bl-notes" className="text-xs"> {i18n.t("common:notesOptional")} </Label>
            <Textarea
              id="bl-notes"
              rows={2}
              placeholder={i18n.t("projects:stageBaselineDialog.ui.baselineNotesExample")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground"> {i18n.t("projects:stageBaselineDialog.ui.currentWorkingBudget")} </span>
              <span className="font-mono">{euros(Number(stage.budget) || 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground"> {i18n.t("projects:stageBaselineDialog.ui.plannedAllocationHours")} </span>
              <span className="font-mono">{(livePlannedHours).toLocaleString(i18n.language, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {i18n.t("common:units.hoursShort")} </span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {locked ? (
            <Button variant="ghost" size="sm" onClick={clear} className="text-destructive hover:text-destructive">
               {i18n.t("projects:stageBaselineDialog.ui.removeBaseline")} </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
               {i18n.t("common:cancel")} </Button>
            <Button size="sm" onClick={save} disabled={setBaseline.isPending}>
              {setBaseline.isPending ? i18n.t("common:saving") : locked ? i18n.t("projects:stageBaselineDialog.ui.resetBaseline") : i18n.t("projects:stageBaselineDialog.ui.setBaseline")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
