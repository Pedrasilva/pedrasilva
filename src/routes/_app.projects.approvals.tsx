import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { usePendingApprovalsSummary } from "@/lib/projects/use-hour-approvals";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/projects/app-shell";
import { Check, CheckCircle2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { useDateLocale } from "@/i18n/use-date-locale";
import { useDecideNonWorkingEntry, useNonWorkingQueue } from "@/lib/projects/use-non-working-days";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/projects/approvals")({
  component: ProjectsApprovalsQueue,
});

function ProjectsApprovalsQueue() {
  const { t } = useTranslation(["projects", "common"]);
  const { isAdmin } = useAuth();
  const { data, isLoading } = usePendingApprovalsSummary();
  const nwd = useNonWorkingQueue(isAdmin);
  const decide = useDecideNonWorkingEntry();
  const locale = useDateLocale();
  async function act(id: string, approve: boolean) {
    let reason: string | undefined;
    if (!approve) {
      const r = window.prompt(t("projects:approvals.rejectPrompt", { defaultValue: "Reason for rejection?" }) ?? "");
      if (!r) return;
      reason = r;
    }
    try {
      await decide.mutateAsync({ id, approve, reason });
      toast.success(approve ? t("projects:approvals.approved", { defaultValue: "Entry approved" }) : t("projects:approvals.rejected", { defaultValue: "Entry rejected" }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-muted-foreground">
          {t("common:accessDenied", { defaultValue: "Access denied." })}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("projects:approvals.queueTitle", { defaultValue: "Approve work" })}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("projects:approvals.queueSubtitle", {
              defaultValue: "Projects with hours awaiting approval.",
            })}
          </p>
        </div>

        {(nwd.data ?? []).length > 0 && (
          <section className="mb-6 rounded-lg border border-warning bg-warning/5" aria-labelledby="nwd-title">
            <div className="p-4">
              <h2 id="nwd-title" className="font-semibold">{t("projects:nonWorkingDay.sectionTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("projects:nonWorkingDay.sectionSub")}</p>
            </div>
            <ul className="divide-y border-t">
              {nwd.data!.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-warning text-warning">
                        {t(`projects:nonWorkingDay.badge.${e.reason}`)}{e.holiday ? ` · ${e.holiday}` : ""}
                      </Badge>
                      <span className="font-medium">{format(parseISO(e.entry_date), "EEE d MMM yyyy", { locale })}</span>
                      <span className="text-muted-foreground">· {e.user_name ?? "—"}</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {e.label}{e.notes ? ` — ${e.notes}` : ""}
                    </div>
                  </div>
                  <span className="font-mono">{e.hours.toFixed(2)} h</span>
                  <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => void act(e.id, true)}>
                    <Check className="mr-1 h-4 w-4" /> {t("projects:approvals.approve", { defaultValue: "Approve" })}
                  </Button>
                  <Button size="sm" variant="outline" className="border-destructive/40 text-destructive" disabled={decide.isPending} onClick={() => void act(e.id, false)}>
                    <X className="mr-1 h-4 w-4" /> {t("projects:approvals.reject", { defaultValue: "Reject" })}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />{" "}
            {t("common:loading", { defaultValue: "Loading…" })}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-500" />
            <p className="text-sm text-muted-foreground">
              {t("projects:approvals.queueEmpty", {
                defaultValue: "All caught up. No pending hours.",
              })}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.map((p) => (
              <Link
                key={p.id}
                to="/projects/$projectId"
                params={{ projectId: p.id }}
                search={{ tab: "approvals" }}
                className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ background: p.color }}
                  />
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.count}{" "}
                      {t("projects:approvals.pendingEntries", {
                        defaultValue: "pending entries",
                      })}{" "}
                      · {p.hours.toFixed(1)}h
                    </div>
                  </div>
                </div>
                <div className="text-xs font-medium text-primary">
                  {t("projects:approvals.review", { defaultValue: "Review →" })}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
