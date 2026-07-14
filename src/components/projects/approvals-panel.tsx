import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  useProjectPendingHours,
  useApproveEntry,
  useRejectEntry,
  type PendingEntry,
} from "@/lib/projects/use-hour-approvals";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Check, X, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { euros } from "@/lib/projects/gantt-utils";

interface Props {
  projectId: string;
}

interface StageOpt {
  id: string;
  name: string;
  sort_order: number;
  budget: number;
}

function useProjectStagesFlat(projectId: string) {
  return useQuery({
    queryKey: ["project-stages-flat", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<StageOpt[]> => {
      const { data } = await supabase
        .from("pm_stages")
        .select("id, name, sort_order, budget")
        .eq("project_id", projectId)
        .order("sort_order");
      return ((data ?? []) as unknown as StageOpt[]).map((s) => ({
        id: s.id,
        name: s.name,
        sort_order: s.sort_order,
        budget: Number(s.budget) || 0,
      }));
    },
  });
}

export function ApprovalsPanel({ projectId }: Props) {
  const { t } = useTranslation(["projects", "common"]);
  const { data, isLoading } = useProjectPendingHours(projectId);
  const { data: allStages } = useProjectStagesFlat(projectId);
  const approve = useApproveEntry(projectId);
  const reject = useRejectEntry(projectId);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const toggle = (k: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const totalPending = data?.total ?? 0;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("common:loading", { defaultValue: "Loading…" })}
      </div>
    );
  }

  if (!data || totalPending === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {t("projects:approvals.empty", {
          defaultValue: "No pending hours. Everything is approved.",
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {t("projects:approvals.title", { defaultValue: "Approve work" })}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("projects:approvals.subtitle", {
              defaultValue:
                "Review, adjust and approve time logged against this project.",
              count: totalPending,
            })}{" "}
            · {totalPending}{" "}
            {t("projects:approvals.pendingEntries", { defaultValue: "pending entries" })}
          </p>
        </div>
      </div>

      {data.groups.map((g) => {
        const key = g.stage?.id ?? "__unassigned__";
        const open = openGroups.has(key);
        const budget = g.stage?.budget ? Number(g.stage.budget) : 0;
        const usagePct =
          budget > 0 ? Math.round((g.billableAmount / budget) * 100) : null;
        return (
          <div key={key} className="rounded-lg border bg-card">
            <button
              type="button"
              onClick={() => toggle(key)}
              className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50"
            >
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="flex-1">
                <div className="font-medium">
                  {g.stage
                    ? `${g.stage.sort_order + 1}. ${g.stage.name}`
                    : t("projects:approvals.unassigned", {
                        defaultValue: "Unassigned stage",
                      })}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {t("projects:approvals.pending", { defaultValue: "Pending" })}:{" "}
                    <span className="font-medium text-foreground">
                      {g.entries.length}
                    </span>
                  </span>
                  <span>
                    {t("projects:approvals.hours", { defaultValue: "Hours" })}:{" "}
                    <span className="font-medium text-foreground">
                      {g.totalHours.toFixed(1)}h
                    </span>
                  </span>
                  <span>
                    {t("projects:approvals.billableAmount", {
                      defaultValue: "Billable value",
                    })}
                    :{" "}
                    <span className="font-medium text-foreground">
                      {euros(g.billableAmount)}
                    </span>
                  </span>
                  {budget > 0 && (
                    <span>
                      {t("projects:approvals.budget", { defaultValue: "Budget" })}:{" "}
                      <span className="font-medium text-foreground">
                        {euros(budget)}
                      </span>{" "}
                      ({usagePct}%)
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await Promise.all(
                      g.entries.map((entry) =>
                        approve.mutateAsync({ id: entry.id }),
                      ),
                    );
                    toast.success(
                      t("projects:approvals.stageApproved", {
                        defaultValue: "Stage entries approved",
                      }),
                    );
                  } catch (err) {
                    toast.error(String((err as Error).message ?? err));
                  }
                }}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                {t("projects:approvals.approveStage", {
                  defaultValue: "Approve all",
                })}
              </button>
            </button>

            {open && (
              <div className="border-t">
                <div className="grid grid-cols-[100px_140px_1fr_80px_90px_100px_140px_140px] items-center gap-2 border-b bg-muted/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <div>{t("projects:approvals.date", { defaultValue: "Date" })}</div>
                  <div>{t("projects:approvals.person", { defaultValue: "Person" })}</div>
                  <div>{t("projects:approvals.notes", { defaultValue: "Notes" })}</div>
                  <div className="text-right">
                    {t("projects:approvals.hours", { defaultValue: "Hours" })}
                  </div>
                  <div className="text-center">
                    {t("projects:approvals.billable", { defaultValue: "Billable" })}
                  </div>
                  <div className="text-right">
                    {t("projects:approvals.rate", { defaultValue: "Rate €/h" })}
                  </div>
                  <div>
                    {t("projects:approvals.stage", { defaultValue: "Stage" })}
                  </div>
                  <div className="text-right">
                    {t("projects:approvals.actions", { defaultValue: "Actions" })}
                  </div>
                </div>
                {g.entries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    stages={allStages ?? []}
                    onApprove={(patch) =>
                      approve.mutateAsync({ id: entry.id, ...patch })
                    }
                    onReject={(reason) =>
                      reject.mutateAsync({ id: entry.id, reason })
                    }
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EntryRow({
  entry,
  stages,
  onApprove,
  onReject,
}: {
  entry: PendingEntry;
  stages: StageOpt[];
  onApprove: (patch: {
    billable?: boolean;
    sale_rate_override?: number | null;
    pm_stage_id?: string | null;
  }) => Promise<void>;
  onReject: (reason: string) => Promise<void>;
}) {
  const { t } = useTranslation(["projects", "common"]);
  const initialRate = Number(
    entry.sale_rate_override ?? entry.sale_rate_snapshot ?? 0,
  );
  const [billable, setBillable] = useState(entry.billable);
  const [rate, setRate] = useState<string>(String(initialRate));
  const [stageId, setStageId] = useState<string>(entry.stage_id ?? "");
  const [busy, setBusy] = useState(false);
  const amount = useMemo(
    () => (billable ? Number(rate) * entry.hours : 0),
    [billable, rate, entry.hours],
  );

  const doApprove = async () => {
    setBusy(true);
    try {
      const rateNum = Number(rate);
      const overrideChanged = rateNum !== Number(entry.sale_rate_snapshot ?? 0);
      await onApprove({
        billable,
        sale_rate_override: overrideChanged ? rateNum : null,
        pm_stage_id: stageId && stageId !== entry.stage_id ? stageId : undefined,
      });
      toast.success(
        t("projects:approvals.approved", { defaultValue: "Entry approved" }),
      );
    } catch (e) {
      toast.error(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const doReject = async () => {
    const reason = window.prompt(
      t("projects:approvals.rejectPrompt", {
        defaultValue: "Reason for rejection?",
      }) ?? "",
    );
    if (!reason) return;
    setBusy(true);
    try {
      await onReject(reason);
      toast.success(
        t("projects:approvals.rejected", { defaultValue: "Entry rejected" }),
      );
    } catch (e) {
      toast.error(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-[100px_140px_1fr_80px_90px_100px_140px_140px] items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0">
      <div className="text-xs text-muted-foreground">
        {format(parseISO(entry.entry_date), "d MMM yyyy")}
      </div>
      <div className="truncate">{entry.user_name ?? "—"}</div>
      <div className="truncate text-xs text-muted-foreground" title={entry.notes ?? ""}>
        {entry.notes ?? "—"}
      </div>
      <div className="text-right font-medium">{entry.hours.toFixed(2)}</div>
      <div className="flex justify-center">
        <input
          type="checkbox"
          checked={billable}
          onChange={(e) => setBillable(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
      </div>
      <div>
        <input
          type="number"
          step="0.01"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          disabled={!billable}
          className="w-full rounded-md border bg-background px-2 py-1 text-right text-sm disabled:opacity-50"
        />
      </div>
      <div>
        <select
          value={stageId}
          onChange={(e) => setStageId(e.target.value)}
          className="w-full rounded-md border bg-background px-2 py-1 text-xs"
        >
          <option value="">—</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.sort_order + 1}. {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-end gap-1">
        <span className="mr-2 text-xs text-muted-foreground">{euros(amount)}</span>
        <button
          type="button"
          disabled={busy}
          onClick={doApprove}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          title={t("projects:approvals.approve", { defaultValue: "Approve" }) ?? ""}
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={doReject}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          title={t("projects:approvals.reject", { defaultValue: "Reject" }) ?? ""}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
